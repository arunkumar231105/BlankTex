const THUMB = { 'T-Shirt': '👕', Hoodie: '🧥', Sweatshirt: '👚', 'Tank Top': '🎽', Polo: '👔', Cap: '🧢' };

export default function StylesBrowser({ filters, query, list, loading, error, selectedId, onSelect, onQuery, supplierSelected }) {
  const { data, total, page, totalPages } = list;

  return (
    <div className="card card-pad browser">
      <h3 style={{ marginBottom: 12 }}>Styles</h3>

      <div className="b-search">
        <span className="si">🔍</span>
        <input placeholder="Search styles…" value={query.search} onChange={(e) => onQuery({ search: e.target.value })} />
      </div>

      {!supplierSelected && <div className="b-filters">
        <select value={query.category} onChange={(e) => onQuery({ category: e.target.value })}>
          <option value="">Category</option>
          {filters.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={query.gender} onChange={(e) => onQuery({ gender: e.target.value })}>
          <option value="">Gender</option>
          {filters.genders.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select value={query.fit} onChange={(e) => onQuery({ fit: e.target.value })}>
          <option value="">Fit</option>
          {filters.fits.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>}

      <div className="list-head"><span>Style No. / Name</span><span>SKUs</span></div>

      {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      {loading && !data.length && <div className="loading">Loading…</div>}
      {!loading && !data.length && !error && <div className="empty"><div className="big">📭</div>No styles found.</div>}

      {data.map((s) => (
        <div key={s.style_id} className={`style-row${s.style_id === selectedId ? ' active' : ''}`} onClick={() => onSelect(s.style_id)}>
          <div className="style-thumb">{s.primary_image ? <img src={s.primary_image} alt="" /> : (THUMB[s.garment_category] || '👕')}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sr-no">{s.style_no}</div>
            <div className="sr-name">{s.style_name}</div>
          </div>
          <div className="sr-brand">{s.brand_name}</div>
          <div className="sr-skus">{s.sku_count}</div>
        </div>
      ))}

      {!!total && (
        <div className="pager">
          <span>Showing {data.length} of {total.toLocaleString()} styles</span>
          <div className="pages">
            <button disabled={page <= 1} onClick={() => onQuery({ page: page - 1 })}>‹</button>
            {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map((p) => (
              <button key={p} className={p === page ? 'active' : ''} onClick={() => onQuery({ page: p })}>{p}</button>
            ))}
            <button disabled={page >= totalPages} onClick={() => onQuery({ page: page + 1 })}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
