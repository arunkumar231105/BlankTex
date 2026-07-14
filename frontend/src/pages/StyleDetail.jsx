import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge } from '../lib/ui.jsx';
import ColorsTab from './style/ColorsTab.jsx';
import SizesTab from './style/SizesTab.jsx';
import SkusTab from './style/SkusTab.jsx';
import ImagesTab from './style/ImagesTab.jsx';
import DecorationsTab from './style/DecorationsTab.jsx';

const TABS = ['Overview', 'Images', 'Colors', 'Sizes', 'Decorations', 'SKUs'];

function Info({ k, v }) {
  return <div className="info-row"><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>;
}

export default function StyleDetail() {
  const { id } = useParams();
  const [style, setStyle] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState(null);

  useEffect(() => { api.styleDetail(id).then(setStyle).catch((e) => setError(e.message)); }, [id]);

  if (error) return <div className="error-box">{error}</div>;
  if (!style) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-desc"><Link to="/styles" style={{ color: 'var(--primary)' }}>← Styles</Link></div>
          <div className="page-title">{style.style_no} — {style.style_name}</div>
          <div className="page-desc">
            {[style.brand_name, style.garment_category, style.gender].filter(Boolean).join(' · ')} · <Badge value={style.product_status} />
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="card card-pad">
          <div className="meta-grid">
            <div>
              <Info k="Style No." v={style.style_no} />
              <Info k="Style Name" v={style.style_name} />
              <Info k="Short Name" v={style.short_name} />
              <Info k="Brand" v={`${style.brand_name} (${style.brand_code})`} />
              <Info k="Category" v={style.garment_category} />
              <Info k="Garment Type" v={style.garment_type} />
              <Info k="Gender" v={style.gender} />
              <Info k="Fit" v={style.fit_type} />
            </div>
            <div>
              <Info k="Sleeve" v={style.sleeve_type} />
              <Info k="Neck" v={style.neck_type} />
              <Info k="Fabric" v={style.fabric_composition} />
              <Info k="Fabric Type" v={style.fabric_type} />
              <Info k="Fabric Weight" v={style.fabric_weight_gsm != null ? `${style.fabric_weight_gsm} gsm` : (style.fabric_weight_oz != null ? `${style.fabric_weight_oz} oz` : null)} />
              <Info k="Preferred Supplier" v={style.supplier_name} />
              <Info k="Featured" v={style.is_featured ? 'Yes' : 'No'} />
              <Info k="Colors / Sizes" v={`${style.colors.length} colors · ${style.sizes.length} sizes`} />
            </div>
          </div>
          {style.remarks && <p style={{ marginTop: 14, color: '#56617a', fontSize: 13 }}>{style.remarks}</p>}
        </div>
      )}

      {tab === 'Images' && <ImagesTab styleId={id} />}
      {tab === 'Colors' && <ColorsTab styleId={id} />}
      {tab === 'Sizes' && <SizesTab styleId={id} />}
      {tab === 'Decorations' && <DecorationsTab styleId={id} />}
      {tab === 'SKUs' && <SkusTab styleId={id} />}
    </>
  );
}
