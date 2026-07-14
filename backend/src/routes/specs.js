import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './crud.js';

const router = Router();

const COLS = [
  'chest_width', 'body_length', 'sleeve_length', 'shoulder_width', 'garment_weight_g',
  'chest_circumference', 'waist_circumference', 'hip_circumference', 'pants_length',
  'inseam_length', 'hem_circumference', 'head_circumference', 'visor_length',
  'crown_depth', 'measurement_unit',
  'print_area_width', 'print_area_height', 'max_print_width', 'max_print_height',
  'front_print_top_margin', 'back_print_top_margin', 'is_available', 'is_discontinued', 'notes',
];

// One spec row per size. Fetch (may be null).
router.get('/by-size/:sizeId', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM style_size_specs WHERE style_size_id = $1', [req.params.sizeId]);
  res.json(rows[0] || null);
}));

// Upsert the spec for a size.
router.put('/by-size/:sizeId', wrap(async (req, res) => {
  const cols = COLS.filter((c) => req.body[c] !== undefined);
  const existing = await query('SELECT size_spec_id FROM style_size_specs WHERE style_size_id = $1', [req.params.sizeId]);

  if (existing.rows.length) {
    if (!cols.length) return res.json(existing.rows[0]);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    const values = cols.map((c) => req.body[c]);
    values.push(req.params.sizeId);
    const { rows } = await query(
      `UPDATE style_size_specs SET ${sets.join(',')} WHERE style_size_id = $${values.length} RETURNING *`,
      values,
    );
    return res.json(rows[0]);
  }

  const insertCols = ['style_size_id', ...cols];
  const values = [req.params.sizeId, ...cols.map((c) => req.body[c])];
  const params = insertCols.map((_, i) => `$${i + 1}`);
  const { rows } = await query(
    `INSERT INTO style_size_specs (${insertCols.join(',')}) VALUES (${params.join(',')}) RETURNING *`,
    values,
  );
  res.status(201).json(rows[0]);
}));

export default router;
