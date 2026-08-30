import { sql } from 'drizzle-orm';
import { logger } from '../core/logger';
import { db } from '../db';

const RETENTION_DAYS = 90;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Roll raw pageview rows older than the retention window into `pageview_daily`
 * (per day/site/path/country view + unique counts), then delete them. Runs in a
 * transaction so a row is never counted twice: it is aggregated and removed
 * atomically. Late-arriving rows for an already-rolled day are folded in on the
 * next run via ON CONFLICT.
 */
export async function rollUpOldPageviews(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO pageview_daily (day, site, path, country, views, uniques)
      SELECT date_trunc('day', created_at)::date AS day,
             site,
             path,
             coalesce(country, '') AS country,
             count(*)::int AS views,
             count(distinct visitor_hash)::int AS uniques
      FROM pageviews
      WHERE created_at < now() - make_interval(days => ${RETENTION_DAYS})
      GROUP BY 1, site, path, coalesce(country, '')
      ON CONFLICT (day, site, path, country) DO UPDATE
        SET views = pageview_daily.views + excluded.views,
            uniques = pageview_daily.uniques + excluded.uniques
    `);
    await tx.execute(sql`
      DELETE FROM pageviews WHERE created_at < now() - make_interval(days => ${RETENTION_DAYS})
    `);
  });
}

/** Fire the roll-up now, then once a day. Failures are logged, never thrown. */
export function startPageviewRetention(): void {
  const run = () => {
    rollUpOldPageviews()
      .then(() => logger.info('pageview retention roll-up complete'))
      .catch((err) => logger.error(err, 'pageview retention roll-up failed'));
  };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}
