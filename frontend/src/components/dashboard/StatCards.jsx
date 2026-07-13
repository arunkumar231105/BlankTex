import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const CARDS = [
  ['activeBrands', 'Brands', 'Active Brands', '◈', '#eaf1ff', '#2f6bff'],
  ['totalStyles', 'Styles', 'Total Styles', '👕', '#eef7ee', '#16a34a'],
  ['totalSkus', 'SKUs', 'Total SKUs', '▤', '#eefaf3', '#0ea5a0'],
  ['totalColors', 'Colors', 'Distinct Colors', '◐', '#fdf0e9', '#e8752b'],
  ['activeProducts', 'Active Products', 'Active Styles', '🛍', '#f2edff', '#7c5cff'],
  ['lowStockSkus', 'Discontinued', 'SKUs', '🚩', '#fdecec', '#e5484d'],
  ['recentlyImported', 'Recently Added', 'This Week', '⊕', '#eef7ee', '#16a34a'],
];

export default function StatCards() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.dashboardStats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {CARDS.map(([key, label, sub, ico, bg, fg]) => (
        <div className="stat" key={key} style={{ padding: 14 }}>
          <div className="st-ico" style={{ background: bg, color: fg }}>{ico}</div>
          <div>
            <div className="st-label">{label}</div>
            <div className="st-value" style={{ fontSize: 21 }}>{stats ? Number(stats[key]).toLocaleString() : '—'}</div>
            <div className="st-label" style={{ fontSize: 10.5 }}>{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
