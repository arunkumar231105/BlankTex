import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './crud.js';

const router = Router();

const WRITABLE = [
  'brand_id', 'style_no', 'style_name', 'short_name', 'garment_category',
  'garment_type', 'gender', 'fit_type', 'sleeve_type', 'neck_type',
  'fabric_composition', 'fabric_weight_gsm', 'fabric_weight_oz', 'fabric_type',
  'product_status', 'display_order', 'is_featured', 'default_supplier_id',
  'active', 'discontinued', 'remarks',
];

// GET /api/styles?search=&category=&gender=&fit=&page=1&pageSize=7
router.get('/', wrap(async (req, res) => {
  const { search, category, gender, fit, supplier } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 7));

  // A selected supplier is an explicit supplier-catalog view. Do not mix the
  // manually managed BlankTex catalog with records synced from another source.
  if (supplier) {
    const params = [supplier];
    const clauses = ['scs.supplier_id = $1', 'scs.active = TRUE'];
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(scs.style_code ILIKE $${params.length} OR scs.style_name ILIKE $${params.length} OR scs.display_name ILIKE $${params.length})`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const total = (await query(`SELECT COUNT(*)::int n FROM supplier_catalog_styles scs ${where}`, params)).rows[0].n;
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const { rows } = await query(`
      SELECT scs.supplier_style_id style_id,scs.style_code style_no,scs.display_name style_name,
             scs.style_name short_name,'Supplier Catalog' garment_category,NULL::text gender,NULL::text fit_type,
             'Active' product_status,TRUE active,FALSE discontinued,FALSE is_featured,
             sup.supplier_id brand_id,sup.supplier_code brand_name,
             COALESCE(scs.images->>0,'') primary_image,
             ((SELECT COUNT(*) FROM supplier_catalog_colors c WHERE c.supplier_id=scs.supplier_id AND c.active) *
              (SELECT COUNT(*) FROM supplier_catalog_sizes z WHERE z.supplier_id=scs.supplier_id AND z.active))::int sku_count,
             TRUE supplier_catalog
        FROM supplier_catalog_styles scs
        JOIN suppliers sup ON sup.supplier_id=scs.supplier_id
        ${where}
       ORDER BY scs.display_name,scs.style_code
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, listParams);
    return res.json({ data: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
  }

  const p = [];
  const clauses = [];
  if (search) {
    p.push(`%${search}%`);
    clauses.push(`(s.style_no ILIKE $${p.length} OR s.style_name ILIKE $${p.length} OR b.brand_name ILIKE $${p.length})`);
  }
  if (category) { p.push(category); clauses.push(`s.garment_category = $${p.length}`); }
  if (gender)   { p.push(gender);   clauses.push(`s.gender = $${p.length}`); }
  if (fit)      { p.push(fit);      clauses.push(`s.fit_type = $${p.length}`); }
  if (supplier) { p.push(supplier); clauses.push(`s.default_supplier_id = $${p.length}`); }
  const filterSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const countRes = await query(
    `SELECT COUNT(*)::int n FROM styles s JOIN brands b ON b.brand_id = s.brand_id ${filterSql}`,
    p,
  );
  const total = countRes.rows[0].n;

  const listParams = [...p, pageSize, (page - 1) * pageSize];
  const { rows } = await query(
    `SELECT s.style_id, s.style_no, s.style_name, s.short_name, s.garment_category,
            s.gender, s.fit_type, s.product_status, s.active, s.discontinued, s.is_featured,
            b.brand_id, b.brand_name,
            (SELECT COUNT(*)::int FROM style_color_sizes sc WHERE sc.style_id = s.style_id) AS sku_count
       FROM styles s
       JOIN brands b ON b.brand_id = s.brand_id
       ${filterSql}
      ORDER BY s.display_order, s.style_no
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    listParams,
  );

  res.json({ data: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
}));

// Distinct filter values for dropdowns
router.get('/filters', wrap(async (_req, res) => {
  const [cat, gen, fit] = await Promise.all([
    query(`SELECT DISTINCT garment_category v FROM styles ORDER BY 1`),
    query(`SELECT DISTINCT gender v FROM styles ORDER BY 1`),
    query(`SELECT DISTINCT fit_type v FROM styles WHERE fit_type IS NOT NULL ORDER BY 1`),
  ]);
  res.json({
    categories: cat.rows.map((r) => r.v),
    genders: gen.rows.map((r) => r.v),
    fits: fit.rows.map((r) => r.v),
  });
}));

// Full detail: style + brand + default supplier + colors + sizes(with specs)
router.get('/:id', wrap(async (req, res) => {
  const supplierStyle = (await query(`
    SELECT scs.*,sup.supplier_name,sup.supplier_code,sup.website,sup.default_currency supplier_currency,
           sup.lead_time_days supplier_lead_time,sup.minimum_order supplier_moq
      FROM supplier_catalog_styles scs
      JOIN suppliers sup ON sup.supplier_id=scs.supplier_id
     WHERE scs.supplier_style_id=$1 AND scs.active=TRUE`, [req.params.id])).rows[0];
  if (supplierStyle) {
    const [colors, sizes] = await Promise.all([
      query(`SELECT c.supplier_color_id style_color_id,c.color_code supplier_color_code,
                    c.color_code internal_color_code,c.display_name,c.color_name,
                    COALESCE((SELECT hex_color FROM style_colors legacy
                              WHERE COALESCE(legacy.supplier_color_code,legacy.internal_color_code)=c.color_code
                                AND legacy.hex_color IS NOT NULL LIMIT 1),'#d7dce5') hex_color,
                    TRUE active,FALSE discontinued
               FROM supplier_catalog_colors c
              WHERE c.supplier_id=$1 AND c.active=TRUE ORDER BY c.display_name,c.color_code`, [supplierStyle.supplier_id]),
      query(`SELECT z.supplier_size_id style_size_id,z.size_code,z.display_name size_name,
                    TRUE active,FALSE discontinued,
                    (SELECT COUNT(*)::int FROM supplier_catalog_colors c WHERE c.supplier_id=z.supplier_id AND c.active) sku_count
               FROM supplier_catalog_sizes z
              WHERE z.supplier_id=$1 AND z.active=TRUE ORDER BY z.display_name,z.size_code`, [supplierStyle.supplier_id]),
    ]);
    const images = (supplierStyle.images || []).map((imageUrl, index) => ({
      style_image_id: `${supplierStyle.supplier_style_id}-${index}`,
      image_url: imageUrl,
      alt_text: supplierStyle.display_name,
      is_primary: index === 0,
    }));
    return res.json({
      style_id: supplierStyle.supplier_style_id,
      supplier_catalog: true,
      supplier_id: supplierStyle.supplier_id,
      style_no: supplierStyle.style_code,
      style_name: supplierStyle.display_name,
      raw_style_name: supplierStyle.style_name,
      short_name: supplierStyle.style_code,
      garment_category: 'Supplier Catalog',
      garment_type: supplierStyle.display_name,
      craft_types: supplierStyle.craft_types,
      price_mode: supplierStyle.price_mode,
      product_status: 'Active', active: true, discontinued: false, is_featured: false,
      brand_name: supplierStyle.supplier_code, brand_code: supplierStyle.supplier_code, brand_logo: null,
      supplier_name: supplierStyle.supplier_name, supplier_code: supplierStyle.supplier_code,
      supplier_lead_time: supplierStyle.supplier_lead_time, supplier_moq: supplierStyle.supplier_moq,
      supplier_currency: supplierStyle.supplier_currency,
      colors: colors.rows, sizes: sizes.rows, images,
    });
  }

  const styleRes = await query(
    `SELECT s.*, b.brand_name, b.brand_code, b.brand_logo,
            sup.supplier_name, sup.supplier_code, sup.lead_time_days AS supplier_lead_time,
            sup.minimum_order AS supplier_moq, sup.default_currency AS supplier_currency
       FROM styles s
       JOIN brands b ON b.brand_id = s.brand_id
       LEFT JOIN suppliers sup ON sup.supplier_id = s.default_supplier_id
      WHERE s.style_id = $1`,
    [req.params.id],
  );
  if (!styleRes.rows.length) return res.status(404).json({ error: 'Style not found' });

  const [colors, sizes, imgs] = await Promise.all([
    query('SELECT * FROM style_colors WHERE style_id = $1 ORDER BY sort_order, color_name', [req.params.id]),
    query(
      `SELECT ss.*, sp.chest_width, sp.chest_circumference, sp.waist_circumference,
              sp.hip_circumference, sp.body_length, sp.pants_length, sp.inseam_length,
              sp.sleeve_length, sp.shoulder_width, sp.measurement_unit,
              sp.print_area_width, sp.print_area_height, sp.max_print_width, sp.max_print_height,
              (SELECT COUNT(*)::int FROM style_color_sizes sc WHERE sc.style_size_id = ss.style_size_id) AS sku_count
         FROM style_sizes ss
         LEFT JOIN style_size_specs sp ON sp.style_size_id = ss.style_size_id
        WHERE ss.style_id = $1
        ORDER BY ss.display_order`,
      [req.params.id],
    ),
    query('SELECT * FROM style_images WHERE style_id = $1 ORDER BY is_primary DESC, sort_order, created_at', [req.params.id]),
  ]);

  res.json({ ...styleRes.rows[0], colors: colors.rows, sizes: sizes.rows, images: imgs.rows });
}));

router.post('/', wrap(async (req, res) => {
  const cols = WRITABLE.filter((c) => req.body[c] !== undefined);
  const values = cols.map((c) => req.body[c]);
  const params = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await query(
    `INSERT INTO styles (${cols.join(',')}) VALUES (${params.join(',')}) RETURNING *`,
    values,
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', wrap(async (req, res) => {
  const cols = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const values = cols.map((c) => req.body[c]);
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE styles SET ${sets.join(',')} WHERE style_id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM styles WHERE style_id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

// Generate SKUs for every active color x active size combination that doesn't exist yet.
router.post('/:id/generate-skus', wrap(async (req, res) => {
  const styleId = req.params.id;
  const st = await query('SELECT style_no, short_name FROM styles WHERE style_id = $1', [styleId]);
  if (!st.rows.length) return res.status(404).json({ error: 'Style not found' });
  const prefix = st.rows[0].short_name || st.rows[0].style_no;

  const colors = (await query(
    'SELECT style_color_id, supplier_color_code, internal_color_code FROM style_colors WHERE style_id = $1 AND active = TRUE',
    [styleId],
  )).rows;
  const sizes = (await query(
    'SELECT style_size_id, size_code FROM style_sizes WHERE style_id = $1 AND active = TRUE',
    [styleId],
  )).rows;

  let created = 0;
  for (const c of colors) {
    const code = (c.supplier_color_code || c.internal_color_code || 'CLR').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    for (const z of sizes) {
      const exists = await query(
        'SELECT 1 FROM style_color_sizes WHERE style_id = $1 AND style_color_id = $2 AND style_size_id = $3',
        [styleId, c.style_color_id, z.style_size_id],
      );
      if (exists.rows.length) continue;
      await query(
        `INSERT INTO style_color_sizes (style_id, style_color_id, style_size_id, sku_code, active)
         VALUES ($1,$2,$3,$4,TRUE)`,
        [styleId, c.style_color_id, z.style_size_id, `${prefix}-${code}-${z.size_code}`],
      );
      created += 1;
    }
  }
  res.json({ created, colors: colors.length, sizes: sizes.length });
}));

export default router;
