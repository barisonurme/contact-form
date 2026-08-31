import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { env } from '../core/env';

/** Sliding-window in-memory rate limiter. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.sweep(now);
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private sweep(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}

/**
 * Real client IP. With `TRUSTED_PROXY_HOPS` proxies in front (our Caddy = 1),
 * the trusted address is the Nth-from-rightmost `X-Forwarded-For` entry — each
 * proxy appends the address it saw, so everything further left is spoofable by
 * the client. Falls back to the socket address when there's no proxy or the
 * header is shorter than expected.
 */
export function clientIp(c: Context): string {
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops > 0) {
    const parts = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const trusted = parts[parts.length - hops];
    if (trusted) return trusted;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
