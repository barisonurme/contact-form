import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { db } from '../db';
import { messages } from '../db/schema';
import { sendNotification } from '../services/mailer';
import { RateLimiter, clientIp } from '../services/rate-limit';

const submitSchema = z.object({
  site: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
});

const submitLimiter = new RateLimiter(3, 60 * 1000);

export const publicRoutes = new Hono();

publicRoutes.get('/health', (c) => c.json({ status: 'ok' }));

publicRoutes.use(
  '/submit',
  cors({
    origin: (origin) => (env.ALLOWED_ORIGINS.includes(origin) ? origin : ''),
    allowMethods: ['POST', 'OPTIONS'],
  }),
);

publicRoutes.post('/submit', async (c) => {
  const ip = clientIp(c);
  if (!submitLimiter.allow(ip)) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be valid JSON' }, 400);
  }

  // Honeypot: hidden "website" field filled in → bot. Pretend success, do nothing.
  if (typeof body === 'object' && body !== null && (body as Record<string, unknown>).website) {
    logger.info({ ip }, 'honeypot triggered, dropping submission');
    return c.json({ ok: true });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ error: `${issue.path.join('.')}: ${issue.message}` }, 400);
  }

  const { site, name, email, message } = parsed.data;
  if (!env.ALLOWED_SITES.includes(site)) {
    return c.json({ error: 'Unknown site' }, 400);
  }

  await db.insert(messages).values({ site, name, email, message, ip });
  logger.info({ site, ip }, 'message stored');

  // Don't block the response on SMTP — log failures instead
  sendNotification({ site, name, email, message, ip }).catch((err) => {
    logger.error(err, 'notification mail failed');
  });

  return c.json({ ok: true });
});
