// Fetch wrapper + generic resource client for the BlankTex API.
const BASE = '/api';

function qs(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  return clean.length ? '?' + new URLSearchParams(clean).toString() : '';
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const b = await res.json(); msg = b.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // generic CRUD — resource is the route namespace (e.g. 'suppliers')
  list: (resource, params) => request(`/${resource}${qs(params)}`),
  get: (resource, id) => request(`/${resource}/${id}`),
  create: (resource, body) => request(`/${resource}`, { method: 'POST', body }),
  update: (resource, id, body) => request(`/${resource}/${id}`, { method: 'PUT', body }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),

  // raw
  raw: (path, options) => request(path, options),

  // CSV import — entity: suppliers | brands | styles | catalog
  importCsv: (entity, csv) => request(`/import/${entity}`, { method: 'POST', body: { csv } }),

  // specific
  dashboardStats: () => request('/dashboard/stats'),
  styleFilters: () => request('/styles/filters'),
  styleDetail: (id) => request(`/styles/${id}`),
  generateSkus: (id) => request(`/styles/${id}/generate-skus`, { method: 'POST' }),

  // nested lists
  contactsBySupplier: (id) => request(`/contacts/by-supplier/${id}`),
  warehousesBySupplier: (id) => request(`/warehouses/by-supplier/${id}`),
  colorsByStyle: (id) => request(`/colors/by-style/${id}`),
  sizesByStyle: (id) => request(`/sizes/by-style/${id}`),
  skusByStyle: (id) => request(`/skus/by-style/${id}`),
  specBySize: (id) => request(`/specs/by-size/${id}`),
  saveSpec: (id, body) => request(`/specs/by-size/${id}`, { method: 'PUT', body }),
  pricesBySku: (id) => request(`/prices/by-sku/${id}`),
};
