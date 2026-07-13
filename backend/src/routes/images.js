import { query } from '../db.js';
import { crudRouter, wrap } from './crud.js';

const router = crudRouter({
  table: 'style_images',
  id: 'style_image_id',
  orderBy: 'is_primary DESC, sort_order, created_at',
  columns: ['style_id', 'image_url', 'alt_text', 'is_primary', 'sort_order'],
});

router.get('/by-style/:styleId', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM style_images WHERE style_id = $1 ORDER BY is_primary DESC, sort_order, created_at',
    [req.params.styleId],
  );
  res.json(rows);
}));

export default router;
