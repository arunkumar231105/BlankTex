import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ResourceManager from '../ui/ResourceManager.jsx';
import ImportModal from '../ui/ImportModal.jsx';
import { useToast } from '../ui/Toast.jsx';

const CATALOG_IMPORT = {
  entity: 'catalog',
  title: 'Catalog (Styles + Colors + Sizes + SKUs)',
  columns: ['brand_code', 'brand_name', 'style_no', 'style_name', 'garment_category', 'gender',
    'color_name', 'supplier_color_code', 'hex_color', 'size_code', 'sku_code', 'supplier_sku',
    'barcode', 'supplier_code', 'cost_price'],
  sample: 'brand_code,brand_name,style_no,style_name,garment_category,gender,color_name,supplier_color_code,size_code,sku_code,supplier_sku\n'
    + 'DIGI,DIGI,DG001,180G Adult 100% Cotton T-Shirt,T-Shirt,Unisex,Black,BL01,S,DG001-BL01-S,DG001-BL01-S\n'
    + 'DIGI,DIGI,DG001,180G Adult 100% Cotton T-Shirt,T-Shirt,Unisex,White,WH01,S,DG001-WH01-S,DG001-WH01-S\n',
};
import {
  GARMENT_CATEGORY, GENDER, FIT_TYPE, SLEEVE_TYPE, NECK_TYPE, FABRIC_TYPE, PRODUCT_STATUS,
} from '../lib/enums.js';

