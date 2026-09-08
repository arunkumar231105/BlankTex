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
// the worker keeps verifying until the supplier shows the order.
//
// HARD RULE — an order is never placed twice (a duplicate is real money lost):
//   * The payload is sent at most ONCE per cycle. Once submit_sent_at is set the
//     worker only verifies; it never resends on its own, however long it waits.
//   * Before that single send the supplier must confirm the order is absent twice
//     (queryOrderInfo, 3s apart) plus once via queryOrderStatus. Any failed check
//     means "unknown" and nothing is sent.
//   * A second send can only come from a human clicking Retry, which starts a new
//     cycle — and that cycle still runs the same absence checks first.
//   * The supplier itself dedups on platformOid (= our order_no), and order_no is
//     unique in our database, as two further independent layers.
import { query } from './db.js';
import { supplierPost, SUPPLIER_STATUSES } from './supplier.js';
import { createPurchaseOrder, printshopConfigured } from './printshop.js';

const POLL_MS = 5_000;                     // how often the worker looks for due work
const VERIFY_RETRY_MS = 20_000;            // re-check cadence while waiting on the supplier
const CONFIRM_WINDOW_MS = 30 * 60_000;     // after the single send, how long to keep verifying before a human must look
const UNREACHABLE_AFTER_MS = 2 * 60 * 60_000; // never sent because the supplier could not be checked for this long
const ABSENCE_RECHECK_MS = 3_000;          // gap between the two absence checks before sending
const LOCK_STALE_MINUTES = 10;             // a crashed worker's claim expires after this
const BATCH = 5;

const IN_PROGRESS_MESSAGE = 'Supplier is still processing this order — it will confirm automatically.';
const SLOW_MESSAGE = 'Supplier was slow to respond — confirming the order…';
const NEEDS_REVIEW_MESSAGE = 'Sent to the supplier once but never confirmed. It was NOT resent automatically — check the supplier portal for this order number before using Retry, so it is not placed twice.';
const UNREACHABLE_MESSAGE = 'Could not reach the supplier to place this order (nothing was sent). Retry once the supplier is reachable.';

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

// Stronger than one lookup: the supplier must say "not found" twice, a few seconds
// apart, on queryOrderInfo AND once on queryOrderStatus. Only then is it safe to
// send. Returns true if confirmed absent, false if found anywhere, null if any
// check failed (unknown — never send on unknown).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function confirmedAbsentOnSupplier(orderNo) {
  const first = await orderExistsOnSupplier(orderNo);
  if (first !== false) return first;
  try {
    const status = await supplierPost('/trade/api/interface/queryOrderStatus', { platformOidList: [orderNo] });
    if ((status.data || []).length) return false;
  } catch {
    return null;
  }
  await sleep(ABSENCE_RECHECK_MS);
  const second = await orderExistsOnSupplier(orderNo);
  return second === false ? true : second;
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

  // 2. Already sent once in this cycle? Then we ONLY verify — never resend. The
  //    supplier may still be working on it (big orders take minutes); if it has not
  //    shown up within the window, a human must check the portal before any Retry.
  if (order.submit_sent_at) {
    const sentAgo = Date.now() - new Date(order.submit_sent_at).getTime();
    return sentAgo < CONFIRM_WINDOW_MS
      ? defer(order, IN_PROGRESS_MESSAGE, VERIFY_RETRY_MS)
      : markFailed(order, NEEDS_REVIEW_MESSAGE);
  }

  // 3. Never sent, and the supplier has been unreachable for hours — stop trying
  //    (nothing was sent, so a Retry later is safe) and let a human know.
  const startedAgo = Date.now() - new Date(order.submit_started_at || order.created_at).getTime();
  if (startedAgo > UNREACHABLE_AFTER_MS) return markFailed(order, UNREACHABLE_MESSAGE);

  // 4. The one and only send of this cycle — but first the supplier must confirm,
  //    more than once, that it does not already hold the order.
  const absent = await confirmedAbsentOnSupplier(order.order_no);
  if (absent === false) return markSubmitted(order);
  if (absent !== true) return defer(order, SLOW_MESSAGE, VERIFY_RETRY_MS);
  // Record the send BEFORE calling out: if we crash mid-call, the next tick must
  // treat this order as possibly sent and only verify.
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
    // Claim due orders atomically. FOR UPDATE SKIP LOCKED makes this safe even if
    // several workers ever run at once: no two can claim the same order.
    const { rows } = await query(`
      UPDATE purchases SET submit_locked_at=NOW()
       WHERE purchase_id IN (
         SELECT purchase_id FROM purchases
          WHERE submission_status='Submitting'
            AND (submit_next_at IS NULL OR submit_next_at<=NOW())
            AND (submit_locked_at IS NULL OR submit_locked_at<NOW()-INTERVAL '${LOCK_STALE_MINUTES} minutes')
          ORDER BY created_at LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED)
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
