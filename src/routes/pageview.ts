import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { db } from '../db';
import { pageviews } from '../db/schema';
import { RateLimiter, clientIp } from '../services/rate-limit';
import { requireAdmin } from '../services/auth';
import { deviceType, isBot, uaFamily } from '../services/ua';

// Pageviews are chattier than contact submits — a much more lenient bucket.
const pageviewLimiter = new RateLimiter(60, 60 * 1000);
const statsLimiter = new RateLimiter(30, 60 * 1000);

const MAX_BODY_BYTES = 1024;
const DEDUPE_WINDOW_MS = 10 * 1000;

// Raw pageview rows live this long before the retention job rolls them into
// aggregates (see src/services/pageview-retention.ts). Per-visitor drill-downs
// can only answer dates inside this window.
const RAW_RETENTION_DAYS = 90;

// Strict: unknown fields are rejected, types enforced, lengths capped.
const pageviewSchema = z
  .object({
    site: z.string().min(1).max(64),
    path: z.string().min(1).max(512),
    referrer: z.string().max(1024).optional().default(''),
    screen: z.string().max(16).optional().default(''),
  })
  .strict();

const statsQuerySchema = z.object({
  site: z.string().min(1),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  groupBy: z
    .enum(['path', 'country', 'region', 'referrer', 'day', 'browser', 'device'])
    .optional(),
});

// Per-visitor drill-down: one calendar day (UTC) of raw rows for one site.
const visitorsQuerySchema = z.object({
  site: z.string().min(1),
  day: z.iso.date(),
});

// Dimensions the 90-day rollup table (pageview_daily) can answer. Everything
// else is raw-only and therefore limited to the retention window.
const ROLLED_UP_DIMS = new Set(['path', 'country', 'day']);

const allowedSites = () => env.PAGEVIEW_ALLOWED_SITES ?? env.ALLOWED_SITES;

/** Empty 204 — used for success AND every validation failure (no abuser feedback). */
const noContent = (c: Context) => c.body(null, 204);

// --- Origin allowlist -------------------------------------------------------

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Accept only when the Origin or Referer host is in PAGEVIEW_ALLOWED_ORIGINS. */
function originAllowed(c: Context): boolean {
  const allow = env.PAGEVIEW_ALLOWED_ORIGINS;
  const origin = hostOf(c.req.header('origin'));
  const referer = hostOf(c.req.header('referer'));
  return (!!origin && allow.includes(origin)) || (!!referer && allow.includes(referer));
}

// --- Visitor hash (no PII at rest) ----------------------------------------

let saltCache: { date: string; salt: string } | null = null;

/** sha256(SERVER_SECRET + UTC-date). Rotates daily so hashes can't be correlated across days. */
function dailySalt(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  if (saltCache?.date === date) return saltCache.salt;
  const salt = new Bun.CryptoHasher('sha256').update(env.SERVER_SECRET + date).digest('hex');
  saltCache = { date, salt };
  return salt;
}

function visitorHash(ip: string, ua: string): string {
  return new Bun.CryptoHasher('sha256').update(dailySalt() + ip + ua).digest('hex');
}

// --- Dedupe (same visitor + path within 10s) -----------------------------

const recentHits = new Map<string, number>();

function isDuplicate(key: string, now = Date.now()): boolean {
  const last = recentHits.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recentHits.set(key, now);
  if (recentHits.size > 20_000) {
    for (const [k, t] of recentHits) if (now - t > DEDUPE_WINDOW_MS) recentHits.delete(k);
  }
  return false;
}

// --- Server-derived fields ----------------------------------------------

function edgeGeo(c: Context): { country: string | null; region: string | null } {
  const raw =
    c.req.header('cf-ipcountry') ??
    c.req.header('x-vercel-ip-country') ??
    c.req.header('x-country-code') ??
    null;
  const rawRegion =
    c.req.header('x-vercel-ip-country-region') ?? c.req.header('cf-region-code') ?? null;
  const clean = (v: string | null) =>
    v && v !== 'XX' && /^[A-Za-z0-9-]{1,8}$/.test(v) ? v.toUpperCase() : null;
  return { country: clean(raw), region: clean(rawRegion) };
}

