import { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Suppliers from './pages/Suppliers.jsx';
import SupplierDetail from './pages/SupplierDetail.jsx';
import Brands from './pages/Brands.jsx';
import Styles from './pages/Styles.jsx';
import StyleDetail from './pages/StyleDetail.jsx';

const CRUMBS = { '': 'Dashboard', suppliers: 'Suppliers', brands: 'Brands', styles: 'Styles' };

export default function App() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bt_sidebar') === '1');
  const { pathname } = useLocation();

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem('bt_sidebar', c ? '0' : '1');
      return !c;
    });
  };

  const crumb = CRUMBS[pathname.split('/')[1]] || 'BlankTex';

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <Sidebar />
      <div className="main">
        <Topbar onToggle={toggle} crumb={crumb} />
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/suppliers/:id" element={<SupplierDetail />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/styles" element={<Styles />} />
            <Route path="/styles/:id" element={<StyleDetail />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
