// Phone alerts, the page's side (see netlify/push/service.mjs):
//   GET  /api/push/key          the site's public signing key, which a phone subscribes with
//   GET  /api/push/status       is the checker running, how many are signed up, the last alerts sent
//   POST /api/push/subscribe    { subscription, teams: { nba: '18' }, any: false }  sign up, or change the team
//   POST /api/push/unsubscribe  { endpoint }
//   POST /api/push/test         { endpoint }  send this phone a test alert
// Any of the site's copies (Netlify, Cloudflare, GitHub Pages) can call these, so the answers allow other origins.
import { getStore } from '@netlify/blobs';
import { vapid, cleanSub, saveSub, subKey, sendTest, status } from '../push/service.mjs';

export const config = { path: '/api/push/*' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const json = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...CORS } });

export default async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
  const store = getStore({ name: 'push', consistency: 'strong' }), what = new URL(req.url).pathname.split('/').pop();
  try {
    if (req.method === 'GET' && what === 'key') return json({ ok: true, key: (await vapid(store)).publicKey }, 200, 'public, max-age=3600');
    if (req.method === 'GET' && what === 'status') return json(await status(store));
    if (req.method !== 'POST') return json({ ok: false, error: 'Not found' }, 404);
    const body = await req.json().catch(() => null);
    if (what === 'subscribe') {
      const { sub, error } = cleanSub(body); if (error) return json({ ok: false, error }, 400);
      return (await saveSub(store, sub)) ? json({ ok: true }) : json({ ok: false, error: 'Alerts are full right now.' }, 503);
    }
    const endpoint = String(body?.endpoint || '');
    if (!endpoint) return json({ ok: false, error: 'Which phone?' }, 400);
    if (what === 'unsubscribe') { await store.delete(subKey(endpoint)); return json({ ok: true }); }
    if (what === 'test') { const r = await sendTest(store, endpoint); return json(r, r.ok ? 200 : 400); }
    return json({ ok: false, error: 'Not found' }, 404);
  } catch (e) {
    console.log('push api failed', what, e?.message);
    return json({ ok: false, error: 'Alerts are unavailable right now.' }, 500);
  }
};
