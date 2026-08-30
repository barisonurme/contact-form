/**
 * Tiny User-Agent classifier. We never store the raw UA string — only the
 * coarse family and device type derived here.
 */

const BOT_RE = /bot|crawl|spider|slurp|headless|preview/i;

/** True for empty UAs and anything that looks automated. */
export function isBot(ua: string): boolean {
  return ua.trim() === '' || BOT_RE.test(ua);
}

/** Coarse browser family — enough for analytics, not fingerprinting. */
export function uaFamily(ua: string): string {
  if (/Edg(A|iOS|)?\//.test(ua)) return 'Edge';
  if (/OPR\/|\bOpera\b/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Version\/.*Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function deviceType(ua: string): DeviceType {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*\bMobile\b)/.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*\bMobile\b|Windows Phone|IEMobile/.test(ua)) return 'mobile';
  return 'desktop';
}
