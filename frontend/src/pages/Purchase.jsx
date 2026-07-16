import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ui/Toast.jsx';
import { useNavigate } from 'react-router-dom';

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
  const colors = catalog.colors.filter((entry) => entry.style_id === item.style_id);
  const sizes = catalog.sizes.filter((entry) => entry.style_id === item.style_id);
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
        <div className="purchase-field"><label>Style *</label><select value={item.style_id} onChange={(e) => onChange('style_id', e.target.value)} required><option value="">— Select Style —</option>{catalog.styles.map((style) => <option key={style.style_id} value={style.style_id}>{style.style_name} ({style.style_no})</option>)}</select></div>
        <div className="purchase-field"><label>Color *</label><select value={item.style_color_id} onChange={(e) => onChange('style_color_id', e.target.value)} disabled={!item.style_id} required><option value="">— Select Color —</option>{colors.map((color) => <option key={color.style_color_id} value={color.style_color_id}>{color.display_name || color.color_name} ({color.color_code})</option>)}</select></div>
        <div className="purchase-field"><label>Size *</label><select value={item.style_size_id} onChange={(e) => onChange('style_size_id', e.target.value)} disabled={!item.style_id} required><option value="">— Select Size —</option>{sizes.map((size) => <option key={size.style_size_id} value={size.style_size_id}>{size.size_name} ({size.size_code})</option>)}</select></div>
      </div>
      <div className="purchase-grid two">
        <div className="purchase-field"><label>Craft Type *</label><select value={item.craft_type} onChange={(e) => onChange('craft_type', e.target.value)}><option value="1">Heat Transfer (烫画)</option><option value="2">DTG Direct-to-Garment (直喷)</option></select></div>
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
  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState({ suppliers: [], styles: [], colors: [], sizes: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState({});
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.purchaseCatalog().then(setCatalog).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'supplier_id') setItems([]);
  };
  const changeItem = (index, field, value) => setItems((current) => current.map((entry, itemIndex) => {
    if (itemIndex !== index) return entry;
    if (field === 'style_id') return { ...entry, style_id: value, style_color_id: '', style_size_id: '' };
    return { ...entry, [field]: value };
  }));

  const uploadImage = async (index, role, file) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use a PNG, JPG, or WebP image');
    if (file.size > 10 * 1024 * 1024) return toast.error('Image must be 10 MB or smaller');
    const key = `${index}:${role}`;
    setUploading((current) => ({ ...current, [key]: role }));
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(file);
      });
      const uploaded = await api.uploadPurchaseImage({ data, mime_type: file.type, original_name: file.name });
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

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateItems();
    if (validationError) return toast.error(validationError);
    setSubmitting(true);
    try {
      const result = await api.createPurchase({ ...form, order_time: new Date(form.order_time).toISOString(), items });
      if (result.success) toast.success(`Order ${result.order_no} placed successfully!`);
      else toast.error(`Order saved, but supplier submission failed: ${result.message}`);
      navigate('/orders', { state: { createdOrder: result.order_no, submissionFailed: !result.success } });
    } catch (err) {
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
  };

  return (
    <div className="purchase-page">
      <div className="page-head"><div><div className="page-title">New Order</div><div className="page-desc">Place a new BlankTex purchase order</div></div></div>
      <form onSubmit={submit}>
        <Section number="1" title="Supplier Selection">
          <div className="purchase-field full"><label>Fulfillment Supplier *</label><select value={form.supplier_id} onChange={(event) => setField('supplier_id', event.target.value)} required><option value="">— Select Supplier Before Creating Order —</option>{catalog.suppliers.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id} disabled={!supplier.can_place_order}>{supplier.supplier_name} ({supplier.supplier_code}){supplier.can_place_order ? ' — API Connected' : ' — API Not Configured'}</option>)}</select></div>
          {selectedSupplier && <div className={`supplier-choice ${selectedSupplier.can_place_order ? 'ready' : 'blocked'}`}><span>{selectedSupplier.can_place_order ? '✓' : '!'}</span><div><b>{selectedSupplier.supplier_name}</b><small>{selectedSupplier.can_place_order ? `Connected through ${selectedSupplier.api_provider} production API` : 'This supplier cannot receive API purchase orders yet.'}</small></div></div>}
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
          <div className="purchase-field"><label>State / Province *</label><input value={form.state_province} onChange={(e) => setField('state_province', e.target.value)} required /></div>
          <div className="purchase-field"><label>ZIP Code *</label><input value={form.postal_code} onChange={(e) => setField('postal_code', e.target.value)} required /></div>
          <div className="purchase-field"><label>Country *</label><input value={form.country} onChange={(e) => setField('country', e.target.value)} required /></div>
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
        </Section>
        </fieldset>

        {!form.supplier_id && <div className="supplier-required-note">Select an API-connected supplier above to unlock the purchase-order form.</div>}

        <div className="purchase-actions"><button type="button" className="btn" onClick={() => navigate('/orders')}>Cancel</button><button type="button" className="btn" onClick={() => setPreview((value) => !value)} disabled={!selectedSupplier?.can_place_order}>Preview JSON</button><button type="submit" className="btn primary" disabled={!selectedSupplier?.can_place_order || submitting || Object.keys(uploading).length}>{submitting ? 'Sending to supplier…' : '→ Place Order'}</button></div>
        {preview && <pre className="purchase-preview">{JSON.stringify({ ...form, items }, null, 2)}</pre>}
      </form>
    </div>
  );
}
