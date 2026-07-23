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

router.get('/print-areas/by-style/:styleId', wrap(async (req, res) => {
  const processType = String(req.query.process_type || '').toUpperCase();
  if (processType && !['DTF', 'DTG'].includes(processType)) {
    return res.status(400).json({ error: 'process_type must be DTF or DTG' });
  }
  const params = [req.params.styleId];
  const processFilter = processType ? 'AND p.process_type = $2' : '';
  if (processType) params.push(processType);

  const { rows } = await query(
    `SELECT p.*, z.size_code, z.size_name, z.display_order
     FROM style_print_areas p
     JOIN style_sizes z ON z.style_size_id = p.style_size_id
     WHERE p.style_id = $1 ${processFilter}
     ORDER BY p.process_type,
       CASE p.placement WHEN 'Front' THEN 1 WHEN 'Back' THEN 2 ELSE 3 END,
       z.display_order, z.size_code`,
    params,
  );
  res.json(rows);
}));

export default router;
