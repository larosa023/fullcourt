/* Fullcourt service worker: keeps the app opening without signal and shows the last scores you loaded.
   The page itself is always fetched fresh when there's a connection, so updates show up right away. */
const SHELL = 'fc-shell-v1';
const DATA = 'fc-data-v1';
const SHELL_FILES = ['./', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// scores and standings: network first, fall back to the last saved copy
const SAVE = /site\.api\.espn\.com\/apis\/(site\/v2|v2)\/sports\/basketball\/(nba|wnba)\/(scoreboard|standings)/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok && url.pathname === new URL(self.registration.scope).pathname) { const copy = r.clone(); caches.open(SHELL).then(c => c.put('./', copy)); }
      return r;
    }).catch(() => caches.match('./', { cacheName: SHELL }).then(r => r || Response.error())));
    return;
  }
  if (SAVE.test(req.url)) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(DATA).then(c => c.put(req.url, copy)).then(trimData); }
      return r;
    }).catch(() => caches.open(DATA).then(c => c.match(req.url)).then(async r => {
      if (!r) return Response.error();
      return new Response(await r.blob(), { status: 200, headers: { 'content-type': 'application/json', 'x-fc-cached': '1', 'access-control-expose-headers': 'x-fc-cached' } });
    })));
  }
});

let trimming = false;
async function trimData() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(DATA); const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) await c.delete(k); } catch (e) {}
  trimming = false;
}

// tapping a game alert opens (or focuses) Fullcourt on that game
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const game = e.notification.data?.game, lg = e.notification.data?.lg;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.postMessage({ game, lg }); return c.focus(); }
    return self.clients.openWindow(`./?game=${encodeURIComponent(game || '')}`);
  }));
});
