// Verified catalog loader generated from the supplied DIGI/Gildan workbooks.
// Safe startup behavior: seed an empty DB, replace the repository's known demo
// fixture, and otherwise leave user-managed data untouched.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(__dirname, 'catalog-data.json'), 'utf8'));
const DEMO_STYLE_NOS = new Set(['3001', '5000', '3600', '1717', 'SS4500']);

async function insertOne(client, sql, params) {
  return (await client.query(sql, params)).rows[0];
}

async function clearCatalog(client) {
  await client.query(`TRUNCATE
    supplier_sku_prices, style_color_sizes, style_print_areas, style_decorations, style_size_specs,
    style_sizes, style_colors, style_images, styles, brands, manufacturers,
    supplier_warehouses, supplier_contacts, suppliers, catalog_meta
    RESTART IDENTITY CASCADE`);
}

async function loadCatalog(client) {
  const brandIds = new Map();
  for (const brand of catalog.brands) {
    const row = await insertOne(client,
      `INSERT INTO brands (brand_code, brand_name, default_size_system, default_currency, status,
         remarks) VALUES ($1,$2,$3,'USD','Active',$4) RETURNING brand_id`,
      [brand.brand_code, brand.brand_name, brand.default_size_system,
       `Verified catalog import ${catalog.catalog_version}`]);
    brandIds.set(brand.brand_code, row.brand_id);
  }

  for (const [order, style] of catalog.styles.entries()) {
    const row = await insertOne(client,
      `INSERT INTO styles (brand_id, style_no, style_name, short_name, garment_category,
         garment_type, gender, fabric_composition, fabric_weight_gsm, product_status,
         display_order, active, discontinued, remarks)
       VALUES ($1,$2,$3,$2,$4,$5,$6,$7,$8,'Active',$9,TRUE,FALSE,$10)
       RETURNING style_id`,
      [brandIds.get(style.brand_code), style.style_no, style.style_name,
       style.garment_category, style.garment_type, style.gender,
       style.fabric_composition, style.fabric_weight_gsm, order + 1,
       'Source: supplied catalog workbook; untranslated source values normalized to English.']);
    const styleId = row.style_id;

    const colorIds = new Map();
    for (const color of style.colors) {
      const c = await insertOne(client,
        `INSERT INTO style_colors (style_id, supplier_color_code, color_name,
           internal_color_code, display_name, hex_color, sort_order, active, discontinued)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,FALSE) RETURNING style_color_id`,
        [styleId, color.supplier_color_code, color.color_name,
         color.internal_color_code, color.display_name, color.hex_color, color.sort_order]);
      colorIds.set(color.supplier_color_code, c.style_color_id);
    }

    const sizeIds = new Map();
    for (const size of style.sizes) {
      const z = await insertOne(client,
        `INSERT INTO style_sizes (style_id, size_code, supplier_size_code, size_name,
           size_group, display_order, active, discontinued)
         VALUES ($1,$2,$2,$3,$4,$5,TRUE,FALSE) RETURNING style_size_id`,
        [styleId, size.size_code, size.size_name, size.size_group, size.display_order]);
      sizeIds.set(size.size_code, z.style_size_id);
      if (size.spec) {
        const cols = Object.keys(size.spec);
        const values = [z.style_size_id, ...cols.map((key) => size.spec[key])];
        const names = ['style_size_id', ...cols];
        const params = names.map((_, i) => `$${i + 1}`);
        await client.query(
          `INSERT INTO style_size_specs (${names.join(',')}) VALUES (${params.join(',')})`, values);
      }
    }

    for (const sku of style.skus) {
      await client.query(
        `INSERT INTO style_color_sizes (style_id, style_color_id, style_size_id, sku_code,
           supplier_sku, supplier_style_no, active, discontinued)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,FALSE)`,
        [styleId, colorIds.get(sku.supplier_color_code), sizeIds.get(sku.size_code),
         sku.sku_code, sku.supplier_sku, sku.supplier_style_no]);
    }

    for (const image of style.images) {
      await client.query(
        `INSERT INTO style_images (style_id, image_url, alt_text, is_primary, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [styleId, image.image_url, image.alt_text, image.is_primary, image.sort_order]);
    }

    for (const decoration of style.decorations) {
      await client.query(
        `INSERT INTO style_decorations (style_id, process_type, supplier_color_code, size_range)
         VALUES ($1,$2,$3,$4)`,
        [styleId, decoration.process_type, decoration.supplier_color_code, decoration.size_range]);
    }
  }

  await client.query(
    `INSERT INTO catalog_meta (catalog_key, catalog_version, source_description)
     VALUES ('primary',$1,$2)`, [catalog.catalog_version, catalog.source]);
}

export async function seedCatalogIfSafe({ forceReplace = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT catalog_version FROM catalog_meta WHERE catalog_key = $1', ['primary']);
    if (current.rows[0]?.catalog_version === catalog.catalog_version && !forceReplace) {
      await client.query('COMMIT');
      return { action: 'unchanged', version: catalog.catalog_version };
    }

    const existing = await client.query('SELECT style_no FROM styles ORDER BY style_no');
    const styleNos = existing.rows.map((row) => row.style_no);
    const knownDemo = styleNos.length === DEMO_STYLE_NOS.size
      && styleNos.every((styleNo) => DEMO_STYLE_NOS.has(styleNo));
    if (styleNos.length && !knownDemo && !forceReplace) {
      await client.query('COMMIT');
      return { action: 'preserved', reason: 'existing non-demo catalog data', existingStyles: styleNos.length };
    }

    if (styleNos.length || forceReplace) await clearCatalog(client);
    await loadCatalog(client);
    await client.query('COMMIT');
    return { action: knownDemo ? 'replaced-demo' : 'seeded', version: catalog.catalog_version,
      ...catalog.audit };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Non-destructive correction for deployments that already imported the catalog
// before display swatches were added. Only catalog-matched brand/style/color rows
// are touched; user-created colors remain unchanged.
export async function syncCatalogColors() {
  const values = [];
  const params = [];
  for (const style of catalog.styles) {
    for (const color of style.colors) {
      const base = params.length;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
      params.push(style.brand_code, style.style_no, color.supplier_color_code,
        color.display_name, color.hex_color);
    }
  }
  const result = await pool.query(
    `UPDATE style_colors sc
        SET color_name = v.display_name,
            display_name = v.display_name,
            hex_color = v.hex_color
       FROM styles s, brands b,
            (VALUES ${values.join(',')}) AS v(brand_code, style_no, supplier_color_code, display_name, hex_color)
      WHERE sc.style_id = s.style_id
        AND s.brand_id = b.brand_id
        AND b.brand_code = v.brand_code
        AND s.style_no = v.style_no
        AND sc.supplier_color_code = v.supplier_color_code`,
    params,
  );
  return { updated: result.rowCount };
}

async function runCli() {
  const result = await seedCatalogIfSafe({ forceReplace: process.argv.includes('--replace') });
  console.log('Catalog:', result);
  await pool.end();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch(async (error) => {
    console.error('Catalog import failed:', error);
    await pool.end();
    process.exit(1);
  });
}
