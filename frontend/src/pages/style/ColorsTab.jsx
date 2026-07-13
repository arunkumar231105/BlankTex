import { useCallback } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';
import { Badge, ColorDot, yesNo } from '../../lib/ui.jsx';
import { COLOR_FAMILY } from '../../lib/enums.js';

const fields = [
  { name: 'color_name', label: 'Color Name', required: true, hint: 'Supplier color name, e.g. Heather Navy' },
  { name: 'display_name', label: 'Display Name', required: true },
  { name: 'internal_color_code', label: 'Internal Code', required: true, hint: 'Standardized, e.g. NAVY' },
  { name: 'supplier_color_code', label: 'Supplier Code', hint: 'Supplier’s code, e.g. NAV' },
  { name: 'hex_color', label: 'Swatch Color', type: 'color' },
  { name: 'color_family', label: 'Color Family', type: 'select', options: COLOR_FAMILY },
  { name: 'pantone_code', label: 'Pantone Code' },
  { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
  { name: 'is_popular', label: 'Popular color', type: 'checkbox' },
  { name: 'is_default', label: 'Default color', type: 'checkbox' },
  { name: 'active', label: 'Active', type: 'checkbox', default: true },
  { name: 'discontinued', label: 'Discontinued', type: 'checkbox' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const columns = [
  { key: 'display_name', label: 'Color', render: (r) => <ColorDot hex={r.hex_color} name={r.display_name} /> },
  { key: 'internal_color_code', label: 'Internal Code' },
  { key: 'supplier_color_code', label: 'Supplier Code' },
  { key: 'color_family', label: 'Family' },
  { key: 'is_default', label: 'Default', render: (r) => yesNo(r.is_default) },
  { key: 'active', label: 'Active', render: (r) => <Badge value={r.active ? 'Active' : 'Inactive'} /> },
];

export default function ColorsTab({ styleId }) {
  const load = useCallback(() => api.colorsByStyle(styleId), [styleId]);
  return (
    <ResourceManager
      title="Colors" singular="Color" resource="colors" idKey="style_color_id"
      columns={columns} fields={fields} load={load} fixed={{ style_id: styleId }}
      searchKeys={['display_name', 'internal_color_code', 'color_family']}
    />
  );
}
