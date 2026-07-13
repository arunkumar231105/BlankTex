import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'style_sizes',
  id: 'style_size_id',
  orderBy: 'display_order ASC',
  columns: [
    'style_id', 'size_code', 'supplier_size_code', 'size_name', 'size_group',
    'display_order', 'is_default', 'active', 'discontinued', 'remarks',
  ],
});

// Sizes (with specs) for a given style
router.get('/by-style/:styleId', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT ss.*, sp.chest_width, sp.body_length, sp.sleeve_length, sp.shoulder_width
       FROM style_sizes ss
       LEFT JOIN style_size_specs sp ON sp.style_size_id = ss.style_size_id
      WHERE ss.style_id = $1
      ORDER BY ss.display_order`,
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
