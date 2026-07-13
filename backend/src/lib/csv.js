// Minimal robust CSV parser (handles quotes, escaped quotes, CRLF, BOM)
// + smart header normalization with alias mapping.

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQ = false;
  let i = 0;
  text = String(text).replace(/^﻿/, ''); // strip BOM

  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== '')); // drop blank lines
}

const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Map many header spellings to canonical column names.
const ALIASES = {
  supplier_code: ['supplier_code', 'supplier', 'vendor', 'vendor_code', 'supplier_id_code'],
  supplier_name: ['supplier_name', 'supplier_full_name', 'vendor_name'],
  supplier_type: ['supplier_type', 'type'],
  brand_code: ['brand_code', 'brand_cd'],
  brand_name: ['brand_name', 'brand', 'brand_full_name'],
  brand_owner: ['brand_owner', 'owner'],
  brand_logo: ['brand_logo', 'logo', 'logo_url', 'image', 'image_url'],
  style_no: ['style_no', 'style_number', 'style', 'styleno', 'style_num', 'model', 'model_no'],
  style_name: ['style_name', 'product_name', 'name', 'description', 'product'],
  short_name: ['short_name', 'short'],
  garment_category: ['garment_category', 'category', 'product_category'],
  garment_type: ['garment_type', 'type_name', 'product_type'],
  gender: ['gender', 'sex'],
  fit_type: ['fit_type', 'fit'],
  sleeve_type: ['sleeve_type', 'sleeve'],
  neck_type: ['neck_type', 'neck'],
  fabric_composition: ['fabric_composition', 'fabric', 'material', 'composition'],
  fabric_weight_gsm: ['fabric_weight_gsm', 'gsm', 'weight_gsm'],
  fabric_weight_oz: ['fabric_weight_oz', 'oz', 'weight_oz', 'ounces'],
  fabric_type: ['fabric_type'],
  color_name: ['color_name', 'color', 'colour', 'colour_name'],
  supplier_color_code: ['supplier_color_code', 'color_code', 'colour_code'],
  internal_color_code: ['internal_color_code', 'color_internal', 'std_color'],
  hex_color: ['hex_color', 'hex', 'hex_code', 'color_hex', 'colour_hex'],
  color_family: ['color_family', 'colour_family', 'family'],
  size_code: ['size_code', 'size'],
  size_name: ['size_name', 'size_label'],
  size_group: ['size_group', 'size_system'],
  sku_code: ['sku_code', 'sku', 'sku_no', 'internal_sku'],
  supplier_sku: ['supplier_sku', 'vendor_sku', 'supplier_sku_code', 'sku_supplier'],
  supplier_style_no: ['supplier_style_no', 'supplier_style'],
  barcode: ['barcode', 'upc', 'ean', 'gtin'],
  weight_lbs: ['weight_lbs', 'weight', 'ship_weight'],
  cost_price: ['cost_price', 'cost', 'price', 'wholesale', 'wholesale_price'],
  currency: ['currency', 'cur'],
  website: ['website', 'url', 'site'],
  country_of_origin: ['country_of_origin', 'country', 'origin'],
  default_currency: ['default_currency', 'currency'],
  catalog_source: ['catalog_source', 'source'],
  payment_terms: ['payment_terms', 'terms'],
  lead_time_days: ['lead_time_days', 'lead_time', 'lead'],
  status: ['status'],
  default_status: ['default_status', 'status'],
};

// Build reverse lookup: normalized header -> canonical
const REVERSE = {};
for (const [canonical, list] of Object.entries(ALIASES)) {
  for (const a of list) if (!(a in REVERSE)) REVERSE[a] = canonical;
}

// Parse CSV text into array of row objects keyed by canonical column names.
export function parseRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const rawHeaders = rows[0].map(norm);
  const headers = rawHeaders.map((h) => REVERSE[h] || h);
  const records = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      const val = r[idx] != null ? String(r[idx]).trim() : '';
      obj[h] = val === '' ? null : val;
    });
    return obj;
  });
  return { headers, records };
}

export const toBool = (v) => {
  if (v == null || v === '') return null;
  return ['1', 'true', 'yes', 'y', 't'].includes(String(v).trim().toLowerCase());
};

// Normalize a hex color to #RRGGBB (expands #RGB shorthand); returns null if invalid.
export const normHex = (v) => {
  if (!v) return null;
  let h = String(v).trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : null;
};
