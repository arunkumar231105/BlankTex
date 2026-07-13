import { useNavigate } from 'react-router-dom';
import ResourceManager from '../ui/ResourceManager.jsx';
import { Badge } from '../lib/ui.jsx';
import {
  SUPPLIER_TYPE, CATALOG_SOURCE, ACTIVE_INACTIVE, CURRENCY,
} from '../lib/enums.js';

const fields = [
  { name: 'supplier_code', label: 'Supplier Code', required: true, hint: 'Short code, e.g. SSA' },
  { name: 'supplier_name', label: 'Supplier Name', required: true },
  { name: 'supplier_type', label: 'Type', type: 'select', options: SUPPLIER_TYPE, required: true },
  { name: 'catalog_source', label: 'Catalog Source', type: 'select', options: CATALOG_SOURCE, required: true, default: 'Manual Entry' },
  { name: 'default_currency', label: 'Currency', type: 'select', options: CURRENCY, required: true, default: 'USD' },
  { name: 'default_status', label: 'Status', type: 'select', options: ACTIVE_INACTIVE, required: true, default: 'Active' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'api_provider', label: 'API Provider' },
  { name: 'payment_terms', label: 'Payment Terms', placeholder: 'Net 30' },
  { name: 'lead_time_days', label: 'Lead Time (days)', type: 'number' },
  { name: 'minimum_order', label: 'Minimum Order', type: 'number' },
  { name: 'free_shipping_amount', label: 'Free Shipping Over', type: 'number' },
  { name: 'api_available', label: 'API integration available', type: 'checkbox' },
  { name: 'supports_backorders', label: 'Supports backorders', type: 'checkbox' },
  { name: 'dropship_available', label: 'Dropship available', type: 'checkbox' },
  { name: 'tax_exempt_supported', label: 'Tax-exempt supported', type: 'checkbox' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const columns = [
  { key: 'supplier_code', label: 'Code', render: (r) => <b>{r.supplier_code}</b> },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'supplier_type', label: 'Type' },
  { key: 'catalog_source', label: 'Catalog' },
  { key: 'lead_time_days', label: 'Lead Time', render: (r) => (r.lead_time_days != null ? `${r.lead_time_days} d` : '—') },
  { key: 'default_status', label: 'Status', render: (r) => <Badge value={r.default_status} /> },
];

export default function Suppliers() {
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Suppliers</div>
          <div className="page-desc">Distributors and brands that supply blank apparel. Click a row to manage contacts &amp; warehouses.</div>
        </div>
      </div>
      <ResourceManager
        title="Suppliers"
        singular="Supplier"
        resource="suppliers"
        idKey="supplier_id"
        columns={columns}
        fields={fields}
        searchKeys={['supplier_code', 'supplier_name', 'supplier_type']}
        onRowClick={(r) => navigate(`/suppliers/${r.supplier_id}`)}
        importConfig={{
          entity: 'suppliers',
          title: 'Suppliers',
          columns: ['supplier_code', 'supplier_name', 'supplier_type', 'catalog_source', 'default_currency', 'lead_time_days', 'payment_terms', 'website', 'default_status'],
          sample: 'supplier_code,supplier_name,supplier_type,catalog_source,default_currency,lead_time_days,payment_terms\nSSA,S&S Activewear,Distributor,API,USD,2,Net 30\nSMR,SanMar,Distributor,API,USD,2,Net 30\n',
        }}
      />
    </>
  );
}
