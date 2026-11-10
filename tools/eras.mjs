// Builds the season-by-season data behind Ask's history answers ("1962 MVP race", "top scorers 1987",
// "Wilt 1962 vs Jordan 1987", "1996 Bulls"). Runs weekly on GitHub (.github/workflows/eras.yml) and publishes to the
// era-data branch:
//   seasons/<year>.json  every player's per-game line that season (regular season and playoffs), his award finishes
//                        (MVP-2, ROY-1, AS, NBA1 ...) and every team's record. <year> is the year the season ended.
//   index.json           every player who has appeared: name, first and last season, a career-size number used to
//                        pick between players who share a name, and an ESPN id for photos where ESPN has one.
//   top.json             the best single seasons ever by stat.
// Source: Basketball-Reference, two pages per season, one page every ~4 s. Finished seasons never change, so after
// the first run only the newest two seasons are read again.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const VER = 1;
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com';
const out = process.argv[2] || 'pub';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&mdash;/g, '-').replace(/\s+/g, ' ').trim();
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.status === 429) { console.log('429, waiting'); await sleep(65000); continue; }
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return json ? r.json() : r.text();
    } catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
  return null;
}
const brGet = async url => { const t = await get(BR + url); await sleep(4200); return t ? t.replace(/<!--([\s\S]*?)-->/g, '$1') : null; }; // some tables ship inside comments
const tableOf = (html, id) => { const i = html.indexOf(`id="${id}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</table>', i)); };
const rowsOf = t => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const cells = r => Object.fromEntries([...r.matchAll(/data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => [m[1], m[2]]));
const num = v => { const s = strip(v); return s === '' ? null : +s; };

// what each stored row holds, in order
const COLS = ['id', 'name', 'age', 'tm', 'pos', 'g', 'gs', 'mp', 'pts', 'trb', 'ast', 'stl', 'blk', 'tov', 'fgp', 'fga', 'tp', 'tpa', 'tpp', 'ftp', 'fta', 'aw'];
const SRC = { age: 'age', g: 'games', gs: 'games_started', mp: 'mp_per_g', pts: 'pts_per_g', trb: 'trb_per_g', ast: 'ast_per_g', stl: 'stl_per_g', blk: 'blk_per_g', tov: 'tov_per_g', fgp: 'fg_pct', fga: 'fga_per_g', tp: 'fg3_per_g', tpa: 'fg3a_per_g', tpp: 'fg3_pct', ftp: 'ft_pct', fta: 'fta_per_g' };

// one table of the per-game page → one row per player (a traded player's combined line, with the teams he played for)
function playersOf(table) {
  const byId = new Map();
  for (const r of rowsOf(table.slice(Math.max(0, table.indexOf('<tbody'))))) {
    const id = r.match(/data-append-csv="([a-z0-9]+)"/)?.[1]; if (!id) continue;
    const c = cells(r), tm = strip(c.team_name_abbr || c.team_id || '');
    const prev = byId.get(id);
    if (prev) { if (tm && !/^\dTM$|^TOT$/.test(tm)) prev.teams.push(tm); continue; } // the lines after a combined one are his separate teams
    const row = { id, name: strip(c.name_display || c.player).replace(/\*$/, ''), tm, teams: [], pos: strip(c.pos), aw: strip(c.awards) };
    for (const [k, s] of Object.entries(SRC)) row[k] = num(c[s]);
    byId.set(id, row);
  }
  return [...byId.values()].map(p => { const tm = /^\dTM$|^TOT$/.test(p.tm) ? p.teams.join('/') || p.tm : p.tm; return COLS.map(k => k === 'tm' ? tm : p[k] ?? null); });
}

async function season(y) {
  const html = await brGet(`/leagues/NBA_${y}_per_game.html`);
  if (!html) return null;
  const reg = playersOf(tableOf(html, 'per_game_stats'));
  if (reg.length < 40) throw new Error(`season ${y}: only ${reg.length} players parsed`);
  const post = playersOf(tableOf(html, 'per_game_stats_post'));
  // team names and records, from the season's summary page
  const teams = {};
  try {
    const sum = await brGet(`/leagues/NBA_${y}.html`);
    for (const m of (sum || '').matchAll(/<table[^>]*id="((?:divs|confs)_standings[^"]*)"/g)) {
      for (const r of rowsOf(tableOf(sum, m[1]))) {
        const c = cells(r), ab = (c.team_name || '').match(/\/teams\/([A-Z]{3})\//)?.[1]; if (!ab || teams[ab]) continue;
        teams[ab] = [strip(c.team_name).replace(/\*$/, '').replace(/\s*\(\d+\)\s*$/, '').trim(), num(c.wins), num(c.losses)];
      }
    }
  } catch (e) { console.log('summary failed', y, e.message); }
  return { v: VER, y, season: `${y - 1}-${String(y).slice(2)}`, built: new Date().toISOString().slice(0, 10), cols: COLS, reg, post, teams };
}

const now = new Date(), CUR = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); // the season under way (or about to start in October)
mkdirSync(`${out}/seasons`, { recursive: true });
const all = {};
let fetched = 0;
for (let y = 1947; y <= CUR; y++) {
  const f = `${out}/seasons/${y}.json`;
  let old = null;
  if (existsSync(f)) { try { old = JSON.parse(readFileSync(f, 'utf8')); } catch (e) {} }
  // keep a finished season once it has been read after its awards were handed out
  const settled = old && old.v === VER && (y <= CUR - 2 || (y === CUR - 1 && old.built >= `${y}-07-15`));
  if (settled) { all[y] = old; continue; }
  try {
    const d = await season(y);
    if (d) { all[y] = d; writeFileSync(f, JSON.stringify(d)); fetched++; console.log('season', y, d.reg.length, 'players,', d.post.length, 'in the playoffs,', Object.keys(d.teams).length, 'teams'); }
    else if (old) all[y] = old;
    else console.log('season', y, 'has no page yet');
  } catch (e) { console.log('season failed', y, e.message); if (old) all[y] = old; }
}
const years = Object.keys(all).map(Number).sort((a, b) => a - b);
if (years.length < 70) throw new Error(`only ${years.length} seasons; keeping the published files`);
console.log('seasons', years.length, 'read this run', fetched);

// ---- the player index
const I = (r, k) => r[COLS.indexOf(k)];
const idx = new Map();
const notable = new Set();
for (const y of years) {
  const S = all[y];
  const maxG = Math.max(...S.reg.map(r => I(r, 'g') || 0)), qual = S.reg.filter(r => (I(r, 'g') || 0) >= 0.7 * maxG);
  for (const k of ['pts', 'trb', 'ast']) [...qual].sort((a, b) => (I(b, k) || 0) - (I(a, k) || 0)).slice(0, 25).forEach(r => notable.add(I(r, 'id')));
  for (const r of S.reg) {
    const id = I(r, 'id'), e = idx.get(id) || { name: I(r, 'name'), y0: y, y1: y, score: 0 };
    e.name = I(r, 'name'); e.y1 = y; e.score += (I(r, 'pts') || 0) * (I(r, 'g') || 0);
    if (I(r, 'aw')) notable.add(id);
    idx.set(id, e);
  }
}
// ESPN ids (for photos) for players a graphic is likely to show: anyone who drew award votes or ranked near the top of
// a season, from the years ESPN has photos for. Ids found on earlier runs are kept.
let prev = {};
try { prev = Object.fromEntries(JSON.parse(readFileSync(`${out}/index.json`, 'utf8')).players.map(p => [p[0], p[5]])); } catch (e) {}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hasPhoto = async id => { try { const r = await fetch(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`, { method: 'HEAD', headers: { 'user-agent': UA } }); return r.ok; } catch (e) { return null; } };
let looked = 0;
for (const [id, e] of idx) {
  if (prev[id] != null) { e.espn = prev[id]; continue; }
  if (!notable.has(id) || e.y1 < 1985) { e.espn = null; continue; }
  if (looked >= 2500) { e.espn = null; continue; } // a first run does the bulk; later runs only see new names
  looked++;
  e.espn = 0; // looked up, nothing usable
  try {
    const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(e.name.normalize('NFD').replace(/[̀-ͯ]/g, ''))}&limit=6&type=player`, true);
    const hit = (d?.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === 'NBA' && fold(c.displayName) === fold(e.name));
    const m = hit?.uid?.match(/a:(\d+)/);
    if (m && (await hasPhoto(m[1])) !== false) e.espn = m[1];
  } catch (err) { e.espn = null; } // try again next week
  await sleep(120);
}
console.log('players', idx.size, 'notable', notable.size, 'ESPN lookups this run', looked, 'with a photo id', [...idx.values()].filter(e => e.espn).length);
writeFileSync(`${out}/index.json`, JSON.stringify({ v: VER, updated: new Date().toISOString(), first: years[0], last: years.at(-1), cur: CUR,
  cols: ['id', 'name', 'y0', 'y1', 'score', 'espn'], players: [...idx].map(([id, e]) => [id, e.name, e.y0, e.y1, Math.round(e.score), e.espn ?? null]) }));

// ---- the best single seasons by stat (qualified: at least 70% of that season's games)
const top = {};
for (const k of ['pts', 'trb', 'ast', 'stl', 'blk', 'tp', 'mp']) {
  const list = [];
  for (const y of years) {
    if (y === CUR) continue; // a season under way isn't a finished season
    const S = all[y], maxG = Math.max(...S.reg.map(r => I(r, 'g') || 0));
    for (const r of S.reg) if ((I(r, 'g') || 0) >= 0.7 * maxG && I(r, k) != null) list.push([I(r, k), I(r, 'id'), I(r, 'name'), y, I(r, 'tm'), I(r, 'g')]);
  }
  top[k] = list.sort((a, b) => b[0] - a[0]).slice(0, 100);
  console.log('top', k, top[k][0]);
}
writeFileSync(`${out}/top.json`, JSON.stringify({ v: VER, cols: ['val', 'id', 'name', 'y', 'tm', 'g'], top }));
