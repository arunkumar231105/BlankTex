// Generic CRUD router factory to avoid boilerplate across simple tables.
import { Router } from 'express';
import { query } from '../db.js';

// Wrap async handlers so thrown errors reach the central error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * @param {object} opts
 * @param {string} opts.table    - table name
 * @param {string} opts.id       - primary key column
 * @param {string[]} opts.columns- writable columns (create/update)
 * @param {string} [opts.orderBy]- default ordering
 */
export function crudRouter({ table, id, columns, orderBy = 'created_at DESC' }) {
  const router = Router();

  router.get('/', wrap(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    res.json(rows);
  }));

  router.get('/:id', wrap(async (req, res) => {
    const { rows } = await query(`SELECT * FROM ${table} WHERE ${id} = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }));

  router.post('/', wrap(async (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
    const params = cols.map((_, i) => `$${i + 1}`);
    const values = cols.map((c) => req.body[c]);
    const { rows } = await query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${params.join(',')}) RETURNING *`,
      values,
    );
    res.status(201).json(rows[0]);
  }));

  router.put('/:id', wrap(async (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    const values = cols.map((c) => req.body[c]);
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE ${table} SET ${sets.join(',')} WHERE ${id} = $${values.length} RETURNING *`,
      values,
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }));

  // Soft-delete-friendly hard delete; FKs are RESTRICT so referenced rows are protected.
  router.delete('/:id', wrap(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM ${table} WHERE ${id} = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  }));

  return router;
}
