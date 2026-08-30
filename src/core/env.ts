import { z } from 'zod';

const csv = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  MAIL_TO: z.string().min(1),

  ALLOWED_SITES: z.string().transform(csv).pipe(z.array(z.string()).min(1)),
  ALLOWED_ORIGINS: z.string().transform(csv).pipe(z.array(z.string()).min(1)),

  // Pageview analytics (POST /api/pageview, GET /api/pageview/stats).
  // Hosts allowed to send pageviews — host only, no scheme (Origin/Referer host is matched against this).
  PAGEVIEW_ALLOWED_ORIGINS: z
    .string()
    .transform(csv)
    .pipe(z.array(z.string()).min(1))
    .default(['barisonurme.com', 'www.barisonurme.com', 'localhost', '127.0.0.1']),
  // Site ids accepted for pageviews. Falls back to ALLOWED_SITES when unset.
  PAGEVIEW_ALLOWED_SITES: z.string().transform(csv).pipe(z.array(z.string()).min(1)).optional(),
  // Secret used to derive the daily visitor-hash salt. Rotate = invalidate all visitor hashes.
  SERVER_SECRET: z.string().min(16, 'SERVER_SECRET must be at least 16 characters'),

  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(
      /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
      'ADMIN_PASSWORD_HASH must be a complete bcrypt hash ($2b$12$ + 53 chars). ' +
        'If it looks truncated, docker compose likely ate parts of it — in the env file, ' +
        'escape every $ as $$',
    ),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