/** Query string / hash stripped; must be an absolute path with no whitespace. */
function normalizePath(input: string): string | null {
  const cut = input.search(/[?#]/);
  const path = cut === -1 ? input : input.slice(0, cut);
  if (!path.startsWith('/') || /\s/.test(path) || path.length > 512) return null;
  return path;
}

export const pageviewRoutes = new Hono();

pageviewRoutes.use(
  '/',
  cors({
    origin: (origin) => {
      const h = hostOf(origin);
      return h && env.PAGEVIEW_ALLOWED_ORIGINS.includes(h) ? origin : '';
    },
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

pageviewRoutes.post('/', async (c) => {
  const ip = clientIp(c);
  if (!pageviewLimiter.allow(ip)) return c.body(null, 429);

  if (!originAllowed(c)) return c.body(null, 403);

  const ua = c.req.header('user-agent') ?? '';
  if (isBot(ua)) {
    logger.info({ ip }, 'pageview dropped: bot');
    return noContent(c);
  }

  // Body size cap — check the header, then the actual text.
  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noContent(c);

  const rawBody = await c.req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return noContent(c);

  // Accept application/json and text/plain (navigator.sendBeacon sends text/plain).
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return noContent(c);
  }

  const parsed = pageviewSchema.safeParse(json);
  if (!parsed.success) return noContent(c);

  const { site, referrer } = parsed.data;
  if (!allowedSites().includes(site)) return noContent(c);

  const path = normalizePath(parsed.data.path);
  if (path === null) return noContent(c);

  const vHash = visitorHash(ip, ua);
  if (isDuplicate(`${vHash}|${path}`)) {
    logger.info({ site }, 'pageview dropped: duplicate');
    return noContent(c);
  }

  const { country, region } = edgeGeo(c);

  // Fire-and-forget: a storage failure must never surface to the site.
  db.insert(pageviews)
    .values({
      site,
      path,
      referrer: referrer.slice(0, 1024),
      country,
      region,
      uaFamily: uaFamily(ua),
      deviceType: deviceType(ua),
      visitorHash: vHash,
    })
    .catch((err) => logger.error(err, 'pageview insert failed'));

  return noContent(c);
});

// POST only — anything else on the collector path is a 405.
pageviewRoutes.all('/', (c) => c.body(null, 405));

// --- Read side --------------------------------------------------------------

interface GroupRow {
  key: string;
  views: number;
  uniques: number;
}

/**
 * Merge raw + rolled-up rows by key. Unique counts across the 90-day boundary
 * are additive and therefore approximate (a visitor seen on both sides is
 * counted twice) — acceptable for a traffic dashboard.
 */
function mergeGroups(a: GroupRow[], b: GroupRow[]): GroupRow[] {
  const out = new Map<string, GroupRow>();
  for (const r of [...a, ...b]) {
    const cur = out.get(r.key);
    if (cur) {
      cur.views += r.views;
      cur.uniques += r.uniques;
    } else {
      out.set(r.key, { key: r.key, views: r.views, uniques: r.uniques });
    }
  }
  return [...out.values()].sort((x, y) => y.views - x.views).slice(0, 500);
}

pageviewRoutes.get('/stats', requireAdmin, async (c) => {
  const ip = clientIp(c);
  if (!statsLimiter.allow(ip)) return c.json({ error: 'Too many requests' }, 429);

  const parsed = statsQuerySchema.safeParse({
    site: c.req.query('site'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    groupBy: c.req.query('groupBy'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ error: `${issue.path.join('.')}: ${issue.message}` }, 400);
  }

  const { site, groupBy } = parsed.data;
  if (!allowedSites().includes(site)) return c.json({ error: 'Unknown site' }, 400);

  const toDate = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999Z`) : new Date();
  const fromDate = parsed.data.from
    ? new Date(`${parsed.data.from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  // postgres-js's raw-query path won't serialize Date params — pass ISO strings, let PG cast.
  const fromTs = fromDate.toISOString();
  const toTs = toDate.toISOString();
  const fromDay = fromTs.slice(0, 10);
  const toDay = toTs.slice(0, 10);

  // Totals: raw rows in range + rolled-up aggregates in range.
  const rawTotals = (await db.execute(sql`
    SELECT count(*)::int AS views, count(distinct visitor_hash)::int AS uniques
    FROM pageviews
    WHERE site = ${site} AND created_at >= ${fromTs} AND created_at <= ${toTs}
  `)) as unknown as Array<{ views: number; uniques: number }>;
  const aggTotals = (await db.execute(sql`
    SELECT coalesce(sum(views), 0)::int AS views, coalesce(sum(uniques), 0)::int AS uniques
    FROM pageview_daily
    WHERE site = ${site} AND day >= ${fromDay} AND day <= ${toDay}
  `)) as unknown as Array<{ views: number; uniques: number }>;

  const totalViews = rawTotals[0].views + aggTotals[0].views;
  const uniqueVisitors = rawTotals[0].uniques + aggTotals[0].uniques;

  let breakdown: GroupRow[] | null = null;
  if (groupBy) {
    const rawKey =
      groupBy === 'country'
        ? sql`coalesce(country, '')`
        : groupBy === 'region'
          ? sql`coalesce(region, '')`
          : groupBy === 'day'
            ? sql`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
            : groupBy === 'referrer'
              ? sql`referrer`
              : groupBy === 'browser'
                ? sql`coalesce(ua_family, 'Other')`
                : groupBy === 'device'
                  ? sql`coalesce(device_type, 'desktop')`
                  : sql`path`;

    const rawGroups = (await db.execute(sql`
      SELECT ${rawKey} AS key,
             count(*)::int AS views,
             count(distinct visitor_hash)::int AS uniques
      FROM pageviews
      WHERE site = ${site} AND created_at >= ${fromTs} AND created_at <= ${toTs}
      GROUP BY 1
    `)) as unknown as GroupRow[];

    // The rollup table only carries day/site/path/country, so any other
    // breakdown (referrer, browser, device, region) is raw-only.
    let aggGroups: GroupRow[] = [];
    if (ROLLED_UP_DIMS.has(groupBy)) {
      const aggKey =
        groupBy === 'country'
          ? sql`country`
          : groupBy === 'day'
            ? sql`to_char(day, 'YYYY-MM-DD')`
            : sql`path`;
      aggGroups = (await db.execute(sql`
        SELECT ${aggKey} AS key, sum(views)::int AS views, sum(uniques)::int AS uniques
        FROM pageview_daily
        WHERE site = ${site} AND day >= ${fromDay} AND day <= ${toDay}
        GROUP BY 1
      `)) as unknown as GroupRow[];
    }

    breakdown = mergeGroups(rawGroups, aggGroups);
  }

  return c.json({
    site,
    from: fromTs,
    to: toTs,
    totalViews,
    uniqueVisitors,
    groupBy: groupBy ?? null,
    breakdown,
  });
});

// --- Per-visitor drill-down ----------------------------------------------
//
// A `visitorHash` is sha256(daily-secret + ip + ua) and the secret rotates
// every UTC day, so a hash identifies a visitor *within one day only* — never
// across days, and it carries no recoverable IP or User-Agent. These two
// endpoints expose that single-day view: the list of hashes seen on a day, and
// the page-by-page path sequence for one hash.

const isVisitorHash = (v: string) => /^[a-f0-9]{64}$/.test(v);

const dayBounds = (day: string) => ({
  fromTs: `${day}T00:00:00.000Z`,
  toTs: `${day}T23:59:59.999Z`,
});

/** True once the retention job may have rolled this day's raw rows into aggregates. */
const dayIsStale = (day: string) =>
  Date.now() - Date.parse(`${day}T00:00:00.000Z`) > RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface VisitorRow {
  hash: string;
  views: number;
  paths: number;
  country: string;
  region: string;
  device: string;
  browser: string;
  firstSeen: string;
  lastSeen: string;
}

pageviewRoutes.get('/stats/visitors', requireAdmin, async (c) => {
  const ip = clientIp(c);
  if (!statsLimiter.allow(ip)) return c.json({ error: 'Too many requests' }, 429);

  const parsed = visitorsQuerySchema.safeParse({
    site: c.req.query('site'),
    day: c.req.query('day'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ error: `${issue.path.join('.')}: ${issue.message}` }, 400);
  }

  const { site, day } = parsed.data;
  if (!allowedSites().includes(site)) return c.json({ error: 'Unknown site' }, 400);

  const { fromTs, toTs } = dayBounds(day);
  const visitors = (await db.execute(sql`
    SELECT visitor_hash AS hash,
           count(*)::int AS views,
           count(distinct path)::int AS paths,
           max(coalesce(country, '')) AS country,
           max(coalesce(region, '')) AS region,
           max(device_type) AS device,
           max(ua_family) AS browser,
           to_char(min(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "firstSeen",
           to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastSeen"
    FROM pageviews
    WHERE site = ${site} AND created_at >= ${fromTs} AND created_at <= ${toTs}
    GROUP BY visitor_hash
    ORDER BY count(*) DESC, min(created_at) ASC
    LIMIT 500
  `)) as unknown as VisitorRow[];

  return c.json({ site, day, stale: dayIsStale(day), visitors });
});

interface VisitorHit {
  path: string;
  referrer: string;
  country: string;
  region: string;
  device: string;
  browser: string;
  at: string;
}

pageviewRoutes.get('/stats/visitors/:hash', requireAdmin, async (c) => {
  const ip = clientIp(c);
  if (!statsLimiter.allow(ip)) return c.json({ error: 'Too many requests' }, 429);

  const hash = c.req.param('hash');
  if (!isVisitorHash(hash)) return c.json({ error: 'Not found' }, 404);

  const parsed = visitorsQuerySchema.safeParse({
    site: c.req.query('site'),
    day: c.req.query('day'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ error: `${issue.path.join('.')}: ${issue.message}` }, 400);
  }

  const { site, day } = parsed.data;
  if (!allowedSites().includes(site)) return c.json({ error: 'Unknown site' }, 400);

  const { fromTs, toTs } = dayBounds(day);
  const hits = (await db.execute(sql`
    SELECT path,
           referrer,
           coalesce(country, '') AS country,
           coalesce(region, '') AS region,
           device_type AS device,
           ua_family AS browser,
           to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "at"
    FROM pageviews
    WHERE site = ${site} AND visitor_hash = ${hash}
      AND created_at >= ${fromTs} AND created_at <= ${toTs}
    ORDER BY created_at ASC
    LIMIT 1000
  `)) as unknown as VisitorHit[];

  if (hits.length === 0) return c.json({ error: 'Not found' }, 404);

  return c.json({ site, day, hash, hits });
});
