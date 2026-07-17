import { Router } from 'express';
import { query } from '../db.js';
import {
  authRequired,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  sessionTokenFromRequest,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';

const router = Router();
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

router.post('/sso', async (req, res, next) => {
  try {
    const expected = String(process.env.SSO_SHARED_SECRET || '');
    if (!expected || req.get('x-decoinks-sso-secret') !== expected) {
      return res.status(403).json({ error: 'SSO unavailable' });
    }
    const username = String(req.get('x-authentik-username') || '').trim().toLowerCase();
    if (!username) return res.status(401).json({ error: 'Missing SSO identity' });
    const rawEmail = String(req.get('x-authentik-email') || '').trim().toLowerCase();
    const email = rawEmail.includes('@') ? rawEmail : `${username}@decoinkssuite.com`;
    const displayName = String(req.get('x-authentik-name') || '').trim() || username;
    let { rows } = await query(
      `SELECT user_id, email, display_name, role FROM admin_users
       WHERE LOWER(email) = $1 AND active IS TRUE`,
      [email],
    );
    if (!rows[0]) {
      const passwordHash = await hashPassword((await import('node:crypto')).randomBytes(48).toString('base64url'));
      ({ rows } = await query(
        `INSERT INTO admin_users (email, password_hash, display_name, role, active)
         VALUES ($1, $2, $3, 'admin', TRUE)
         RETURNING user_id, email, display_name, role`,
        [email, passwordHash, displayName],
      ));
    }
    await query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    const { token, expiresAt } = await createSession(rows[0].user_id);
    setSessionCookie(req, res, token, expiresAt);
    return res.json({ user: rows[0] });
  } catch (error) {
    return next(error);
  }
});

function attemptState(ip) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    const fresh = { count: 0, startedAt: now };
    attempts.set(ip, fresh);
    return fresh;
  }
  return current;
}

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip;
    const state = attemptState(ip);
    if (state.count >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const { rows } = await query(
      `SELECT user_id, email, display_name, role, password_hash
       FROM admin_users WHERE LOWER(email) = $1 AND active IS TRUE`,
      [email],
    );
    const valid = rows[0] && await verifyPassword(password, rows[0].password_hash);
    if (!valid) {
      state.count += 1;
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    attempts.delete(ip);
    await query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    const { token, expiresAt } = await createSession(rows[0].user_id);
    setSessionCookie(req, res, token, expiresAt);
    return res.json({
      user: {
        user_id: rows[0].user_id,
        email: rows[0].email,
        display_name: rows[0].display_name,
        role: rows[0].role,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

router.post('/logout', async (req, res, next) => {
  try {
    await deleteSession(sessionTokenFromRequest(req));
    clearSessionCookie(req, res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
