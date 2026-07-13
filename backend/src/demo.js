// Optional REVIEW demo data — 5 styles with full supporting data.
// Run:  docker compose exec backend node src/demo.js      (or: npm run db:demo)
// It TRUNCATES all tables first, so only run it on a review/empty database.
import 'dotenv/config';
import { pool, query } from './db.js';

const one = async (sql, params) => (await query(sql, params)).rows[0];

const COLORS = [
  ['White', '#FFFFFF', 'White', 'WHT'], ['Black', '#111111', 'Black', 'BLK'],
  ['Navy', '#1F2A4C', 'Blue', 'NAV'], ['Red', '#C8102E', 'Red', 'RED'],
  ['Sport Grey', '#B4B7BA', 'Grey', 'SPG'], ['Forest', '#22402E', 'Green', 'FOR'],
];
const SIZES = [
  ['S', 'Small', 1, 18, 28], ['M', 'Medium', 2, 20, 29], ['L', 'Large', 3, 22, 30],
  ['XL', 'Extra Large', 4, 24, 31], ['2XL', '2X Large', 5, 26, 32],
];

async function clear() {
  await query(`TRUNCATE
    supplier_sku_prices, style_color_sizes, style_size_specs, style_sizes,
    style_colors, styles, brands, supplier_warehouses, supplier_contacts, suppliers
    RESTART IDENTITY CASCADE`);
}

