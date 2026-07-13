import { Router } from 'express';
import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'suppliers',
  id: 'supplier_id',
  orderBy: 'supplier_name ASC',
  columns: [
    'supplier_code', 'supplier_name', 'supplier_type', 'website', 'api_available',
    'api_provider', 'catalog_source', 'minimum_order', 'free_shipping_amount',
    'default_currency', 'payment_terms', 'lead_time_days', 'supports_backorders',
    'dropship_available', 'tax_exempt_supported', 'default_status', 'remarks',
  ],
});

// Nested: a supplier's contacts and warehouses
router.get('/:id/contacts', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM supplier_contacts WHERE supplier_id = $1 ORDER BY is_primary DESC, contact_name',
    [req.params.id],
  );
  res.json(rows);
}));

router.get('/:id/warehouses', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM supplier_warehouses WHERE supplier_id = $1 ORDER BY default_warehouse DESC, warehouse_name',
    [req.params.id],
  );
  res.json(rows);
}));

export default router;
