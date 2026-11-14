/* Fullcourt service worker: keeps the app opening without signal and shows the last scores you loaded.
   The page itself is always fetched fresh when there's a connection, so updates show up right away. */
const SHELL = 'fc-shell-v2';
const DATA = 'fc-data-v1';
const ASSETS = 'fc-assets-v1';
// caches named fc-keep-* belong to the page (player game logs kept between visits) and are left alone here
const BASE = new URL(self.registration.scope).pathname; // '/' on Netlify and Cloudflare, '/fullcourt/' on GitHub Pages
const SHELL_FILES = ['./', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, DATA, ASSETS].includes(k) && !k.startsWith('fc-keep-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// scores and standings: network first, fall back to the last saved copy
const SAVE = /site\.api\.espn\.com\/apis\/(site\/v2|v2)\/sports\/basketball\/(nba|wnba|womens-college-basketball|mens-college-basketball)\/(scoreboard|standings|rankings)/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    const isShell = url.pathname === new URL(self.registration.scope).pathname;
    const saved = () => caches.match('./', { cacheName: SHELL });
    const net = fetch(req).then(r => {
      if (r.ok && isShell) { const copy = r.clone(); caches.open(SHELL).then(c => c.put('./', copy)); }
      return r;
    });
    // On a weak signal the page can take many seconds to arrive. After 2.5 seconds, open the saved copy instead
    // (the download carries on and is saved for next time). No saved copy, or a different page: wait for the network.
    const slow = isShell ? new Promise(res => setTimeout(res, 2500)).then(saved) : null;
    e.respondWith((slow ? Promise.race([net.catch(() => null), slow]).then(r => r || net) : net).catch(() => saved().then(r => r || Response.error())));
    return;
  }
  // site code and styles: names change with every update, so a saved copy is always right
  if (url.origin === self.location.origin && (url.pathname.startsWith(BASE + 'assets/') || url.pathname.startsWith(BASE + 'fonts/'))) {
    e.respondWith(caches.open(ASSETS).then(async c => {
      const hit = await c.match(req.url); if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { c.put(req.url, r.clone()); trimAssets(c); }
      return r;
    }));
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

// room for every module's script and style plus the fonts (about 140 files), with headroom for the previous update's
async function trimAssets(c) {
  try { const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 220))) await c.delete(k); } catch (e) {}
}
let trimming = false;
async function trimData() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(DATA); const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) await c.delete(k); } catch (e) {}
  trimming = false;
}

// an alert from the alert service (netlify/functions/push-check.mjs), arriving with Fullcourt closed.
// Every one has to be shown: phones stop delivering to sites that receive pushes without showing them.
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Fullcourt', { body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { game: m.game || null, lg: m.lg || null } }).then(setBadge));
});
// the home-screen icon shows how many alerts are waiting (iPhone home-screen app, Android, desktop installs);
// opening Fullcourt clears it
function setBadge() {
  const nav = self.navigator;
  if (!nav?.setAppBadge || !self.registration.getNotifications) return Promise.resolve();
  return self.registration.getNotifications().then(list => list.length ? nav.setAppBadge(list.length) : nav.clearAppBadge()).catch(() => {});
}
self.addEventListener('notificationclose', e => e.waitUntil(setBadge()));

// tapping a game alert opens (or focuses) Fullcourt on that game
self.addEventListener('notificationclick', e => {
  e.notification.close(); setBadge();
  const game = e.notification.data?.game, lg = e.notification.data?.lg;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { if (game) c.postMessage({ game, lg }); return c.focus(); }
    return self.clients.openWindow(game ? `./?${lg ? `league=${lg}&` : ''}game=${encodeURIComponent(game)}` : './');
  }));
});
