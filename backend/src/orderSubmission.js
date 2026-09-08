// Background submission of purchase orders to the DIGI/RIIN supplier.
//
// Placing an order with the supplier is slow and unpredictable — a large order can
// take minutes while the supplier fetches every artwork — so it must never happen
// inside the user's HTTP request. A purchase is saved as 'Submitting' and this
// worker drives it to a final state:
//   Submitted — the supplier confirmed the order, or was later found to hold it.
//   Failed    — the supplier explicitly rejected it (a real business error), or it
//               never appeared after hours of trying and a human needs to look.
// A timeout, gateway error or "still processing" reply is NEVER a failure here:
// the worker keeps verifying until the supplier shows the order, and only re-sends
// once the supplier's processing window has clearly passed — always looking for
// the order first, so nothing is ever placed twice.
import { query } from './db.js';
import { supplierPost, SUPPLIER_STATUSES } from './supplier.js';
import { createPurchaseOrder, printshopConfigured } from './printshop.js';

const POLL_MS = 5_000;                    // how often the worker looks for due work
const VERIFY_RETRY_MS = 20_000;           // re-check cadence while waiting on the supplier
const RESEND_AFTER_MS = 15 * 60_000;      // re-send only once the supplier has clearly given up
const GIVE_UP_AFTER_MS = 6 * 60 * 60_000; // escalate to Failed for a human after this long
const LOCK_STALE_MINUTES = 10;            // a crashed worker's claim expires after this
const BATCH = 5;

const IN_PROGRESS_MESSAGE = 'Supplier is still processing this order — it will confirm automatically.';
const SLOW_MESSAGE = 'Supplier was slow to respond — confirming the order…';
const GAVE_UP_MESSAGE = 'Supplier never confirmed this order after repeated attempts — check the supplier portal, then Retry.';

// A timeout / connection failure / gateway error: the supplier may or may not have
// taken the order. supplier.js reports these as status 502.
export function isAmbiguousSupplierError(error) {
  if (error?.status === 502) return true;
  return /\b50[234]\b|timed out|timeout|gateway|ETIMEDOUT|ECONNRESET|socket hang up/i.test(String(error?.message || ''));
}

// "正在下单, 请勿重复操作" — the supplier is still processing an earlier submission of
// this same order. Not a rejection: the order is on its way and must not be resent.
export function isInProgressSupplierError(message) {
  return /正在下单|请勿重复|duplicate|repeat|in progress|being placed|still processing/i.test(String(message || ''));
}

// true if the supplier holds the order, false if it confirmed it does not, null if
// the check itself failed (so nothing can be concluded).
export async function orderExistsOnSupplier(orderNo) {
  try {
    const result = await supplierPost('/trade/api/interface/queryOrderInfo', { platformOidList: [orderNo] });
    return Boolean(result.data?.[0] || result.records?.[0]);
  } catch {
    return null;
  }
}

// Best-effort: pull the live supplier status right away so the Orders page shows
// e.g. "Factory Audit" instead of "Pending Push" until the next scheduled sync.
async function refreshSupplierStatus(order) {
  try {
    const result = await supplierPost('/trade/api/interface/queryOrderStatus', { platformOidList: [order.order_no] });
    const item = (result.data || [])[0];
    if (!item) return;
    await query(`UPDATE purchases SET supplier_status=$1,supplier_status_str=$2 WHERE purchase_id=$3`,
      [item.orderStatus, SUPPLIER_STATUSES[item.orderStatus] || item.orderStateStr || '', order.purchase_id]);
  } catch { /* the scheduled sync will catch up */ }
}

// Once the blanks are placed, raise the purchase order back in Printshop against the
// linked sales order. Non-fatal and idempotent on Printshop's side (no duplicate PO).
async function raisePrintshopPO(order) {
  if (!order.external_sales_order_id || !printshopConfigured()) return;
  try {
    const email = order.created_by
      ? (await query('SELECT email FROM admin_users WHERE user_id=$1', [order.created_by])).rows[0]?.email || ''
      : '';
    const po = await createPurchaseOrder(order.external_sales_order_id, email);
    await query(`UPDATE purchases SET printshop_po_id=$1,printshop_po_number=$2,printshop_po_error=NULL WHERE purchase_id=$3`,
      [po?.id || null, po?.po_number || null, order.purchase_id]);
  } catch (error) {
    await query(`UPDATE purchases SET printshop_po_error=$1 WHERE purchase_id=$2`, [error.message, order.purchase_id]).catch(() => {});
  }
}

