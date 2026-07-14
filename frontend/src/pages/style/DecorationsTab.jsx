import { useCallback } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';

const fields = [
  { name: 'process_type', label: 'Process Type', required: true, hint: 'e.g. DTF or DTG' },
  { name: 'supplier_color_code', label: 'Color / Supplier Code' },
  { name: 'size_range', label: 'Size / Range', hint: 'Source value, e.g. S-XL or 3XL' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const columns = [
  { key: 'process_type', label: 'Process', render: (row) => <b>{row.process_type}</b> },
  { key: 'supplier_color_code', label: 'Color', render: (row) => row.supplier_color_code || 'All listed colors' },
  { key: 'size_range', label: 'Size', render: (row) => row.size_range || 'All listed sizes' },
  { key: 'notes', label: 'Notes' },
];

export default function DecorationsTab({ styleId }) {
  const load = useCallback(() => api.decorationsByStyle(styleId), [styleId]);
  return (
    <ResourceManager
      title="Decoration Availability" singular="Decoration rule" resource="decorations"
      idKey="style_decoration_id" columns={columns} fields={fields} load={load}
      fixed={{ style_id: styleId }} searchKeys={['process_type', 'supplier_color_code', 'size_range']}
    />
  );
}
