// One-off: what the odds feed returns per sportsbook for player props, to see which books come with bet-slip links.
// Reads two games (two objects of the monthly allowance). Prints and saves field names and link samples only.
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.SGO_KEY; if (!KEY) { console.error('SGO_KEY missing'); process.exit(1); }
const now = new Date(), until = new Date(now.getTime() + 40 * 3600e3);
const u = new URL('https://api.sportsgameodds.com/v2/events');
Object.entries({ leagueID: 'NBA', started: 'false', oddsAvailable: 'true', startsAfter: now.toISOString(), startsBefore: until.toISOString(), limit: '2' }).forEach(([k, v]) => u.searchParams.set(k, v));
const r = await fetch(u, { headers: { 'X-Api-Key': KEY } }), j = await r.json();
if (!r.ok || !j.success) { console.error('feed error', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
const out = { status: r.status, events: [] };
for (const e of j.data || []) {
  const ev = { id: e.eventID, teams: `${e.teams?.away?.names?.short} @ ${e.teams?.home?.names?.short}`, starts: e.status?.startsAt, topKeys: Object.keys(e), links: e.links || null, books: {}, sample: null };
  for (const [key, o] of Object.entries(e.odds || {})) {
    ev.kinds = ev.kinds || {}; const kind = `${o.playerID ? 'player' : 'game'}:${o.betTypeID}:${o.periodID}`; ev.kinds[kind] = (ev.kinds[kind] || 0) + 1;
    if (o.periodID !== 'game') continue;
    if (!ev.sample && Object.keys(o.byBookmaker || {}).length > 3) ev.sample = { key, odd: { ...o, byBookmaker: Object.fromEntries(Object.entries(o.byBookmaker || {}).slice(0, 3)) } };
    for (const [b, x] of Object.entries(o.byBookmaker || {})) {
      const B = (ev.books[b] ||= { n: 0, withLink: 0, keys: new Set(), samples: [] });
      B.n++; Object.keys(x).forEach(k => B.keys.add(k));
      const link = x.deeplink || x.deepLink || x.link || x.url;
      if (link) { B.withLink++; if (B.samples.length < 6) B.samples.push({ bet: o.betTypeID, player: e.players?.[o.playerID]?.name || o.playerID, stat: o.statID, side: o.sideID, line: x.overUnder, odds: x.odds, link }); }
    }
  }
  for (const B of Object.values(ev.books)) B.keys = [...B.keys];
  out.events.push(ev);
}
mkdirSync('probe', { recursive: true });
writeFileSync('probe/sgo.json', JSON.stringify(out, null, 1));
writeFileSync('probe/_status.txt', `sgo ${r.status} events ${out.events.length}`);
for (const ev of out.events) console.log(ev.teams, Object.entries(ev.books).map(([b, B]) => `${b}:${B.withLink}/${B.n}`).join(' '));
