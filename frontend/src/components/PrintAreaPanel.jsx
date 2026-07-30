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

export default function PrintAreaPanel({ styleId }) {
  const [processType, setProcessType] = useState('DTF');
  const [printAreas, setPrintAreas] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [areaError, setAreaError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingAreas(true);
    setAreaError('');
    api.printAreasByStyle(styleId)
      .then((rows) => {
        if (!active) return;
        setPrintAreas(rows);
        setProcessType(rows.some((row) => row.process_type === 'DTF') ? 'DTF' : (rows[0]?.process_type || 'DTF'));
      })
      .catch((error) => active && setAreaError(error.message))
      .finally(() => active && setLoadingAreas(false));
    return () => { active = false; };
  }, [styleId]);

  const visibleAreas = useMemo(
    () => printAreas.filter((row) => row.process_type === processType),
    [printAreas, processType],
  );
  const methodCounts = useMemo(() => printAreas.reduce((counts, row) => {
    counts[row.process_type] = (counts[row.process_type] || 0) + 1;
    return counts;
  }, {}), [printAreas]);

  return (
    <section className="card print-area-card">
      <div className="card-head print-area-head">
        <div>
          <h3>DTF / DTG Print Areas</h3>
          <p>Size-specific maximum artwork dimensions.</p>
        </div>
        <div className="process-filter" role="group" aria-label="Filter print areas by method">
          {['DTF', 'DTG'].map((method) => (
            <button
              key={method}
              type="button"
              className={processType === method ? 'active' : ''}
              onClick={() => setProcessType(method)}
              aria-pressed={processType === method}
            >
              {method}
              <span>{methodCounts[method] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="print-method-note">
        <span className={`method-badge ${processType.toLowerCase()}`}>{processType}</span>
        <div>
          <strong>{processType === 'DTF' ? 'Direct to Film' : 'Direct to Garment'}</strong>
          <span>Source measurements are in centimetres. Inches are calculated at 1 in = 2.54 cm.</span>
        </div>
      </div>

      {loadingAreas && <div className="loading">Loading print areas…</div>}
      {areaError && <div className="error-box print-area-error">{areaError}</div>}
      {!loadingAreas && !areaError && visibleAreas.length === 0 && (
        <div className="empty print-area-empty">
          <div className="big">▧</div>
          No {processType} print-area data is supplied for this style.
        </div>
      )}
      {!loadingAreas && visibleAreas.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl print-area-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Placement</th>
                <th>Maximum Print Area</th>
                <th>Scale</th>
              </tr>
            </thead>
            <tbody>
              {visibleAreas.map((row) => (
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
                  <td><span className="scale-value">{round1(row.scale_percent)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
