// Idempotent startup init used by Docker (and `npm run db:init`):
//   1. wait for the database to accept connections
//   2. apply the schema only if it's missing (non-destructive)
// It NEVER seeds and NEVER wipes existing data — you enter real data via the UI.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, query } from './db.js';
import { seedCatalogIfSafe } from './catalog.js';

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

  const { rows } = await query("SELECT to_regclass('public.styles') AS t");
  if (!rows[0].t) {
    console.log('Schema missing — applying blanktex_schema.sql…');
    await query(readFileSync(SCHEMA_PATH, 'utf8'));
    console.log('Schema applied. Verified catalog will be loaded after migrations.');
  } else {
    console.log('Schema already present. Leaving existing data untouched.');
  }

  await migrate();
  const catalogResult = await seedCatalogIfSafe();
  console.log('Catalog init:', catalogResult);
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

    CREATE TABLE IF NOT EXISTS catalog_meta (
      catalog_key VARCHAR(50) PRIMARY KEY,
      catalog_version VARCHAR(30) NOT NULL,
      source_description TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query('DROP TRIGGER IF EXISTS trg_style_images_updated ON style_images');
  await query('CREATE TRIGGER trg_style_images_updated BEFORE UPDATE ON style_images FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_manufacturers_updated ON manufacturers');
  await query('CREATE TRIGGER trg_manufacturers_updated BEFORE UPDATE ON manufacturers FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  await query('DROP TRIGGER IF EXISTS trg_style_decorations_updated ON style_decorations');
  await query('CREATE TRIGGER trg_style_decorations_updated BEFORE UPDATE ON style_decorations FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
  console.log('Migrations applied (catalog measurements and decorations ready).');
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
