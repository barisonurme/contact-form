import { Hono } from 'hono';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { db } from '../db';
import { messages } from '../db/schema';
import { createSession, destroySession, requireAdmin } from '../services/auth';
import { issueCode, noteFailure, verifyCode } from '../services/login-code';
import { sendLoginCode } from '../services/mailer';
import { RateLimiter, clientIp } from '../services/rate-limit';

const PAGE_SIZE = 20;

const loginSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
// Per-IP, plus a ceiling across all IPs so a distributed attack still can't
// grind the 6-digit space or mail-bomb the inbox.
const loginLimiter = new RateLimiter(5, 60 * 1000);
const globalLoginLimiter = new RateLimiter(15, 10 * 60 * 1000);

const loginThrottled = (ip: string) =>
  !loginLimiter.allow(ip) || !globalLoginLimiter.allow('global');

export const adminRoutes = new Hono();

adminRoutes.post('/login/request', async (c) => {
  const ip = clientIp(c);
  if (loginThrottled(ip)) {
    return c.json({ error: 'Çok fazla deneme, biraz sonra tekrar dene' }, 429);
  }

  const code = issueCode();
  sendLoginCode(code, ip).catch((err) => logger.error(err, 'login code mail failed'));
  logger.info({ ip }, 'admin login code requested');
  if (env.NODE_ENV !== 'production') logger.info({ code }, 'dev login code');

  return c.json({ ok: true });
});

adminRoutes.post('/login', async (c) => {
  const ip = clientIp(c);
  if (loginThrottled(ip)) {
    return c.json({ error: 'Çok fazla deneme, biraz sonra tekrar dene' }, 429);
  }

  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Geçerli bir kod gir' }, 400);
  }

  if (!verifyCode(parsed.data.code)) {
    noteFailure(ip);
    logger.warn({ ip }, 'failed admin login');
    return c.json({ error: 'Invalid code' }, 401);
  }

  await createSession(c);
  return c.json({ ok: true });
});

// Everything below requires a valid session
adminRoutes.use('*', requireAdmin);

adminRoutes.post('/logout', (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

adminRoutes.get('/messages', async (c) => {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '', 10) || 1);
  const site = c.req.query('site');
  const unreadOnly = c.req.query('unread') === 'true';

  const filters = [];
  if (site) filters.push(eq(messages.site, site));
  if (unreadOnly) filters.push(eq(messages.read, false));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(messages).where(where),
  ]);

  return c.json({ items, total, page, pageSize: PAGE_SIZE });
});

const isUuid = (value: string) => z.uuid().safeParse(value).success;

adminRoutes.patch('/messages/:id/read', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'Not found' }, 404);
  const updated = await db
    .update(messages)
    .set({ read: true })
    .where(eq(messages.id, id))
    .returning({ id: messages.id });
  if (updated.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.delete('/messages/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'Not found' }, 404);
  const deleted = await db
    .delete(messages)
    .where(eq(messages.id, id))
    .returning({ id: messages.id });
  if (deleted.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.get('/stats', async (c) => {
  const stats = await db
    .select({
      site: messages.site,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`(count(*) filter (where not ${messages.read}))::int`,
    })
    .from(messages)
    .groupBy(messages.site)
    .orderBy(messages.site);

  return c.json({ stats });
});
