import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { logger } from '../core/logger';
import { sendSecurityAlert } from './mailer';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_ALERT_THRESHOLD = 20;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

interface ActiveCode {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
}

// One admin, so a single active code — issuing again replaces the previous one.
let active: ActiveCode | null = null;

/** Generate a fresh 6-digit code, store its hash, and return the plaintext. */
export function issueCode(): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  active = { hash: sha256(code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 };
  return code;
}

/** True once, for the correct unexpired code. Burns the code on success, expiry, or too many tries. */
export function verifyCode(input: string): boolean {
  if (!active) return false;
  if (Date.now() > active.expiresAt) {
    active = null;
    return false;
  }
  active.attempts += 1;
  if (active.attempts > MAX_ATTEMPTS) {
    active = null;
    return false;
  }
  const ok = timingSafeEqual(sha256(input), active.hash);
  if (ok) active = null;
  return ok;
}

let failCount = 0;
let windowStart = 0;
let lastAlertAt = 0;

/** Record a failed login; email an alert once per cooldown when failures pile up. */
export function noteFailure(ip: string): void {
  const now = Date.now();
  if (now - windowStart > FAIL_WINDOW_MS) {
    windowStart = now;
    failCount = 0;
  }
  failCount += 1;
  if (failCount >= FAIL_ALERT_THRESHOLD && now - lastAlertAt > ALERT_COOLDOWN_MS) {
    lastAlertAt = now;
    sendSecurityAlert({
      count: failCount,
      windowMin: Math.round(FAIL_WINDOW_MS / 60_000),
      lastIp: ip,
    }).catch((err) => logger.error(err, 'security alert mail failed'));
  }
}
