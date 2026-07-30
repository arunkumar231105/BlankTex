// Lightweight stock + price refresh for the S&S Activewear catalog.
// Re-reads live inventory/pricing for every imported ss_style and updates the
// existing ss_style_skus rows in place — it does NOT add/remove styles, colours
// or sizes (that is the importer's job). Safe to run on a schedule.
//
// Usage:  node src/refreshSSStock.js            (all imported S&S styles)
//         node src/refreshSSStock.js "Gildan"   (one brand)
import 'dotenv/config';
import { pool } from './db.js';
import { ssGet } from './ssactivewear.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const FIELDS = 'sku,colorCode,sizeCode,qty,warehouses,customerPrice,piecePrice';

async function refreshStyle(supplierId, ss) {
  const products = await ssGet(`/products/?style=${ss.ss_style_ref}&fields=${FIELDS}`);
  if (!Array.isArray(products)) return 0;
  let updated = 0;
  for (const p of products) {
    if (!p.colorCode || !p.sizeCode) continue;
    const wh = (p.warehouses || [])
      .filter((w) => Number(w.qty) > 0)
      .map((w) => ({ wh: w.warehouseAbbr, qty: Number(w.qty) }));
    const r = await pool.query(
      `UPDATE ss_style_skus
          SET qty = $4, warehouses = $5, customer_price = $6, piece_price = $7
        WHERE ss_style_id = $1 AND color_code = $2 AND size_code = $3`,
      [ss.ss_style_id, p.colorCode, p.sizeCode, Number(p.qty) || 0,
       JSON.stringify(wh), num(p.customerPrice), num(p.piecePrice)],
    );
    updated += r.rowCount;
  }
  await pool.query('UPDATE ss_styles SET last_synced_at = NOW() WHERE ss_style_id = $1', [ss.ss_style_id]);
  return updated;
}

async function main() {
  const brandArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const supplier = (await pool.query("SELECT supplier_id FROM suppliers WHERE supplier_code = 'SSA'")).rows[0];
  if (!supplier) { console.error('S&S supplier not found; nothing to refresh.'); await pool.end(); return; }

  const params = [supplier.supplier_id];
  let filter = 'supplier_id = $1 AND active';
  if (brandArgs.length) { params.push(brandArgs); filter += ' AND brand_name = ANY($2)'; }
  const styles = (await pool.query(
    `SELECT ss_style_id, ss_style_ref, brand_name, style_code FROM ss_styles WHERE ${filter}`, params,
  )).rows;

  console.log(`S&S stock refresh → ${styles.length} styles`);
  let done = 0, skus = 0, failed = 0;
  for (let i = 0; i < styles.length; i++) {
    try {
      skus += await refreshStyle(supplier.supplier_id, styles[i]);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${styles.length} styles, ${skus} skus updated`);
    } catch (error) {
      failed++;
      console.error(`  FAIL ${styles[i].brand_name} ${styles[i].style_code}: ${error.message}`);
    }
    await sleep(300);
  }
  console.log(`Stock refresh done — ${done} styles, ${skus} skus updated, ${failed} failed`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('Stock refresh failed:', error.message);
  await pool.end();
  process.exit(1);
});
