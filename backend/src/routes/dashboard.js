import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './crud.js';

const router = Router();

// Top stat cards shown on the dashboard.
router.get('/stats', wrap(async (_req, res) => {
  const [brands, styles, skus, colors, active, lowStock, recent] = await Promise.all([
    query(`SELECT COUNT(*)::int n FROM brands WHERE status = 'Active'`),
    query(`SELECT COUNT(*)::int n FROM styles`),
    query(`SELECT COUNT(*)::int n FROM style_color_sizes`),
    query(`SELECT COUNT(DISTINCT internal_color_code)::int n FROM style_colors`),
    query(`SELECT COUNT(*)::int n FROM styles WHERE active = TRUE AND discontinued = FALSE`),
    query(`SELECT COUNT(*)::int n FROM style_color_sizes WHERE discontinued = TRUE`),
    query(`SELECT COUNT(*)::int n FROM styles WHERE created_at > NOW() - INTERVAL '7 days'`),
  ]);

  res.json({
    activeBrands: brands.rows[0].n,
    totalStyles: styles.rows[0].n,
    totalSkus: skus.rows[0].n,
    totalColors: colors.rows[0].n,
    activeProducts: active.rows[0].n,
    lowStockSkus: lowStock.rows[0].n,
    recentlyImported: recent.rows[0].n,
  });
}));

export default router;
