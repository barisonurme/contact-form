import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { env } from './core/env';
import { logger } from './core/logger';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';

const app = new Hono();

// Request logging for API routes only (skip static assets)
app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start,
    },
    'request',
  );
});

app.onError((err, c) => {
  logger.error(err, 'unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

app.route('/api', publicRoutes);
app.route('/api/admin', adminRoutes);

// Admin SPA — built files land in ./admin/dist (see Dockerfile)
app.use(
  '/admin/*',
  serveStatic({
    root: './admin/dist',
    rewriteRequestPath: (path) => path.replace(/^\/admin/, '') || '/',
  }),
);
app.get('/admin/*', serveStatic({ path: './admin/dist/index.html' }));
app.get('/admin', (c) => c.redirect('/admin/'));
app.get('/', (c) => c.redirect('/admin/'));

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info({ port: env.PORT, env: env.NODE_ENV }, 'contact service listening');
