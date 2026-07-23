// Idempotent startup init used by Docker (and `npm run db:init`):
//   1. wait for the database to accept connections
//   2. apply the schema only if it's missing (non-destructive)
// It NEVER seeds and NEVER wipes existing data — you enter real data via the UI.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, query } from './db.js';
import { seedCatalogIfSafe, syncCatalogColors } from './catalog.js';
import { seedAdminFromEnv } from './auth.js';
import { syncRiinCatalog } from './supplierCatalog.js';
import { syncPrintAreas } from './printAreas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = process.env.SCHEMA_PATH || join(__dirname, '..', '..', 'blanktex_schema.sql');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDb(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await query('SELECT 1');
      console.log('Database is ready.');
      return;
    } catch (err) {
      console.log(`Waiting for database (${i}/${retries})… ${err.code || err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Database did not become ready in time.');
}

async function init() {
  await waitForDb();

  const { rows } = await query("SELECT to_regclass('styles') AS t");
  if (!rows[0].t) {
    console.log('Schema missing — applying blanktex_schema.sql…');
    await query(readFileSync(SCHEMA_PATH, 'utf8'));
    console.log('Schema applied. Verified catalog will be loaded after migrations.');
  } else {
    console.log('Schema already present. Leaving existing data untouched.');
  }

  await migrate();
  const adminResult = await seedAdminFromEnv();
  console.log('Admin auth:', adminResult);
  const catalogResult = await seedCatalogIfSafe();
  console.log('Catalog init:', catalogResult);
  const colorResult = await syncCatalogColors();
  console.log('Catalog color swatches:', colorResult);
  const printAreaResult = await syncPrintAreas();
  console.log('Style print areas:', printAreaResult);
}

// Idempotent, additive migrations for DBs created before a feature was added.
// Safe to run on every startup — never drops or alters existing data.
async function migrate() {
  await query(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

    CREATE TABLE IF NOT EXISTS style_images (
      style_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      style_id   UUID NOT NULL REFERENCES styles (style_id) ON DELETE CASCADE,
      image_url  VARCHAR(500) NOT NULL,
      alt_text   VARCHAR(200),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_style_images_style ON style_images (style_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_style_image_primary ON style_images (style_id) WHERE is_primary IS TRUE;

    CREATE TABLE IF NOT EXISTS manufacturers (
      manufacturer_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      manufacturer_code VARCHAR(20) UNIQUE,
      manufacturer_name VARCHAR(150) NOT NULL UNIQUE,
      country           VARCHAR(100),
      website           VARCHAR(255),
      status            VARCHAR(20) NOT NULL DEFAULT 'Active',
      remarks           TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS manufacturer_id UUID
      REFERENCES manufacturers (manufacturer_id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS ix_brands_manufacturer ON brands (manufacturer_id);

    ALTER TABLE styles ALTER COLUMN gender DROP NOT NULL;
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS chest_circumference DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS waist_circumference DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS hip_circumference DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS pants_length DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS inseam_length DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS hem_circumference DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS head_circumference VARCHAR(30);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS visor_length DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS crown_depth DECIMAL(6,2);
    ALTER TABLE style_size_specs ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(10) DEFAULT 'cm';

    CREATE TABLE IF NOT EXISTS style_decorations (
      style_decoration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      style_id UUID NOT NULL REFERENCES styles (style_id) ON DELETE CASCADE,
      process_type VARCHAR(30) NOT NULL,
      supplier_color_code VARCHAR(50),
      size_range VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_style_decorations_style ON style_decorations (style_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_style_decoration_values ON style_decorations
      (style_id, process_type, COALESCE(supplier_color_code, ''), COALESCE(size_range, ''));

    CREATE TABLE IF NOT EXISTS style_print_areas (
      style_print_area_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      style_id UUID NOT NULL REFERENCES styles (style_id) ON DELETE CASCADE,
      style_size_id UUID NOT NULL REFERENCES style_sizes (style_size_id) ON DELETE CASCADE,
      process_type VARCHAR(10) NOT NULL CHECK (process_type IN ('DTF','DTG')),
      placement VARCHAR(30) NOT NULL CHECK (placement IN ('Front','Back','Front and Back')),
      same_for_front_back BOOLEAN NOT NULL DEFAULT FALSE,
      max_width_cm DECIMAL(8,2) NOT NULL CHECK (max_width_cm > 0),
      max_height_cm DECIMAL(8,2) NOT NULL CHECK (max_height_cm > 0),
      max_width_in DECIMAL(8,2) GENERATED ALWAYS AS (ROUND(max_width_cm / 2.54, 2)) STORED,
      max_height_in DECIMAL(8,2) GENERATED ALWAYS AS (ROUND(max_height_cm / 2.54, 2)) STORED,
      scale_percent DECIMAL(6,2) NOT NULL CHECK (scale_percent > 0 AND scale_percent <= 100),
      actual_width_cm DECIMAL(8,2) NOT NULL CHECK (actual_width_cm > 0),
      actual_height_cm DECIMAL(8,2) NOT NULL CHECK (actual_height_cm > 0),
      actual_width_in DECIMAL(8,2) GENERATED ALWAYS AS (ROUND(actual_width_cm / 2.54, 2)) STORED,
      actual_height_in DECIMAL(8,2) GENERATED ALWAYS AS (ROUND(actual_height_cm / 2.54, 2)) STORED,
      source_size_code VARCHAR(30) NOT NULL,
      source_product_name VARCHAR(250),
      source_name VARCHAR(150) NOT NULL,
      source_sheet VARCHAR(80),
      source_row INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_style_print_area UNIQUE (style_id, style_size_id, process_type, placement)
    );
    CREATE INDEX IF NOT EXISTS ix_style_print_areas_style ON style_print_areas (style_id, process_type);
    CREATE INDEX IF NOT EXISTS ix_style_print_areas_size ON style_print_areas (style_size_id);

    CREATE TABLE IF NOT EXISTS catalog_meta (
      catalog_key VARCHAR(50) PRIMARY KEY,
      catalog_version VARCHAR(30) NOT NULL,
      source_description TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(120) NOT NULL DEFAULT 'Admin',
      role VARCHAR(30) NOT NULL DEFAULT 'admin',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email_lower ON admin_users (LOWER(email));

    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES admin_users (user_id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_auth_sessions_user ON auth_sessions (user_id);
    CREATE INDEX IF NOT EXISTS ix_auth_sessions_expiry ON auth_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS purchases (
      purchase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_no VARCHAR(80) NOT NULL UNIQUE,
      carrier VARCHAR(30),
      order_time TIMESTAMPTZ NOT NULL,
      recipient_name VARCHAR(160) NOT NULL,
      phone VARCHAR(60) NOT NULL,
      address_line_1 VARCHAR(250) NOT NULL,
      address_line_2 VARCHAR(250),
      city VARCHAR(120) NOT NULL,
      state_province VARCHAR(120) NOT NULL,
      postal_code VARCHAR(30) NOT NULL,
      country VARCHAR(100) NOT NULL DEFAULT 'US',
      status VARCHAR(30) NOT NULL DEFAULT 'Placed',
      created_by UUID REFERENCES admin_users (user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ck_purchases_carrier CHECK (carrier IS NULL OR carrier IN ('USPS','UPS','FedEx')),
      CONSTRAINT ck_purchases_status CHECK (status IN ('Draft','Placed','Processing','Shipped','Cancelled'))
    );
    CREATE INDEX IF NOT EXISTS ix_purchases_order_time ON purchases (order_time DESC);
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_status SMALLINT NOT NULL DEFAULT 2;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_status_str VARCHAR(80) NOT NULL DEFAULT 'Pending Push';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS goods_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers (supplier_id) ON DELETE RESTRICT;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS submission_status VARCHAR(30) NOT NULL DEFAULT 'Submitted';
    CREATE INDEX IF NOT EXISTS ix_purchases_supplier_status ON purchases (supplier_status);
    CREATE INDEX IF NOT EXISTS ix_purchases_supplier ON purchases (supplier_id);

    CREATE TABLE IF NOT EXISTS supplier_catalog_styles (
      supplier_style_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
      style_code VARCHAR(80) NOT NULL, style_name VARCHAR(250) NOT NULL, display_name VARCHAR(250) NOT NULL,
      craft_types VARCHAR(30), images JSONB NOT NULL DEFAULT '[]'::jsonb, price_mode INTEGER, raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(supplier_id,style_code)
    );
    CREATE TABLE IF NOT EXISTS supplier_catalog_colors (
      supplier_color_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
      color_code VARCHAR(80) NOT NULL, color_name VARCHAR(200) NOT NULL, display_name VARCHAR(200) NOT NULL,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE, last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(supplier_id,color_code)
    );
    CREATE TABLE IF NOT EXISTS supplier_catalog_sizes (
      supplier_size_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
      size_code VARCHAR(80) NOT NULL, size_name VARCHAR(120) NOT NULL, display_name VARCHAR(120) NOT NULL,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE, last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(supplier_id,size_code)
    );
    CREATE INDEX IF NOT EXISTS ix_supplier_catalog_styles_supplier ON supplier_catalog_styles(supplier_id,active);
    CREATE INDEX IF NOT EXISTS ix_supplier_catalog_colors_supplier ON supplier_catalog_colors(supplier_id,active);
    CREATE INDEX IF NOT EXISTS ix_supplier_catalog_sizes_supplier ON supplier_catalog_sizes(supplier_id,active);
    ALTER TABLE supplier_catalog_styles ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS purchase_items (
      purchase_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id UUID NOT NULL REFERENCES purchases (purchase_id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      product_title VARCHAR(250) NOT NULL,
      style_id UUID NOT NULL REFERENCES styles (style_id) ON DELETE RESTRICT,
      style_color_id UUID NOT NULL REFERENCES style_colors (style_color_id) ON DELETE RESTRICT,
      style_size_id UUID NOT NULL REFERENCES style_sizes (style_size_id) ON DELETE RESTRICT,
      craft_type SMALLINT NOT NULL,
      quantity INTEGER NOT NULL,
      print_position VARCHAR(10),
      specification VARCHAR(200),
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_purchase_item_line UNIQUE (purchase_id, line_no),
      CONSTRAINT ck_purchase_item_craft CHECK (craft_type IN (1,2)),
      CONSTRAINT ck_purchase_item_qty CHECK (quantity > 0),
      CONSTRAINT ck_purchase_item_position CHECK (print_position IS NULL OR print_position IN ('1','2','1,2'))
    );
    ALTER TABLE purchase_items ALTER COLUMN style_id DROP NOT NULL;
    ALTER TABLE purchase_items ALTER COLUMN style_color_id DROP NOT NULL;
    ALTER TABLE purchase_items ALTER COLUMN style_size_id DROP NOT NULL;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS supplier_style_id UUID REFERENCES supplier_catalog_styles(supplier_style_id) ON DELETE RESTRICT;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS supplier_color_id UUID REFERENCES supplier_catalog_colors(supplier_color_id) ON DELETE RESTRICT;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS supplier_size_id UUID REFERENCES supplier_catalog_sizes(supplier_size_id) ON DELETE RESTRICT;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS supplier_sku_code VARCHAR(260);
    CREATE INDEX IF NOT EXISTS ix_purchase_items_purchase ON purchase_items (purchase_id);

    CREATE TABLE IF NOT EXISTS purchase_item_images (
      purchase_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_item_id UUID NOT NULL REFERENCES purchase_items (purchase_item_id) ON DELETE CASCADE,
      image_role VARCHAR(30) NOT NULL,
      image_url VARCHAR(600) NOT NULL,
      original_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_purchase_item_image_role UNIQUE (purchase_item_id, image_role),
      CONSTRAINT ck_purchase_image_role CHECK (image_role IN ('front_print','front_mockup','back_print','back_mockup'))
    );
  `);
  await query('DROP TRIGGER IF EXISTS trg_style_images_updated ON style_images');
  await query('CREATE TRIGGER trg_style_images_updated BEFORE UPDATE ON style_images FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_manufacturers_updated ON manufacturers');
  await query('CREATE TRIGGER trg_manufacturers_updated BEFORE UPDATE ON manufacturers FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_style_decorations_updated ON style_decorations');
  await query('CREATE TRIGGER trg_style_decorations_updated BEFORE UPDATE ON style_decorations FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_style_print_areas_updated ON style_print_areas');
  await query('CREATE TRIGGER trg_style_print_areas_updated BEFORE UPDATE ON style_print_areas FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_admin_users_updated ON admin_users');
  await query('CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_purchases_updated ON purchases');
  await query('CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_purchase_items_updated ON purchase_items');
  await query('CREATE TRIGGER trg_purchase_items_updated BEFORE UPDATE ON purchase_items FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  const riin = await query(`
    INSERT INTO suppliers
      (supplier_code,supplier_name,supplier_type,website,api_available,api_provider,catalog_source,
       default_currency,dropship_available,default_status,remarks)
    VALUES ('RIIN','RIIN Fulfillment','Distributor','https://tshirt.riin.com',TRUE,'RIIN','API',
            'USD',TRUE,'Active','Production fulfillment supplier connected through the RIIN signed API.')
    ON CONFLICT (supplier_code) DO UPDATE SET
      supplier_name=EXCLUDED.supplier_name,website=EXCLUDED.website,api_available=TRUE,
      api_provider='RIIN',catalog_source='API',default_status='Active',remarks=EXCLUDED.remarks
    RETURNING supplier_id
  `);
  await query('UPDATE styles SET default_supplier_id=$1 WHERE default_supplier_id IS NULL', [riin.rows[0].supplier_id]);
  await query('UPDATE purchases SET supplier_id=$1 WHERE supplier_id IS NULL', [riin.rows[0].supplier_id]);
  try {
    const synced = await syncRiinCatalog(riin.rows[0].supplier_id);
    console.log('RIIN supplier catalog synced:', synced);
  } catch (error) {
    console.warn('RIIN catalog sync skipped; using last saved catalog:', error.message);
  }
  console.log('Migrations applied (catalog, authentication and purchasing ready).');
}

try {
  await init();
  await pool.end();
  console.log('Init complete.');
  process.exit(0);
} catch (err) {
  console.error('Init failed:', err.message);
  await pool.end();
  process.exit(1);
}
