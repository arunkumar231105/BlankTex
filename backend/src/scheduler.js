// Background schedulers for the API process. Currently: refresh S&S Activewear
// stock + pricing on a fixed interval. The refresh runs as a detached child
// process so a long pull never blocks the HTTP event loop or crashes the API.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startStockScheduler() {
  const hours = Number(process.env.SS_STOCK_REFRESH_HOURS || 5);
  if (!(hours > 0)) {
    console.log('S&S stock scheduler disabled (SS_STOCK_REFRESH_HOURS <= 0).');
    return;
  }
  const intervalMs = hours * 60 * 60 * 1000;

  const run = () => {
    console.log(`[scheduler] launching S&S stock refresh (interval ${hours}h)`);
    const child = spawn(process.execPath, [join(__dirname, 'refreshSSStock.js')], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.on('error', (error) => console.error('[scheduler] stock refresh failed to start:', error.message));
    child.unref();
  };

  // Fire every `hours`; the first run is one interval after startup so a deploy
  // does not trigger a heavy pull immediately (import data is already fresh).
  setInterval(run, intervalMs);
  console.log(`S&S stock scheduler active — refreshing every ${hours}h.`);
}

// Periodically sync order statuses from the supplier so users don't have to
// click "Sync All". Runs as a detached child process.
export function startOrderSyncScheduler() {
  const minutes = Number(process.env.ORDER_SYNC_MINUTES || 60);
  if (!(minutes > 0)) {
    console.log('Order-status sync scheduler disabled (ORDER_SYNC_MINUTES <= 0).');
    return;
  }
  const intervalMs = minutes * 60 * 1000;

  const run = () => {
    const child = spawn(process.execPath, [join(__dirname, 'syncOrderStatuses.js')], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.on('error', (error) => console.error('[scheduler] order sync failed to start:', error.message));
    child.unref();
  };

  // First run shortly after startup, then every `minutes`.
  setTimeout(run, 60 * 1000);
  setInterval(run, intervalMs);
  console.log(`Order-status sync scheduler active — every ${minutes} min.`);
}
