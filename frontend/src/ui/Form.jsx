import { useState } from 'react';
import Field from './Field.jsx';

// Generic form driven by a list of field descriptors.
// Renders inside a Modal; parent supplies onSubmit(values) and onClose.
export default function Form({ fields, initial = {}, onSubmit, onClose, submitLabel = 'Save' }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? f.default ?? (f.type === 'checkbox' ? false : '');
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const change = (name, val) => setValues((v) => ({ ...v, [name]: val }));

  const submit = async (e) => {
    e.preventDefault();
    // client-side required check
    for (const f of fields) {
      if (f.required && (values[f.name] === '' || values[f.name] == null)) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    // Normalise: empty strings -> null so numeric/optional columns don't get ""
    const payload = {};
    for (const [k, v] of Object.entries(values)) payload[k] = v === '' ? null : v;

    setBusy(true); setError(null);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        {fields.map((f) => <Field key={f.name} f={f} value={values[f.name]} onChange={change} />)}
      </div>
      <div className="modal-foot" style={{ margin: '18px -20px -20px', paddingBottom: 0 }}>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
