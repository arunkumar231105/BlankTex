import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONFIG_PATH = process.env.SUPPLIER_CONFIG_PATH || '/run/secrets/blanktex-supplier.json';

export function supplierConfig() {
  let stored = {};
  try { stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { /* env-only configuration is valid */ }
  return {
    secretKey: process.env.RIIN_SECRET_KEY || stored.secret_key || '',
    baseUrl: (process.env.RIIN_BASE_URL || stored.base_url || 'https://tshirt.riin.com').replace(/\/$/, ''),
    env: process.env.RIIN_ENV || stored.env || 'prod',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || stored.cloudinary_cloud_name || '',
    cloudinaryKey: process.env.CLOUDINARY_API_KEY || stored.cloudinary_api_key || '',
    cloudinarySecret: process.env.CLOUDINARY_API_SECRET || stored.cloudinary_api_secret || '',
  };
}

export async function supplierPost(endpoint, body) {
  const config = supplierConfig();
  if (!config.secretKey) throw Object.assign(new Error('Supplier API is not configured'), { status: 503 });
  const bodyText = JSON.stringify(body);
  const sign = createHash('md5').update(`${bodyText}::${config.secretKey}`).digest('hex');
  let response;
  try {
    response = await fetch(`${config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', secretKey: config.secretKey, sign },
      body: bodyText,
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'Supplier request timed out. Check order status before retrying.'
      : `Supplier connection failed: ${error.message}`;
    throw Object.assign(new Error(message), { status: 502 });
  }
  let result;
  try { result = await response.json(); } catch { throw Object.assign(new Error(`Supplier returned HTTP ${response.status}`), { status: 502 }); }
  if (!result.successful && !result.success) {
    throw Object.assign(new Error(result.message || 'Supplier rejected the request'), {
      status: 400,
      supplierCode: result.errorCode,
    });
  }
  return result;
}

export async function cloudinaryUpload(buffer, mimeType, originalName) {
  const config = supplierConfig();
  if (!config.cloudName || !config.cloudinaryKey || !config.cloudinarySecret) {
    throw Object.assign(new Error('Cloudinary is not configured'), { status: 503 });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash('sha1').update(`timestamp=${timestamp}${config.cloudinarySecret}`).digest('hex');
  const form = new FormData();
  form.append('api_key', config.cloudinaryKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('file', new Blob([buffer], { type: mimeType }), originalName || 'order-image');
  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw Object.assign(new Error(`Image hosting failed: ${error.message}`), { status: 502 });
  }
  const result = await response.json();
  if (!result.secure_url) throw Object.assign(new Error(result.error?.message || 'Image hosting failed'), { status: 502 });
  return { url: result.secure_url, public_id: result.public_id, original_name: originalName || null };
}

export const SUPPLIER_STATUSES = {
  1: 'Store Audit', 2: 'Pending Push', 3: 'Rejected', 4: 'Factory Audit',
  5: 'In Production', 12: 'Shipped', 13: 'Closed', 14: 'Refunding', 15: 'Refunded',
};
