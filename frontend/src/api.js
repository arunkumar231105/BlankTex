// Fetch wrapper + generic resource client for the BlankTex API.
const BASE = '/api';

function qs(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  return clean.length ? '?' + new URLSearchParams(clean).toString() : '';
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(BASE + path, {
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? (isForm ? options.body : JSON.stringify(options.body)) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const b = await res.json(); msg = b.error || msg; } catch { /* ignore */ }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('blanktex:unauthorized'));
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  sso: () => request('/auth/sso', { method: 'POST' }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  authMe: () => request('/auth/me'),

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
  supplierCatalogStyles: (params) => request(`/styles/supplier-catalog/manage${qs(params)}`),
  setSupplierStyleStatus: (id, enabled) => request(`/styles/supplier-catalog/${id}/status`, { method: 'PUT', body: { enabled } }),
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
  imagesByStyle: (id) => request(`/images/by-style/${id}`),
  decorationsByStyle: (id) => request(`/decorations/by-style/${id}`),
  printAreasByStyle: (id, processType) => request(
    `/decorations/print-areas/by-style/${id}${qs({ process_type: processType })}`,
  ),
  purchaseCatalog: () => request('/purchases/catalog'),
  syncPurchaseCatalog: (supplierId) => request('/purchases/catalog/sync', { method: 'POST', body: { supplier_id: supplierId } }),
  createPurchase: (body) => request('/purchases', { method: 'POST', body }),
  uploadPurchaseImage: (body) => request('/purchases/upload', { method: 'POST', body }),
  purchases: (params) => request(`/purchases${qs(params)}`),
  purchase: (orderNo) => request(`/purchases/${encodeURIComponent(orderNo)}`),
  syncPurchases: (orderNos) => request('/purchases/sync', { method: 'POST', body: { order_nos: orderNos || [] } }),
  importPurchase: (orderNo, supplierId) => request('/purchases/import', { method: 'POST', body: { order_no: orderNo, supplier_id: supplierId } }),
  purchaseDelivery: (orderNo) => request(`/purchases/${encodeURIComponent(orderNo)}/delivery`),
  closePurchase: (orderNo) => request(`/purchases/${encodeURIComponent(orderNo)}/close`, { method: 'POST' }),
  savePurchaseNotes: (orderNo, notes) => request(`/purchases/${encodeURIComponent(orderNo)}/notes`, { method: 'PUT', body: { notes } }),
  updatePurchaseShipping: (orderNo, body) => request(`/purchases/${encodeURIComponent(orderNo)}/shipping`, { method: 'PUT', body }),
  purchaseIntegration: () => request('/purchases/integration'),
  testPurchaseIntegration: () => request('/purchases/integration/test', { method: 'POST' }),
  retryPurchase: (orderNo) => request(`/purchases/${encodeURIComponent(orderNo)}/retry`, { method: 'POST' }),
};
