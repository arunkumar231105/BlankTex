import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'blanktex_session';
const SESSION_DAYS = 7;

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, hashHex] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash(token), expiresAt],
  );
  return { token, expiresAt };
}

export function setSessionCookie(req, res, token, expiresAt) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req, res) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function sessionTokenFromRequest(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

export async function deleteSession(token) {
  if (token) await query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash(token)]);
}

export async function authRequired(req, res, next) {
  try {
    const token = sessionTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const { rows } = await query(
      `SELECT u.user_id, u.email, u.display_name, u.role
       FROM auth_sessions s
       JOIN admin_users u ON u.user_id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active IS TRUE`,
      [tokenHash(token)],
    );
    if (!rows[0]) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    req.user = rows[0];
    req.sessionToken = token;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function seedAdminFromEnv() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) {
    console.warn('Admin user not seeded: ADMIN_EMAIL and ADMIN_PASSWORD are required.');
    return { seeded: false, reason: 'missing_env' };
  }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');

  const existing = await query('SELECT user_id FROM admin_users WHERE LOWER(email) = $1', [email]);
  if (existing.rows[0]) return { seeded: false, reason: 'already_exists', email };

  const passwordHash = await hashPassword(password);
  await query(
    `INSERT INTO admin_users (email, password_hash, display_name, role)
     VALUES ($1, $2, 'Admin', 'admin')`,
    [email, passwordHash],
  );
  return { seeded: true, email };
}
