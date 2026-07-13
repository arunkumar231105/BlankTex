import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ResourceManager from '../ui/ResourceManager.jsx';
import ImportModal from '../ui/ImportModal.jsx';
import { Badge } from '../lib/ui.jsx';

const CATALOG_IMPORT = {
  entity: 'catalog',
  title: 'Catalog (Styles + Colors + Sizes + SKUs)',
  columns: ['brand_code', 'brand_name', 'style_no', 'style_name', 'garment_category', 'gender',
    'color_name', 'supplier_color_code', 'hex_color', 'size_code', 'sku_code', 'supplier_sku',
    'barcode', 'supplier_code', 'cost_price'],
  sample: 'brand_code,brand_name,style_no,style_name,garment_category,gender,color_name,supplier_color_code,hex_color,size_code,sku_code,supplier_sku,barcode,supplier_code,cost_price\n'
    + 'GIL,Gildan,5000,Heavy Cotton Tee,T-Shirt,Unisex,Black,BLK,#111111,M,G5000-BLK-M,5000BLKM,00821780001,SSA,2.65\n'
    + 'GIL,Gildan,5000,Heavy Cotton Tee,T-Shirt,Unisex,Black,BLK,#111111,L,G5000-BLK-L,5000BLKL,00821780002,SSA,2.65\n'
    + 'GIL,Gildan,5000,Heavy Cotton Tee,T-Shirt,Unisex,White,WHT,#FFFFFF,M,G5000-WHT-M,5000WHTM,00821780003,SSA,2.55\n',
};
import {
  GARMENT_CATEGORY, GENDER, FIT_TYPE, SLEEVE_TYPE, NECK_TYPE, FABRIC_TYPE, PRODUCT_STATUS,
} from '../lib/enums.js';

const columns = [
  { key: 'style_no', label: 'Style No.', render: (r) => <b>{r.style_no}</b> },
  { key: 'style_name', label: 'Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'garment_category', label: 'Category' },
  { key: 'gender', label: 'Gender' },
  { key: 'sku_count', label: 'SKUs' },
  { key: 'product_status', label: 'Status', render: (r) => <Badge value={r.product_status} /> },
];

export default function Styles() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    Promise.all([api.list('brands'), api.list('suppliers')])
      .then(([b, s]) => { setBrands(b); setSuppliers(s); })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => api.list('styles', { pageSize: 500 }).then((r) => r.data), []);

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
    { name: 'gender', label: 'Gender', type: 'select', options: GENDER, required: true, default: 'Unisex' },
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
          sample: 'brand_code,style_no,style_name,garment_category,garment_type,gender,fabric_composition,fabric_weight_gsm\nGIL,5000,Heavy Cotton Tee,T-Shirt,Crew Neck,Unisex,100% Cotton,180\nBEL,3001,Unisex Jersey Tee,T-Shirt,Crew Neck,Unisex,100% Cotton,142\n',
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
