import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  assert,
  email,
  password,
  text,
  hashPassword,
  verifyPassword,
  hashToken,
  randomToken,
} from './security.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
};
export function sessionMiddleware(db) {
  return (req, res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('sid='))
      ?.slice(4);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = db
        .prepare(
          `SELECT s.*,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.active=1`,
        )
        .get(hashToken(token), Date.now());
      if (session) {
        req.session = session;
        req.user = {
          id: session.user_id,
          name: session.name,
          email: session.email,
          role: session.role,
        };
      }
    }
    next();
  };
}
export function requireUser(req, res, next) {
  assert(req.user, 'Спочатку увійдіть до акаунту.', 401);
  next();
}
export function requireAdmin(req, res, next) {
  assert(req.user?.role === 'admin', 'Доступ лише для адміністратора.', 403);
  next();
}
export function requireCsrf(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Browser requests carry a custom header; cross-origin forms cannot send it.
    assert(req.get('X-Requested-With') === 'svit-shop', 'Запит відхилено.', 403);
    const origin = req.get('Origin');
    if (origin) {
      let host;
      try {
        host = new URL(origin).host;
      } catch {}
      assert(host === req.get('host'), 'Джерело запиту не дозволене.', 403);
    }
    if (req.session)
      assert(
        req.get('X-CSRF-Token') === req.session.csrf_token,
        'Оновіть сторінку та повторіть дію.',
        403,
      );
  }
  next();
}
export function authRouter(db) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Забагато спроб. Спробуйте через 15 хвилин.' },
  });
  async function startSession(req, res, user) {
    if (req.session)
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token = randomToken(),
      csrfToken = randomToken();
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
      hashToken(token),
      user.id,
      csrfToken,
      Date.now() + 7 * 86400000,
    );
    res.cookie('sid', token, { ...cookieOptions, maxAge: 7 * 86400000 });
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrfToken,
    });
  }
  router.get('/me', (req, res) =>
    res.json({ user: req.user || null, csrfToken: req.session?.csrf_token || null }),
  );
  router.post('/register', limit, async (req, res) => {
    const name = text(req.body.name, 'Ім’я', 80, 2),
      address = email(req.body.email),
      secret = password(req.body.password);
    assert(
      !db.prepare('SELECT id FROM users WHERE email=?').get(address),
      'Цей email уже зареєстрований.',
      409,
    );
    const hash = await hashPassword(secret);
    const result = db
      .prepare('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)')
      .run(name, address, hash);
    await startSession(req, res, {
      id: Number(result.lastInsertRowid),
      name,
      email: address,
      role: 'customer',
    });
  });
  router.post('/login', limit, async (req, res) => {
    const address = email(req.body.email),
      secret = password(req.body.password);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
    // Run scrypt even for an unknown address, so account existence is not exposed by a cheap path.
    const stored = user?.password_hash || '00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await verifyPassword(secret, stored);
    assert(user?.active && valid, 'Невірний email або пароль.', 401);
    await startSession(req, res, user);
  });
  router.post('/logout', (req, res) => {
    if (req.session)
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    res.clearCookie('sid', cookieOptions);
    res.json({ ok: true });
  });
  return router;
}
