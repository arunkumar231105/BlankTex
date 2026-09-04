import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ui/Toast.jsx';
import { useNavigate } from 'react-router-dom';
import usePersistentState, { clearPersistentState } from '../hooks/usePersistentState.js';
import { COUNTRIES, statesForCountry } from '../lib/geo.js';
import SearchSelect from '../ui/SearchSelect.jsx';

const DRAFT_FORM_KEY = 'blanktex_new_order_form';
const DRAFT_ITEMS_KEY = 'blanktex_new_order_items';

const emptyItem = () => ({
  product_title: '', style_id: '', style_color_id: '', style_size_id: '', craft_type: '1', quantity: 1,
  print_position: '', specification: '', remark: '', images: {},
});

function localDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function generateOrderId() {
  const now = new Date();
  const stamp = [now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, '0')).join('');
  return `ORD-${stamp}`;
}

// Auto-fill from a Printshop sales order matches its line items to this supplier's
// catalog by name/code. A match must be exact (normalised) — a wrong guess would
// send the wrong garment to the supplier, so anything uncertain is left blank for
// the agent to pick, which the required-field validation then enforces.
const normalizeKey = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
function matchCatalog(list, fields, ...candidates) {
  const wanted = candidates.map(normalizeKey).filter(Boolean);
  if (!wanted.length) return null;
  for (const entry of list) {
    for (const field of fields) {
      const value = normalizeKey(entry[field]);
      if (value && wanted.includes(value)) return entry;
    }
  }
  return null;
}

// Garment weight comes from the curated size spec (grams per piece). Only sizes that
// have a measured weight report one — the rest stay blank rather than guessing.
function itemUnitWeight(item, catalog) {
  const style = catalog.styles.find((entry) => entry.style_id === item.style_id);
  const grams = style?.size_weights?.[item.style_size_id];
  return grams == null ? null : Number(grams);
}

function formatWeight(grams) {
  if (grams == null) return '—';
  const kg = grams / 1000;
  const lb = grams / 453.59237;
  return `${grams < 1000 ? `${Math.round(grams)} g` : `${kg.toFixed(2)} kg`} (${lb.toFixed(2)} lb)`;
}

function Section({ number, title, children }) {
  return (
    <section className="purchase-section">
      <h2><span>{number}</span>{title}</h2>
      {children}
    </section>
  );
}

