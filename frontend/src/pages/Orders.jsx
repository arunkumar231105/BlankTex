import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Modal from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';

const STATUSES = {
  1: ['Store Audit', 'grey'], 2: ['Pending Push', 'amber'], 3: ['Rejected', 'red'],
  4: ['Factory Audit', 'blue'], 5: ['In Production', 'blue'], 12: ['Shipped', 'green'],
  13: ['Closed', 'grey'], 14: ['Refunding', 'red'], 15: ['Refunded', 'grey'],
};
const FILTERS = [['', 'All'], ['2', 'Pending'], ['5', 'Production'], ['12', 'Shipped'], ['13', 'Closed']];

function Status({ value, text }) {
  const status = STATUSES[value] || [text || 'Unknown', 'grey'];
  return <span className={`badge ${status[1]}`}>{text || status[0]}</span>;
}
function SubmissionStatus({ value }) {
  const type = value === 'Submitted' ? 'green' : value === 'Failed' ? 'red' : 'amber';
  return <span className={`badge ${type}`}>{value || 'Submitted'}</span>;
}
function dateTime(value) { return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function Orders() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [integration, setIntegration] = useState(null);

  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await api.purchases({ q: query, status })); }
    catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [query, status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.purchaseIntegration().then(setIntegration).catch(() => {}); }, []);

  const openOrder = async (orderNo) => {
    setDetailLoading(true); setSelected({ order_no: orderNo }); setTracking(null);
    try { setSelected(await api.purchase(orderNo)); }
    catch (error) { toast.error(error.message); setSelected(null); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => {
    if (!location.state?.createdOrder) return;
    const orderNo = location.state.createdOrder;
    if (location.state.submissionFailed) toast.error(`Order ${orderNo} was saved, but supplier submission failed. Open it and retry.`);
    else toast.success(`Order ${orderNo} sent to supplier and saved`);
    navigate('/orders', { replace: true, state: {} });
    openOrder(orderNo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (orderNos) => {
    setSyncing(true);
    try {
      const result = await api.syncPurchases(orderNos);
      toast.success(`Synced ${result.updated} order(s)`);
      await load();
      if (selected?.order_no) await openOrder(selected.order_no);
    } catch (error) { toast.error(error.message); }
    finally { setSyncing(false); }
  };

  const importOrder = async () => {
    if (!importId.trim()) return toast.error('Enter a supplier Order ID');
    setImporting(true);
    try {
      const result = await api.importPurchase(importId.trim());
      toast.success(`Order ${result.order_no} imported`); setImportOpen(false); setImportId(''); await load(); openOrder(result.order_no);
    } catch (error) { toast.error(error.message); }
    finally { setImporting(false); }
  };

  const saveNotes = async () => {
    setSaving(true);
    try { await api.savePurchaseNotes(selected.order_no, selected.notes || ''); toast.success('Notes saved'); }
    catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const getTracking = async () => {
    try { const result = await api.purchaseDelivery(selected.order_no); setTracking(result.data?.[0] || {}); }
    catch (error) { toast.error(error.message); }
  };

  const closeOrder = async () => {
    if (!window.confirm(`Close order ${selected.order_no}? This cannot be undone.`)) return;
    setSaving(true);
    try { await api.closePurchase(selected.order_no); toast.success('Order closed'); await load(); await openOrder(selected.order_no); }
    catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const retryOrder = async () => {
    setSaving(true);
    try { await api.retryPurchase(selected.order_no); toast.success('Order submitted to supplier'); await load(); await openOrder(selected.order_no); }
    catch (error) { toast.error(error.message); await openOrder(selected.order_no); }
    finally { setSaving(false); }
  };

  const payloadGoods = selected?.supplier_payload?.goodsList || [];
  const detailItems = selected?.items?.length ? selected.items : payloadGoods.map((item, index) => ({
    purchase_item_id: `supplier-${index}`, product_title: item.title, style_no: item.styleCode, style_name: item.styleName,
    color_code: item.colorCode, color_name: item.colorName, size_code: item.sizeCode, quantity: item.num,
    craft_type: item.craftType, images: (item.imageList || []).map((image, imageIndex) => ({ purchase_image_id: `${index}-${imageIndex}`, image_role: image.type === 1 ? 'front_print' : 'front_mockup', image_url: image.imageUrl })),
  }));

  return (
    <>
      <div className="page-head">
        <div><div className="page-title">Orders</div><div className="page-desc">Manage, search and sync RIIN supplier orders</div></div>
        <div className="spacer" />
        <button className="btn" onClick={() => sync()} disabled={syncing}>{syncing ? '↻ Syncing…' : '↻ Sync All'}</button>
        <button className="btn" onClick={() => setImportOpen(true)}>↓ Import Order</button>
        <button className="btn primary" onClick={() => navigate('/purchase')}>＋ New Order</button>
      </div>

      {integration && (!integration.configured || !integration.cloudinary_configured) && <div className="error-box">Supplier integration is not fully configured.</div>}
      <div className="card orders-card">
        <div className="orders-toolbar">
          <div className="orders-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Order ID, customer, city or phone…" /></div>
          <div className="orders-filters">{FILTERS.map(([value, label]) => <button key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}</div>
        </div>
        {loading ? <div className="loading">Loading orders…</div> : !orders.length ? <div className="empty"><div className="big">📦</div>No orders found.</div> : (
          <div className="tbl-wrap"><table className="tbl orders-table"><thead><tr><th>Order ID</th><th>Supplier</th><th>Customer</th><th>Location</th><th>Items</th><th>Submission</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>
            {orders.map((order) => <tr key={order.order_no} className="row-click" onClick={() => openOrder(order.order_no)}>
              <td><b className="order-id">{order.order_no}</b></td><td>{order.supplier_name || '—'}</td><td>{order.recipient_name || '—'}</td><td>{[order.city, order.state_province].filter(Boolean).join(', ') || '—'}</td><td>{order.item_count || 0}</td><td><SubmissionStatus value={order.submission_status} /></td><td><Status value={order.supplier_status} text={order.supplier_status_str} /></td><td className="orders-muted">{dateTime(order.updated_at)}</td><td>›</td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {selected && <><div className="order-drawer-backdrop" onClick={() => setSelected(null)} /><aside className="order-drawer">
        {detailLoading ? <div className="loading">Loading order…</div> : <>
          <div className="order-drawer-head"><div><small>ORDER ID</small><h2>{selected.order_no}</h2><div className="order-head-badges"><SubmissionStatus value={selected.submission_status} /><Status value={selected.supplier_status} text={selected.supplier_status_str} /></div></div><button onClick={() => setSelected(null)}>×</button></div>
          <div className="order-drawer-body">
            <div className="order-supplier"><small>FULFILLMENT SUPPLIER</small><b>{selected.supplier_name || 'Unassigned'}</b><span>{selected.supplier_code || '—'}</span></div>
            <div className="order-recipient"><h4>Recipient</h4><p>👤 {selected.recipient_name}</p><p>☎ {selected.phone}</p><p>⌖ {[selected.address_line_1, selected.address_line_2, selected.city, selected.state_province, selected.postal_code, selected.country].filter(Boolean).join(', ')}</p>{selected.carrier && <p>🚚 {selected.carrier}</p>}</div>
            <div><h4 className="order-block-title">Items ({detailItems.length})</h4>{detailItems.map((item) => <div className="order-detail-item" key={item.purchase_item_id}><b>{item.product_title}</b><div className="order-item-tags"><span>{item.style_no}</span><span>{item.color_name || item.color_code}</span><span>{item.size_code}</span><span>Qty: {item.quantity}</span><span>{Number(item.craft_type) === 2 ? 'DTG' : 'Heat Transfer'}</span></div><div className="order-item-images">{(item.images || []).filter((image) => image.image_role.includes('print')).map((image) => <img key={image.purchase_image_id} src={image.image_url} alt={image.image_role} />)}</div></div>)}</div>
            <div><h4 className="order-block-title">Notes</h4><textarea className="order-notes" rows="3" value={selected.notes || ''} onChange={(event) => setSelected((current) => ({ ...current, notes: event.target.value }))} placeholder="Add a note…" /><button className="btn sm" onClick={saveNotes} disabled={saving}>Save Notes</button></div>
            {tracking && <div><h4 className="order-block-title">Tracking</h4><div className="order-tracking">{tracking.trackingNumber ? <><b>📬 {tracking.trackingNumber}</b>{tracking.shippingTime && <span>Shipped: {dateTime(tracking.shippingTime)}</span>}{tracking.waybillDataPath && <a href={tracking.waybillDataPath} target="_blank" rel="noreferrer">Download waybill →</a>}</> : 'No tracking information available yet.'}</div></div>}
            {selected.last_sync_error && <div className="error-box">{selected.last_sync_error}</div>}
          </div>
          <div className="order-drawer-foot">{selected.submission_status === 'Failed' && <div className="order-retry-row"><button className="btn primary" onClick={retryOrder} disabled={saving}>{saving ? 'Retrying…' : '↻ Retry Supplier Submission'}</button></div>}<div><button className="btn" onClick={() => sync([selected.order_no])} disabled={syncing || selected.submission_status !== 'Submitted'}>↻ Sync Status</button><button className="btn" onClick={getTracking} disabled={selected.submission_status !== 'Submitted'}>📦 Tracking</button></div><div><button className="btn" onClick={() => setShippingOpen(true)} disabled={selected.submission_status !== 'Submitted'}>✎ Update Shipping</button>{selected.submission_status === 'Submitted' && ![13, 15].includes(Number(selected.supplier_status)) && <button className="btn danger" onClick={closeOrder} disabled={saving}>× Close Order</button>}</div></div>
        </>}
      </aside></>}

      {importOpen && <Modal title="Import Order from Supplier" onClose={() => setImportOpen(false)} footer={<><button className="btn" onClick={() => setImportOpen(false)}>Cancel</button><button className="btn primary" onClick={importOrder} disabled={importing}>{importing ? 'Importing…' : 'Import'}</button></>}><p className="modal-copy">Enter the Order ID exactly as it appears on the RIIN supplier portal.</p><div className="field"><label>Supplier Order ID (platformOid)</label><input value={importId} onChange={(event) => setImportId(event.target.value)} placeholder="e.g. ORD-260716123456" autoFocus /></div></Modal>}
      {shippingOpen && selected && <ShippingModal order={selected} busy={saving} onClose={() => setShippingOpen(false)} onSave={async (values) => { setSaving(true); try { await api.updatePurchaseShipping(selected.order_no, values); toast.success('Shipping updated on supplier'); setShippingOpen(false); await openOrder(selected.order_no); await load(); } catch (error) { toast.error(error.message); } finally { setSaving(false); } }} />}
    </>
  );
}

function ShippingModal({ order, busy, onClose, onSave }) {
  const [form, setForm] = useState({ recipient_name: order.recipient_name || '', phone: order.phone || '', address_line_1: order.address_line_1 || '', city: order.city || '', state_province: order.state_province || '', postal_code: order.postal_code || '', country: order.country || 'US', carrier: order.carrier || '' });
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  return <Modal title={`Update Shipping — ${order.order_no}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave(form)} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button></>} wide><div className="form-grid">
    <div className="field"><label>Full Name *</label><input value={form.recipient_name} onChange={(e) => field('recipient_name', e.target.value)} /></div><div className="field"><label>Phone *</label><input value={form.phone} onChange={(e) => field('phone', e.target.value)} /></div>
    <div className="field full"><label>Address Line 1 *</label><input value={form.address_line_1} onChange={(e) => field('address_line_1', e.target.value)} /></div><div className="field"><label>City *</label><input value={form.city} onChange={(e) => field('city', e.target.value)} /></div><div className="field"><label>State / Province *</label><input value={form.state_province} onChange={(e) => field('state_province', e.target.value)} /></div><div className="field"><label>ZIP Code *</label><input value={form.postal_code} onChange={(e) => field('postal_code', e.target.value)} /></div><div className="field"><label>Country *</label><input value={form.country} onChange={(e) => field('country', e.target.value)} /></div><div className="field"><label>Carrier</label><select value={form.carrier} onChange={(e) => field('carrier', e.target.value)}><option value="">— Select —</option><option>USPS</option><option>UPS</option><option>FedEx</option></select></div>
  </div></Modal>;
}
