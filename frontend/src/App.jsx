import { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Suppliers from './pages/Suppliers.jsx';
import SupplierDetail from './pages/SupplierDetail.jsx';
import Manufacturers from './pages/Manufacturers.jsx';
import ManufacturerDetail from './pages/ManufacturerDetail.jsx';
import Brands from './pages/Brands.jsx';
import Styles from './pages/Styles.jsx';
import StyleDetail from './pages/StyleDetail.jsx';
import Login from './pages/Login.jsx';
import Purchase from './pages/Purchase.jsx';
import Orders from './pages/Orders.jsx';
import { useAuth } from './auth/AuthContext.jsx';

const CRUMBS = { '': 'Dashboard', orders: 'Orders', purchase: 'New Order', suppliers: 'Suppliers', manufacturers: 'Manufacturers', brands: 'Brands', styles: 'Styles' };

export default function App() {
  const { user, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bt_sidebar') === '1');
  const { pathname } = useLocation();

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem('bt_sidebar', c ? '0' : '1');
      return !c;
    });
  };

  const crumb = CRUMBS[pathname.split('/')[1]] || 'BlankTex';

  if (loading) {
    return <div className="auth-loading"><div className="auth-loading-mark">▣</div><span>Loading BlankTex…</span></div>;
  }
  if (!user) return <Login />;

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <Sidebar />
      <div className="main">
        <Topbar onToggle={toggle} crumb={crumb} user={user} onLogout={logout} />
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/purchase" element={<Purchase />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/suppliers/:id" element={<SupplierDetail />} />
            <Route path="/manufacturers" element={<Manufacturers />} />
            <Route path="/manufacturers/:id" element={<ManufacturerDetail />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/styles" element={<Styles />} />
            <Route path="/styles/:id" element={<StyleDetail />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
