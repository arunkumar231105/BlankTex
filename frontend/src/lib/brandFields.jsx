import { Badge } from './ui.jsx';
import { SIZE_SYSTEM, CURRENCY, BRAND_STATUS } from './enums.js';

// Base brand form fields (without the manufacturer picker — added contextually).
export const brandFields = [
  { name: 'brand_code', label: 'Brand Code', required: true, hint: 'Short code, e.g. GIL' },
  { name: 'brand_name', label: 'Brand Name', required: true },
  { name: 'brand_owner', label: 'Owner (legacy text)', hint: 'Optional — use Manufacturer for the real link' },
  { name: 'default_size_system', label: 'Default Size System', type: 'select', options: SIZE_SYSTEM, required: true, default: 'Adult' },
  { name: 'default_currency', label: 'Currency', type: 'select', options: CURRENCY, required: true, default: 'USD' },
  { name: 'status', label: 'Status', type: 'select', options: BRAND_STATUS, required: true, default: 'Active' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'country_of_origin', label: 'Country of Origin' },
  { name: 'brand_logo', label: 'Brand Logo', type: 'image',
    hint: 'Paste the Nextcloud share link (or any public image URL). Preview shows below and is saved to the database.' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

export const brandLogoCol = {
  key: 'brand_logo', label: 'Logo', width: 60, render: (r) => (
    r.brand_logo
      ? <img className="logo-cell" src={r.brand_logo} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
      : <span className="logo-cell" style={{ display: 'inline-grid', placeItems: 'center', fontSize: 11, color: '#9aa4b2' }}>—</span>
  ),
};

export const brandStatusCol = { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> };
