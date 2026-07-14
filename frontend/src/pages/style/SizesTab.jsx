import { useCallback, useState, useEffect } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';
import Modal from '../../ui/Modal.jsx';
import Form from '../../ui/Form.jsx';
import { useToast } from '../../ui/Toast.jsx';
import { Badge, yesNo } from '../../lib/ui.jsx';
import { SIZE_SYSTEM } from '../../lib/enums.js';

const fields = [
  { name: 'size_code', label: 'Size Code', required: true, hint: 'e.g. XL, YM, 2T' },
  { name: 'size_name', label: 'Size Name', required: true, placeholder: 'Extra Large' },
  { name: 'size_group', label: 'Size Group', type: 'select', options: SIZE_SYSTEM, required: true, default: 'Adult' },
  { name: 'supplier_size_code', label: 'Supplier Size Code' },
  { name: 'display_order', label: 'Display Order', type: 'number', default: 0 },
  { name: 'is_default', label: 'Default size', type: 'checkbox' },
  { name: 'active', label: 'Active', type: 'checkbox', default: true },
  { name: 'discontinued', label: 'Discontinued', type: 'checkbox' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

const specFields = [
  { name: 'measurement_unit', label: 'Measurement Unit', type: 'select', options: ['cm', 'in'], default: 'cm' },
  { name: 'chest_width', label: 'Chest Width', type: 'number' },
  { name: 'chest_circumference', label: 'Chest Circumference', type: 'number' },
  { name: 'waist_circumference', label: 'Waist Circumference', type: 'number' },
  { name: 'hip_circumference', label: 'Hip Circumference', type: 'number' },
  { name: 'body_length', label: 'Body Length', type: 'number' },
  { name: 'pants_length', label: 'Pants Length', type: 'number' },
  { name: 'inseam_length', label: 'Inseam Length', type: 'number' },
  { name: 'sleeve_length', label: 'Sleeve Length', type: 'number' },
  { name: 'shoulder_width', label: 'Shoulder Width', type: 'number' },
  { name: 'head_circumference', label: 'Head Circumference / Range' },
  { name: 'visor_length', label: 'Visor Length', type: 'number' },
  { name: 'crown_depth', label: 'Crown Depth', type: 'number' },
  { name: 'garment_weight_g', label: 'Garment Weight (g)', type: 'number' },
  { name: 'print_area_width', label: 'Print Area Width (in)', type: 'number' },
  { name: 'print_area_height', label: 'Print Area Height (in)', type: 'number' },
  { name: 'max_print_width', label: 'Max Print Width (in)', type: 'number' },
  { name: 'max_print_height', label: 'Max Print Height (in)', type: 'number' },
  { name: 'front_print_top_margin', label: 'Front Top Margin (in)', type: 'number' },
  { name: 'back_print_top_margin', label: 'Back Top Margin (in)', type: 'number' },
  { name: 'is_available', label: 'Available', type: 'checkbox', default: true },
  { name: 'is_discontinued', label: 'Discontinued', type: 'checkbox' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

function SpecModal({ size, onClose }) {
  const toast = useToast();
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    api.specBySize(size.style_size_id).then((s) => setInitial(s || {})).catch(() => setInitial({}));
  }, [size.style_size_id]);

  const save = async (values) => {
    await api.saveSpec(size.style_size_id, values);
    toast.success(`Specs saved for size ${size.size_code}`);
    onClose();
  };

  return (
    <Modal title={`Size Specs — ${size.size_code}`} onClose={onClose} wide>
      {initial === null
        ? <div className="loading">Loading…</div>
        : <Form fields={specFields} initial={initial} onSubmit={save} onClose={onClose} submitLabel="Save Specs" />}
    </Modal>
  );
}

const columns = [
  { key: 'size_code', label: 'Size', render: (r) => <b>{r.size_code}</b> },
  { key: 'size_name', label: 'Name' },
  { key: 'size_group', label: 'Group' },
  { key: 'chest_circumference', label: 'Chest', render: (r) => (r.chest_circumference ?? r.chest_width ?? '—') },
  { key: 'waist_circumference', label: 'Waist', render: (r) => (r.waist_circumference ?? '—') },
  { key: 'body_length', label: 'Length', render: (r) => (r.body_length ?? r.pants_length ?? '—') },
  { key: 'measurement_unit', label: 'Unit', render: (r) => r.measurement_unit || '—' },
  { key: 'is_default', label: 'Default', render: (r) => yesNo(r.is_default) },
  { key: 'active', label: 'Active', render: (r) => <Badge value={r.active ? 'Active' : 'Inactive'} /> },
];

export default function SizesTab({ styleId }) {
  const load = useCallback(() => api.sizesByStyle(styleId), [styleId]);
  const [specSize, setSpecSize] = useState(null);

  return (
    <>
      <ResourceManager
        title="Sizes" singular="Size" resource="sizes" idKey="style_size_id"
        columns={columns} fields={fields} load={load} fixed={{ style_id: styleId }}
        rowActions={(r) => <button className="btn sm" onClick={() => setSpecSize(r)}>Specs</button>}
      />
      {specSize && <SpecModal size={specSize} onClose={() => setSpecSize(null)} />}
    </>
  );
}
