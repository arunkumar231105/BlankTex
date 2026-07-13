export default function SupplierSelect({ suppliers, value, onChange }) {
  const current = suppliers.find((s) => s.supplier_id === value);
  return (
    <div className="card card-pad">
      <h3 style={{ marginBottom: 12 }}>Supplier Selection</h3>
      <label className="field label" style={{ fontSize: 12, color: 'var(--muted)' }}>Select Supplier</label>
      <select className="input" style={{ width: '100%', marginTop: 6, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 9 }}
        value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Suppliers</option>
        {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
      </select>
      <div className="sup-note">
        {current ? (
          <>
            Code: {current.supplier_code} · Type: {current.supplier_type}<br />
            Lead Time: {current.lead_time_days ?? '—'} days · Currency: {current.default_currency}<br />
            Payment: {current.payment_terms || '—'}
          </>
        ) : 'Showing styles from all suppliers.'}
      </div>
    </div>
  );
}
