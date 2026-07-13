import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'manufacturers',
  id: 'manufacturer_id',
  orderBy: 'manufacturer_name ASC',
  columns: ['manufacturer_code', 'manufacturer_name', 'country', 'website', 'status', 'remarks'],
});

// Brands owned by this manufacturer
router.get('/:id/brands', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM brands WHERE manufacturer_id = $1 ORDER BY brand_name',
    [req.params.id],
  );
  res.json(rows);
}));

export default router;
