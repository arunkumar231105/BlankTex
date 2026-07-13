import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './crud.js';
import { parseRecords, toBool, normHex } from '../lib/csv.js';

const router = Router();

// pick(row, cols) -> object with only present (non-null) columns, boolean coercion applied
function pick(row, cols, boolCols = []) {
  const out = {};
  for (const c of cols) {
    if (row[c] == null) continue;
    out[c] = boolCols.includes(c) ? toBool(row[c]) : row[c];
  }
  return out;
}

async function upsert(table, conflictCols, obj) {
  const cols = Object.keys(obj);
  const params = cols.map((_, i) => `$${i + 1}`);
  const updates = cols
    .filter((c) => !conflictCols.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`);
  const setClause = updates.length ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${params.join(',')})
               ON CONFLICT (${conflictCols.join(',')}) ${setClause} RETURNING *`;
  const { rows } = await query(sql, cols.map((c) => obj[c]));
  return rows[0];
}

// ---------- Suppliers ----------
router.post('/suppliers', wrap(async (req, res) => {
  const { records } = parseRecords(req.body.csv || '');
  const cols = ['supplier_code', 'supplier_name', 'supplier_type', 'website', 'api_available',
    'api_provider', 'catalog_source', 'minimum_order', 'free_shipping_amount', 'default_currency',
    'payment_terms', 'lead_time_days', 'supports_backorders', 'dropship_available',
    'tax_exempt_supported', 'default_status'];
  const bools = ['api_available', 'supports_backorders', 'dropship_available', 'tax_exempt_supported'];
  const errors = []; let inserted = 0;
  for (let n = 0; n < records.length; n++) {
    try {
      const o = pick(records[n], cols, bools);
      if (!o.supplier_code || !o.supplier_name) throw new Error('supplier_code and supplier_name are required');
      o.supplier_type = o.supplier_type || 'Distributor';
      o.catalog_source = o.catalog_source || 'CSV Import';
      await upsert('suppliers', ['supplier_code'], o);
      inserted++;
    } catch (e) { errors.push({ row: n + 2, message: e.message }); }
  }
  res.json({ processed: records.length, inserted, errors });
}));

// ---------- Brands ----------
router.post('/brands', wrap(async (req, res) => {
  const { records } = parseRecords(req.body.csv || '');
  const cols = ['brand_code', 'brand_name', 'brand_owner', 'brand_logo', 'website',
    'country_of_origin', 'default_size_system', 'default_currency', 'status'];
  const errors = []; let inserted = 0;
  for (let n = 0; n < records.length; n++) {
    try {
      const o = pick(records[n], cols);
      if (!o.brand_name && !o.brand_code) throw new Error('brand_name (or brand_code) is required');
      // Derive a code from the name when only a name is given
      if (!o.brand_code) o.brand_code = o.brand_name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BRAND';
      if (!o.brand_name) o.brand_name = o.brand_code;
      await upsert('brands', ['brand_code'], o);
      inserted++;
    } catch (e) { errors.push({ row: n + 2, message: e.message }); }
  }
  res.json({ processed: records.length, inserted, errors });
}));

// ---------- Styles (resolves brand by brand_code) ----------
router.post('/styles', wrap(async (req, res) => {
  const { records } = parseRecords(req.body.csv || '');
  const brandCache = new Map();
  const styleCols = ['style_no', 'style_name', 'short_name', 'garment_category', 'garment_type',
    'gender', 'fit_type', 'sleeve_type', 'neck_type', 'fabric_composition', 'fabric_weight_gsm',
    'fabric_weight_oz', 'fabric_type', 'product_status', 'display_order', 'is_featured',
    'active', 'discontinued', 'remarks'];
  const bools = ['is_featured', 'active', 'discontinued'];
  const errors = []; let inserted = 0;

  for (let n = 0; n < records.length; n++) {
    try {
      const r = records[n];
      const brandKey = r.brand_code || r.brand_name;
      if (!brandKey) throw new Error('brand_code or brand_name is required to link the style');
      if (!r.style_no || !r.style_name) throw new Error('style_no and style_name are required');
      let brandId = brandCache.get(brandKey);
      if (!brandId) {
        const b = await query('SELECT brand_id FROM brands WHERE brand_code = $1 OR brand_name = $1', [brandKey]);
        if (!b.rows.length) throw new Error(`brand "${brandKey}" not found — import brands first`);
        brandId = b.rows[0].brand_id; brandCache.set(brandKey, brandId);
      }
      const o = pick(r, styleCols, bools);
      o.brand_id = brandId;
      o.garment_category = o.garment_category || 'T-Shirt';
      o.garment_type = o.garment_type || 'Standard';
      o.gender = o.gender || 'Unisex';
      await upsert('styles', ['brand_id', 'style_no'], o);
      inserted++;
    } catch (e) { errors.push({ row: n + 2, message: e.message }); }
  }
  res.json({ processed: records.length, inserted, errors });
}));

// ---- Shared find-or-create helpers (ctx carries caches + created counters) ----
function newCtx() {
  return {
    brandCache: new Map(), styleCache: new Map(), colorCache: new Map(),
    sizeCache: new Map(), supplierCache: new Map(),
    created: { brands: 0, styles: 0, colors: 0, sizes: 0, skus: 0, prices: 0 },
  };
}

async function foBrand(r, ctx) {
  const key = r.brand_code || r.brand_name;
  if (!key) throw new Error('brand_code (or brand_name) is required');
  if (ctx.brandCache.has(key)) return ctx.brandCache.get(key);
  let row = (await query('SELECT brand_id FROM brands WHERE brand_code = $1 OR brand_name = $1', [key])).rows[0];
  if (!row) {
    const code = (r.brand_code || key).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BRAND';
    row = (await query('INSERT INTO brands (brand_code, brand_name) VALUES ($1,$2) RETURNING brand_id', [code, r.brand_name || key])).rows[0];
    ctx.created.brands++;
  }
  ctx.brandCache.set(key, row.brand_id);
  return row.brand_id;
}

async function foStyle(r, brandId, ctx) {
  if (!r.style_no) throw new Error('style_no is required');
  const key = `${brandId}|${r.style_no}`;
  if (ctx.styleCache.has(key)) return ctx.styleCache.get(key);
  let row = (await query('SELECT style_id FROM styles WHERE brand_id = $1 AND style_no = $2', [brandId, r.style_no])).rows[0];
  if (!row) {
    row = (await query(
      `INSERT INTO styles (brand_id, style_no, style_name, short_name, garment_category, garment_type, gender,
         fit_type, sleeve_type, neck_type, fabric_composition, fabric_weight_gsm, fabric_weight_oz, fabric_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING style_id`,
      [brandId, r.style_no, r.style_name || r.style_no, r.short_name,
       r.garment_category || 'T-Shirt', r.garment_type || 'Standard', r.gender || 'Unisex',
       r.fit_type, r.sleeve_type, r.neck_type, r.fabric_composition, r.fabric_weight_gsm,
       r.fabric_weight_oz, r.fabric_type],
    )).rows[0];
    ctx.created.styles++;
  }
  ctx.styleCache.set(key, row.style_id);
  return row.style_id;
}

async function foColor(styleId, r, ctx) {
  const ident = r.supplier_color_code || r.internal_color_code || r.color_name;
  if (!ident) return null;
  const key = `${styleId}|${ident}`;
  if (ctx.colorCache.has(key)) return ctx.colorCache.get(key);
  let row = (await query(
    `SELECT style_color_id FROM style_colors
      WHERE style_id = $1 AND (supplier_color_code = $2 OR display_name = $2 OR color_name = $2) LIMIT 1`,
    [styleId, ident],
  )).rows[0];
  if (!row) {
    const name = r.color_name || ident;
    row = (await query(
      `INSERT INTO style_colors (style_id, color_name, display_name, internal_color_code,
         supplier_color_code, hex_color, color_family)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING style_color_id`,
      [styleId, name, name, r.internal_color_code || name.toUpperCase().replace(/[^A-Z0-9]/g, ''),
       r.supplier_color_code, normHex(r.hex_color), r.color_family],
    )).rows[0];
    ctx.created.colors++;
  }
  ctx.colorCache.set(key, row.style_color_id);
  return row.style_color_id;
}

async function foSize(styleId, r, ctx) {
  if (!r.size_code) return null;
  const key = `${styleId}|${r.size_code}`;
  if (ctx.sizeCache.has(key)) return ctx.sizeCache.get(key);
  let row = (await query('SELECT style_size_id FROM style_sizes WHERE style_id = $1 AND size_code = $2', [styleId, r.size_code])).rows[0];
  if (!row) {
    row = (await query(
      `INSERT INTO style_sizes (style_id, size_code, size_name, size_group)
       VALUES ($1,$2,$3,$4) RETURNING style_size_id`,
      [styleId, r.size_code, r.size_name || r.size_code, r.size_group || 'Adult'],
    )).rows[0];
    ctx.created.sizes++;
  }
  ctx.sizeCache.set(key, row.style_size_id);
  return row.style_size_id;
}

async function foSupplier(code, ctx) {
  if (!code) return null;
  if (ctx.supplierCache.has(code)) return ctx.supplierCache.get(code);
  let row = (await query('SELECT supplier_id FROM suppliers WHERE supplier_code = $1 OR supplier_name = $1', [code])).rows[0];
  if (!row) {
    row = (await query(
      `INSERT INTO suppliers (supplier_code, supplier_name, supplier_type, catalog_source)
       VALUES ($1,$2,'Distributor','CSV Import') RETURNING supplier_id`,
      [code, code],
    )).rows[0];
  }
  ctx.supplierCache.set(code, row.supplier_id);
  return row.supplier_id;
}

// Build color/size/SKU (+optional price) for a known style from one CSV row.
async function processSkuRow(styleId, r, ctx) {
  const colorId = await foColor(styleId, r, ctx);
  const sizeId = await foSize(styleId, r, ctx);
  if (!colorId || !sizeId) return; // need both for a SKU

  const existing = (await query(
    'SELECT sku_id FROM style_color_sizes WHERE style_id = $1 AND style_color_id = $2 AND style_size_id = $3',
    [styleId, colorId, sizeId],
  )).rows[0];
  const skuCode = r.sku_code
    || `${r.short_name || r.style_no || 'SKU'}-${(r.supplier_color_code || r.color_name || 'CLR').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${r.size_code}`;
  let skuId;
  if (existing) {
    skuId = existing.sku_id;
    await query(
      `UPDATE style_color_sizes SET supplier_sku = COALESCE($2, supplier_sku),
         barcode = COALESCE($3, barcode), weight_lbs = COALESCE($4, weight_lbs)
       WHERE sku_id = $1`,
      [skuId, r.supplier_sku, r.barcode, r.weight_lbs],
    );
  } else {
    skuId = (await query(
      `INSERT INTO style_color_sizes (style_id, style_color_id, style_size_id, sku_code,
         supplier_sku, supplier_style_no, barcode, weight_lbs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING sku_id`,
      [styleId, colorId, sizeId, skuCode, r.supplier_sku, r.supplier_style_no || r.style_no, r.barcode, r.weight_lbs],
    )).rows[0].sku_id;
    ctx.created.skus++;
  }

  if (r.cost_price != null && r.supplier_code) {
    const supId = await foSupplier(r.supplier_code, ctx);
    const price = (await query('SELECT supplier_price_id FROM supplier_sku_prices WHERE supplier_id = $1 AND sku_id = $2', [supId, skuId])).rows[0];
    if (price) {
      await query('UPDATE supplier_sku_prices SET cost_price = $2, currency = COALESCE($3, currency) WHERE supplier_price_id = $1',
        [price.supplier_price_id, r.cost_price, r.currency]);
    } else {
      await query('INSERT INTO supplier_sku_prices (supplier_id, sku_id, cost_price, currency) VALUES ($1,$2,$3,$4)',
        [supId, skuId, r.cost_price, r.currency || 'USD']);
      ctx.created.prices++;
    }
  }
}

// ---------- Smart catalog import (one flat CSV -> brand/style/color/size/sku/price) ----------
router.post('/catalog', wrap(async (req, res) => {
  const { records } = parseRecords(req.body.csv || '');
  const ctx = newCtx();
  const errors = [];
  for (let n = 0; n < records.length; n++) {
    try {
      const r = records[n];
      const brandId = await foBrand(r, ctx);
      const styleId = await foStyle(r, brandId, ctx);
      await processSkuRow(styleId, r, ctx);
    } catch (e) { errors.push({ row: n + 2, message: e.message }); }
  }
  res.json({ processed: records.length, created: ctx.created, errors });
}));

// ---------- Style-scoped import (SKUs tab) -> colors/sizes/skus/prices for ONE style ----------
router.post('/style/:styleId', wrap(async (req, res) => {
  const { styleId } = req.params;
  const st = (await query('SELECT short_name, style_no FROM styles WHERE style_id = $1', [styleId])).rows[0];
  if (!st) return res.status(404).json({ error: 'Style not found' });
  const prefix = st.short_name || st.style_no;

  const { records } = parseRecords(req.body.csv || '');
  const ctx = newCtx();
  const errors = [];
  for (let n = 0; n < records.length; n++) {
    try {
      // Give bare rows the style's own number so auto-generated sku_codes look right
      if (!records[n].short_name && !records[n].style_no) records[n].short_name = prefix;
      await processSkuRow(styleId, records[n], ctx);
    } catch (e) { errors.push({ row: n + 2, message: e.message }); }
  }
  const { brands, styles, ...created } = ctx.created; // omit brand/style counters here
  res.json({ processed: records.length, created, errors });
}));

export default router;
