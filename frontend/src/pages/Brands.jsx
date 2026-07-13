import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ResourceManager from '../ui/ResourceManager.jsx';
import { brandFields, brandLogoCol, brandStatusCol } from '../lib/brandFields.jsx';

export default function Brands() {
  const [manufacturers, setManufacturers] = useState([]);

  useEffect(() => { api.list('manufacturers').then(setManufacturers).catch(() => {}); }, []);

  const mfrOpts = manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.manufacturer_name }));

  // Insert the manufacturer picker right after brand_owner
  const fields = [
    ...brandFields.slice(0, 3),
    { name: 'manufacturer_id', label: 'Manufacturer', type: 'select', options: mfrOpts,
      hint: 'The company that owns this brand (one manufacturer → many brands)' },
    ...brandFields.slice(3),
  ];

  const columns = [
    brandLogoCol,
    { key: 'brand_code', label: 'Code', render: (r) => <b>{r.brand_code}</b> },
    { key: 'brand_name', label: 'Brand' },
    { key: 'manufacturer_name', label: 'Manufacturer', render: (r) => r.manufacturer_name || <span style={{ color: 'var(--muted2)' }}>—</span> },
    { key: 'default_size_system', label: 'Size System' },
    brandStatusCol,
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Brands</div>
          <div className="page-desc">Apparel brands. Each brand can belong to a manufacturer (e.g. Gildan &amp; Comfort Colors → Gildan Activewear).</div>
        </div>
      </div>
      <ResourceManager
        title="Brands" singular="Brand" resource="brands" idKey="brand_id"
        columns={columns} fields={fields}
        searchKeys={['brand_code', 'brand_name', 'brand_owner', 'manufacturer_name']}
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
