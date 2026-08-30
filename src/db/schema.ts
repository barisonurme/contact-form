import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  site: text('site').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  ip: text('ip'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Raw pageview hits. Kept 90 days, then rolled into `pageviewDaily` by the
 * retention job (see src/services/pageview-retention.ts). No PII at rest:
 * no raw IP, no raw User-Agent — only a daily-rotating `visitorHash`.
 */
export const pageviews = pgTable(
  'pageviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    site: text('site').notNull(),
    path: text('path').notNull(),
    referrer: text('referrer').notNull().default(''),
    country: text('country'),
    region: text('region'),
    uaFamily: text('ua_family').notNull().default('Other'),
    deviceType: text('device_type').notNull().default('desktop'),
    visitorHash: text('visitor_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pageviews_site_created_idx').on(t.site, t.createdAt),
    index('pageviews_created_idx').on(t.createdAt),
  ],
);

/** Daily rollup of pageviews older than the retention window. */
export const pageviewDaily = pgTable(
  'pageview_daily',
  {
    day: date('day').notNull(),
    site: text('site').notNull(),
    path: text('path').notNull(),
    country: text('country').notNull().default(''),
    views: integer('views').notNull().default(0),
    uniques: integer('uniques').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.site, t.path, t.country] })],
);

export type Message = typeof messages.$inferSelect;
export type Pageview = typeof pageviews.$inferSelect;
