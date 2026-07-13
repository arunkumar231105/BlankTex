import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'style_colors',
  id: 'style_color_id',
  orderBy: 'sort_order ASC',
  columns: [
    'style_id', 'supplier_color_code', 'color_name', 'internal_color_code', 'display_name',
    'hex_color', 'pantone_code', 'color_family', 'sort_order', 'is_popular',
    'is_default', 'active', 'discontinued', 'remarks',
  ],
});

// Colors for a given style
router.get('/by-style/:styleId', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM style_colors WHERE style_id = $1 ORDER BY sort_order, color_name',
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
