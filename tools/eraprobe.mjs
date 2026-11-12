// One-off: the raw bet-slip links the odds feed carries for player props, over and under side by side, per sportsbook.
// Reads up to six games. Prints and saves link samples only.
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.SGO_KEY; if (!KEY) { console.error('SGO_KEY missing'); process.exit(1); }
const now = new Date(), until = new Date(now.getTime() + 40 * 3600e3);
const u = new URL('https://api.sportsgameodds.com/v2/events');
Object.entries({ leagueID: 'NBA', started: 'false', oddsAvailable: 'true', startsAfter: now.toISOString(), startsBefore: until.toISOString(), limit: '6' }).forEach(([k, v]) => u.searchParams.set(k, v));
const r = await fetch(u, { headers: { 'X-Api-Key': KEY } }), j = await r.json();
if (!r.ok || !j.success) { console.error('feed error', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
const out = { status: r.status, events: [] };
for (const e of j.data || []) {
  const ev = { teams: `${e.teams?.away?.names?.short} @ ${e.teams?.home?.names?.short}`, starts: e.status?.startsAt, books: {} };
  for (const o of Object.values(e.odds || {})) {
    if (o.periodID !== 'game' || o.betTypeID !== 'ou' || o.sideID !== 'over' || !o.playerID) continue;
    const under = e.odds[o.opposingOddID] || {};
    for (const [b, x] of Object.entries(o.byBookmaker || {})) {
      const B = (ev.books[b] ||= { n: 0, withLink: 0, same: 0, samples: [] }), y = under.byBookmaker?.[b] || {};
      B.n++; if (!x.deeplink) continue;
      B.withLink++; if (x.deeplink === y.deeplink) B.same++;
      if (B.samples.length < 5) B.samples.push({ player: e.players?.[o.playerID]?.name || o.playerID, stat: o.statID, line: x.overUnder, overOdds: x.odds, underOdds: y.odds, over: x.deeplink, under: y.deeplink || null, keys: Object.keys(x) });
    }
  }
  if (Object.keys(ev.books).length) out.events.push(ev);
}
mkdirSync('probe', { recursive: true });
writeFileSync('probe/sgo.json', JSON.stringify(out, null, 1));
writeFileSync('probe/_status.txt', `sgo ${r.status} events ${out.events.length}`);
for (const ev of out.events) console.log(ev.teams, Object.entries(ev.books).map(([b, B]) => `${b}:${B.withLink}/${B.n} same ${B.same}`).join(' '));
