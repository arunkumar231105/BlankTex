import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import ResourceManager from '../ui/ResourceManager.jsx';
import { Badge, yesNo } from '../lib/ui.jsx';
import {
  CONTACT_TYPE, DEPARTMENT, CONTACT_METHOD, ACTIVE_INACTIVE,
  WAREHOUSE_TYPE, WAREHOUSE_STATUS,
} from '../lib/enums.js';

const contactFields = [
  { name: 'contact_name', label: 'Contact Name', required: true },
  { name: 'contact_type', label: 'Contact Type', type: 'select', options: CONTACT_TYPE, required: true },
  { name: 'designation', label: 'Designation' },
  { name: 'department', label: 'Department', type: 'select', options: DEPARTMENT },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone' },
  { name: 'mobile', label: 'Mobile' },
  { name: 'whatsapp', label: 'WhatsApp' },
  { name: 'extension', label: 'Extension' },
  { name: 'preferred_contact_method', label: 'Preferred Method', type: 'select', options: CONTACT_METHOD },
  { name: 'timezone', label: 'Timezone', placeholder: 'America/Los_Angeles' },
  { name: 'status', label: 'Status', type: 'select', options: ACTIVE_INACTIVE, required: true, default: 'Active' },
  { name: 'is_primary', label: 'Primary contact', type: 'checkbox' },
  { name: 'receives_purchase_orders', label: 'Receives purchase orders', type: 'checkbox' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const contactCols = [
  { key: 'contact_name', label: 'Name', render: (r) => <b>{r.contact_name}</b> },
  { key: 'contact_type', label: 'Type' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'is_primary', label: 'Primary', render: (r) => yesNo(r.is_primary) },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
];

const whFields = [
  { name: 'warehouse_code', label: 'Warehouse Code', required: true },
  { name: 'warehouse_name', label: 'Warehouse Name', required: true },
  { name: 'warehouse_type', label: 'Type', type: 'select', options: WAREHOUSE_TYPE, required: true },
  { name: 'status', label: 'Status', type: 'select', options: WAREHOUSE_STATUS, required: true, default: 'Active' },
  { name: 'address_line1', label: 'Address Line 1', required: true, full: true },
  { name: 'address_line2', label: 'Address Line 2', full: true },
  { name: 'city', label: 'City', required: true },
  { name: 'state', label: 'State / Province', required: true },
  { name: 'postal_code', label: 'Postal Code', required: true },
  { name: 'country', label: 'Country', required: true },
  { name: 'average_dispatch_days', label: 'Avg Dispatch (days)', type: 'number', required: true, default: 1 },
  { name: 'api_warehouse_code', label: 'API Warehouse Code' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'contact_name', label: 'Warehouse Contact' },
  { name: 'shipping_cutoff_time', label: 'Shipping Cutoff', type: 'time' },
  { name: 'supports_pickup', label: 'Supports pickup', type: 'checkbox' },
  { name: 'default_warehouse', label: 'Default warehouse', type: 'checkbox' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const whCols = [
  { key: 'warehouse_code', label: 'Code', render: (r) => <b>{r.warehouse_code}</b> },
  { key: 'warehouse_name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'average_dispatch_days', label: 'Dispatch', render: (r) => `${r.average_dispatch_days} d` },
  { key: 'default_warehouse', label: 'Default', render: (r) => yesNo(r.default_warehouse) },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
];

export default function SupplierDetail() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.get('suppliers', id).then(setSupplier).catch((e) => setError(e.message)); }, [id]);

  const loadContacts = useCallback(() => api.contactsBySupplier(id), [id]);
  const loadWarehouses = useCallback(() => api.warehousesBySupplier(id), [id]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-desc"><Link to="/suppliers" style={{ color: 'var(--primary)' }}>← Suppliers</Link></div>
          <div className="page-title">{supplier ? supplier.supplier_name : 'Supplier'}</div>
          {supplier && (
            <div className="page-desc">
              {supplier.supplier_code} · {supplier.supplier_type} · {supplier.catalog_source}
              {' · '}<Badge value={supplier.default_status} />
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <h3 style={{ margin: '4px 0 12px' }}>Contacts</h3>
      <ResourceManager
        title="Contacts" singular="Contact" resource="contacts" idKey="supplier_contact_id"
        columns={contactCols} fields={contactFields} load={loadContacts} fixed={{ supplier_id: id }}
      />

      <h3 style={{ margin: '26px 0 12px' }}>Warehouses</h3>
      <ResourceManager
        title="Warehouses" singular="Warehouse" resource="warehouses" idKey="warehouse_id"
        columns={whCols} fields={whFields} load={loadWarehouses} fixed={{ supplier_id: id }}
      />
    </>
  );
}
