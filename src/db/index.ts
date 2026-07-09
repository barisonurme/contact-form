import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../core/env';
import * as schema from './schema';

// postgres.js connects lazily — no connection is opened until the first query
const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });
