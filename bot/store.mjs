// A place to leave a reply's numbers for the picture request that follows a second later, so it doesn't have to read
// and parse the feeds again. It uses Cloudflare's cache, which is per data centre: when the two requests land in
// different ones the picture simply loads the numbers itself. Entries expire on their own.
const key = (origin, k) => `${origin}/__bot-model/${encodeURIComponent(k)}`;
export const cacheStore = (cache, origin, waitUntil) => ({
  async get(k) { const r = await cache.match(key(origin, k)); return r ? r.json() : null; },
  put(k, m, seconds) { try { waitUntil(cache.put(key(origin, k), new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.max(10, seconds)}` } })).catch(() => {})); } catch (e) {} },
});
