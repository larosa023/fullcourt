// Pulls NBA player-prop lines from every book SportsGameOdds carries for games starting in the next ~22 hours
// and writes odds.json (committed to the odds-data branch by the workflow; the site reads it from there).
// Free plan: 2,500 games a month, so the window and schedule are kept tight.
import { writeFileSync } from 'node:fs';
const KEY = process.env.SGO_KEY;
if (!KEY) { console.error('SGO_KEY missing'); process.exit(1); }
const H = { 'X-Api-Key': KEY };
const STAT = { points: 'pts', rebounds: 'reb', assists: 'ast', threePointersMade: 'tpm', 'points+rebounds+assists': 'pra', 'points+rebounds': 'pr', 'points+assists': 'pa', 'rebounds+assists': 'ra', steals: 'stl', blocks: 'blk', 'blocks+steals': 'sb', fieldGoalsAttempted: 'fga', threePointersAttempted: 'tpa', twoPointersMade: 'fg2', twoPointersAttempted: 'fg2a' };
const now = new Date(), until = new Date(now.getTime() + (+process.env.HOURS || 22) * 3600e3);
const events = [];
let cursor = '';
for (let page = 0; page < 5; page++) {
  const u = new URL('https://api.sportsgameodds.com/v2/events');
  Object.entries({ leagueID: 'NBA', started: 'false', oddsAvailable: 'true', startsAfter: now.toISOString(), startsBefore: until.toISOString(), limit: '30' }).forEach(([k, v]) => u.searchParams.set(k, v));
  if (cursor) u.searchParams.set('cursor', cursor);
  const r = await fetch(u, { headers: H });
  const j = await r.json();
  if (!r.ok || !j.success) { console.error('SGO error', r.status, JSON.stringify(j).slice(0, 300)); if (!events.length) process.exit(1); break; } // keep the last good file
  events.push(...(j.data || []));
  if (!j.nextCursor || !(j.data || []).length) break;
  cursor = j.nextCursor;
}
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const out = { updated: now.toISOString(), source: 'SportsGameOdds', events: [] };
for (const e of events) {
  const ev = { id: e.eventID, starts: e.status?.startsAt, home: e.teams?.home?.names?.short, away: e.teams?.away?.names?.short, props: {} };
  const name = id => e.players?.[id]?.name || id;
  for (const [key, o] of Object.entries(e.odds || {})) {
    if (o.periodID !== 'game' || o.betTypeID !== 'ou' || o.sideID !== 'over' || !o.playerID) continue;
    const k = STAT[o.statID]; if (!k) continue;
    const under = e.odds[o.opposingOddID] || {};
    const books = {};
    for (const [b, x] of Object.entries(o.byBookmaker || {})) {
      if (x.available === false) continue;
      const u = under.byBookmaker?.[b] || {};
      const row = { l: num(x.overUnder), o: num(x.odds), u: num(u.odds) };
      // (book deeplinks skipped: a share of FanDuel's point at the wrong market)
      if (row.l != null) books[b] = row;
    }
    if (!Object.keys(books).length) continue;
    const p = (ev.props[name(o.playerID)] ||= {});
    p[k] = { books, fair: num(o.fairOverUnder) };
  }
  out.events.push(ev);
}
if (!out.events.length) { console.log('no games with lines in the window; keeping the last file'); process.exit(1); }
// which player-prop markets the feed actually had (mapped or not), to see what's on offer
const seen = {}; for (const e of events) for (const o of Object.values(e.odds || {})) if (o.playerID && o.periodID === 'game' && o.betTypeID === 'ou' && o.sideID === 'over') { const s = (seen[o.statID] ||= { props: 0, books: new Set() }); s.props++; Object.keys(o.byBookmaker || {}).forEach(b => s.books.add(b)); }
for (const sid of ['fieldGoalsAttempted', 'threePointersAttempted', 'twoPointersAttempted']) { const o = events.flatMap(e => Object.values(e.odds || {})).find(o => o.statID === sid && o.playerID && o.periodID === 'game' && o.sideID === 'over'); if (o) { const { byBookmaker, ...rest } = o; console.log('sample', sid, JSON.stringify(rest).slice(0, 700)); } }
console.log('markets in feed:', Object.entries(seen).map(([k, v]) => `${k} ${v.props} (${[...v.books].join(',')})`).join(' | '));
writeFileSync(process.argv[2] || 'odds.json', JSON.stringify(out));
console.log(`${out.events.length} games, ${out.events.reduce((a, e) => a + Object.keys(e.props).length, 0)} players`);
