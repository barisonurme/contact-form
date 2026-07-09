import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../core/env';
import { logger } from '../core/logger';

const client = postgres(env.DATABASE_URL, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  logger.info('migrations applied');
} catch (err) {
  logger.error(err, 'migration failed');
  process.exit(1);
} finally {
  await client.end();
}
