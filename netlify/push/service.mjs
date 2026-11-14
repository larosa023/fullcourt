// The phone-alert service, shared by the two Netlify functions: netlify/functions/push-api.mjs (the page subscribes,
// changes its team, asks for a test) and netlify/functions/push-check.mjs (runs every minute and sends the alerts).
// Everything is kept in a Netlify Blobs store named "push":
//   vapid        the site's signing key, made on first use; it never leaves Netlify
//   sub/<hash>   one per phone or browser: its push address, the teams it follows, whether it wants every close finish,
//                its players and its open tracked bets (netlify/push/extras.mjs)
//   state        what each of today's games looked like a minute ago, and when the checker may next sleep until
//   log          the last few alerts sent (titles only), for the status page
import { createHash } from 'node:crypto';
import { newVapidKeys, sendPush } from './webpush.mjs';
import { LEAGUES, scoreboardUrl, dayET, slim, step, messageFor, idleFor } from './alerts.mjs';
import { cleanPlayers, cleanBets, playerAlerts, betAlerts, gamesToRead, injuryAlerts, injuryLeagues, injuryMap } from './extras.mjs';

export const SUBJECT = 'https://nbafullcourty.netlify.app'; // who's sending, as push services ask
const MAX_SUBS = 500;
// the push services phones and browsers use; nothing else is ever contacted
const PUSH_HOSTS = /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)$/;
export const subKey = endpoint => `sub/${createHash('sha256').update(endpoint).digest('hex').slice(0, 24)}`;

export async function vapid(store) {
  let k = await store.get('vapid', { type: 'json' });
  if (!k?.publicKey) { await store.setJSON('vapid', newVapidKeys()); k = await store.get('vapid', { type: 'json' }); } // read back: if two requests raced, both use the one that stuck
  return k;
}

// a subscription as the page sends it -> a clean record, or an error message
export function cleanSub(body) {
  const s = body?.subscription || {}, endpoint = String(s.endpoint || '');
  let host = ''; try { const u = new URL(endpoint); if (u.protocol === 'https:') host = u.hostname; } catch (e) {}
  if (!PUSH_HOSTS.test(host)) return { error: 'That isn\'t a push address from a phone or browser.' };
  const p256dh = String(s.keys?.p256dh || ''), auth = String(s.keys?.auth || '');
  if (!/^[A-Za-z0-9_-]{80,100}=*$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}=*$/.test(auth)) return { error: 'The subscription keys are missing.' };
  const teams = {};
  for (const lg of LEAGUES) { const t = body?.teams?.[lg]; if (t != null && /^\d{1,6}$/.test(String(t))) teams[lg] = String(t); }
  return { sub: { endpoint, keys: { p256dh, auth }, teams, any: !!body?.any, players: cleanPlayers(body?.players), bets: cleanBets(body?.bets), want: { players: body?.want?.players !== false, bets: body?.want?.bets !== false } } };
}

export async function saveSub(store, rec) {
  const key = subKey(rec.endpoint), old = await store.get(key, { type: 'json' });
  if (!old && (await store.list({ prefix: 'sub/' })).blobs.length >= MAX_SUBS) return false;
  await store.setJSON(key, { ...old, ...rec, created: old?.created || new Date().toISOString(), updated: new Date().toISOString() });
  // wake the checker so a new team counts from the next minute rather than after its nap
  const st = await store.get('state', { type: 'json' }); if (st?.idleUntil) await store.setJSON('state', { ...st, idleUntil: 0 });
  return true;
}

async function remember(store, entries) {
  if (!entries.length) return;
  const log = (await store.get('log', { type: 'json' })) || [];
  await store.setJSON('log', [...entries, ...log].slice(0, 30));
}