async function markSubmitted(order) {
  await query(`UPDATE purchases SET status='Placed',submission_status='Submitted',last_sync_error=NULL,synced_at=NOW(),
                submit_locked_at=NULL,submit_next_at=NULL WHERE purchase_id=$1`, [order.purchase_id]);
  await refreshSupplierStatus(order);
  await raisePrintshopPO(order);
  console.log(`[submit-worker] ${order.order_no} submitted`);
}

async function markFailed(order, message) {
  await query(`UPDATE purchases SET submission_status='Failed',last_sync_error=$2,submit_locked_at=NULL,submit_next_at=NULL WHERE purchase_id=$1`,
    [order.purchase_id, message]);
  console.log(`[submit-worker] ${order.order_no} failed: ${message}`);
}

// Keep the order in 'Submitting', note what we are waiting on, and come back later.
async function defer(order, message, delayMs) {
  await query(`UPDATE purchases SET last_sync_error=$2,submit_next_at=NOW()+($3||' milliseconds')::interval,submit_locked_at=NULL WHERE purchase_id=$1`,
    [order.purchase_id, message, String(delayMs)]);
}

export async function processOrder(order) {
  // 1. Already on the supplier? Covers an earlier send that timed out on our side.
  const exists = await orderExistsOnSupplier(order.order_no);
  if (exists === true) return markSubmitted(order);
  if (exists === null) return defer(order, SLOW_MESSAGE, VERIFY_RETRY_MS);

  // 2. Not there yet, but we sent it recently — the supplier may still be working
  //    on it (big orders take minutes). Wait and re-check; never resend into that.
  const sentAgo = order.submit_sent_at ? Date.now() - new Date(order.submit_sent_at).getTime() : null;
  if (sentAgo !== null && sentAgo < RESEND_AFTER_MS) return defer(order, IN_PROGRESS_MESSAGE, VERIFY_RETRY_MS);

  // 3. Only after a very long time with nothing to show does a human need to look.
  const startedAgo = Date.now() - new Date(order.submit_started_at || order.created_at).getTime();
  if (startedAgo > GIVE_UP_AFTER_MS) return markFailed(order, GAVE_UP_MESSAGE);

  // 4. Send it.
  await query(`UPDATE purchases SET submit_sent_at=NOW(),submit_attempts=COALESCE(submit_attempts,0)+1 WHERE purchase_id=$1`, [order.purchase_id]);
  try {
    await supplierPost('/trade/api/interface/placeOrder', order.supplier_payload);
    return markSubmitted(order);
  } catch (error) {
    if (isInProgressSupplierError(error.message)) return defer(order, IN_PROGRESS_MESSAGE, VERIFY_RETRY_MS);
    if (isAmbiguousSupplierError(error)) return defer(order, SLOW_MESSAGE, VERIFY_RETRY_MS);
    // The supplier answered and said no — a real rejection the user must see.
    return markFailed(order, error.message);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    // Claim due orders atomically so a slow batch can never be picked up twice.
    const { rows } = await query(`
      UPDATE purchases SET submit_locked_at=NOW()
       WHERE purchase_id IN (
         SELECT purchase_id FROM purchases
          WHERE submission_status='Submitting'
            AND (submit_next_at IS NULL OR submit_next_at<=NOW())
            AND (submit_locked_at IS NULL OR submit_locked_at<NOW()-INTERVAL '${LOCK_STALE_MINUTES} minutes')
          ORDER BY created_at LIMIT ${BATCH})
       RETURNING *`);
    await Promise.all(rows.map((order) => processOrder(order).catch((error) => {
      console.error(`[submit-worker] ${order.order_no}:`, error.message);
      return defer(order, SLOW_MESSAGE, VERIFY_RETRY_MS).catch(() => {});
    })));
  } catch (error) {
    console.error('[submit-worker]', error.message);
  } finally {
    running = false;
  }
}

export function startSubmissionWorker() {
  setInterval(tick, POLL_MS);
  setTimeout(tick, 2_000);
  console.log(`Order submission worker active — polling every ${POLL_MS / 1000}s.`);
}

// Run a tick right away (after a create/retry commits) so a new order reaches the
// supplier within milliseconds instead of waiting for the next poll.
export function kickSubmissionWorker() {
  setImmediate(tick);
}
