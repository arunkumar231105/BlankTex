import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'supplier_sku_prices',
  id: 'supplier_price_id',
  orderBy: 'created_at DESC',
  columns: [
    'supplier_id', 'warehouse_id', 'sku_id', 'cost_price', 'currency',
    'minimum_order_qty', 'case_pack_qty', 'lead_time_days', 'free_shipping_eligible',
    'preferred_supplier', 'effective_from', 'effective_to', 'active', 'remarks',
  ],
});

// All supplier prices for a SKU, with supplier name
router.get('/by-sku/:skuId', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, s.supplier_name, s.supplier_code
       FROM supplier_sku_prices p
       JOIN suppliers s ON s.supplier_id = p.supplier_id
      WHERE p.sku_id = $1
      ORDER BY p.preferred_supplier DESC, p.cost_price`,
    [req.params.skuId],
  );
  res.json(rows);
}));

export default router;
