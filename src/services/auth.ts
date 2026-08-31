import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Context } from 'hono';
import { env } from '../core/env';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createSession(c: Context): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ sub: 'admin', iat: now, exp: now + SESSION_TTL_SECONDS }, env.JWT_SECRET);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function destroySession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export const requireAdmin = createMiddleware(async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await verify(token, env.JWT_SECRET, 'HS256');
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