function UploadZone({ label, hint, image, uploading, onFile, onClear }) {
  const handleDrop = (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]);
  };
  return (
    <div className="purchase-upload-field">
      <label>{label} <small>{hint}</small></label>
      <label
        className={`purchase-upload${image ? ' uploaded' : ''}${uploading ? ' busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('drag-over'); }}
        onDragLeave={(event) => event.currentTarget.classList.remove('drag-over')}
        onDrop={handleDrop}
      >
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => event.target.files[0] && onFile(event.target.files[0])} />
        {uploading ? <><span className="upload-spinner" /> <b>Uploading…</b></> : image ? (
          <>
            <img src={image.url} alt={label} />
            <span className="upload-success">✓ Uploaded</span>
            <button type="button" onClick={(event) => { event.preventDefault(); onClear(); }}>Remove</button>
          </>
        ) : (
          <><span className="upload-icon">⇧</span><b>Upload {label.replace(' *', '')}</b><span>Click or drag &amp; drop</span></>
        )}
      </label>
    </div>
  );
}

function PurchaseItem({ item, index, catalog, onChange, onRemove, onUpload, uploading }) {
  const selectedStyle = catalog.styles.find((entry) => entry.style_id === item.style_id);
  // A style only comes in the colours/sizes the catalog lists for it. When the
  // supplier gives no per-style breakdown (color_ids empty) we keep the full
  // supplier palette rather than leaving the dropdown empty.
  const colors = useMemo(() => {
    if (selectedStyle?.colors?.length) return selectedStyle.colors;
    const allowed = selectedStyle?.color_ids || [];
    return allowed.length ? catalog.colors.filter((color) => allowed.includes(color.style_color_id)) : catalog.colors;
  }, [catalog.colors, selectedStyle]);
  const sizes = useMemo(() => {
    const allowed = selectedStyle?.size_ids || [];
    return allowed.length ? catalog.sizes.filter((size) => allowed.includes(size.style_size_id)) : catalog.sizes;
  }, [catalog.sizes, selectedStyle]);
  const styleOptions = useMemo(() => catalog.styles.map((style) => ({ value: style.style_id, label: style.style_name, hint: style.style_no })), [catalog.styles]);
  const colorOptions = useMemo(() => colors.map((color) => ({ value: color.style_color_id, label: color.display_name || color.color_name, hint: color.color_code })), [colors]);
  const sizeOptions = useMemo(() => sizes.map((size) => ({ value: size.style_size_id, label: size.size_name, hint: size.size_code })), [sizes]);
  const supportedCrafts = String(selectedStyle?.craft_types || '1,2').split(',').map((value) => value.trim());
  const unitWeight = itemUnitWeight(item, catalog);
  const pieces = Math.max(1, Number.parseInt(item.quantity, 10) || 0);
  const bothSides = item.print_position === '1,2';
  const imageField = (role, label, hint) => (
    <UploadZone
      label={label} hint={hint} image={item.images[role]} uploading={uploading === role}
      onFile={(file) => onUpload(role, file)} onClear={() => onChange('images', { ...item.images, [role]: undefined })}
    />
  );

  return (
    <div className="purchase-item-card">
      <div className="purchase-item-head"><b>Item #{index + 1}</b><button type="button" aria-label={`Remove item ${index + 1}`} onClick={onRemove}>×</button></div>
      <div className="purchase-field full">
        <label>Product Title *</label>
        <input value={item.product_title} onChange={(e) => onChange('product_title', e.target.value)} placeholder="e.g. Custom Print T-Shirt" required />
      </div>
      <div className="purchase-grid three">
        <div className="purchase-field"><label>Style *</label><SearchSelect value={item.style_id} options={styleOptions} placeholder="— Search style name or number —" onChange={(value) => onChange('style_id', value)} /></div>
        <div className="purchase-field"><label>Color *</label><SearchSelect value={item.style_color_id} options={colorOptions} placeholder={item.style_id ? '— Select Color —' : '— Select a style first —'} disabled={!item.style_id} onChange={(value) => onChange('style_color_id', value)} /></div>
        <div className="purchase-field"><label>Size *</label><SearchSelect value={item.style_size_id} options={sizeOptions} placeholder={item.style_id ? '— Select Size —' : '— Select a style first —'} disabled={!item.style_id} onChange={(value) => onChange('style_size_id', value)} /></div>
      </div>
      {selectedStyle && item.style_size_id && <div className="purchase-weight-line">
        <span>Weight</span>
        <b>{unitWeight == null ? 'Not published for this size' : `${formatWeight(unitWeight)} / pc`}</b>
        {unitWeight != null && <small>× {pieces} pc = {formatWeight(unitWeight * pieces)}</small>}
      </div>}
      {selectedStyle && <div className="supplier-style-preview">
        {selectedStyle.images?.[0] ? <img src={selectedStyle.images[0]} alt={selectedStyle.style_name} /> : <div className="supplier-style-placeholder">👕</div>}
        <div><b>{selectedStyle.style_name}</b><span>Supplier style: {selectedStyle.style_no}</span><small>{colors.length} colours · {sizes.length} sizes{selectedStyle.color_ids?.length ? '' : ' (supplier-wide palette)'} · SKU: {selectedStyle.style_no}-COLOR-SIZE</small></div>
      </div>}
      <div className="purchase-grid two">
        <div className="purchase-field"><label>Craft Type *</label><select value={item.craft_type} onChange={(e) => onChange('craft_type', e.target.value)}><option value="1" disabled={!supportedCrafts.includes('1')}>Heat Transfer (烫画)</option><option value="2" disabled={!supportedCrafts.includes('2')}>DTG Direct-to-Garment (直喷)</option></select></div>
        <div className="purchase-field"><label>Quantity *</label><input type="number" min="1" value={item.quantity} onChange={(e) => onChange('quantity', e.target.value)} required /></div>
      </div>
      <div className="purchase-grid three">
        <div className="purchase-field"><label>Print Position</label><select value={item.print_position} onChange={(e) => onChange('print_position', e.target.value)}><option value="">— None —</option><option value="1">Front</option><option value="2">Back</option><option value="1,2">Both (Front &amp; Back)</option></select></div>
        <div className="purchase-field"><label>Specification</label><input value={item.specification} onChange={(e) => onChange('specification', e.target.value)} placeholder="e.g. Black/XL" /></div>
        <div className="purchase-field"><label>Remark</label><input value={item.remark} onChange={(e) => onChange('remark', e.target.value)} placeholder="Optional note" /></div>
      </div>
      <div className="purchase-upload-grid">
        {imageField('front_print', bothSides ? 'Front Print *' : 'Print Image *', '(PNG, what gets printed)')}
        {imageField('front_mockup', bothSides ? 'Front Mockup *' : 'Mockup Image *', '(preview/effect)')}
      </div>
      {bothSides && <div className="purchase-upload-grid back-images">
        {imageField('back_print', 'Back Print *', '(PNG, back design)')}
        {imageField('back_mockup', 'Back Mockup *', '(back preview)')}
      </div>}
    </div>
  );
}

export default function Purchase() {
  const toast = useToast();
  const navigate = useNavigate();
  const initialForm = useMemo(() => ({ supplier_id: '', order_no: generateOrderId(), carrier: '', order_time: localDateTime(), recipient_name: '', phone: '', address_line_1: '', address_line_2: '', city: '', state_province: '', postal_code: '', country: 'US' }), []);
  // Draft persistence: the form + line items survive a page refresh/redeploy
  // (localStorage), so in-progress work is never lost. Cleared on submit.
  const [form, setForm] = usePersistentState(DRAFT_FORM_KEY, initialForm);
  const [items, setItems] = usePersistentState(DRAFT_ITEMS_KEY, []);
  const [catalog, setCatalog] = useState({ suppliers: [], styles: [], colors: [], sizes: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [uploading, setUploading] = useState({});
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [salesOrders, setSalesOrders] = useState([]);
  const [salesOrderId, setSalesOrderId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');

  useEffect(() => {
    api.purchaseCatalog().then(setCatalog).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  // Apparel sales orders from Printshop that don't yet have a purchase order.
  // Silent if the bridge is unreachable — importing is optional, manual entry stays.
  useEffect(() => {
    api.salesOrders().then((res) => setSalesOrders(res.data || [])).catch(() => setSalesOrders([]));
  }, []);

  // A restored draft can hold a colour/size the style no longer offers (the catalog
  // is re-synced between sessions) — drop those so the item is re-picked from the
  // style's real palette instead of failing at submit time.
  useEffect(() => {
    if (!catalog.styles.length) return;
    setItems((current) => current.map((item) => {
      const style = catalog.styles.find((entry) => entry.style_id === item.style_id);
      if (!style) return item;
      const colorOk = !style.color_ids?.length || !item.style_color_id || style.color_ids.includes(item.style_color_id);
      const sizeOk = !style.size_ids?.length || !item.style_size_id || style.size_ids.includes(item.style_size_id);
      if (colorOk && sizeOk) return item;
      return { ...item, style_color_id: colorOk ? item.style_color_id : '', style_size_id: sizeOk ? item.style_size_id : '' };
    }));
  }, [catalog.styles]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    // Changing supplier invalidates any imported line (its matched SKUs belong to
    // the old supplier's catalog), so clear the items and the sales-order link too.
    if (field === 'supplier_id') { setItems([]); setSalesOrderId(''); setImportNote(''); }
  };
  const changeItem = (index, field, value) => setItems((current) => current.map((entry, itemIndex) => {
    if (itemIndex !== index) return entry;
    if (field === 'style_id') {
      const style = catalog.styles.find((candidate) => candidate.style_id === value);
      const firstCraft = String(style?.craft_types || '1').split(',')[0].trim() || '1';
      return { ...entry, style_id: value, style_color_id: '', style_size_id: '', craft_type: firstCraft };
    }
    return { ...entry, [field]: value };
  }));

  // Pull a Printshop apparel sales order and pre-fill the form: recipient from the
  // order (falling back to the customer's address), and each line matched to this
  // supplier's catalog. Unmatched style/color/size stay blank on purpose.
  const importSalesOrder = async (id) => {
    setSalesOrderId(id);
    if (!id) { setImportNote(''); return; }
    if (!form.supplier_id) { toast.error('Select a fulfillment supplier first, then import'); setSalesOrderId(''); return; }
    setImporting(true);
    try {
      const { data: order } = await api.salesOrder(id);
      const ship = order.ship_to || {};
      setForm((current) => ({
        ...current,
        recipient_name: order.shipping_name || order.contact_name || ship.name || ship.company_name || current.recipient_name,
        phone: order.contact_phone || ship.mobile_number || ship.phone || ship.company_phone_number || current.phone,
        address_line_1: order.shipping_address || ship.address_line1 || current.address_line_1,
        address_line_2: '',
        city: ship.city || current.city,
        state_province: ship.state || current.state_province,
        postal_code: ship.zip || current.postal_code,
        country: ship.country || current.country || 'US',
      }));
      const styles = catalog.styles.filter((s) => s.supplier_id === form.supplier_id);
      const colors = catalog.colors.filter((c) => c.supplier_id === form.supplier_id);
      const sizes = catalog.sizes.filter((s) => s.supplier_id === form.supplier_id);
      let unmatched = 0;
      const mapped = (order.items || []).map((it) => {
        const style = matchCatalog(styles, ['style_name', 'style_no'], it.item, it.model);
        const color = matchCatalog(colors, ['color_code', 'color_name', 'display_name'], it.color);
        const size = matchCatalog(sizes, ['size_code', 'size_name'], it.size);
        if (!style || !color || !size) unmatched += 1;
        const images = {};
        if (it.front_image) images.front_print = { url: it.front_image };
        if (it.front_mockup) images.front_mockup = { url: it.front_mockup };
        if (it.back_image) images.back_print = { url: it.back_image };
        if (it.back_mockup) images.back_mockup = { url: it.back_mockup };
        const bothSides = Boolean(it.back_image || it.back_mockup);
        return {
          ...emptyItem(),
          product_title: it.item || it.style_description || 'Imported item',
          style_id: style?.style_id || '',
          style_color_id: color?.style_color_id || '',
          style_size_id: size?.style_size_id || '',
          craft_type: style ? (String(style.craft_types || '1').split(',')[0].trim() || '1') : '1',
          quantity: Number(it.qty) || 1,
          print_position: bothSides ? '1,2' : (it.front_image ? '1' : ''),
          specification: [it.color, it.size].filter(Boolean).join(' / '),
          remark: it.catalog_sku ? `Printshop SKU ${it.catalog_sku}` : '',
          images,
        };
      });
      setItems(mapped);
      const total = mapped.length;
      setImportNote(
        `Imported ${order.order_number} — ${total} item${total === 1 ? '' : 's'}. ` +
        (unmatched
          ? `${unmatched} item${unmatched === 1 ? '' : 's'} need Style/Color/Size confirmed below before placing.`
          : 'All items matched the supplier catalog — review recipient & artwork, then place.')
      );
      toast.success(`Loaded sales order ${order.order_number}`);
    } catch (err) {
      toast.error(err.message);
      setSalesOrderId('');
    } finally {
      setImporting(false);
    }
  };

  const syncCatalog = async () => {
    if (!form.supplier_id) return;
    setSyncingCatalog(true);
    try {
      const result = await api.syncPurchaseCatalog(form.supplier_id);
      const refreshed = await api.purchaseCatalog();
      setCatalog(refreshed);
      setItems([]);
      toast.success(`Supplier catalog synced: ${result.styles} styles, ${result.colors} colors, ${result.sizes} sizes`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncingCatalog(false);
    }
  };

  const uploadImage = async (index, role, file) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use a PNG, JPG, or WebP image');
    if (file.size > 10 * 1024 * 1024) return toast.error('Image must be 10 MB or smaller');
    const key = `${index}:${role}`;
    setUploading((current) => ({ ...current, [key]: role }));
    try {
      // Upload the binary file straight to Cloudinary (no base64, no relay through
      // our API) — a single hop to a global CDN, so large prints upload fast.
      // Retry transient failures (network drops, 5xx, stale signatures) so a flaky
      // moment during a large multi-item order doesn't force a full page reload.
      const maxAttempts = 4;
      let uploaded = null;
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const sig = await api.cloudinaryUploadSignature();
          const form = new FormData();
          form.append('file', file);
          form.append('api_key', sig.api_key);
          form.append('timestamp', sig.timestamp);
          form.append('signature', sig.signature);
          const response = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, {
            method: 'POST', body: form,
          });
          // Cloudinary sometimes returns HTML on 5xx/edge errors; guard the parse.
          let out = null;
          try { out = await response.json(); } catch { out = null; }
          if (!response.ok || !out?.secure_url) {
            const msg = out?.error?.message || `Upload failed (${response.status})`;
            const err = new Error(msg);
            err.retriable = response.status >= 500 || response.status === 429 || response.status === 401;
            throw err;
          }
          uploaded = { url: out.secure_url, public_id: out.public_id, original_name: file.name };
          break;
        } catch (err) {
          lastError = err;
          // TypeError from fetch = network layer failure; always retriable.
          const isNetwork = err instanceof TypeError;
          const retriable = isNetwork || err.retriable;
          if (!retriable || attempt === maxAttempts) throw err;
          await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
        }
      }
      if (!uploaded) throw lastError || new Error('Upload failed');
      setItems((current) => current.map((entry, itemIndex) => itemIndex === index
        ? { ...entry, images: { ...entry.images, [role]: uploaded } }
        : entry));
      toast.success('Image uploaded ✓');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading((current) => { const next = { ...current }; delete next[key]; return next; });
    }
  };

  const validateItems = () => {
    if (!form.supplier_id) return 'Select a supplier first';
    if (!items.length) return 'Add at least one item';
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.product_title.trim()) return `Item #${index + 1}: title is required`;
      if (!item.style_id) return `Item #${index + 1}: style is required`;
      if (!item.style_color_id) return `Item #${index + 1}: color is required`;
      if (!item.style_size_id) return `Item #${index + 1}: size is required`;
      if (!item.images.front_print) return `Item #${index + 1}: print image is required`;
      if (!item.images.front_mockup) return `Item #${index + 1}: mockup image is required`;
      if (item.print_position === '1,2' && !item.images.back_print) return `Item #${index + 1}: back print image is required for Both position`;
      if (item.print_position === '1,2' && !item.images.back_mockup) return `Item #${index + 1}: back mockup image is required for Both position`;
    }
    return '';
  };

  const validateForm = () => {
    const digits = (value) => String(value || '').replace(/\D/g, '');
    if (!form.order_no.trim()) return 'Order ID is required';
    if (!form.order_time) return 'Order time is required';
    if (!form.recipient_name.trim()) return 'Recipient full name is required';
    if (!form.phone.trim()) return 'Phone number is required';
    if (digits(form.phone).length < 7) return 'Enter a valid phone number';
    if (!form.address_line_1.trim()) return 'Address Line 1 is required';
    if (!form.city.trim()) return 'City is required';
    if (!form.state_province.trim()) return 'State / Province is required';
    if (!form.postal_code.trim()) return 'ZIP / Postal code is required';
    if (form.country === 'US' && !/^\d{5}(-\d{4})?$/.test(form.postal_code.trim())) return 'Enter a valid US ZIP code (e.g. 90210 or 90210-1234)';
    if (!form.country) return 'Country is required';
    return '';
  };

  // A proxy/gateway timeout (504/502/503) or dropped connection is *ambiguous*: the
  // backend saves the order and places it with the supplier before it replies, so the
  // timeout often fires while the order is actually going through. Never surface these
  // as a raw error — verify with the supplier first.
  const isAmbiguousError = (message) => /\b50[234]\b|gateway|time\s?d?\s?out|timeout|failed to fetch|networkerror|load failed|connection/i.test(String(message || ''));

  // Ask the backend to reconcile this order from the supplier, then read its final
  // state. Read-only on the supplier side (queryOrderStatus) — never places a
  // duplicate. Returns the resolved order, or null if it could not be found.
  const confirmAmbiguousOrder = async (orderNo) => {
    for (let i = 0; i < 6; i += 1) {
      try { await api.syncPurchases([orderNo]); } catch { /* supplier not ready yet — retry */ }
      try {
        const order = await api.purchase(orderNo);
        if (order?.submission_status && order.submission_status !== 'Submitting') return order;
      } catch { /* not queryable yet — retry */ }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    try { return await api.purchase(orderNo); } catch { return null; }
  };

  const finishPlaced = (orderNo, failed) => {
    clearPersistentState(DRAFT_FORM_KEY);
    clearPersistentState(DRAFT_ITEMS_KEY);
    setSalesOrderId('');
    setImportNote('');
    navigate('/orders', { state: { createdOrder: orderNo, submissionFailed: failed } });
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateItems() || validateForm();
    if (validationError) return toast.error(validationError);
    const orderNo = form.order_no;
    setSubmitting(true);
    try {
      const result = await api.createPurchase({ ...form, order_time: new Date(form.order_time).toISOString(), items, external_sales_order_id: salesOrderId || null });
      if (result.success) {
        const po = result.printshop_po;
        if (po?.po_number) toast.success(`Order ${result.order_no} placed · Printshop PO ${po.po_number} raised`);
        else if (po?.error) toast.success(`Order ${result.order_no} placed (Printshop PO pending: ${po.error})`);
        else toast.success(`Order ${result.order_no} placed successfully!`);
        return finishPlaced(result.order_no, false);
      }
      // Saved, but supplier submission reported failure. If that reason is an
      // ambiguous timeout, the order is often actually placed — reconcile first.
      if (isAmbiguousError(result.message)) {
        const order = await confirmAmbiguousOrder(result.order_no);
        if (order?.submission_status === 'Submitted') { toast.success(`Order ${result.order_no} placed successfully!`); return finishPlaced(result.order_no, false); }
      }
      toast.error(`Order saved, but supplier submission failed: ${result.message}`);
      return finishPlaced(result.order_no, true);
    } catch (err) {
      // Proxy 504 / dropped connection — the order may already be going through.
      if (isAmbiguousError(err.message)) {
        const order = await confirmAmbiguousOrder(orderNo);
        if (order?.submission_status === 'Submitted') { toast.success(`Order ${orderNo} placed successfully!`); return finishPlaced(orderNo, false); }
        if (order?.submission_status === 'Failed') { toast.error(`Order saved, but supplier submission failed: ${order.last_sync_error || 'please retry from Orders'}`); return finishPlaced(orderNo, true); }
        if (order) { toast.success(`Order ${orderNo} saved — confirming with the supplier. It will show in Orders shortly.`); return finishPlaced(orderNo, false); }
      }
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Loading purchase catalog…</div>;
  if (error) return <div className="error-box">{error}</div>;

  const selectedSupplier = catalog.suppliers.find((supplier) => supplier.supplier_id === form.supplier_id);
  const supplierCatalog = {
    ...catalog,
    styles: catalog.styles.filter((style) => style.supplier_id === form.supplier_id),
    colors: catalog.colors.filter((color) => color.supplier_id === form.supplier_id),
    sizes: catalog.sizes.filter((size) => size.supplier_id === form.supplier_id),
  };
  // Order totals. `unweighed` counts items whose size has no published weight, so the
  // total is never quietly reported as complete when part of it is unknown.
  const totals = items.reduce((sum, item) => {
    const pieces = Math.max(0, Number.parseInt(item.quantity, 10) || 0);
    const unit = itemUnitWeight(item, supplierCatalog);
    return {
      pieces: sum.pieces + pieces,
      grams: sum.grams + (unit == null ? 0 : unit * pieces),
      unweighed: sum.unweighed + (item.style_size_id && unit == null ? 1 : 0),
    };
  }, { pieces: 0, grams: 0, unweighed: 0 });

  return (
    <div className="purchase-page">
      <div className="page-head"><div><div className="page-title">New Order</div><div className="page-desc">Place a new BlankTex purchase order</div></div></div>
      <form onSubmit={submit}>
        <Section number="1" title="Supplier Selection">
          <div className="purchase-field full"><label>Fulfillment Supplier *</label><select value={form.supplier_id} onChange={(event) => setField('supplier_id', event.target.value)} required><option value="">— Select Supplier Before Creating Order —</option>{catalog.suppliers.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id} disabled={!supplier.can_place_order}>{supplier.supplier_name} ({supplier.supplier_code}){supplier.can_place_order ? ' — API Connected' : ' — API Not Configured'}</option>)}</select></div>
          {selectedSupplier && <div className={`supplier-choice ${selectedSupplier.can_place_order ? 'ready' : 'blocked'}`}><span>{selectedSupplier.can_place_order ? '✓' : '!'}</span><div><b>{selectedSupplier.supplier_name}</b><small>{selectedSupplier.can_place_order ? `Connected through ${selectedSupplier.api_provider} production API · ${supplierCatalog.styles.length} styles · ${supplierCatalog.colors.length} colors · ${supplierCatalog.sizes.length} sizes` : 'This supplier cannot receive API purchase orders yet.'}</small></div>{selectedSupplier.can_place_order && <button type="button" className="btn supplier-sync" onClick={syncCatalog} disabled={syncingCatalog}>{syncingCatalog ? 'Syncing…' : '↻ Sync Catalog'}</button>}</div>}
          {selectedSupplier?.can_place_order && <div className="purchase-field full">
            <label>Import from Sales Order <small>(optional — apparel orders without a PO)</small></label>
            <SearchSelect
              value={salesOrderId}
              options={salesOrders.map((order) => ({ value: order.id, label: `${order.order_number} — ${order.customer_name || 'No customer'}`, hint: `${order.total_qty} pc · ${order.sales_channel || ''}` }))}
              placeholder={importing ? 'Loading order…' : (salesOrders.length ? '— Pick a sales order to auto-fill —' : '— No apparel orders awaiting a PO —')}
              onChange={importSalesOrder}
            />
            {importNote && <div className="supplier-choice ready" style={{ marginTop: 8 }}><span>↧</span><div><b>Sales order imported</b><small>{importNote}</small></div></div>}
          </div>}
        </Section>

        <fieldset className="purchase-workflow" disabled={!selectedSupplier?.can_place_order}>
        <Section number="2" title="Order Info"><div className="purchase-grid two">
          <div className="purchase-field"><label>Order ID * <small>(must be unique)</small></label><input value={form.order_no} onChange={(e) => setField('order_no', e.target.value)} required /></div>
          <div className="purchase-field"><label>Carrier</label><select value={form.carrier} onChange={(e) => setField('carrier', e.target.value)}><option value="">— Select Carrier —</option><option>USPS</option><option>UPS</option><option>FedEx</option></select></div>
          <div className="purchase-field full"><label>Order Time *</label><input type="datetime-local" value={form.order_time} onChange={(e) => setField('order_time', e.target.value)} required /></div>
        </div></Section>

        <Section number="3" title="Recipient"><div className="purchase-grid two">
          <div className="purchase-field"><label>Full Name *</label><input value={form.recipient_name} onChange={(e) => setField('recipient_name', e.target.value)} required /></div>
          <div className="purchase-field"><label>Phone *</label><input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} required /></div>
          <div className="purchase-field full"><label>Address Line 1 *</label><input value={form.address_line_1} onChange={(e) => setField('address_line_1', e.target.value)} required /></div>
          <div className="purchase-field full"><label>Address Line 2</label><input value={form.address_line_2} onChange={(e) => setField('address_line_2', e.target.value)} /></div>
          <div className="purchase-field"><label>City *</label><input value={form.city} onChange={(e) => setField('city', e.target.value)} required /></div>
          <div className="purchase-field"><label>State / Province *</label>{statesForCountry(form.country)
            ? <SearchSelect value={form.state_province} options={statesForCountry(form.country).map(([code, name]) => ({ value: code, label: code, hint: name }))} placeholder="— Search state (CA, NY…) —" hintInValue={false} onChange={(value) => setField('state_province', value)} />
            : <input value={form.state_province} onChange={(e) => setField('state_province', e.target.value)} placeholder="State / Province" required />}</div>
          <div className="purchase-field"><label>ZIP Code *</label><input value={form.postal_code} onChange={(e) => setField('postal_code', e.target.value)} required /></div>
          <div className="purchase-field"><label>Country *</label><select value={form.country} onChange={(e) => setForm((current) => ({ ...current, country: e.target.value, state_province: '' }))} required>{COUNTRIES.map(([code]) => <option key={code} value={code}>{code}</option>)}</select></div>
        </div></Section>

        <Section number="4" title="Items">
          <button type="button" className="btn purchase-add" onClick={() => setItems((current) => [...current, emptyItem()])}>＋ Add Item</button>
          {!items.length ? <div className="purchase-empty">No items yet — click <b>Add Item</b> to start</div> : items.map((item, index) => (
            <PurchaseItem key={index} item={item} index={index} catalog={supplierCatalog}
              onChange={(field, value) => changeItem(index, field, value)}
              onRemove={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              onUpload={(role, file) => uploadImage(index, role, file)} uploading={uploading[`${index}:front_print`] || uploading[`${index}:front_mockup`] || uploading[`${index}:back_print`] || uploading[`${index}:back_mockup`]}
            />
          ))}
          {items.length > 0 && <div className="purchase-totals">
            <div><small>ITEMS</small><b>{items.length}</b></div>
            <div><small>PIECES</small><b>{totals.pieces}</b></div>
            <div className="purchase-totals-weight"><small>TOTAL WEIGHT</small><b>{formatWeight(totals.grams)}</b></div>
            {totals.unweighed > 0 && <span className="purchase-totals-note">No published weight for {totals.unweighed} item{totals.unweighed > 1 ? 's' : ''} — not counted above</span>}
          </div>}
        </Section>
        </fieldset>

        {!form.supplier_id && <div className="supplier-required-note">Select an API-connected supplier above to unlock the purchase-order form.</div>}

        <div className="purchase-actions"><button type="button" className="btn" onClick={() => navigate('/orders')}>Cancel</button><button type="button" className="btn" onClick={() => setPreview((value) => !value)} disabled={!selectedSupplier?.can_place_order}>Preview JSON</button><button type="submit" className="btn primary" disabled={!selectedSupplier?.can_place_order || submitting || Object.keys(uploading).length}>{submitting ? 'Sending to supplier…' : '→ Place Order'}</button></div>
        {preview && <pre className="purchase-preview">{JSON.stringify({ ...form, items }, null, 2)}</pre>}
      </form>
    </div>
  );
}
