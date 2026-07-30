import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function round1(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return String(Math.round(number * 10) / 10);
}

function AreaValue({ widthCm, heightCm, widthIn, heightIn }) {
  return (
    <div className="print-dimension">
      <strong>{round1(widthIn)} × {round1(heightIn)} in</strong>
      <span>{round1(widthCm)} × {round1(heightCm)} cm</span>
    </div>
  );
}

function placementLabel(row) {
  if (row.same_for_front_back) return 'Front & Back (same)';
  return row.placement;
}

const METHODS = [
  { key: 'DTF', label: 'Direct to Film' },
  { key: 'DTG', label: 'Direct to Garment' },
];

function ProcessColumn({ method, label, rows }) {
  return (
    <div className="process-column">
      <div className="print-method-note">
        <span className={`method-badge ${method.toLowerCase()}`}>{method}</span>
        <div>
          <strong>{label}</strong>
          <span>Source measurements are in centimetres. Inches are calculated at 1 in = 2.54 cm.</span>
        </div>
        <span className="method-count">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="empty print-area-empty">
          <div className="big">▧</div>
          No {method} print-area data is supplied for this style.
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl print-area-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Placement</th>
                <th>Maximum Print Area</th>
                <th>Actual Scaled Size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.style_print_area_id}>
                  <td>
                    <div className="print-size">{row.source_size_code}</div>
                    {row.source_size_code !== row.size_code && (
                      <div className="print-size-alias">Catalog: {row.size_code}</div>
                    )}
                  </td>
                  <td><span className="placement-badge">{placementLabel(row)}</span></td>
                  <td>
                    <AreaValue
                      widthCm={row.max_width_cm}
                      heightCm={row.max_height_cm}
                      widthIn={row.max_width_in}
                      heightIn={row.max_height_in}
                    />
                  </td>
                  <td>
                    <AreaValue
                      widthCm={row.actual_width_cm}
                      heightCm={row.actual_height_cm}
                      widthIn={row.actual_width_in}
                      heightIn={row.actual_height_in}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PrintAreaPanel({ styleId }) {
  const [printAreas, setPrintAreas] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [areaError, setAreaError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingAreas(true);
    setAreaError('');
    api.printAreasByStyle(styleId)
      .then((rows) => { if (active) setPrintAreas(rows); })
      .catch((error) => active && setAreaError(error.message))
      .finally(() => active && setLoadingAreas(false));
    return () => { active = false; };
  }, [styleId]);

  const byMethod = useMemo(() => {
    const groups = { DTF: [], DTG: [] };
    printAreas.forEach((row) => {
      if (!groups[row.process_type]) groups[row.process_type] = [];
      groups[row.process_type].push(row);
    });
    return groups;
  }, [printAreas]);

  return (
    <section className="card print-area-card">
      <div className="card-head print-area-head">
        <div>
          <h3>DTF / DTG Print Areas</h3>
          <p>Size-specific maximum and scaled artwork dimensions.</p>
        </div>
      </div>

      {loadingAreas && <div className="loading">Loading print areas…</div>}
      {areaError && <div className="error-box print-area-error">{areaError}</div>}
      {!loadingAreas && !areaError && (
        <div className="process-grid">
          {METHODS.map(({ key, label }) => (
            <ProcessColumn key={key} method={key} label={label} rows={byMethod[key] || []} />
          ))}
        </div>
      )}
    </section>
  );
}
