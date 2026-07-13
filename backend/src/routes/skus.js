import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'style_color_sizes',
  id: 'sku_id',
  orderBy: 'sku_code ASC',
  columns: [
    'style_id', 'style_color_id', 'style_size_id', 'sku_code', 'supplier_sku',
    'supplier_style_no', 'barcode', 'weight_lbs', 'active', 'discontinued',
  ],
});

// SKUs for a style, joined to human-readable color/size + best price
router.get('/by-style/:styleId', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT sc.sku_id, sc.sku_code, sc.supplier_sku, sc.supplier_style_no, sc.barcode, sc.weight_lbs,
            sc.active, sc.discontinued, sc.style_color_id, sc.style_size_id,
            col.display_name AS color, col.hex_color,
            sz.size_code AS size,
            (SELECT MIN(cost_price) FROM supplier_sku_prices p
              WHERE p.sku_id = sc.sku_id AND p.active = TRUE) AS best_cost
       FROM style_color_sizes sc
       JOIN style_colors col ON col.style_color_id = sc.style_color_id
       JOIN style_sizes  sz  ON sz.style_size_id  = sc.style_size_id
      WHERE sc.style_id = $1
      ORDER BY col.sort_order, sz.display_order`,
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
