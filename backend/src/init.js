// Idempotent startup init used by Docker (and `npm run db:init`):
//   1. wait for the database to accept connections
//   2. apply the schema only if it's missing (non-destructive)
// It NEVER seeds and NEVER wipes existing data — you enter real data via the UI.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, query } from './db.js';

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
    console.log('Schema applied. Database is empty — add data via the app.');
  } else {
    console.log('Schema already present. Leaving existing data untouched.');
  }
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
