import { useState } from 'react';

function ImageField({ f, value, onChange }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="field full img-field">
      <label>{f.label}{f.required && <span className="req"> *</span>}</label>
      <input
        type="url"
        placeholder="Paste Nextcloud / image share link…"
        value={value || ''}
        onChange={(e) => { setBroken(false); onChange(f.name, e.target.value); }}
      />
      <div className="hint">{f.hint || 'Paste a public image URL (e.g. a Nextcloud share link). The preview updates automatically.'}</div>
      <div className="preview">
        {value && !broken
          ? <img src={value} alt="preview" onError={() => setBroken(true)} />
          : (broken ? 'Image could not load' : 'No image')}
      </div>
    </div>
  );
}

export default function Field({ f, value, onChange }) {
  if (f.type === 'image') return <ImageField f={f} value={value} onChange={onChange} />;

  if (f.type === 'checkbox') {
    return (
      <div className="field check">
        <input id={f.name} type="checkbox" checked={!!value} onChange={(e) => onChange(f.name, e.target.checked)} />
        <label htmlFor={f.name}>{f.label}</label>
      </div>
    );
  }

  const set = (v) => onChange(f.name, v === '' ? null : v);

  let control;
  if (f.type === 'select') {
    control = (
      <select value={value ?? ''} onChange={(e) => set(e.target.value)}>
        <option value="">{f.placeholder || '— select —'}</option>
        {(f.options || []).map((o) => {
          const val = typeof o === 'object' ? o.value : o;
          const lbl = typeof o === 'object' ? o.label : o;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    );
  } else if (f.type === 'textarea') {
    control = <textarea value={value ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
  } else if (f.type === 'color') {
    control = (
      <div className="color-input">
        <input type="color" value={value || '#000000'} onChange={(e) => set(e.target.value)} />
        <input type="text" value={value ?? ''} placeholder="#000000" onChange={(e) => set(e.target.value)} />
      </div>
    );
  } else if (f.type === 'number') {
    control = <input type="number" step={f.step || 'any'} value={value ?? ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} placeholder={f.placeholder} />;
  } else {
    control = <input type={f.type || 'text'} value={value ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
  }

  return (
    <div className={`field${f.full ? ' full' : ''}`}>
      <label>{f.label}{f.required && <span className="req"> *</span>}</label>
      {control}
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
}
