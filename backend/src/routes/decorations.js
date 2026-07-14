import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'style_decorations',
  id: 'style_decoration_id',
  orderBy: 'process_type ASC, supplier_color_code ASC NULLS FIRST, size_range ASC NULLS FIRST',
  columns: ['style_id', 'process_type', 'supplier_color_code', 'size_range', 'notes'],
});

router.get('/by-style/:styleId', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM style_decorations WHERE style_id = $1
      ORDER BY process_type, supplier_color_code NULLS FIRST, size_range NULLS FIRST`,
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
