import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './crud.js';

const router = Router();

const WRITABLE = [
  'brand_code', 'brand_name', 'brand_owner', 'manufacturer_id', 'brand_logo', 'website',
  'country_of_origin', 'default_size_system', 'default_currency', 'status', 'remarks',
];

// List with manufacturer name joined
router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*, m.manufacturer_name
       FROM brands b
       LEFT JOIN manufacturers m ON m.manufacturer_id = b.manufacturer_id
      ORDER BY b.brand_name`,
  );
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM brands WHERE brand_id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.post('/', wrap(async (req, res) => {
  const cols = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
  const params = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await query(
    `INSERT INTO brands (${cols.join(',')}) VALUES (${params.join(',')}) RETURNING *`,
    cols.map((c) => req.body[c]),
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
    `UPDATE brands SET ${sets.join(',')} WHERE brand_id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM brands WHERE brand_id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

export default router;
