import { NavLink } from 'react-router-dom';

const CATALOG = [
  ['/', '▦', 'Dashboard'],
  ['/orders', '▣', 'Orders'],
  ['/purchase', '＋', 'New Order'],
  ['/suppliers', '🚚', 'Suppliers'],
  ['/manufacturers', '🏭', 'Manufacturers'],
  ['/brands', '◈', 'Brands'],
  ['/styles', '👕', 'Styles'],
];

function Item({ to, ico, label }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={label}>
      <span className="ico">{ico}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">▣</div>
        <div className="brand-text">
          <div className="brand-name">BlankTex</div>
          <div className="brand-sub">Product Management</div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-section">Catalog</div>
        {CATALOG.map(([to, ico, label]) => <Item key={to} to={to} ico={ico} label={label} />)}
      </nav>
    </aside>
  );
}
