import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import StatCards from '../components/dashboard/StatCards.jsx';
import SupplierSelect from '../components/dashboard/SupplierSelect.jsx';
import StylesBrowser from '../components/dashboard/StylesBrowser.jsx';
import StylePreview from '../components/dashboard/StylePreview.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [filters, setFilters] = useState({ categories: [], genders: [], fits: [] });
  const [query, setQuery] = useState({ search: '', category: '', gender: '', fit: '', page: 1, pageSize: 7 });
  const [list, setList] = useState({ data: [], total: 0, totalPages: 1, page: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.list('suppliers').then(setSuppliers).catch(() => {});
    api.styleFilters().then(setFilters).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.list('styles', { ...query, supplier });
      setList(res);
      if (res.data.length && !res.data.some((s) => s.style_id === selectedId)) {
        setSelectedId(res.data[0].style_id);
      } else if (!res.data.length) {
        setSelectedId(null);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [query, supplier]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.styleDetail(selectedId).then(setDetail).catch((e) => setError(e.message));
  }, [selectedId]);

  const patchQuery = (patch) => setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));

  return (
    <>
      <StatCards />

      <div className="dash-actions">
        <button className="btn" onClick={() => navigate('/styles')}>＋ Add New Style</button>
        <button className="btn primary" onClick={() => navigate('/styles')}>Manage Catalog</button>
        <button className="btn" type="button" title="Purchase Order — coming soon">Purchase Order</button>
      </div>

      <div className="dash-grid">
        <div>
          <SupplierSelect suppliers={suppliers} value={supplier} onChange={(v) => { setSupplier(v); patchQuery({ page: 1 }); }} />
          <div style={{ height: 16 }} />
          <StylesBrowser
            filters={filters}
            query={query}
            list={list}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onQuery={patchQuery}
          />
        </div>
        <StylePreview detail={detail} loading={loading} />
      </div>
    </>
  );
}
