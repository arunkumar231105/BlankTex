import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';
import Form from './Form.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import ImportModal from './ImportModal.jsx';

/**
 * Generic CRUD table.
 * props:
 *  title, singular, resource (api namespace), idKey,
 *  columns: [{key,label,render?,width?}], fields (form descriptors),
 *  load: optional custom loader () => Promise<rows[]> (else api.list(resource)),
 *  fixed: object merged into every create/update (e.g. {supplier_id}),
 *  onRowClick, searchKeys, extraActions (node), rowActions (row)=>node
 */
export default function ResourceManager({
  title, singular, resource, idKey, columns, fields,
  load, fixed = {}, onRowClick, searchKeys, extraActions, rowActions, emptyHint, refreshKey = 0,
  importConfig,
}) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | row
  const [confirming, setConfirming] = useState(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = load ? await load() : await api.list(resource);
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [load, resource]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const saveRow = async (values) => {
    const payload = { ...values, ...fixed };
    if (editing && editing[idKey]) {
      await api.update(resource, editing[idKey], payload);
      toast.success(`${singular} updated`);
    } else {
      await api.create(resource, payload);
      toast.success(`${singular} added`);
    }
    setEditing(null);
    reload();
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.remove(resource, confirming[idKey]);
      toast.success(`${singular} deleted`);
      setConfirming(null);
      reload();
    } catch (e) {
      toast.error(e.message.includes('23503') || e.message.toLowerCase().includes('foreign')
        ? `Cannot delete — this ${singular.toLowerCase()} is referenced by other records. Set it inactive instead.`
        : e.message);
    } finally { setBusy(false); }
  };

  const filtered = search && searchKeys
    ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <>
      <div className="toolbar">
        {searchKeys && (
          <div className="search">
            <span className="si">🔍</span>
            <input placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        <div className="spacer" />
        {extraActions}
        {importConfig && <button className="btn" onClick={() => setImporting(true)}>⬆ Import CSV</button>}
        <button className="btn primary" onClick={() => setEditing({})}>＋ Add {singular}</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : null}>{c.label}</th>)}
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={columns.length + 1}><div className="loading">Loading…</div></td></tr>}
              {!loading && !filtered.length && (
                <tr><td colSpan={columns.length + 1}>
                  <div className="empty">
                    <div className="big">📭</div>
                    No {title.toLowerCase()} yet.{emptyHint ? <div style={{ marginTop: 6 }}>{emptyHint}</div> : null}
                  </div>
                </td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r[idKey]} className={onRowClick ? 'row-click' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                      {c.render ? c.render(r) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                  <td className="actions">
                    {rowActions && rowActions(r)}
                    <button className="btn sm" onClick={() => setEditing(r)}>Edit</button>
                    <button className="btn sm danger" onClick={() => setConfirming(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={`${editing[idKey] ? 'Edit' : 'Add'} ${singular}`}
          onClose={() => setEditing(null)}
          wide={fields.length > 8}
        >
          <Form fields={fields} initial={editing} onSubmit={saveRow} onClose={() => setEditing(null)} />
        </Modal>
      )}

      {confirming && (
        <ConfirmDialog
          message={`Delete this ${singular.toLowerCase()}? This cannot be undone.`}
          onConfirm={doDelete}
          onClose={() => setConfirming(null)}
          busy={busy}
        />
      )}

      {importing && importConfig && (
        <ImportModal
          {...importConfig}
          onClose={() => setImporting(false)}
          onDone={reload}
        />
      )}
    </>
  );
}
