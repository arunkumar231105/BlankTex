import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ColorizedProductImage from './ColorizedProductImage';

const CAT_EMOJI = { 'T-Shirt': '👕', Hoodie: '🧥', Sweatshirt: '👚', 'Tank Top': '🎽', Polo: '👔', Cap: '🧢' };

function Info({ k, v }) {
  return <div className="info-row"><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>;
}

export default function StylePreview({ detail, loading }) {
  const navigate = useNavigate();
  const [activeImg, setActiveImg] = useState(0);
  const [activeColorId, setActiveColorId] = useState(null);

  // Reset image/color selections whenever the style changes.
  useEffect(() => {
    setActiveImg(0);
    setActiveColorId(detail?.colors?.[0]?.style_color_id || null);
  }, [detail?.style_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !detail) return <div className="card"><div className="loading">Loading style…</div></div>;
  if (!detail) return <div className="card"><div className="empty"><div className="big">👕</div>Select a style from the list to preview it.</div></div>;

  const s = detail;
  const emoji = CAT_EMOJI[s.garment_category] || '👕';
  const active = s.active && !s.discontinued;
  const images = s.images || [];
  const hero = images[activeImg] || images[0];
  const selectedColor = s.colors.find((color) => color.style_color_id === activeColorId) || s.colors[0];

  return (
    <div>
      <div className="card">
        <div className="pv-head">
          <h2>{s.style_no} — {s.style_name}</h2>
          <span className={`badge ${active ? 'green' : 'grey'}`}>{active ? 'Active' : s.product_status}</span>
          <span className="spacer" />
          {!s.supplier_catalog && <button className="btn sm" onClick={() => navigate(`/styles/${s.style_id}`)}>✎ Edit Style</button>}
          {!s.supplier_catalog && <button className="btn sm" onClick={() => navigate(`/styles/${s.style_id}`)}>Manage ▾</button>}
          {s.supplier_catalog && <span className="badge blue">Live Supplier Catalog</span>}
        </div>

        <div className="pv-grid">
          <div className="pv-block">
            <h4>General Information</h4>
            <Info k="Style No." v={s.style_no} />
            <Info k="Product Name" v={s.style_name} />
            <Info k="Brand" v={s.brand_name} />
            <Info k="Category" v={s.garment_category} />
            <Info k="Gender" v={s.gender} />
            <Info k="Fit" v={s.fit_type} />
            <Info k="Neck" v={s.neck_type} />
            <Info k="Sleeve" v={s.sleeve_type} />
            <Info k="Fabric" v={s.fabric_composition} />
            <Info k="Fabric Weight" v={s.fabric_weight_oz ? `${s.fabric_weight_oz} oz / ${s.fabric_weight_gsm ?? '—'} g` : null} />
            <Info k="Fabric Type" v={s.fabric_type} />
            {s.supplier_catalog && <Info k="Original Name" v={s.raw_style_name} />}
            {s.supplier_catalog && <Info k="Craft Types" v={String(s.craft_types || '').split(',').map((v) => v === '1' ? 'Heat Transfer' : v === '2' ? 'DTG' : v).join(', ')} />}
          </div>

          <div className="pv-block">
            <div className="pv-hero" style={{ '--selected-color': selectedColor?.hex_color || '#d7dce5' }}>
              {s.brand_logo && <img className="brand-badge" src={s.brand_logo} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
              {hero
                ? <div className="pv-artwork">
                    <ColorizedProductImage
                      src={hero.image_url}
                      color={selectedColor?.hex_color}
                      alt={hero.alt_text || s.style_name}
                    />
                  </div>
                : emoji}
              {selectedColor && (
                <div className="pv-selected-color">
                  <span style={{ background: selectedColor.hex_color }} />
                  {selectedColor.display_name}
                  <small>{selectedColor.supplier_color_code}</small>
                </div>
              )}
            </div>
            {images.length > 0 && (
              <div className="pv-thumbs">
                {images.map((img, i) => (
                  <button key={img.style_image_id} className={`t${i === activeImg ? ' active' : ''}`}
                    onClick={() => setActiveImg(i)} title={img.alt_text || ''}>
                    <img src={img.image_url} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pv-block">
            <h4>Supplier Information</h4>
            <Info k="Supplier" v={s.supplier_name} />
            <Info k="Supplier Code" v={s.supplier_code} />
            <Info k="MOQ" v={s.supplier_moq ? `${s.supplier_moq} Pcs` : null} />
            <Info k="Lead Time" v={s.supplier_lead_time ? `${s.supplier_lead_time} Business Days` : null} />
            <Info k="Currency" v={s.supplier_currency} />
            <Info k="Featured" v={s.is_featured ? 'Yes' : 'No'} />
            <Info k="Status" v={s.product_status} />
            <h4 style={{ marginTop: 18 }}>Summary</h4>
            <Info k="Colors" v={String(s.colors.length)} />
            <Info k="Sizes" v={String(s.sizes.length)} />
            <Info k="Total SKUs" v={String(s.sizes.reduce((a, z) => a + (z.sku_count || 0), 0))} />
            {s.supplier_catalog && <Info k="SKU Pattern" v={`${s.style_no}-COLOR-SIZE`} />}
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="two-col">
        <div className="card">
          <div className="pv-section"><h4>Available Colors ({s.colors.length})</h4></div>
          {s.colors.length
            ? (
              <div className="pv-colors">
                {s.colors.map((c) => (
                  <button type="button" className={`pv-sw${c.style_color_id === selectedColor?.style_color_id ? ' active' : ''}`}
                    key={c.style_color_id} onClick={() => setActiveColorId(c.style_color_id)}
                    aria-pressed={c.style_color_id === selectedColor?.style_color_id}
                    title={`${c.display_name} (${c.supplier_color_code})`}>
                    <span className="chip" style={{ background: c.hex_color || '#ccc' }} />
                    <div className="cn">{c.display_name}</div>
                    <div className="cc">{c.supplier_color_code}</div>
                  </button>
                ))}
              </div>
            )
            : <div className="empty" style={{ padding: 30 }}>No colors yet.</div>}
        </div>

        <div className="card">
          <div className="pv-section"><h4>Available Sizes ({s.sizes.length})</h4></div>
          {s.sizes.length
            ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Size</th><th>Chest (cm)</th><th>Length (cm)</th><th>SKUs</th><th>Status</th></tr></thead>
                  <tbody>
                    {s.sizes.map((z) => (
                      <tr key={z.style_size_id}>
                        <td style={{ fontWeight: 600 }}>{z.size_code}</td>
                        <td>{z.chest_circumference ?? z.chest_width ?? '—'}</td>
                        <td>{z.body_length ?? z.pants_length ?? '—'}</td>
                        <td>{z.sku_count}</td>
                        <td><span className={`badge ${z.active ? 'green' : 'grey'}`}>{z.active ? 'Active' : 'Inactive'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <div className="empty" style={{ padding: 30 }}>No sizes yet.</div>}
        </div>
      </div>
    </div>
  );
}
