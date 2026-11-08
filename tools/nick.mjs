// Builds nicknames.json: players' real nicknames, as Basketball-Reference lists them on each player's page
// (the line in brackets under the name, e.g. Allen Iverson: "The Answer, A.I., Bubba Chuck"). Nothing is made up here.
// Covers every current NBA player (from this season's team rosters), and everyone in the History section (NBA and WNBA
// legends and career leaders). Runs daily on GitHub; pages already read are kept, so a run only reads new players
// plus a few old ones to refresh (one page every ~4 s, at most ~480 pages a run).
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-nicknames/1.0; daily; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com', RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 429) { console.log('429, waiting'); await sleep(65000); continue; } if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); }
    catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
}
const brGet = async u => { const t = await get(BR + u); await sleep(4200); return t; };
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

const old = (await get(`${RAW}/nick-data/nicknames.json`, true).catch(() => null)) || { players: {} };
const players = old.players || {};
const [hn, hw] = await Promise.all([get(`${RAW}/hist-data/history.json`, true).catch(() => null), get(`${RAW}/hist-data/history-wnba.json`, true).catch(() => null)]);

// who to cover: { brId: { lg, name, espn } }
const want = {};
for (const [H, lg] of [[hn, 'nba'], [hw, 'wnba']]) {
  if (!H) continue;
  for (const [id, L] of Object.entries(H.legends || {})) want[id] = { lg, name: L.name, espn: L.espn || null };
  for (const r of Object.values(H.leaders || {}).flat()) if (!want[r.id]) want[r.id] = { lg, name: r.name, espn: H.espn?.[r.id] || null };
}
// this season's NBA rosters
const now = new Date(), season = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
const TEAMS = ['ATL', 'BOS', 'BRK', 'CHO', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHO', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
for (const t of TEAMS) {
  const html = await brGet(`/teams/${t}/${season}.html`).catch(() => null); if (!html) continue;
  const i = html.indexOf('id="roster"'), tb = i > 0 ? html.slice(i, html.indexOf('</table>', i)) : '';
  for (const m of tb.matchAll(/href="\/players\/[a-z]\/([a-z0-9]+)\.html">([^<]+)</g)) if (!want[m[1]]) want[m[1]] = { lg: 'nba', name: strip(m[2]), espn: null, current: true };
}
console.log('players to cover', Object.keys(want).length, 'already read', Object.keys(players).length);

// read the pages we haven't yet, then refresh the oldest few
const todo = Object.keys(want).filter(id => !players[id]);
const stale = Object.keys(players).filter(id => want[id]).sort((a, b) => (players[a].at || '').localeCompare(players[b].at || '')).slice(0, 25);
let n = 0;
for (const id of [...todo, ...stale]) {
  if (n++ >= 480) break;
  const w = want[id], path = w.lg === 'wnba' ? `/wnba/players/${id[0]}/${id}.html` : `/players/${id[0]}/${id}.html`;
  try {
    const html = await brGet(path); if (!html) continue;
    const m = html.indexOf('id="meta"'), blk = html.slice(m, m + 3000);
    const raw = blk.match(/<p>\s*\(([^<]{2,300})\)\s*<\/p>/)?.[1];
    const nick = raw ? strip(raw).split(/\s*,\s*/).filter(Boolean) : [];
    players[id] = { ...(players[id] || {}), lg: w.lg, name: w.name, nick, at: new Date().toISOString().slice(0, 10), espn: players[id]?.espn || w.espn || null };
  } catch (e) { console.log('failed', id, e.message); }
}
// ESPN ids for current players who aren't in History (their pages on Fullcourt use ESPN ids)
for (const [id, p] of Object.entries(players)) {
  if (p.espn || !p.nick?.length) continue;
  if (want[id]?.espn) { p.espn = want[id].espn; continue; }
  const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(p.name.normalize('NFD').replace(/[̀-ͯ]/g, ''))}&limit=6&type=player`, true).catch(() => null);
  const hit = (d?.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === (p.lg === 'wnba' ? 'WNBA' : 'NBA') && fold(c.displayName) === fold(p.name));
  const e = hit?.uid?.match(/a:(\d+)/)?.[1]; if (e) p.espn = e;
  await sleep(150);
}
const withNick = Object.values(players).filter(p => p.nick?.length).length;
console.log('read this run', Math.min(n, 480), 'players with nicknames', withNick, 'of', Object.keys(players).length);
if (Object.keys(players).length < 50) throw new Error('too few players read; keeping the last file');
writeFileSync(process.argv[2] || 'nicknames.json', JSON.stringify({ updated: new Date().toISOString(), source: 'Basketball-Reference', players }));
