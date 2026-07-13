import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import ResourceManager from '../ui/ResourceManager.jsx';
import { Badge } from '../lib/ui.jsx';
import { brandFields, brandLogoCol, brandStatusCol } from '../lib/brandFields.jsx';

const brandCols = [
  brandLogoCol,
  { key: 'brand_code', label: 'Code', render: (r) => <b>{r.brand_code}</b> },
  { key: 'brand_name', label: 'Brand' },
  { key: 'default_size_system', label: 'Size System' },
  brandStatusCol,
];

export default function ManufacturerDetail() {
  const { id } = useParams();
  const [mfr, setMfr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.get('manufacturers', id).then(setMfr).catch((e) => setError(e.message)); }, [id]);

  const loadBrands = useCallback(() => api.raw(`/manufacturers/${id}/brands`), [id]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-desc"><Link to="/manufacturers" style={{ color: 'var(--primary)' }}>← Manufacturers</Link></div>
          <div className="page-title">{mfr ? mfr.manufacturer_name : 'Manufacturer'}</div>
          {mfr && (
            <div className="page-desc">
              {mfr.manufacturer_code || '—'} · {mfr.country || '—'} · <Badge value={mfr.status} />
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <h3 style={{ margin: '4px 0 12px' }}>Brands owned by this manufacturer</h3>
      <ResourceManager
        title="Brands" singular="Brand" resource="brands" idKey="brand_id"
        columns={brandCols} fields={brandFields} load={loadBrands} fixed={{ manufacturer_id: id }}
        emptyHint="Add brands here, or set a brand’s Manufacturer from the Brands page."
      />
    </>
  );
}
