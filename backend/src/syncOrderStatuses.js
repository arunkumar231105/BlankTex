// Periodic order-status sync: pulls the latest status from the DIGI/RIIN supplier
// for all active orders and updates them. Also reconciles any 504-mislabelled
// Failed orders to Submitted (if the supplier knows about them). Run on a
// schedule so users don't have to click "Sync All".
import 'dotenv/config';
import { query, pool } from './db.js';
import { supplierPost, SUPPLIER_STATUSES } from './supplier.js';

async function main() {
  // Skip already-final orders (Closed/Refunded) — their status won't change.
  const orderNos = (await query(
    "SELECT order_no FROM purchases WHERE submission_status IN ('Submitted','Failed') AND COALESCE(supplier_status,0) NOT IN (13,15) ORDER BY created_at DESC",
  )).rows.map((r) => r.order_no);
  if (!orderNos.length) { console.log('order sync: nothing to do'); await pool.end(); return; }

  let updated = 0;
  for (let i = 0; i < orderNos.length; i += 100) {
    const batch = orderNos.slice(i, i + 100);
    try {
      const result = await supplierPost('/trade/api/interface/queryOrderStatus', { platformOidList: batch });
      for (const item of result.data || []) {
        await query(
          `UPDATE purchases SET supplier_status=$1, supplier_status_str=$2, status='Placed',
                  submission_status='Submitted', synced_at=NOW(), last_sync_error=NULL WHERE order_no=$3`,
          [item.orderStatus, SUPPLIER_STATUSES[item.orderStatus] || item.orderStateStr || '', item.platformOid],
        );
        updated += 1;
      }
    } catch (error) {
      console.error('order sync batch failed:', error.message);
    }
  }
  console.log('order status sync: updated', updated, 'of', orderNos.length);
  await pool.end();
}

main().catch(async (error) => {
  console.error('order status sync failed:', error.message);
  await pool.end();
  process.exit(1);
});
