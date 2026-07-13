import { useCallback } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';
import { yesNo } from '../../lib/ui.jsx';

const fields = [
  { name: 'image_url', label: 'Image', type: 'image', required: true,
    hint: 'Paste the Nextcloud share link (or any public image URL). Preview shows below and is saved to the database.' },
  { name: 'alt_text', label: 'Label / Caption', placeholder: 'Front, Back, Black colorway…' },
  { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
  { name: 'is_primary', label: 'Primary image (shown first in preview)', type: 'checkbox' },
];

const Thumb = ({ url }) => (
  url
    ? <img src={url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', background: '#f4f6f9' }}
        onError={(e) => { e.target.style.visibility = 'hidden'; }} />
    : <span style={{ color: 'var(--muted2)' }}>—</span>
);

const columns = [
  { key: 'image_url', label: 'Image', width: 60, render: (r) => <Thumb url={r.image_url} /> },
  { key: 'alt_text', label: 'Label' },
  { key: 'sort_order', label: 'Order' },
  { key: 'is_primary', label: 'Primary', render: (r) => yesNo(r.is_primary) },
  { key: 'url', label: 'URL', render: (r) => <span style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>{r.image_url}</span> },
];

export default function ImagesTab({ styleId }) {
  const load = useCallback(() => api.imagesByStyle(styleId), [styleId]);
  return (
    <>
      <p className="page-desc" style={{ marginBottom: 12 }}>
        Add one or more images for this style (e.g. front / back / lifestyle, or per-colorway).
        Paste a Nextcloud share link. The <b>Primary</b> image is shown first in the dashboard preview.
      </p>
      <ResourceManager
        title="Images" singular="Image" resource="images" idKey="style_image_id"
        columns={columns} fields={fields} load={load} fixed={{ style_id: styleId }}
      />
    </>
  );
}
