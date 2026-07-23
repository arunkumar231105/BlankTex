import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import ResourceManager from '../../ui/ResourceManager.jsx';

const fields = [
  { name: 'process_type', label: 'Process Type', required: true, hint: 'e.g. DTF or DTG' },
  { name: 'supplier_color_code', label: 'Color / Supplier Code' },
  { name: 'size_range', label: 'Size / Range', hint: 'Source value, e.g. S-XL or 3XL' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const columns = [
  { key: 'process_type', label: 'Process', render: (row) => <b>{row.process_type}</b> },
  { key: 'supplier_color_code', label: 'Color', render: (row) => row.supplier_color_code || 'All listed colors' },
  { key: 'size_range', label: 'Size', render: (row) => row.size_range || 'All listed sizes' },
  { key: 'notes', label: 'Notes' },
];

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function AreaValue({ widthCm, heightCm, widthIn, heightIn }) {
  return (
    <div className="print-dimension">
      <strong>{cleanNumber(widthCm)} × {cleanNumber(heightCm)} cm</strong>
      <span>{cleanNumber(widthIn)} × {cleanNumber(heightIn)} in</span>
    </div>
  );
}

function placementLabel(row) {
  if (row.same_for_front_back) return 'Front & Back (same)';
  return row.placement;
}

export default function DecorationsTab({ styleId }) {
  const load = useCallback(() => api.decorationsByStyle(styleId), [styleId]);
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
        if (!rows.some((row) => row.process_type === processType)) {
          setProcessType(rows[0]?.process_type || 'DTF');
        }
      })
      .catch((error) => active && setAreaError(error.message))
      .finally(() => active && setLoadingAreas(false));
    return () => { active = false; };
  }, [styleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleAreas = useMemo(
    () => printAreas.filter((row) => row.process_type === processType),
    [printAreas, processType],
  );
  const methodCounts = useMemo(() => printAreas.reduce((counts, row) => {
    counts[row.process_type] = (counts[row.process_type] || 0) + 1;
    return counts;
  }, {}), [printAreas]);

  return (
    <div className="decoration-layout">
      <section className="card print-area-card">
        <div className="card-head print-area-head">
          <div>
            <h3>Print Area Specifications</h3>
            <p>Size-specific maximum and scaled artwork dimensions.</p>
          </div>
          <label className="process-picker">
            <span>Print method</span>
            <select value={processType} onChange={(event) => setProcessType(event.target.value)}>
              <option value="DTF">DTF ({methodCounts.DTF || 0})</option>
              <option value="DTG">DTG ({methodCounts.DTG || 0})</option>
            </select>
          </label>
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
                  <th>Actual Scaled Size</th>
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
                    <td><span className="scale-value">{cleanNumber(row.scale_percent)}%</span></td>
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
      </section>

      <ResourceManager
        title="Decoration Availability" singular="Decoration rule" resource="decorations"
        idKey="style_decoration_id" columns={columns} fields={fields} load={load}
        fixed={{ style_id: styleId }} searchKeys={['process_type', 'supplier_color_code', 'size_range']}
      />
    </div>
  );
}
