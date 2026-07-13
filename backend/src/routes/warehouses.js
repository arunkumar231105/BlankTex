import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'supplier_warehouses',
  id: 'warehouse_id',
  orderBy: 'default_warehouse DESC, warehouse_name',
  columns: [
    'supplier_id', 'warehouse_code', 'warehouse_name', 'warehouse_type', 'address_line1',
    'address_line2', 'city', 'state', 'postal_code', 'country', 'timezone', 'contact_name',
    'phone', 'email', 'latitude', 'longitude', 'shipping_cutoff_time', 'average_dispatch_days',
    'supports_pickup', 'default_warehouse', 'api_warehouse_code', 'status', 'remarks',
  ],
});

router.get('/by-supplier/:id', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM supplier_warehouses WHERE supplier_id = $1 ORDER BY default_warehouse DESC, warehouse_name',
    [req.params.id],
  );
  res.json(rows);
}));

export default router;
