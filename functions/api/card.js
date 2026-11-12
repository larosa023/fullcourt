// Cloudflare Pages Function: the picture in each of the Discord bot's replies (https://<the Cloudflare site>/api/card?v=…).
// `v` is the view the reply showed (bot/bot.mjs); the picture is drawn from the same numbers and returned as a PNG.
// `h` is only a fingerprint of those numbers: it makes the address change when they do, so nothing shows a stale image.
import fontBin from '../../bot/font.bin';
import { loadFonts } from '../../bot/draw.mjs';
import { card, hasCard } from '../../bot/cards.mjs';
import { model, hasModel } from '../../bot/espn.mjs';
import { decodeView } from '../../bot/bot.mjs';
import { cacheStore } from '../../bot/store.mjs';

// x-card says how the picture was produced (drawn now, or kept from before) and where its numbers came from
const png = (body, how, seconds) => new Response(body, { headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${seconds}`, 'x-card': how } });
const RECENT = new Map(); // the last few pictures this running copy drew

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url), view = decodeView(url.searchParams.get('v')), pinned = url.searchParams.has('h'), keep = pinned ? 86400 : 30;
  if (!hasModel(view.k)) return new Response('no such card', { status: 404 });
  const cache = caches.default, id = url.pathname + url.search;
  if (pinned) {
    const mem = RECENT.get(id); if (mem) return png(mem, 'memory', keep);
    const hit = await cache.match(request).catch(() => null); if (hit) return hit;
  }
  try {
    const seen = {}, m = await model(view, cacheStore(cache, url.origin, waitUntil), seen);
    if (String(view.side || '').startsWith('team:')) view.side = m.h?.id === view.side.slice(5) ? 'h' : 'a';
    if (!hasCard(view, m)) return new Response('nothing to draw', { status: 404 });
    loadFonts(fontBin);
    const bytes = card(view, m).png();
    if (pinned) { RECENT.set(id, bytes); if (RECENT.size > 12) RECENT.delete(RECENT.keys().next().value); waitUntil(cache.put(request, png(bytes, 'cache', keep)).catch(() => {})); }
    return png(bytes, `drawn, numbers from ${seen.from}`, keep);
  } catch (e) {
    console.log('card failed:', view.k, e?.message);
    return new Response('the stats feed didn\'t answer', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
