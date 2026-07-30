// On-demand importer for the S&S Activewear catalog into supplier-scoped tables
// (ss_styles / ss_style_colors / ss_style_sizes / ss_style_skus). It does NOT
// touch the manual BlankTex catalog or the RIIN supplier catalog.
//
// Usage (inside the backend container):
//   node src/importSSCatalog.js                 # all selected brands
//   node src/importSSCatalog.js "Gildan"        # one brand (pilot)
//   node src/importSSCatalog.js "Gildan" "LAT"  # specific brands
//   node src/importSSCatalog.js --force         # re-import already-synced styles
//
// Idempotent + resumable: a committed style is skipped on re-run unless --force.
import 'dotenv/config';
import { pool } from './db.js';
import { ssGet, ssImageUrl } from './ssactivewear.js';

export const SELECTED_BRANDS = [
  'AllPro', 'Augusta Sportswear', 'BELLA + CANVAS', 'Champion', 'Comfort Colors',
  'ComfortWash by Hanes', 'Gildan', 'Hanes', 'Independent Trading Co.', 'JERZEES',
  'Lane Seven', 'LAT', 'Next Level', 'Richardson', 'Shaka Wear', 'Tultex',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normHex(value) {
  if (!value) return null;
  const h = String(value).trim();
  return /^#?[0-9a-f]{6}$/i.test(h) ? (h[0] === '#' ? h : `#${h}`).toLowerCase() : null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getSupplierId() {
  const r = await pool.query("SELECT supplier_id FROM suppliers WHERE supplier_code = 'SSA'");
  if (!r.rows[0]) throw new Error("S&S supplier row missing — deploy the migration (init.js) first.");
  return r.rows[0].supplier_id;
}

function brandCode(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'BRAND';
}

// Register each imported brand in the shared brands table, linked to the S&S
// supplier, so it appears on the Brands page. Existing brands (e.g. Gildan) are
// only linked to the supplier; their other fields are left untouched.
async function upsertBrands(supplierId, brandNames) {
  for (const name of brandNames) {
    await pool.query(
      `INSERT INTO brands (brand_code, brand_name, default_size_system, default_currency, status, supplier_id, remarks)
       VALUES ($1,$2,'Adult','USD','Active',$3,'Imported from S&S Activewear')
       ON CONFLICT (brand_name) DO UPDATE SET supplier_id = EXCLUDED.supplier_id`,
      [brandCode(name), name, supplierId],
    );
  }
}

async function importStyle(client, supplierId, style) {
  const products = await ssGet(`/products/?style=${style.styleID}`);
  if (!Array.isArray(products)) throw new Error('Unexpected products payload');

  const colors = new Map();
  const sizes = new Map();
  const skus = [];
  for (const p of products) {
    if (p.colorCode && !colors.has(p.colorCode)) {
      colors.set(p.colorCode, {
        color_code: p.colorCode,
        color_name: p.colorName || p.colorCode,
        display_name: p.colorName || p.colorCode,
        hex_color: normHex(p.color1),
        color_family: p.colorFamily || null,
        swatch_image: ssImageUrl(p.colorSwatchImage),
        front_image: ssImageUrl(p.colorFrontImage),
        back_image: ssImageUrl(p.colorBackImage),
        side_image: ssImageUrl(p.colorSideImage || p.colorDirectSideImage),
        sort_order: colors.size,
      });
    }
    if (p.sizeCode && !sizes.has(p.sizeCode)) {
      sizes.set(p.sizeCode, { size_code: p.sizeCode, size_name: p.sizeName || p.sizeCode, sort_order: sizes.size });
    }
    if (p.colorCode && p.sizeCode) {
      const wh = (p.warehouses || [])
        .filter((w) => Number(w.qty) > 0)
        .map((w) => ({ wh: w.warehouseAbbr, qty: Number(w.qty) }));
      skus.push({
        color_code: p.colorCode,
        size_code: p.sizeCode,
        sku: p.sku || null,
        gtin: p.gtin || null,
        piece_price: num(p.piecePrice),
        customer_price: num(p.customerPrice),
        qty: Number(p.qty) || 0,
        warehouses: wh,
        weight: num(p.unitWeight),
      });
    }
  }

  // Images: style render first, then a few colour fronts for a gallery.
  const images = [];
  const styleImg = ssImageUrl(style.styleImage);
  if (styleImg) images.push(styleImg);
  for (const c of colors.values()) {
    if (c.front_image && !images.includes(c.front_image)) images.push(c.front_image);
    if (images.length >= 8) break;
  }

  const descText = stripHtml(style.description);
  const styleRow = await client.query(
    `INSERT INTO ss_styles
       (supplier_id, ss_style_ref, style_code, part_number, title, brand_name, category,
        description, fabric, images, active, enabled, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,TRUE,NOW())
     ON CONFLICT (supplier_id, ss_style_ref) DO UPDATE SET
       style_code=EXCLUDED.style_code, part_number=EXCLUDED.part_number, title=EXCLUDED.title,
       brand_name=EXCLUDED.brand_name, category=EXCLUDED.category, description=EXCLUDED.description,
       fabric=EXCLUDED.fabric, images=EXCLUDED.images, active=TRUE, last_synced_at=NOW()
     RETURNING ss_style_id`,
    [supplierId, String(style.styleID), style.styleName, style.partNumber || null,
     style.title || style.styleName, style.brandName, style.baseCategory || null,
     descText.slice(0, 4000) || null, (descText.split('. ')[0] || '').slice(0, 240) || null,
     JSON.stringify(images)],
  );
  const ssStyleId = styleRow.rows[0].ss_style_id;

  // Clean re-sync of children so removed colours/sizes/skus don't linger.
  await client.query('DELETE FROM ss_style_colors WHERE ss_style_id = $1', [ssStyleId]);
  await client.query('DELETE FROM ss_style_sizes WHERE ss_style_id = $1', [ssStyleId]);
  await client.query('DELETE FROM ss_style_skus WHERE ss_style_id = $1', [ssStyleId]);

  for (const c of colors.values()) {
    await client.query(
      `INSERT INTO ss_style_colors
         (ss_style_id, color_code, color_name, display_name, hex_color, color_family,
          swatch_image, front_image, back_image, side_image, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ssStyleId, c.color_code, c.color_name, c.display_name, c.hex_color, c.color_family,
       c.swatch_image, c.front_image, c.back_image, c.side_image, c.sort_order],
    );
  }
  for (const z of sizes.values()) {
    await client.query(
      `INSERT INTO ss_style_sizes (ss_style_id, size_code, size_name, sort_order) VALUES ($1,$2,$3,$4)`,
      [ssStyleId, z.size_code, z.size_name, z.sort_order],
    );
  }
  for (const k of skus) {
    await client.query(
      `INSERT INTO ss_style_skus
         (ss_style_id, color_code, size_code, sku, gtin, piece_price, customer_price, qty, warehouses, weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (ss_style_id, color_code, size_code) DO NOTHING`,
      [ssStyleId, k.color_code, k.size_code, k.sku, k.gtin, k.piece_price, k.customer_price,
       k.qty, JSON.stringify(k.warehouses), k.weight],
    );
  }
  return { colors: colors.size, sizes: sizes.size, skus: skus.length };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const brandArgs = args.filter((a) => !a.startsWith('--'));
  const brands = brandArgs.length ? brandArgs : SELECTED_BRANDS;

  const supplierId = await getSupplierId();
  const allStyles = await ssGet('/styles/');
  const target = allStyles.filter((s) => brands.includes(s.brandName));

  // Register the brands up front so the Brands page reflects them immediately.
  await upsertBrands(supplierId, [...new Set(target.map((s) => s.brandName))]);
  const existing = new Set(
    (await pool.query('SELECT ss_style_ref FROM ss_styles WHERE supplier_id = $1', [supplierId]))
      .rows.map((r) => r.ss_style_ref),
  );

  console.log(`S&S import → ${target.length} styles across ${brands.length} brand(s)${force ? ' (force)' : ''}`);
  const totals = { styles: 0, colors: 0, sizes: 0, skus: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < target.length; i++) {
    const st = target[i];
    if (!force && existing.has(String(st.styleID))) { totals.skipped++; continue; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await importStyle(client, supplierId, st);
      await client.query('COMMIT');
      totals.styles++; totals.colors += r.colors; totals.sizes += r.sizes; totals.skus += r.skus;
      if (totals.styles % 20 === 0 || r.skus > 400) {
        console.log(`  [${i + 1}/${target.length}] ${st.brandName} ${st.styleName} — ${r.colors}c ${r.sizes}z ${r.skus} skus`);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      totals.failed++;
      console.error(`  FAIL ${st.brandName} ${st.styleName} (style ${st.styleID}): ${error.message}`);
    } finally {
      client.release();
    }
    await sleep(350);
  }

  console.log(`DONE — imported ${totals.styles} styles, ${totals.colors} colours, ${totals.sizes} sizes, ${totals.skus} skus; skipped ${totals.skipped}, failed ${totals.failed}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('S&S import failed:', error.message);
  await pool.end();
  process.exit(1);
});
