import { Router } from 'express';
import { query } from '../db.js';
import {
  authRequired,
  clearSessionCookie,
  createSession,
  deleteSession,
  sessionTokenFromRequest,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';

const router = Router();
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

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
