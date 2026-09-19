import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { authRouter, sessionMiddleware, requireUser, requireAdmin, requireCsrf } from './auth.js';
import { catalogRouter } from './catalog.js';
import { customerRouter } from './orders.js';
import { adminRouter } from './admin.js';

export function createApp(
  db,
  { publicDir = fileURLToPath(new URL('../src', import.meta.url)) } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: process.env.COOKIE_SECURE === 'true' ? undefined : false,
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Забагато запитів. Спробуйте за хвилину.' },
    }),
  );
  app.use('/api', express.json({ limit: '64kb' }), sessionMiddleware(db), requireCsrf);
  app.use('/api', (req, res, next) => {
    req.body ??= {};
    next();
  });
  app.use('/api/auth', authRouter(db));
  app.use('/api', catalogRouter(db));
  app.use('/api/admin', requireUser, requireAdmin, adminRouter(db, publicDir));
  app.use('/api', requireUser, customerRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API-ресурс не знайдено.' }));
  app.use(express.static(publicDir, { dotfiles: 'deny', index: 'index.html' }));
  app.use((req, res) => res.status(404).send('Сторінку не знайдено.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/.test(error.message))
      return res.status(409).json({ error: 'Запис із таким email або адресою вже існує.' });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'Зображення завелике. Максимум 5 МБ.' });
    if (error instanceof SyntaxError || error.type === 'entity.too.large')
      return res.status(400).json({ error: 'Некоректний формат або розмір запиту.' });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res
      .status(status)
      .json({ error: status >= 500 ? 'Помилка сервера. Спробуйте пізніше.' : error.message });
  });
  return app;
}
