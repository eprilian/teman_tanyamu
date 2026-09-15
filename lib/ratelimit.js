// sliding-window rate limiter (in-memory, per key). makeLimiter({windowMs,max}) -> { allow(key) }
function makeLimiter(opts = {}) {
  let windowMs = opts.windowMs || 60000;
  let max = opts.max || 30;
  const hits = new Map();
  function allow(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) { // periodic gc to keep memory flat
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs * 2) hits.delete(k);
    }
    return true;
  }
  return {
    allow,
    get windowMs() { return windowMs; },
    get max() { return max; },
    setLimits(next) { if (next.windowMs) windowMs = next.windowMs; if (next.max) max = next.max; }
  };
}
module.exports = { makeLimiter };
