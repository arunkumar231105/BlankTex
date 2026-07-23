import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const printAreaData = JSON.parse(readFileSync(join(__dirname, 'print-area-data.json'), 'utf8'));

const SIZE_ALIASES = new Map([
  ['2XL', 'XXL'],
  ['3XL', 'XXXL'],
  ['4XL', 'XXXXL'],
  ['5XL', 'XXXXXL'],
]);

function normalizePlacement(sourcePlacement) {
  if (sourcePlacement === 'Front and Back are the same') {
    return { placement: 'Front and Back', sameForFrontBack: true };
  }
  return { placement: sourcePlacement, sameForFrontBack: false };
}

export async function syncPrintAreas() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT s.style_id, s.style_no, z.style_size_id, z.size_code
      FROM styles s
      LEFT JOIN style_sizes z ON z.style_id = s.style_id
    `);

    const styles = new Map();
    for (const row of rows) {
      if (!styles.has(row.style_no)) {
        styles.set(row.style_no, { styleId: row.style_id, sizes: new Map() });
      }
      if (row.style_size_id) {
        styles.get(row.style_no).sizes.set(row.size_code, row.style_size_id);
      }
    }

    await client.query('DELETE FROM style_print_areas WHERE source_name = $1', [printAreaData.source_name]);

    const unmatchedStyles = new Map();
    const unmatchedSizes = [];
    let imported = 0;

    for (const record of printAreaData.records) {
      const style = styles.get(record.style_no);
      if (!style) {
        unmatchedStyles.set(record.style_no, (unmatchedStyles.get(record.style_no) || 0) + 1);
        continue;
      }

      const canonicalSize = style.sizes.has(record.source_size_code)
        ? record.source_size_code
        : SIZE_ALIASES.get(record.source_size_code);
      const styleSizeId = style.sizes.get(canonicalSize);
      if (!styleSizeId) {
        unmatchedSizes.push({
          style_no: record.style_no,
          source_size_code: record.source_size_code,
          source_sheet: record.source_sheet,
          source_row: record.source_row,
        });
        continue;
      }

      const normalized = normalizePlacement(record.placement);
      await client.query(
        `INSERT INTO style_print_areas (
           style_id, style_size_id, process_type, placement, same_for_front_back,
           max_width_cm, max_height_cm, scale_percent, actual_width_cm, actual_height_cm,
           source_size_code, source_product_name, source_name, source_sheet, source_row
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          style.styleId, styleSizeId, record.process_type, normalized.placement,
          normalized.sameForFrontBack, record.max_width_cm, record.max_height_cm,
          record.scale_percent, record.actual_width_cm, record.actual_height_cm,
          record.source_size_code, record.product_name, printAreaData.source_name,
          record.source_sheet, record.source_row,
        ],
      );
      imported += 1;
    }

    await client.query('COMMIT');
    return {
      source_records: printAreaData.record_count,
      imported,
      unmatched_styles: [...unmatchedStyles.entries()].map(([style_no, records]) => ({ style_no, records })),
      unmatched_sizes: unmatchedSizes,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
