// cache.js — shared sessionStorage caching utilities

// Default expiry: 30 seconds
const DEFAULT_TTL = 30000;

export function cacheGet(key, ttl = DEFAULT_TTL) {
  try {
    const raw = sessionStorage.getItem(key);
    const time = sessionStorage.getItem(key + "_time");

    if (!raw || !time) return null;

    const age = Date.now() - Number(time);
    if (age > ttl) {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(key + "_time");
      return null;
    }

    return JSON.parse(raw);
  } catch (err) {
    console.error("cacheGet error:", err);
    return null;
  }
}

export function cacheSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem(key + "_time", Date.now());
  } catch (err) {
    console.error("cacheSet error:", err);
  }
}

export function cacheRemove(key) {
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(key + "_time");
}

export function cachePBKey(pbId, suffix) {
  return `pb_${pbId}_${suffix}`;
}