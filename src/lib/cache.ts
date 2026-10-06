import type { Settings } from './types';

/* ---------------- on-device cache: instant start on refresh ---------------- */

const CACHE_PREFIX = 'bb-cache-';
export interface CacheShape {
  v: 1;
  data: Partial<Record<string, unknown>> & { settings?: Partial<Settings> };
}

export function readCache(uid: string): CacheShape['data'] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + uid);
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheShape;
    return c.v === 1 ? c.data : null;
  } catch {
    return null;
  }
}

export function writeCache(uid: string, data: CacheShape['data']) {
  try {
    localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify({ v: 1, data } satisfies CacheShape));
  } catch {
    // quota exceeded or storage blocked — the app still works from the live database
  }
}

export function clearDataCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked */
  }
}
