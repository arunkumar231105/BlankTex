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
    `SELECT ss.*, sp.chest_width, sp.chest_circumference, sp.waist_circumference,
            sp.hip_circumference, sp.body_length, sp.pants_length, sp.inseam_length,
            sp.sleeve_length, sp.shoulder_width, sp.head_circumference,
            sp.visor_length, sp.crown_depth, sp.garment_weight_g, sp.measurement_unit
       FROM style_sizes ss
       LEFT JOIN style_size_specs sp ON sp.style_size_id = ss.style_size_id
      WHERE ss.style_id = $1
      ORDER BY ss.display_order`,
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