export default function Styles() {
  const navigate = useNavigate();
  const toast = useToast();
  const [brands, setBrands] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [supplierStyles, setSupplierStyles] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [statusBusy, setStatusBusy] = useState('');

  useEffect(() => {
    Promise.all([api.list('brands'), api.list('suppliers')])
      .then(([b, s]) => {
        setBrands(b); setSuppliers(s);
        const connected = s.find((supplier) => supplier.api_available);
        if (connected) setSupplierId(connected.supplier_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!supplierId) { setSupplierStyles([]); return; }
    let current = true;
    api.supplierCatalogStyles({ supplier: supplierId, search: supplierSearch })
      .then((rows) => current && setSupplierStyles(rows))
      .catch((e) => current && setError(e.message));
    return () => { current = false; };
  }, [supplierId, supplierSearch]);

  const load = useCallback(() => api.list('styles', { pageSize: 500 }).then((r) => r.data), []);

  const setSupplierStatus = async (style, enabled) => {
    setStatusBusy(style.style_id);
    try {
      await api.setSupplierStyleStatus(style.style_id, enabled);
      setSupplierStyles((current) => current.map((row) => row.style_id === style.style_id ? { ...row, enabled } : row));
      toast.success(`${style.style_no} is now ${enabled ? 'Active' : 'Inactive'}`);
    } catch (e) { toast.error(e.message); }
    finally { setStatusBusy(''); }
  };

  const setManagedStatus = async (style, active) => {
    setStatusBusy(style.style_id);
    try {
      await api.update('styles', style.style_id, { active });
      setRefreshKey((key) => key + 1);
      toast.success(`${style.style_no} is now ${active ? 'Active' : 'Inactive'}`);
    } catch (e) { toast.error(e.message); }
    finally { setStatusBusy(''); }
  };

  const columns = [
    { key: 'style_no', label: 'Style No.', render: (r) => <b>{r.style_no}</b> },
    { key: 'style_name', label: 'Name' },
    { key: 'brand_name', label: 'Brand' },
    { key: 'garment_category', label: 'Category' },
    { key: 'gender', label: 'Gender' },
    { key: 'sku_count', label: 'SKUs' },
    { key: 'active', label: 'Status', render: (r) => <select className={`inline-status ${r.active ? 'active' : 'inactive'}`} value={r.active ? 'active' : 'inactive'} disabled={statusBusy === r.style_id} onClick={(event) => event.stopPropagation()} onChange={(event) => setManagedStatus(r, event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select> },
  ];

  if (error) return <div className="error-box">{error}</div>;
  if (!brands) return <div className="loading">Loading…</div>;

  if (!brands.length) {
    return (
      <>
        <div className="page-head"><div><div className="page-title">Styles</div></div></div>
        <div className="card"><div className="empty">
          <div className="big">🏷️</div>
          You need at least one <b>brand</b> before adding styles.<br />
          <a href="/brands" style={{ color: 'var(--primary)' }}>Add a brand first →</a>
        </div></div>
      </>
    );
  }

  const brandOpts = brands.map((b) => ({ value: b.brand_id, label: `${b.brand_code} — ${b.brand_name}` }));
  const supplierOpts = suppliers.map((s) => ({ value: s.supplier_id, label: `${s.supplier_code} — ${s.supplier_name}` }));

  const fields = [
    { name: 'brand_id', label: 'Brand', type: 'select', options: brandOpts, required: true },
    { name: 'style_no', label: 'Style No.', required: true, hint: 'Manufacturer number, unique per brand' },
    { name: 'style_name', label: 'Style Name', required: true },
    { name: 'short_name', label: 'Short Name', placeholder: 'e.g. G5000' },
    { name: 'garment_category', label: 'Category', type: 'select', options: GARMENT_CATEGORY, required: true },
    { name: 'garment_type', label: 'Garment Type', required: true, placeholder: 'Crew Neck, Pullover…' },
    { name: 'gender', label: 'Gender', type: 'select', options: GENDER,
      hint: 'Leave blank when the source catalog does not specify a gender.' },
    { name: 'fit_type', label: 'Fit', type: 'select', options: FIT_TYPE },
    { name: 'sleeve_type', label: 'Sleeve', type: 'select', options: SLEEVE_TYPE },
    { name: 'neck_type', label: 'Neck', type: 'select', options: NECK_TYPE },
    { name: 'fabric_composition', label: 'Fabric Composition', placeholder: '100% Cotton' },
    { name: 'fabric_type', label: 'Fabric Type', type: 'select', options: FABRIC_TYPE },
    { name: 'fabric_weight_gsm', label: 'Fabric Weight (GSM)', type: 'number' },
    { name: 'fabric_weight_oz', label: 'Fabric Weight (oz)', type: 'number' },
    { name: 'product_status', label: 'Status', type: 'select', options: PRODUCT_STATUS, required: true, default: 'Active' },
    { name: 'display_order', label: 'Display Order', type: 'number', default: 0 },
    { name: 'default_supplier_id', label: 'Preferred Supplier', type: 'select', options: supplierOpts },
    { name: 'is_featured', label: 'Featured', type: 'checkbox' },
    { name: 'active', label: 'Active', type: 'checkbox', default: true },
    { name: 'discontinued', label: 'Discontinued', type: 'checkbox' },
    { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Styles</div>
          <div className="page-desc">Garment styles. Click a row to manage colors, sizes, size specs and SKUs.</div>
        </div>
      </div>
      <div className="card supplier-styles-manager">
        <div className="supplier-styles-head">
          <div><h3>Supplier-linked Styles</h3><p>These synced styles control visibility on Dashboard and New Order.</p></div>
          <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Select Supplier</option>
            {suppliers.filter((supplier) => supplier.api_available).map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_code} — {supplier.supplier_name}</option>)}
          </select>
          <input className="input" placeholder="Search supplier styles…" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} />
        </div>
        <div className="tbl-wrap supplier-styles-table"><table className="tbl"><thead><tr><th>Image</th><th>Style No.</th><th>Name</th><th>Supplier</th><th>Craft</th><th>Status</th></tr></thead><tbody>
          {!supplierStyles.length && <tr><td colSpan="6"><div className="empty">No supplier styles found.</div></td></tr>}
          {supplierStyles.map((style) => <tr key={style.style_id}>
            <td>{style.images?.[0] ? <img className="supplier-style-thumb" src={style.images[0]} alt="" /> : '👕'}</td>
            <td><b>{style.style_no}</b></td><td>{style.style_name}<small className="supplier-raw-name">{style.raw_name !== style.style_name ? style.raw_name : ''}</small></td>
            <td>{style.supplier_code}</td><td>{String(style.craft_types || '').split(',').map((value) => value === '1' ? 'Heat Transfer' : value === '2' ? 'DTG' : value).join(', ') || '—'}</td>
            <td><select className={`inline-status ${style.enabled ? 'active' : 'inactive'}`} value={style.enabled ? 'active' : 'inactive'} disabled={statusBusy === style.style_id} onChange={(event) => setSupplierStatus(style, event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></td>
          </tr>)}
        </tbody></table></div>
        <div className="supplier-styles-count">{supplierStyles.length} supplier styles · inactive styles are excluded from Dashboard and New Order</div>
      </div>

      <div className="managed-styles-title"><h3>Managed BlankTex Styles</h3><span>Manual catalog records</span></div>
      <ResourceManager
        title="Styles" singular="Style" resource="styles" idKey="style_id"
        columns={columns} fields={fields} load={load}
        refreshKey={refreshKey}
        searchKeys={['style_no', 'style_name', 'brand_name', 'garment_category']}
        onRowClick={(r) => navigate(`/styles/${r.style_id}`)}
        extraActions={<button className="btn" onClick={() => setCatalogOpen(true)}>⬆ Import Catalog (SKUs)</button>}
        importConfig={{
          entity: 'styles',
          title: 'Styles',
          columns: ['brand_code', 'style_no', 'style_name', 'short_name', 'garment_category', 'garment_type', 'gender', 'fit_type', 'sleeve_type', 'neck_type', 'fabric_composition', 'fabric_weight_gsm', 'fabric_weight_oz', 'fabric_type'],
          sample: 'brand_code,style_no,style_name,garment_category,garment_type,gender,fabric_composition,fabric_weight_gsm\nDIGI,DG001,180G Adult 100% Cotton T-Shirt,T-Shirt,T-Shirt,Unisex,100% Cotton,180\nGILDAN,C1717,Gildan Heavyweight T-Shirt,T-Shirt,T-Shirt,Unisex,100% Cotton,207\n',
        }}
      />

      {catalogOpen && (
        <ImportModal
          {...CATALOG_IMPORT}
          onClose={() => setCatalogOpen(false)}
          onDone={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
