import pino from 'pino';
import { env } from './env';

// pino-pretty as a sync stream (instead of a transport worker) — plays nicer with Bun
const stream =
  env.NODE_ENV === 'production'
    ? undefined
    : (await import('pino-pretty')).default({ colorize: true, translateTime: 'HH:MM:ss' });

export const logger = stream
  ? pino({ level: env.LOG_LEVEL }, stream)
  : pino({ level: env.LOG_LEVEL });
