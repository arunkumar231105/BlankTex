import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// Single shared connection pool for the whole API.
export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'blanktex',
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

// Thin helper so routes read cleanly: const { rows } = await query(sql, params)
export function query(text, params) {
  return pool.query(text, params);
}
