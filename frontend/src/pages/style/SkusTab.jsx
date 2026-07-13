import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';
import Modal from '../../ui/Modal.jsx';
import ImportModal from '../../ui/ImportModal.jsx';
import { useToast } from '../../ui/Toast.jsx';
import { Badge, ColorDot, money, yesNo } from '../../lib/ui.jsx';
import { CURRENCY } from '../../lib/enums.js';

const SKU_IMPORT_COLS = ['color_name', 'supplier_color_code', 'hex_color', 'size_code', 'size_name',
  'sku_code', 'supplier_sku', 'barcode', 'weight_lbs', 'supplier_code', 'cost_price'];
const SKU_IMPORT_SAMPLE = 'color_name,supplier_color_code,hex_color,size_code,sku_code,supplier_sku,barcode,supplier_code,cost_price\n'
  + 'Black,BLK,#111111,M,G5000-BLK-M,5000BLKM,00821780001,SSA,2.65\n'
  + 'Black,BLK,#111111,L,G5000-BLK-L,5000BLKL,00821780002,SSA,2.65\n'
  + 'White,WHT,#FFFFFF,M,G5000-WHT-M,5000WHTM,00821780003,SSA,2.55\n';

function PricesModal({ sku, suppliers, onClose }) {
  const load = useCallback(() => api.pricesBySku(sku.sku_id), [sku.sku_id]);
  const supplierOpts = suppliers.map((s) => ({ value: s.supplier_id, label: `${s.supplier_code} — ${s.supplier_name}` }));

  const fields = [
    { name: 'supplier_id', label: 'Supplier', type: 'select', options: supplierOpts, required: true },
    { name: 'cost_price', label: 'Cost Price', type: 'number', required: true },
    { name: 'currency', label: 'Currency', type: 'select', options: CURRENCY, required: true, default: 'USD' },
    { name: 'minimum_order_qty', label: 'Min Order Qty', type: 'number', default: 1 },
    { name: 'case_pack_qty', label: 'Case Pack Qty', type: 'number' },
    { name: 'lead_time_days', label: 'Lead Time (days)', type: 'number' },
    { name: 'effective_from', label: 'Effective From', type: 'date' },
    { name: 'effective_to', label: 'Effective To', type: 'date' },
    { name: 'free_shipping_eligible', label: 'Free shipping eligible', type: 'checkbox' },
    { name: 'preferred_supplier', label: 'Preferred supplier', type: 'checkbox' },
    { name: 'active', label: 'Active', type: 'checkbox', default: true },
    { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
  ];

  const columns = [
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'cost_price', label: 'Cost', render: (r) => money(r.cost_price, r.currency) },
    { key: 'minimum_order_qty', label: 'MOQ' },
    { key: 'preferred_supplier', label: 'Preferred', render: (r) => yesNo(r.preferred_supplier) },
    { key: 'active', label: 'Active', render: (r) => <Badge value={r.active ? 'Active' : 'Inactive'} /> },
  ];

  return (
    <Modal title={`Supplier Prices — ${sku.sku_code}`} onClose={onClose} wide>
      <ResourceManager
        title="Prices" singular="Price" resource="prices" idKey="supplier_price_id"
        columns={columns} fields={fields} load={load} fixed={{ sku_id: sku.sku_id }}
      />
    </Modal>
  );
}

const columns = [
  { key: 'sku_code', label: 'SKU', render: (r) => <b>{r.sku_code}</b> },
  { key: 'color', label: 'Color', render: (r) => <ColorDot hex={r.hex_color} name={r.color} /> },
  { key: 'size', label: 'Size' },
  { key: 'supplier_sku', label: 'Supplier SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'best_cost', label: 'Best Cost', render: (r) => (r.best_cost != null ? money(r.best_cost) : '—') },
  { key: 'active', label: 'Active', render: (r) => <Badge value={r.active ? 'Active' : 'Inactive'} /> },
];

export default function SkusTab({ styleId }) {
  const toast = useToast();
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pricesSku, setPricesSku] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.colorsByStyle(styleId), api.sizesByStyle(styleId), api.list('suppliers')])
      .then(([c, s, sup]) => { setColors(c); setSizes(s); setSuppliers(sup); })
      .catch(() => {});
  }, [styleId, refreshKey]);

  const load = useCallback(() => api.skusByStyle(styleId), [styleId]);

  const colorOpts = colors.map((c) => ({ value: c.style_color_id, label: c.display_name }));
  const sizeOpts = sizes.map((z) => ({ value: z.style_size_id, label: z.size_code }));

  const fields = [
    { name: 'style_color_id', label: 'Color', type: 'select', options: colorOpts, required: true },
    { name: 'style_size_id', label: 'Size', type: 'select', options: sizeOpts, required: true },
    { name: 'sku_code', label: 'SKU Code', required: true },
    { name: 'supplier_sku', label: 'Supplier SKU' },
    { name: 'supplier_style_no', label: 'Supplier Style No.' },
    { name: 'barcode', label: 'Barcode (UPC/EAN)' },
    { name: 'weight_lbs', label: 'Weight (lbs)', type: 'number' },
    { name: 'active', label: 'Active', type: 'checkbox', default: true },
    { name: 'discontinued', label: 'Discontinued', type: 'checkbox' },
  ];

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateSkus(styleId);
      toast.success(res.created ? `Generated ${res.created} new SKU(s)` : 'No new SKUs — all combinations exist');
      setRefreshKey((k) => k + 1);
    } catch (e) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  return (
    <>
      <p className="page-desc" style={{ marginBottom: 12 }}>
        Each SKU is one Color × Size. Add colors and sizes first, then generate SKUs automatically.
      </p>
      <ResourceManager
        title="SKUs" singular="SKU" resource="skus" idKey="sku_id"
        columns={columns} fields={fields} load={load} fixed={{ style_id: styleId }}
        refreshKey={refreshKey}
        searchKeys={['sku_code', 'color', 'size', 'supplier_sku', 'barcode']}
        extraActions={
          <>
            <button className="btn" onClick={() => setImportOpen(true)}>⬆ Import SKUs CSV</button>
            <button className="btn" onClick={generate} disabled={generating || !colors.length || !sizes.length}>
              {generating ? 'Generating…' : '⚙ Generate SKUs'}
            </button>
          </>
        }
        rowActions={(r) => <button className="btn sm" onClick={() => setPricesSku(r)}>Prices</button>}
      />
      {pricesSku && <PricesModal sku={pricesSku} suppliers={suppliers} onClose={() => setPricesSku(null)} />}
      {importOpen && (
        <ImportModal
          entity={`style/${styleId}`}
          title="SKUs for this style"
          columns={SKU_IMPORT_COLS}
          sample={SKU_IMPORT_SAMPLE}
          onClose={() => setImportOpen(false)}
          onDone={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
