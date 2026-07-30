// S&S Activewear REST API v2 client.
// Auth is HTTP Basic: username = account number, password = API key.
// Credentials come from the environment (or the shared supplier config file),
// never hard-coded, so keys are not committed to the repository.
import { readFileSync } from 'node:fs';

const CONFIG_PATH = process.env.SUPPLIER_CONFIG_PATH || '/run/secrets/blanktex-supplier.json';

export function ssConfig() {
  let stored = {};
  try { stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { /* env-only is valid */ }
  return {
    account: process.env.SSA_ACCOUNT || stored.ssa_account || '',
    apiKey: process.env.SSA_API_KEY || stored.ssa_api_key || '',
    baseUrl: (process.env.SSA_BASE_URL || stored.ssa_base_url || 'https://api.ssactivewear.com/v2').replace(/\/$/, ''),
    cdnBase: (process.env.SSA_CDN_BASE || stored.ssa_cdn_base || 'https://cdn.ssactivewear.com').replace(/\/$/, ''),
  };
}

export function ssImageUrl(path) {
  if (!path) return null;
  const clean = String(path).trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  return `${ssConfig().cdnBase}/${clean.replace(/^\//, '')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ssGet(path, { retries = 4, throttleWaitMs = 62_000 } = {}) {
  const { account, apiKey, baseUrl } = ssConfig();
  if (!account || !apiKey) {
    throw Object.assign(new Error('S&S API not configured (set SSA_ACCOUNT and SSA_API_KEY)'), { status: 503 });
  }
  const auth = Buffer.from(`${account}:${apiKey}`).toString('base64');

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      // Network/timeout: retry a few times before giving up.
      if (attempt < retries) { await sleep(3_000); continue; }
      throw Object.assign(new Error(`S&S request failed for ${path}: ${error.message}`), { status: 502 });
    }
    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    const throttled = res.status === 503 || res.status === 429 || /throttl/i.test(body);
    if (throttled && attempt < retries) {
      await sleep(throttleWaitMs);
      continue;
    }
    throw Object.assign(new Error(`S&S HTTP ${res.status} for ${path}${body ? ` — ${body.slice(0, 160)}` : ''}`), { status: res.status });
  }
}
