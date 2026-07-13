import ResourceManager from '../ui/ResourceManager.jsx';
import { Badge } from '../lib/ui.jsx';
import { SIZE_SYSTEM, CURRENCY, BRAND_STATUS } from '../lib/enums.js';

const fields = [
  { name: 'brand_code', label: 'Brand Code', required: true, hint: 'Short code, e.g. GIL' },
  { name: 'brand_name', label: 'Brand Name', required: true },
  { name: 'brand_owner', label: 'Brand Owner' },
  { name: 'default_size_system', label: 'Default Size System', type: 'select', options: SIZE_SYSTEM, required: true, default: 'Adult' },
  { name: 'default_currency', label: 'Currency', type: 'select', options: CURRENCY, required: true, default: 'USD' },
  { name: 'status', label: 'Status', type: 'select', options: BRAND_STATUS, required: true, default: 'Active' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'country_of_origin', label: 'Country of Origin' },
  { name: 'brand_logo', label: 'Brand Logo', type: 'image',
    hint: 'Paste the Nextcloud share link (or any public image URL). Preview shows below and is saved to the database.' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const columns = [
  { key: 'brand_logo', label: 'Logo', width: 60, render: (r) => (
      r.brand_logo
        ? <img className="logo-cell" src={r.brand_logo} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
        : <span className="logo-cell" style={{ display: 'inline-grid', placeItems: 'center', fontSize: 11, color: '#9aa4b2' }}>—</span>
    ) },
  { key: 'brand_code', label: 'Code', render: (r) => <b>{r.brand_code}</b> },
  { key: 'brand_name', label: 'Brand' },
  { key: 'brand_owner', label: 'Owner' },
  { key: 'default_size_system', label: 'Size System' },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
];

export default function Brands() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Brands</div>
          <div className="page-desc">Apparel brands in your catalog. Logos are stored as an image link (e.g. Nextcloud share URL).</div>
        </div>
      </div>
      <ResourceManager
        title="Brands" singular="Brand" resource="brands" idKey="brand_id"
        columns={columns} fields={fields}
        searchKeys={['brand_code', 'brand_name', 'brand_owner']}
        importConfig={{
          entity: 'brands',
          title: 'Brands',
          columns: ['brand_code', 'brand_name', 'brand_owner', 'brand_logo', 'website', 'country_of_origin', 'default_size_system', 'default_currency', 'status'],
          sample: 'brand_code,brand_name,brand_owner,default_size_system,status\nGIL,Gildan,Gildan Activewear,Adult,Active\nBEL,Bella Canvas,Bella+Canvas LLC,Adult,Active\n',
        }}
      />
    </>
  );
}