// one pass of the checker. fetchImpl and now are replaceable for tests
export async function check(store, { fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  const state = (await store.get('state', { type: 'json' })) || { games: {} };
  if (!force && state.idleUntil && now < state.idleUntil) return { slept: true };
  const keys = (await store.list({ prefix: 'sub/' })).blobs.map(b => b.key);
  const out = { subs: keys.length, games: 0, sent: 0, gone: 0, failed: 0 };
  if (!keys.length) { await store.setJSON('state', { ...state, lastRun: now, idleUntil: now + 10 * 60e3, note: 'nobody subscribed' }); return out; }
  const subs = (await Promise.all(keys.map(k => store.get(k, { type: 'json' }).then(s => s && { ...s, key: k })))).filter(Boolean);
  const want = new Set(subs.flatMap(s => [...(s.any ? LEAGUES : Object.keys(s.teams || {})), ...(s.players || []).map(p => p.lg), ...(s.bets || []).map(b => b.lg)]));
  const ymd = dayET(now), games = [], failed = new Set();
  for (const lg of LEAGUES.filter(l => want.has(l))) {
    try {
      const r = await fetchImpl(scoreboardUrl(lg, ymd), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`scoreboard ${r.status}`);
      games.push(...((await r.json()).events || []).map(e => slim(lg, e)));
    } catch (e) { out.error = `${lg}: ${e.message}`; failed.add(lg); }
  }
  // compare with a minute ago; only today's games are kept, plus the records of a league whose feed didn't answer
  // (so nothing is announced twice when it comes back)
  const recs = Object.fromEntries(Object.entries(state.games || {}).filter(([, r]) => failed.has(r.lg))), due = [];
  for (const g of games) { const { rec, due: d } = step(g, state.games?.[g.id]); recs[g.id] = rec; for (const key of d) due.push([g, key]); }
  out.games = games.length;
  const sends = [], log = [];
  for (const [g, key] of due) for (const s of subs) { const m = messageFor(s, g, key); if (m) sends.push([s, m]); }
  // players and tracked bets: read the box scores they need (live games, and any that ended this minute)
  const prevGames = state.games || {}, finals = new Set(games.filter(g => g.state === 'post' && prevGames[g.id] && prevGames[g.id].s !== 'post').map(g => g.id));
  const quiet = new Set(games.filter(g => !prevGames[g.id]).map(g => g.id)), read = gamesToRead(subs, games, finals), sums = {};
  const per = state.day === ymd ? state.per || {} : {}; // what each subscriber has already been told today
  // injury news for players on tracked bets: the league report, at most every 3 minutes, while such a game is ahead or on
  const injAt = { ...(state.day === ymd ? state.injAt || {} : {}) }, inj = {};
  for (const lg of injuryLeagues(subs, games)) {
    if (now - (injAt[lg] || 0) < 3 * 60e3) continue;
    try { const r = await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/injuries`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); if (r.ok) { inj[lg] = injuryMap(await r.json()); injAt[lg] = now; } } catch (e) {}
  }
  if (Object.keys(inj).length) out.injuries = Object.keys(inj).join(',');
  if (read.size || Object.keys(inj).length) {
    const list = [...read];
    for (let k = 0; k < list.length; k += 6) await Promise.all(list.slice(k, k + 6).map(async gid => {
      const g = games.find(x => x.id === gid);
      try { const r = await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/basketball/${g.lg}/summary?event=${gid}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); if (r.ok) sums[gid] = await r.json(); } catch (e) {}
    }));
    out.boxes = Object.keys(sums).length;
    for (const s of subs) {
      const me = s.key.slice(4, 16), mine = per[me] || { seen: [], last: {} }, seen = new Set(mine.seen);
      const msgs = [...(s.want?.players !== false ? playerAlerts(s, games, sums, seen, quiet, finals) : []), ...(s.want?.bets !== false ? [...betAlerts(s, sums, seen, mine.last, quiet), ...injuryAlerts(s, games, inj, seen, now)] : [])];
      for (const m of msgs) sends.push([s, m]);
      per[me] = { seen: [...seen].slice(-400), last: mine.last };
    }
  }
  const vk = sends.length ? await vapid(store) : null;
  for (let k = 0; k < sends.length; k += 20) {
    await Promise.all(sends.slice(k, k + 20).map(async ([s, m]) => {
      const { ttl, ...msg } = m, res = await sendPush(s, msg, { keys: vk, subject: SUBJECT, ttl: ttl || 600, fetchImpl });
      out[res === 'sent' ? 'sent' : res === 'gone' ? 'gone' : 'failed']++;
      if (res === 'gone') await store.delete(s.key);
      if (res === 'sent') log.push({ at: new Date(now).toISOString(), title: m.title, body: m.body.split('\n')[0] });
    }));
  }
  // when nothing has been read (feed down), keep the old records so nothing is announced twice
  await store.setJSON('state', { games: recs, day: ymd, per, lastRun: now, idleUntil: failed.size ? now : now + Math.min(idleFor(games, now), injuryLeagues(subs, games).size ? 3 * 60e3 : Infinity), injAt, last: out });
  await remember(store, log);
  return out;
}

export async function sendTest(store, endpoint, now = Date.now(), fetchImpl = fetch) {
  const key = subKey(endpoint), s = await store.get(key, { type: 'json' });
  if (!s) return { ok: false, error: 'This phone isn\'t signed up for alerts.' };
  if (s.lastTest && now - Date.parse(s.lastTest) < 20e3) return { ok: false, error: 'Give it a few seconds before sending another.' };
  await store.setJSON(key, { ...s, lastTest: new Date(now).toISOString() });
  const res = await sendPush(s, { title: 'Alerts are on', body: 'This is how a Fullcourt alert looks. You\'ll get them even when the app is closed.', tag: 'fc-test' }, { keys: await vapid(store), subject: SUBJECT, ttl: 120, fetchImpl });
  if (res === 'gone') await store.delete(key);
  return res === 'sent' ? { ok: true } : { ok: false, error: res === 'gone' ? 'This phone\'s alert sign-up has expired. Turn alerts off and on again.' : 'The push service didn\'t take it. Try again in a minute.' };
}

export async function status(store, now = Date.now()) {
  const st = (await store.get('state', { type: 'json' })) || {}, subs = (await store.list({ prefix: 'sub/' })).blobs.length, log = (await store.get('log', { type: 'json' })) || [];
  const ago = st.lastRun ? Math.round((now - st.lastRun) / 1000) : null;
  return { ok: true, subscribers: subs, lastCheck: st.lastRun ? new Date(st.lastRun).toISOString() : null, secondsAgo: ago, sleepingUntil: st.idleUntil && st.idleUntil > now ? new Date(st.idleUntil).toISOString() : null, last: st.last || null, recent: log.slice(0, 10) };
}