async function buildStyle(cfg) {
  const style = await one(
    `INSERT INTO styles (brand_id, style_no, style_name, short_name, garment_category, garment_type,
       gender, fit_type, sleeve_type, neck_type, fabric_composition, fabric_weight_gsm, fabric_weight_oz,
       fabric_type, product_status, display_order, is_featured, default_supplier_id, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Active',$15,$16,$17,TRUE) RETURNING style_id`,
    [cfg.brand_id, cfg.style_no, cfg.style_name, cfg.short_name, cfg.category, cfg.type, cfg.gender,
     cfg.fit, cfg.sleeve, cfg.neck, cfg.fabric, cfg.gsm, cfg.oz, cfg.fabric_type, cfg.order,
     cfg.featured || false, cfg.supplier_id],
  );
  const styleId = style.style_id;

  const colorIds = [];
  for (let i = 0; i < cfg.colors; i++) {
    const [name, hex, family, code] = COLORS[i];
    const c = await one(
      `INSERT INTO style_colors (style_id, supplier_color_code, color_name, internal_color_code,
         display_name, hex_color, color_family, sort_order, is_popular, is_default, active)
       VALUES ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9,TRUE) RETURNING style_color_id`,
      [styleId, code, name, name.toUpperCase().replace(/[^A-Z]/g, ''), hex, family, i + 1, i < 3, i === 0],
    );
    colorIds.push({ id: c.style_color_id, code });
  }

  const sizeIds = [];
  for (let i = 0; i < cfg.sizes; i++) {
    const [code, sname, ord, chest, length] = SIZES[i];
    const z = await one(
      `INSERT INTO style_sizes (style_id, size_code, supplier_size_code, size_name, size_group,
         display_order, is_default, active)
       VALUES ($1,$2,$2,$3,'Adult',$4,$5,TRUE) RETURNING style_size_id`,
      [styleId, code, sname, ord, code === 'M'],
    );
    await query(
      `INSERT INTO style_size_specs (style_size_id, chest_width, body_length, print_area_width,
         print_area_height, garment_weight_g, is_available)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
      [z.style_size_id, chest, length, chest - 8, length - 13, cfg.gsm],
    );
    sizeIds.push({ id: z.style_size_id, code });
  }

  for (const c of colorIds) {
    for (const z of sizeIds) {
      const sku = await one(
        `INSERT INTO style_color_sizes (style_id, style_color_id, style_size_id, sku_code,
           supplier_sku, supplier_style_no, weight_lbs, active)
         VALUES ($1,$2,$3,$4,$5,$6,0.42,TRUE) RETURNING sku_id`,
        [styleId, c.id, z.id, `${cfg.short_name}-${c.code}-${z.code}`,
         `${cfg.style_no}${c.code}${z.code}`, cfg.style_no],
      );
      const bump = ['2XL', '3XL'].includes(z.code) ? 1.2 : 0;
      await query(
        `INSERT INTO supplier_sku_prices (supplier_id, sku_id, cost_price, currency,
           minimum_order_qty, case_pack_qty, lead_time_days, preferred_supplier, effective_from, active)
         VALUES ($1,$2,$3,'USD',12,72,4,TRUE,CURRENT_DATE,TRUE)`,
        [cfg.supplier_id, sku.sku_id, (cfg.baseCost + bump).toFixed(2)],
      );
    }
  }
  return styleId;
}

async function run() {
  console.log('Clearing…');
  await clear();

  console.log('Suppliers…');
  const mkSupplier = (code, name, type, lead) => one(
    `INSERT INTO suppliers (supplier_code, supplier_name, supplier_type, catalog_source, website,
       api_available, default_currency, payment_terms, lead_time_days, supports_backorders,
       dropship_available, tax_exempt_supported, default_status)
     VALUES ($1,$2,$3,'API',$4,TRUE,'USD','Net 30',$5,TRUE,TRUE,TRUE,'Active') RETURNING supplier_id`,
    [code, name, type, `https://www.${code.toLowerCase()}.com`, lead],
  );
  const bella = await mkSupplier('BC', 'Bella+Canvas (USA)', 'Brand', 4);
  const ssa = await mkSupplier('SSA', 'S&S Activewear', 'Distributor', 2);
  const sanmar = await mkSupplier('SMR', 'SanMar', 'Distributor', 2);
  const alpha = await mkSupplier('ALP', 'AlphaBroder', 'Distributor', 3);

  // A couple of contacts + warehouses so those screens have data
  await query(
    `INSERT INTO supplier_contacts (supplier_id, contact_name, designation, department, contact_type,
       email, phone, is_primary, receives_purchase_orders, preferred_contact_method, status)
     VALUES ($1,'John Smith','Sales Manager','Sales','Sales','john@bellacanvas.com','+1 800-555-1234',
       TRUE,TRUE,'Email','Active'),
       ($2,'Lisa Brown','Account Manager','Customer Service','Customer Service','lisa@ssactivewear.com',
       '+1 800-555-9876',TRUE,TRUE,'Phone','Active')`,
    [bella.supplier_id, ssa.supplier_id],
  );
  await query(
    `INSERT INTO supplier_warehouses (supplier_id, warehouse_code, warehouse_name, warehouse_type,
       address_line1, city, state, postal_code, country, average_dispatch_days, default_warehouse,
       api_warehouse_code, status)
     VALUES ($1,'BC-CA01','Los Angeles DC','Distribution Center','123 Distribution Way','Los Angeles',
       'California','90670','USA',1,TRUE,'CA01','Active'),
       ($2,'SSA-NV01','Reno DC','Distribution Center','456 Logistics Blvd','Reno','Nevada','89506',
       'USA',1,TRUE,'NV01','Active')`,
    [bella.supplier_id, ssa.supplier_id],
  );

  console.log('Brands…');
  const mkBrand = async (code, name, owner) => (await one(
    `INSERT INTO brands (brand_code, brand_name, brand_owner, brand_logo, default_size_system,
       default_currency, status)
     VALUES ($1,$2,$3,$4,'Adult','USD','Active') RETURNING brand_id`,
    [code, name, owner, `https://dummyimage.com/120x120/2f6bff/ffffff.png&text=${code}`],
  )).brand_id;
  const bBella = await mkBrand('BEL', 'Bella Canvas', 'Bella+Canvas LLC');
  const bGildan = await mkBrand('GIL', 'Gildan', 'Gildan Activewear');
  const bNext = await mkBrand('NXT', 'Next Level', 'Next Level Apparel');
  const bComfort = await mkBrand('CC', 'Comfort Colors', 'Gildan Activewear');
  const bIndie = await mkBrand('IND', 'Independent', 'Independent Trading Co.');

  console.log('Styles + colors + sizes + SKUs + prices…');
  await buildStyle({ brand_id: bBella, supplier_id: bella.supplier_id, style_no: '3001', short_name: 'BC3001',
    style_name: 'Unisex Jersey Short Sleeve Tee', category: 'T-Shirt', type: 'Crew Neck', gender: 'Unisex',
    fit: 'Retail Fit', sleeve: 'Short Sleeve', neck: 'Crew Neck', fabric: '100% Airlume combed ring-spun cotton',
    gsm: 142, oz: 4.2, fabric_type: 'Ring Spun Cotton', order: 1, featured: true, baseCost: 2.65, colors: 6, sizes: 5 });
  await buildStyle({ brand_id: bGildan, supplier_id: ssa.supplier_id, style_no: '5000', short_name: 'G5000',
    style_name: 'Heavy Cotton Adult Tee', category: 'T-Shirt', type: 'Crew Neck', gender: 'Unisex',
    fit: 'Classic Fit', sleeve: 'Short Sleeve', neck: 'Crew Neck', fabric: '100% Cotton', gsm: 180, oz: 5.3,
    fabric_type: 'Ring Spun Cotton', order: 2, baseCost: 2.10, colors: 5, sizes: 5 });
  await buildStyle({ brand_id: bNext, supplier_id: ssa.supplier_id, style_no: '3600', short_name: 'NL3600',
    style_name: 'Unisex Cotton Tank Top', category: 'Tank Top', type: 'Tank', gender: 'Unisex',
    fit: 'Slim Fit', sleeve: 'Sleeveless', neck: 'Crew Neck', fabric: '100% Combed Cotton', gsm: 145, oz: 4.3,
    fabric_type: 'Combed Cotton', order: 3, baseCost: 3.40, colors: 4, sizes: 4 });
  await buildStyle({ brand_id: bComfort, supplier_id: sanmar.supplier_id, style_no: '1717', short_name: 'CC1717',
    style_name: 'Garment-Dyed Adult Tee', category: 'T-Shirt', type: 'Crew Neck', gender: 'Unisex',
    fit: 'Relaxed Fit', sleeve: 'Short Sleeve', neck: 'Crew Neck', fabric: '100% Ring Spun Cotton', gsm: 200,
    oz: 6.1, fabric_type: 'Garment Dyed', order: 4, baseCost: 5.90, colors: 5, sizes: 5 });
  await buildStyle({ brand_id: bIndie, supplier_id: alpha.supplier_id, style_no: 'SS4500', short_name: 'IND4500',
    style_name: 'Midweight Pullover Hoodie', category: 'Hoodie', type: 'Pullover', gender: 'Unisex',
    fit: 'Relaxed Fit', sleeve: 'Long Sleeve', neck: 'Hooded', fabric: '80% Cotton / 20% Polyester', gsm: 300,
    oz: 8.9, fabric_type: 'Fleece', order: 5, baseCost: 11.20, colors: 4, sizes: 5 });

  const c = await one(`SELECT
    (SELECT COUNT(*) FROM suppliers) suppliers, (SELECT COUNT(*) FROM brands) brands,
    (SELECT COUNT(*) FROM styles) styles, (SELECT COUNT(*) FROM style_colors) colors,
    (SELECT COUNT(*) FROM style_color_sizes) skus, (SELECT COUNT(*) FROM supplier_sku_prices) prices`);
  console.log('Demo data loaded:', c);
}

try {
  await run();
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error('Demo load failed:', err);
  await pool.end();
  process.exit(1);
}
