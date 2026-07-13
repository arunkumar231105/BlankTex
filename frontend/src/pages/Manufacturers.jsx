import { useNavigate } from 'react-router-dom';
import ResourceManager from '../ui/ResourceManager.jsx';
import { Badge } from '../lib/ui.jsx';
import { ACTIVE_INACTIVE } from '../lib/enums.js';

const fields = [
  { name: 'manufacturer_name', label: 'Manufacturer Name', required: true },
  { name: 'manufacturer_code', label: 'Code', hint: 'Short code, e.g. GILDAN' },
  { name: 'country', label: 'Country' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'status', label: 'Status', type: 'select', options: ACTIVE_INACTIVE, required: true, default: 'Active' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const columns = [
  { key: 'manufacturer_code', label: 'Code', render: (r) => <b>{r.manufacturer_code || '—'}</b> },
  { key: 'manufacturer_name', label: 'Manufacturer' },
  { key: 'country', label: 'Country' },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
];

export default function Manufacturers() {
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Manufacturers</div>
          <div className="page-desc">Companies that own brands. One manufacturer can own many brands. Click a row to see its brands.</div>
        </div>
      </div>
      <ResourceManager
        title="Manufacturers" singular="Manufacturer" resource="manufacturers" idKey="manufacturer_id"
        columns={columns} fields={fields}
        searchKeys={['manufacturer_code', 'manufacturer_name', 'country']}
        onRowClick={(r) => navigate(`/manufacturers/${r.manufacturer_id}`)}
      />
    </>
  );
}
