import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'supplier_contacts',
  id: 'supplier_contact_id',
  orderBy: 'is_primary DESC, contact_name',
  columns: [
    'supplier_id', 'contact_name', 'designation', 'department', 'email', 'phone',
    'mobile', 'whatsapp', 'extension', 'contact_type', 'is_primary',
    'receives_purchase_orders', 'preferred_contact_method', 'timezone', 'notes', 'status',
  ],
});

router.get('/by-supplier/:id', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM supplier_contacts WHERE supplier_id = $1 ORDER BY is_primary DESC, contact_name',
    [req.params.id],
  );
  res.json(rows);
}));

export default router;
