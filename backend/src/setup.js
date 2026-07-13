// Creates the blanktex database (if missing) and applies the schema.
// Usage: npm run db:setup
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = process.env.SCHEMA_PATH || join(__dirname, '..', '..', 'blanktex_schema.sql');

const cfg = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};
const dbName = process.env.PGDATABASE || 'blanktex';

async function ensureDatabase() {
  const admin = new Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rows.length === 0) {
    await admin.query(`CREATE DATABASE ${dbName}`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
  await admin.end();
}

async function applySchema() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const client = new Client({ ...cfg, database: dbName });
  await client.connect();
  // Idempotent: wipe and rebuild so setup/reset can be re-run safely.
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.query(sql);
  console.log('Schema applied from blanktex_schema.sql');
  await client.end();
}

try {
  await ensureDatabase();
  await applySchema();
  console.log('Setup complete.');
  process.exit(0);
} catch (err) {
  console.error('Setup failed:', err.message);
  process.exit(1);
}
