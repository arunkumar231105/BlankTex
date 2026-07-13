// Small shared render helpers for tables.
export function Badge({ value }) {
  const v = String(value || '').toLowerCase();
  let cls = 'grey';
  if (['active', 'yes', 'true'].includes(v)) cls = 'green';
  else if (['discontinued', 'closed', 'inactive'].includes(v)) cls = 'grey';
  else if (['coming soon'].includes(v)) cls = 'amber';
  return <span className={`badge ${cls}`}>{value ?? '—'}</span>;
}

export const yesNo = (b) => <span className={`badge ${b ? 'green' : 'grey'}`}>{b ? 'Yes' : 'No'}</span>;

export function ColorDot({ hex, name }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: hex || '#ccc', border: '1px solid rgba(0,0,0,.12)' }} />
      {name}
    </span>
  );
}

export const money = (v, cur = 'USD') => (v == null ? '—' : `${cur} ${Number(v).toFixed(2)}`);
