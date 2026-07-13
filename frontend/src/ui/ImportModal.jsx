import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

// entity: suppliers | brands | styles | catalog
export default function ImportModal({ entity, title, columns, sample, onClose, onDone }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result));
    reader.readAsText(file);
  };

  const rowCount = csv ? Math.max(0, csv.trim().split(/\r?\n/).length - 1) : 0;

  const downloadTemplate = () => {
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${entity.replace(/[^a-z0-9]+/gi, '-')}-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!csv.trim()) { setError('Please choose a CSV file first.'); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await api.importCsv(entity, csv);
      setResult(res);
      const ok = res.created
        ? Object.values(res.created).reduce((a, b) => a + b, 0)
        : res.inserted;
      toast.success(`Imported — ${ok} record(s) added/updated`);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      title={`Import ${title} from CSV`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn primary" onClick={runImport} disabled={busy || !csv}>
            {busy ? 'Importing…' : `Import ${rowCount || ''} row(s)`}
          </button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      <div className="import-row">
        <label className="btn">
          📁 Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
        <button className="btn" onClick={downloadTemplate}>⬇ Download template</button>
        {fileName && <span className="import-file">{fileName} · {rowCount} data row(s)</span>}
      </div>

      <div className="import-hint">
        <b>Expected columns</b> (extra columns are ignored; headers are case/spacing-insensitive):
        <div className="import-cols">{columns.join(', ')}</div>
      </div>

      {csv && (
        <details className="import-preview">
          <summary>Preview first lines</summary>
          <pre>{csv.split(/\r?\n/).slice(0, 6).join('\n')}</pre>
        </details>
      )}

      {result && (
        <div className="import-result">
          {result.created ? (
            <div className="import-summary">
              {Object.entries(result.created).map(([k, v]) => (
                <span key={k} className="badge blue">{v} {k}</span>
              ))}
            </div>
          ) : (
            <div className="import-summary"><span className="badge green">{result.inserted} added/updated</span></div>
          )}
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
            {result.processed} row(s) processed · {result.errors.length} error(s)
          </div>
          {!!result.errors.length && (
            <div className="import-errors">
              {result.errors.slice(0, 20).map((er, i) => (
                <div key={i}>Row {er.row}: {er.message}</div>
              ))}
              {result.errors.length > 20 && <div>…and {result.errors.length - 20} more</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
