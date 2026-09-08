// Server-to-server client for Decoinks Printshop's /api/crm bridge.
//
// BlankTex reads Printshop's apparel sales orders (to auto-fill a new blank order)
// and, once the blanks are placed with the supplier, asks Printshop to raise the
// purchase order for that sales order. Printshop stays the system of record: PO
// numbering, the po_orders link and pipeline events all happen on its side — we
// only call the same service its own screens call.
//
// Auth is the shared *service* secret (SERVICE_API_SECRET), sent in the header
// Printshop's serviceAuth middleware checks (`x-decoinks-sso-secret`). That is a
// different credential from the person-login SSO secret. Both reach this process
// via the env_file it inherits from Printshop's backend/.env.
//
// The base URL points at Printshop's backend container by its unambiguous name
// (`decoinks_backend`) on the shared `decoinks_decoinks_net` network — not the
// service alias `backend`, which collides with BlankTex's own backend there.

const BASE = (process.env.PRINTSHOP_API_URL || 'http://decoinks_backend:8000').replace(/\/+$/, '');
const SECRET = process.env.SERVICE_API_SECRET || '';

function printshopError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

export function printshopConfigured() {
  return Boolean(SECRET);
}

async function psFetch(path, { method = 'GET', body } = {}) {
  if (!SECRET) throw printshopError('Printshop service secret is not configured', 500);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'x-decoinks-sso-secret': SECRET,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw printshopError(`Could not reach Printshop: ${err.message}`, 502);
  }
  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) {
    throw printshopError(payload?.error || `Printshop returned ${res.status}`, res.status);
  }
  return payload?.data ?? payload;
}

// Apparel sales orders that do not yet have a purchase order — the pick list.
export function listSalesOrders({ type = 'apparel', channel = '', search = '' } = {}) {
  const qs = new URLSearchParams(
    Object.entries({ type, channel, search }).filter(([, v]) => v)
  ).toString();
  return psFetch(`/api/crm/orders${qs ? `?${qs}` : ''}`);
}

// One order in full: header, line items, artworks — for auto-fill.
export function getSalesOrder(id) {
  return psFetch(`/api/crm/orders/${encodeURIComponent(id)}`);
}

// Raise (or return the existing) purchase order for this sales order. Idempotent
// on Printshop's side. Returns { id, po_number, status, ... }.
export function createPurchaseOrder(orderId, agentEmail = '') {
  return psFetch(`/api/crm/orders/${encodeURIComponent(orderId)}/purchase-order`, {
    method: 'POST',
    body: { agent_email: agentEmail || '' },
  });
}
