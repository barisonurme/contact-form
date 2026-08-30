CREATE TABLE "pageview_daily" (
	"day" date NOT NULL,
	"site" text NOT NULL,
	"path" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"uniques" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pageview_daily_day_site_path_country_pk" PRIMARY KEY("day","site","path","country")
);
--> statement-breakpoint
CREATE TABLE "pageviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"country" text,
	"region" text,
	"ua_family" text DEFAULT 'Other' NOT NULL,
	"device_type" text DEFAULT 'desktop' NOT NULL,
	"visitor_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pageviews_site_created_idx" ON "pageviews" USING btree ("site","created_at");--> statement-breakpoint
CREATE INDEX "pageviews_created_idx" ON "pageviews" USING btree ("created_at");