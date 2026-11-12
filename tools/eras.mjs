// Builds the history data behind Ask ("1962 MVP race", "players who averaged 30 and 10", "2003 draft", "how tall was
// Manute Bol", "best record ever", "who did the Bulls beat in the 1996 Finals"). Runs weekly on GitHub
// (.github/workflows/eras.yml) and publishes to the era-data branch:
//   seasons/<year>.json  every player's season: per-game line, totals and advanced numbers (regular season and
//                        playoffs), award finishes (MVP-2, ROY-1, AS, NBA1 ...), every team's record, conference and
//                        ratings, and every playoff series. <year> is the year the season ended.
//   index.json           every player who has appeared: name, first and last season, a career-size number used to
//                        pick between players who share a name, and an ESPN id for photos where ESPN has one.
//   top.json             the best single seasons ever by stat.
//   table.json           every notable season in one file, for questions that search all of history at once.
//   careers.json         career totals, teams, accolades and titles for every player.
//   teams.json           every team season: record, conference, ratings, how far it went.
//   playoffs.json        every playoff series.     awards.json   award finishes and stat leaders, year by year.
//   draft.json           every draft.              bio.json      height, weight, birth date, college, Hall of Fame.
//   league.json          league averages by season.
// Source: Basketball-Reference, one page every ~4 s. Finished seasons never change, so after the first run only the
// newest two seasons (and the newest two drafts) are read again.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const VER = 2;
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com';
const WN = process.env.ERA_LG === 'wnba'; // the WNBA's files go in a wnba/ folder beside the NBA's
const out = (process.argv[2] || 'pub') + (WN ? '/wnba' : '');
const LOCAL = process.env.ERA_PAGES || ''; // testing: read saved pages from this folder instead of the network
const ONLY = process.env.ERA_YEARS ? new Set(process.env.ERA_YEARS.split(',').map(Number)) : null;
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
const localFile = url => {
  if (WN) { const m = url.match(/\/wnba\/years\/(\d{4})(?:_(per_game|totals|advanced))?\.html$/) || url.match(/\/wnba\/(awards)\/awards_(\d{4})\.html$/) || url.match(/\/wnba\/(draft)\/(\d{4})\.html$/); const n = /all_defense/.test(url) ? 'w_all_defense' : !m ? '' : m[1] === 'awards' ? `w_awards_${m[2]}` : m[1] === 'draft' ? `w_draft_${m[2]}` : `w_${{ per_game: 'pergame', totals: 'totals', advanced: 'adv' }[m[2]] || 'sum'}_${m[1]}`; const f = `${LOCAL}/${n}.html`; return n && existsSync(f) ? readFileSync(f, 'utf8') : null; }
  const m = url.match(/_(\d{4})_(totals|advanced|per_game)\.html$/) || url.match(/\/(leagues)\/[A-Z]+_(\d{4})\.html$/) || url.match(/\/(draft)\/[A-Z]+_(\d{4})\.html$/) || url.match(/\/(players)\/([a-z])\/$/);
  const name = !m ? (/stats_per_game/.test(url) ? 'lgavg' : '') : m[1] === 'leagues' ? `league_${m[2]}` : m[1] === 'draft' ? `draft_${m[2]}` : m[1] === 'players' ? `players_${m[2]}` : `${{ totals: 'totals', advanced: 'adv', per_game: 'pergame' }[m[2]]}_${m[1]}`;
  const f = `${LOCAL}/${name}.html`;
  return name && existsSync(f) ? readFileSync(f, 'utf8') : null;
};
// some tables ship inside comments
const brGet = async url => { if (LOCAL) return localFile(url); const t = await get(BR + url); await sleep(4200); return t ? t.replace(/<!--([\s\S]*?)-->/g, '$1') : null; };
const tableOf = (html, id) => { const i = html.indexOf(`id="${id}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</table>', i)); };
const rowsOf = t => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const cells = r => Object.fromEntries([...r.matchAll(/data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => [m[1], m[2]]));
const num = v => { const s = strip(v).replace(/^\+/, ''); return s === '' || !Number.isFinite(+s) ? null : +s; };
const pidOf = s => String(s || '').match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1] || null;

// what each stored row holds, in order: the per-game line, then season totals, then advanced numbers
const COLS1 = ['id', 'name', 'age', 'tm', 'pos', 'g', 'gs', 'mp', 'pts', 'trb', 'ast', 'stl', 'blk', 'tov', 'fgp', 'fga', 'tp', 'tpa', 'tpp', 'ftp', 'fta', 'aw'];
const SRC = { age: 'age', g: 'games', gs: 'games_started', mp: 'mp_per_g', pts: 'pts_per_g', trb: 'trb_per_g', ast: 'ast_per_g', stl: 'stl_per_g', blk: 'blk_per_g', tov: 'tov_per_g', fgp: 'fg_pct', fga: 'fga_per_g', tp: 'fg3_per_g', tpa: 'fg3a_per_g', tpp: 'fg3_pct', ftp: 'ft_pct', fta: 'fta_per_g' };
const TOT = { ptsT: 'pts', trbT: 'trb', astT: 'ast', stlT: 'stl', blkT: 'blk', tpT: 'fg3', mpT: 'mp', fgT: 'fg', fgaT: 'fga', ftT: 'ft', ftaT: 'fta', tdT: 'tpl_dbl' };
const ADV = { per: 'per', ts: 'ts_pct', usg: 'usg_pct', ws: 'ws', ws48: 'ws_per_48', bpm: 'bpm', vorp: 'vorp' };
const COLS = [...COLS1, ...Object.keys(TOT), ...Object.keys(ADV)];

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
  return [...byId.values()].map(p => { const tm = /^\dTM$|^TOT$/.test(p.tm) ? p.teams.join('/') || p.tm : p.tm; return COLS1.map(k => k === 'tm' ? tm : p[k] ?? null); });
}
// a totals or advanced table → id → the wanted numbers from each player's first (combined) line
function extraOf(table, MAP) {
  const byId = new Map();
  for (const r of rowsOf(table.slice(Math.max(0, table.indexOf('<tbody'))))) {
    const id = r.match(/data-append-csv="([a-z0-9]+)"/)?.[1]; if (!id || byId.has(id)) continue;
    const c = cells(r);
    byId.set(id, Object.values(MAP).map(s => num(c[s])));
  }
  return byId;
}
const TEAM_ADV = { srs: 'srs', ortg: 'off_rtg', drtg: 'def_rtg', pace: 'pace' };

async function season(y, old) {
  const LG = y <= 1949 ? 'BAA' : 'NBA'; // the league's first three seasons were played as the BAA
  // a finished season's per-game lines were read on an earlier run; only the new pages are needed
  let reg, post;
  if (old?.reg?.length >= 40 && old.settledPerGame) { reg = old.reg.map(r => r.slice(0, COLS1.length)); post = (old.post || []).map(r => r.slice(0, COLS1.length)); }
  else {
    const html = await brGet(`/leagues/${LG}_${y}_per_game.html`);
    if (!html) return null;
    reg = playersOf(tableOf(html, 'per_game_stats'));
    if (reg.length < 40) throw new Error(`season ${y}: only ${reg.length} players parsed`);
    post = playersOf(tableOf(html, 'per_game_stats_post'));
  }
  const tot = await brGet(`/leagues/${LG}_${y}_totals.html`), adv = await brGet(`/leagues/${LG}_${y}_advanced.html`);
  if (!tot || !adv) throw new Error(`season ${y}: totals or advanced page missing`);
  const add = (rows, T, A) => rows.map(r => [...r, ...(T.get(r[0]) || Object.keys(TOT).map(() => null)), ...(A.get(r[0]) || Object.keys(ADV).map(() => null))]);
  const tReg = extraOf(tableOf(tot, 'totals_stats'), TOT), aReg = extraOf(tableOf(adv, 'advanced'), ADV);
  if (tReg.size < 40 || aReg.size < 40) throw new Error(`season ${y}: totals ${tReg.size}, advanced ${aReg.size} players parsed`);
  reg = add(reg, tReg, aReg);
  post = add(post, extraOf(tableOf(tot, 'totals_stats_post'), TOT), extraOf(tableOf(adv, 'advanced_post'), ADV));

  // the season's summary page: team names, records, conference and division, ratings, and every playoff series
  const sum = await brGet(`/leagues/${LG}_${y}.html`);
  if (!sum) throw new Error(`season ${y}: summary page missing`);
  const teams = {}, byName = {};
  for (const m of sum.matchAll(/<table[^>]*id="(divs_standings_[^"]*)"/g)) {
    let div = '';
    for (const r of rowsOf(tableOf(sum, m[1]))) {
      const c = cells(r), ab = (c.team_name || '').match(/\/teams\/([A-Z]{3})\//)?.[1];
      if (!ab) { const d = strip(r); if (/Division|Conference/.test(d) && d.length < 40) div = d.replace(/ Division$/, ''); continue; }
      if (teams[ab]) continue;
      const side = m[1].slice(-1), conf = side === 'E' || side === 'W' ? side : /^East/.test(div) ? 'E' : /^West/.test(div) ? 'W' : div.slice(0, 1) || '';
      const name = strip(c.team_name).replace(/\*$/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
      teams[ab] = { name, w: num(c.wins), l: num(c.losses), conf, div, ppg: num(c.pts_per_g), oppg: num(c.opp_pts_per_g), srs: num(c.srs) };
      byName[name] = ab;
    }
  }
  if (Object.keys(teams).length < 6) for (const m of sum.matchAll(/<table[^>]*id="(confs_standings_[^"]*)"/g)) for (const r of rowsOf(tableOf(sum, m[1]))) {
    const c = cells(r), ab = (c.team_name || '').match(/\/teams\/([A-Z]{3})\//)?.[1]; if (!ab || teams[ab]) continue;
    const name = strip(c.team_name).replace(/\*$/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    teams[ab] = { name, w: num(c.wins), l: num(c.losses), conf: m[1].slice(-1), div: '', ppg: num(c.pts_per_g), oppg: num(c.opp_pts_per_g), srs: num(c.srs) };
    byName[name] = ab;
  }
  if (Object.keys(teams).length < 6) throw new Error(`season ${y}: only ${Object.keys(teams).length} teams parsed`);
  for (const r of rowsOf(tableOf(sum, 'advanced-team'))) {
    const c = cells(r), ab = (c.team || '').match(/\/teams\/([A-Z]{3})\//)?.[1] || byName[strip(c.team).replace(/\*$/, '')]; if (!ab || !teams[ab]) continue;
    for (const [k, s] of Object.entries(TEAM_ADV)) { const v = num(c[s]); if (v != null) teams[ab][k] = v; }
  }
  const po = [...sum.matchAll(/<strong>([^<]+)<\/strong><\/span><\/td>\s*<td><a href='\/teams\/([A-Z]{3})\/\d+\.html'>[^<]+<\/a>\s*over\s*<a href='\/teams\/([A-Z]{3})\/\d+\.html'>[^<]+<\/a>\s*(?:&nbsp;)?\s*\((\d+)-(\d+)\)/g)]
    .map(m => [strip(m[1]), m[2], m[3], +m[4], +m[5]]);
  const TK = ['name', 'w', 'l', 'conf', 'div', 'ppg', 'oppg', 'srs', 'ortg', 'drtg', 'pace'];
  return { v: VER, y, season: `${y - 1}-${String(y).slice(2)}`, built: new Date().toISOString().slice(0, 10), cols: COLS, reg, post,
    tcols: TK, teams: Object.fromEntries(Object.entries(teams).map(([ab, t]) => [ab, TK.map(k => t[k] ?? null)])), po };
}

/* ---------------- the WNBA: the same season file from its own pages ---------------- */
const widOf = r => r.match(/\/wnba\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1] || null;
const W_SRC = { ...SRC, g: 'g', gs: 'gs' }, W_TOT = { ...TOT, tdT: 'tpl_dbl' }, W_ADV = { per: 'per', ts: 'ts_pct', usg: 'usg_pct', ws: 'ws', ws48: 'ws_per_40', bpm: 'bpm', vorp: 'vorp' };
function wExtra(table, MAP) { const byId = new Map(); for (const r of rowsOf(table.slice(Math.max(0, table.indexOf('<tbody'))))) { const id = widOf(r); if (!id || byId.has(id)) continue; const c = cells(r); byId.set(id, Object.values(MAP).map(k => num(c[k]))); } return byId; }
let wDef = null; // All-Defensive teams for every year come on one page
async function seasonW(y) {
  const html = await brGet(`/wnba/years/${y}_per_game.html`); if (!html) return null;
  const byId = new Map();
  for (const r of rowsOf(tableOf(html, 'per_game').replace(/^[\s\S]*?<tbody/, '<tbody'))) {
    const id = widOf(r); if (!id) continue;
    const c = cells(r), tm = strip(c.team), prev = byId.get(id);
    if (prev) { if (tm && tm !== 'TOT') prev.teams.push(tm); continue; }
    const row = { id, name: strip(c.player).replace(/<\/?\w*$/, '').replace(/\*$/, '').trim(), tm, teams: [], pos: strip(c.pos), aw: '' };
    for (const [k, k2] of Object.entries(W_SRC)) row[k] = num(c[k2]);
    byId.set(id, row);
  }
  if (byId.size < 30) throw new Error(`WNBA ${y}: only ${byId.size} players parsed`);
  const tot = await brGet(`/wnba/years/${y}_totals.html`), adv = await brGet(`/wnba/years/${y}_advanced.html`);
  if (!tot || !adv) throw new Error(`WNBA ${y}: totals or advanced page missing`);
  const T = wExtra(tableOf(tot, 'totals'), W_TOT), A = wExtra(tableOf(adv, 'advanced'), W_ADV);
  if (T.size < 30 || A.size < 30) throw new Error(`WNBA ${y}: totals ${T.size}, advanced ${A.size} players parsed`);
  // award voting (and the ages it lists), the All-WNBA teams, the All-Defensive teams
  const aw = new Map(), age = new Map(), tag = (id, t) => id && aw.set(id, (aw.get(id) || []).concat(t));
  const awp = await brGet(`/wnba/awards/awards_${y}.html`);
  if (awp) {
    for (const [tid, K] of [['mvp', 'MVP'], ['roy', 'ROY'], ['dpoy', 'DPOY'], ['swoy', '6MOY'], ['mip', 'MIP']]) for (const r of rowsOf(tableOf(awp, tid))) { const id = widOf(r), c = cells(r), rk = parseInt(strip(c.rank), 10); if (id && rk) { tag(id, `${K}-${rk}`); const a = num(c.wnba_age ?? c.age); if (a) age.set(id, a); } }
    for (const r of rowsOf(tableOf(awp, 'all_wnba'))) { const id = widOf(r), c = cells(r), n = parseInt(strip(c.all_wnba_team), 10); if (id && n) { tag(id, `NBA${n}`); const a = num(c.age ?? c.wnba_age); if (a) age.set(id, a); } }
  } else console.log('WNBA', y, 'no awards page');
  if (wDef === null) { wDef = {}; const d = await brGet('/wnba/awards/all_defense.html'); for (const r of rowsOf(tableOf(d || '', 'all-defensive'))) { const id = widOf(r), c = cells(r), yy = parseInt(strip(c.year_id), 10), n = parseInt(strip(c.award_team), 10); if (id && yy && n) (wDef[yy] = wDef[yy] || []).push([id, `DEF${n}`]); } }
  for (const [id, t] of wDef[y] || []) tag(id, t);
  const reg = [...byId.values()].map(p => { const tm = p.tm === 'TOT' ? p.teams.join('/') || 'TOT' : p.tm; p.aw = (aw.get(p.id) || []).join(','); if (p.age == null) p.age = age.get(p.id) ?? null; return [...COLS1.map(k => (k === 'tm' ? tm : p[k] ?? null)), ...(T.get(p.id) || Object.keys(TOT).map(() => null)), ...(A.get(p.id) || Object.keys(ADV).map(() => null))]; });
  const sum = await brGet(`/wnba/years/${y}.html`); if (!sum) throw new Error(`WNBA ${y}: summary page missing`);
  const teams = {}, byName = {};
  for (const m of sum.matchAll(/<table[^>]*id="(standings_[ew]|wnba_standings)"/g)) for (const r of rowsOf(tableOf(sum, m[1]))) {
    const c = cells(r), ab = (c.team_name || '').match(/\/wnba\/teams\/([A-Z]{3})\//)?.[1]; if (!ab) continue;
    const name = strip(c.team_name).replace(/\*$/, '').trim(), t = teams[ab] || (teams[ab] = { name, w: num(c.wins), l: num(c.losses), conf: '', div: '' });
    if (m[1] !== 'wnba_standings') { t.conf = m[1].slice(-1).toUpperCase(); t.ppg = num(c.pts_per_g); t.oppg = num(c.opp_pts_per_g); }
    byName[name] = ab;
  }
  if (Object.keys(teams).length < 6) throw new Error(`WNBA ${y}: only ${Object.keys(teams).length} teams parsed`);
  for (const r of rowsOf(tableOf(sum, 'advanced-team'))) { const c = cells(r), ab = byName[strip(c.team).replace(/\*$/, '').trim()]; if (!ab) continue; for (const [k, k2] of Object.entries(TEAM_ADV)) { const v = num(c[k2]); if (v != null) teams[ab][k] = v; } }
  const po = [...sum.matchAll(/<strong>([^<]+)<\/strong><\/span><\/td>\s*<td><a href='\/wnba\/teams\/([A-Z]{3})\/\d+\.html'>[^<]+<\/a>\s*over\s*<a href='\/wnba\/teams\/([A-Z]{3})\/\d+\.html'>[^<]+<\/a>\s*(?:&nbsp;)?\s*\((\d+)-(\d+)\)/g)]
    .map(m => [/^(WNBA )?(Finals|Championship)( Game)?$/i.test(strip(m[1])) ? 'Finals' : strip(m[1]), m[2], m[3], +m[4], +m[5]]);
  const TK = ['name', 'w', 'l', 'conf', 'div', 'ppg', 'oppg', 'srs', 'ortg', 'drtg', 'pace'];
  return { v: VER, y, season: String(y), built: new Date().toISOString().slice(0, 10), cols: COLS, reg, post: [], tcols: TK, teams: Object.fromEntries(Object.entries(teams).map(([ab, t]) => [ab, TK.map(k => t[k] ?? null)])), po };
}

// the season under way or coming next: the NBA's starts in October; the WNBA's runs May to October inside one year
const now = new Date(), CUR = WN ? (now.getUTCMonth() >= 10 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()) : now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
const FIRST = WN ? 1997 : 1947;
mkdirSync(`${out}/seasons`, { recursive: true });
const all = {};
let fetched = 0;
const readJSON = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return null; } };
for (let y = FIRST; y <= CUR; y++) {
  const f = `${out}/seasons/${y}.json`;
  const old = existsSync(f) ? readJSON(f) : null;
  // keep a finished season once it has been read after its awards were handed out
  const done = old && (WN ? y < now.getUTCFullYear() - 1 || (y < CUR && old.built >= `${y}-11-10`) : y <= CUR - 2 || (y === CUR - 1 && old.built >= `${y}-07-15`));
  if ((done && old.v === VER) || (ONLY && !ONLY.has(y) && old)) { all[y] = old; continue; }
  try {
    const d = WN ? await seasonW(y) : await season(y, done ? { ...old, settledPerGame: true } : null);
    if (d) { all[y] = d; writeFileSync(f, JSON.stringify(d)); fetched++; console.log('season', y, d.reg.length, 'players,', d.post.length, 'in the playoffs,', Object.keys(d.teams).length, 'teams,', d.po.length, 'series'); }
    else if (old) all[y] = old;
    else console.log('season', y, 'has no page yet');
  } catch (e) { console.log('season failed', y, e.message); if (old) all[y] = old; }
}
const years = Object.keys(all).map(Number).sort((a, b) => a - b);
if (years.length < (WN ? (LOCAL ? 1 : 25) : 75)) throw new Error(`only ${years.length} seasons; keeping the published files`);
console.log('seasons', years.length, 'read this run', fetched, 'not yet on the new format', years.filter(y => all[y].v !== VER).length);

// each season reads through its own column list (a season still on the old format simply lacks the newer columns)
const colIx = new Map();
const I = (S, r, k) => { let m = colIx.get(S); if (!m) { m = Object.fromEntries(S.cols.map((c, i) => [c, i])); colIx.set(S, m); } const i = m[k]; return i == null ? null : r[i] ?? null; };
const teamOf = (S, ab) => { const t = S.teams?.[ab]; if (!t) return null; const k = S.tcols || ['name', 'w', 'l']; return Object.fromEntries(k.map((c, i) => [c, t[i]])); };
const champOf = S => (S.po || []).find(s => /^Finals$/i.test(s[0]) && s[3] > s[4] || /^Finals$/i.test(s[0]))?.[1] || null;
const awOf = s => { const o = {}; for (const t of String(s || '').split(',')) { const m = t.trim().match(/^([A-Z0-9]+?)(?:-(\d+))?$/); if (m) o[m[1]] = m[2] ? +m[2] : 1; } return o; };

// ---- the player index
const idx = new Map();
const notable = new Set();
for (const y of years) {
  const S = all[y];
  const maxG = Math.max(...S.reg.map(r => I(S, r, 'g') || 0)), qual = S.reg.filter(r => (I(S, r, 'g') || 0) >= 0.7 * maxG);
  for (const k of ['pts', 'trb', 'ast']) [...qual].sort((a, b) => (I(S, b, k) || 0) - (I(S, a, k) || 0)).slice(0, 25).forEach(r => notable.add(I(S, r, 'id')));
  for (const r of S.reg) {
    const id = I(S, r, 'id'), e = idx.get(id) || { name: I(S, r, 'name'), y0: y, y1: y, score: 0 };
    // points scored, plus weight for All-Star games, All-NBA teams and MVPs (Magic Johnson outranks Eddie Johnson)
    const aw = String(I(S, r, 'aw') || '');
    e.name = I(S, r, 'name'); e.y1 = y; e.score += (I(S, r, 'pts') || 0) * (I(S, r, 'g') || 0) + (/(^|,)AS(,|$)/.test(aw) ? 2000 : 0) + (/(^|,)NBA\d/.test(aw) ? 1500 : 0) + (/(^|,)MVP-1(,|$)/.test(aw) ? 5000 : 0);
    if (I(S, r, 'aw')) notable.add(id);
    idx.set(id, e);
  }
}
// ESPN ids (for photos) for players a graphic is likely to show: anyone who drew award votes or ranked near the top of
// a season, from the years ESPN has photos for. Ids found on earlier runs are kept.
let prev = {};
try { prev = Object.fromEntries(JSON.parse(readFileSync(`${out}/index.json`, 'utf8')).players.map(p => [p[0], p[5]])); } catch (e) {}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hasPhoto = async id => { try { const r = await fetch(`https://a.espncdn.com/i/headshots/${WN ? 'wnba' : 'nba'}/players/full/${id}.png`, { method: 'HEAD', headers: { 'user-agent': UA } }); return r.ok; } catch (e) { return null; } };
let looked = 0;
for (const [id, e] of idx) {
  if (prev[id] != null) { e.espn = prev[id]; continue; }
  if (LOCAL || !notable.has(id) || e.y1 < (WN ? 2005 : 1985)) { e.espn = null; continue; }
  if (looked >= 2500) { e.espn = null; continue; } // a first run does the bulk; later runs only see new names
  looked++;
  e.espn = 0; // looked up, nothing usable
  try {
    const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(e.name.normalize('NFD').replace(/[̀-ͯ]/g, ''))}&limit=6&type=player`, true);
    const hit = (d?.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === (WN ? 'WNBA' : 'NBA') && fold(c.displayName) === fold(e.name));
    const m = hit?.uid?.match(/a:(\d+)/);
    if (m && (await hasPhoto(m[1])) !== false) e.espn = m[1];
  } catch (err) { e.espn = null; } // try again next week
  await sleep(120);
}
console.log('players', idx.size, 'notable', notable.size, 'ESPN lookups this run', looked, 'with a photo id', [...idx.values()].filter(e => e.espn).length);
const save = (name, data) => { const s = JSON.stringify(data); writeFileSync(`${out}/${name}`, s); console.log(name, Math.round(s.length / 1024), 'KB'); };
save('index.json', { v: VER, updated: new Date().toISOString(), first: years[0], last: years.at(-1), cur: CUR,
  cols: ['id', 'name', 'y0', 'y1', 'score', 'espn'], players: [...idx].map(([id, e]) => [id, e.name, e.y0, e.y1, Math.round(e.score), e.espn ?? null]) });

// ---- the best single seasons by stat (qualified: at least 70% of that season's games)
const top = {};
for (const k of ['pts', 'trb', 'ast', 'stl', 'blk', 'tp', 'mp']) {
  const list = [];
  for (const y of years) {
    if (y === CUR) continue; // a season under way isn't a finished season
    const S = all[y], maxG = Math.max(...S.reg.map(r => I(S, r, 'g') || 0));
    for (const r of S.reg) if ((I(S, r, 'g') || 0) >= 0.7 * maxG && I(S, r, k) != null) list.push([I(S, r, k), I(S, r, 'id'), I(S, r, 'name'), y, I(S, r, 'tm'), I(S, r, 'g')]);
  }
  top[k] = list.sort((a, b) => b[0] - a[0]).slice(0, 100);
  console.log('top', k, top[k][0]);
}
save('top.json', { v: VER, cols: ['val', 'id', 'name', 'y', 'tm', 'g'], top });

// ---- every notable finished season in one table, for questions that search all of history
// ("players who averaged 30 and 10", "best seasons at age 19", "50-40-90 seasons", "highest PER ever")
{
  const TC = ['id', 'y', 'age', 'tm', 'pos', 'g', 'mp', 'pts', 'trb', 'ast', 'stl', 'blk', 'tp', 'tpa', 'fgp', 'tpp', 'ftp', 'fta', 'per', 'ts', 'usg', 'ws', 'bpm', 'ptsT', 'trbT', 'astT', 'stlT', 'blkT', 'tpT', 'tdT', 'aw'];
  const rows = [];
  for (const y of years) {
    if (y === CUR) continue;
    const S = all[y], maxG = Math.max(...S.reg.map(r => I(S, r, 'g') || 0));
    for (const r of S.reg) {
      const v = k => I(S, r, k);
      if ((v('g') || 0) < 0.58 * maxG) continue;
      if (!(v('mp') >= 24 || v('pts') >= 10 || v('trb') >= 8 || v('ast') >= 5 || v('stl') >= 1.5 || v('blk') >= 1.5 || v('tp') >= 2 || v('aw'))) continue;
      rows.push(TC.map(k => k === 'y' ? y : v(k)));
    }
  }
  save('table.json', { v: VER, cols: TC, games: Object.fromEntries(years.map(y => [y, Math.max(...all[y].reg.map(r => I(all[y], r, 'g') || 0))])), rows });
}

// ---- stat leaders and award finishes, year by year
const leadersOf = {}; // year → stat → [id, value, team]
{
  const AW = {};
  for (const y of years) {
    const S = all[y], maxG = Math.max(...S.reg.map(r => I(S, r, 'g') || 0)), o = {};
    for (const r of S.reg) {
      const a = awOf(I(S, r, 'aw')), id = I(S, r, 'id');
      for (const [k, n] of Object.entries(a)) {
        if (/^(MVP|ROY|DPOY|6MOY|MIP|CPOY)$/.test(k)) { if (n <= 5) (o[k] = o[k] || []).push([id, n, I(S, r, 'tm')]); }
        else (o[k] = o[k] || []).push(id); // AS, NBA1-3, DEF1-2 and the like
      }
    }
    for (const k of Object.keys(o)) if (Array.isArray(o[k][0])) o[k].sort((a, b) => a[1] - b[1]);
    if (y !== CUR) {
      o.ldr = {}; leadersOf[y] = {};
      for (const k of ['pts', 'trb', 'ast', 'stl', 'blk']) {
        const q = S.reg.filter(r => (I(S, r, 'g') || 0) >= 0.7 * maxG && I(S, r, k) != null).sort((a, b) => I(S, b, k) - I(S, a, k))[0];
        if (q) { o.ldr[k] = [I(S, q, 'id'), I(S, q, k), I(S, q, 'tm')]; leadersOf[y][k] = I(S, q, 'id'); }
      }
    }
    AW[y] = o;
  }
  save('awards.json', { v: VER, years: AW });
}

// ---- every team season, and every playoff series
{
  const TC = ['y', 'ab', 'name', 'w', 'l', 'conf', 'div', 'ppg', 'oppg', 'srs', 'ortg', 'drtg', 'pace', 'po', 'top'];
  const rows = [], series = {};
  for (const y of years) {
    const S = all[y];
    if (S.po?.length) series[y] = S.po;
    const champ = champOf(S), out1 = {}; // the round each beaten team went out in
    for (const s of S.po || []) if (!/Tiebreaker/i.test(s[0]) || !out1[s[2]]) out1[s[2]] = out1[s[2]] && !/Tiebreaker/i.test(out1[s[2]]) ? out1[s[2]] : s[0]; // a lost tiebreaker isn't how a playoff team went out
    for (const ab of Object.keys(S.teams || {})) {
      const t = teamOf(S, ab);
      const best = S.reg.filter(r => String(I(S, r, 'tm')).split('/').includes(ab)).sort((a, b) => (I(S, b, 'pts') || 0) * (I(S, b, 'g') || 0) - (I(S, a, 'pts') || 0) * (I(S, a, 'g') || 0))[0];
      rows.push([y, ab, t.name, t.w, t.l, t.conf ?? null, t.div ?? null, t.ppg ?? null, t.oppg ?? null, t.srs ?? null, t.ortg ?? null, t.drtg ?? null, t.pace ?? null,
        ab === champ ? 'Champions' : out1[ab] ? `Lost ${out1[ab]}` : (S.po?.length ? '' : null), best ? I(S, best, 'id') : null]);
    }
  }
  save('teams.json', { v: VER, cols: TC, rows });
  save('playoffs.json', { v: VER, cols: ['round', 'won', 'lost', 'w', 'l'], years: series });
}

// ---- careers: totals, teams, accolades, titles
{
  const C = new Map();
  const ranges = ys => { const o = []; let a = null, b = null; for (const y of [...new Set(ys)].sort((p, q) => p - q)) { if (b != null && y === b + 1) { b = y; continue; } if (a != null) o.push(a === b ? `${a}` : `${a}-${b}`); a = b = y; } if (a != null) o.push(a === b ? `${a}` : `${a}-${b}`); return o.join(','); };
  const SUM = ['g', 'mpT', 'ptsT', 'trbT', 'astT', 'stlT', 'blkT', 'tpT', 'fgT', 'fgaT', 'ftT', 'ftaT', 'tdT'];
  for (const y of years) {
    const S = all[y], champ = champOf(S);
    const onChamp = new Set();
    if (champ) for (const r of S.post || []) if (String(I(S, r, 'tm')).split('/').pop() === champ) onChamp.add(I(S, r, 'id'));
    for (const [rows, post] of [[S.reg, false], [S.post || [], true]]) for (const r of rows) {
      const id = I(S, r, 'id');
      const c = C.get(id) || { n: 0, reg: Object.fromEntries(SUM.map(k => [k, 0])), has: {}, post: { g: 0, ptsT: 0, trbT: 0, astT: 0 }, teams: {}, aw: {}, rings: [], ldr: { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 }, ws: 0 };
      if (post) { for (const k of Object.keys(c.post)) c.post[k] += I(S, r, k) || 0; C.set(id, c); continue; }
      c.n++;
      for (const k of SUM) { const v = I(S, r, k); if (v != null) { c.reg[k] += v; c.has[k] = (c.has[k] || 0) + (I(S, r, 'g') || 0); } }
      c.ws += I(S, r, 'ws') || 0;
      const tms = String(I(S, r, 'tm') || '').split('/').filter(t => t && !/^\dTM$|^TOT$/.test(t));
      for (const t of tms) (c.teams[t] = c.teams[t] || []).push(y);
      if (champ && (tms.at(-1) === champ || onChamp.has(id))) c.rings.push(y);
      for (const [k, n] of Object.entries(awOf(I(S, r, 'aw')))) { if (/^(MVP|ROY|DPOY|6MOY|MIP|CPOY)$/.test(k)) { if (n === 1) c.aw[k] = (c.aw[k] || 0) + 1; } else c.aw[k] = (c.aw[k] || 0) + 1; }
      for (const k of Object.keys(c.ldr)) if (leadersOf[y]?.[k] === id) c.ldr[k]++;
      C.set(id, c);
    }
  }
  const CC = ['id', 'n', ...SUM, 'cov', 'pg', 'pptsT', 'ptrbT', 'pastT', 'teams', 'aw', 'rings', 'ldr', 'ws'];
  // cov: for each total, the share of his games it was recorded in (steals and blocks only exist from 1973-74, threes from 1979-80)
  const players = [...C].map(([id, c]) => [id, c.n, ...SUM.map(k => Math.round(c.reg[k])),
    Object.fromEntries(['stlT', 'blkT', 'tpT', 'mpT', 'trbT'].map(k => [k, c.reg.g ? Math.round(100 * (c.has[k] || 0) / c.reg.g) : 0]).filter(([, v]) => v < 100)),
    c.post.g, Math.round(c.post.ptsT), Math.round(c.post.trbT), Math.round(c.post.astT),
    Object.entries(c.teams).sort((a, b) => a[1][0] - b[1][0]).map(([t, ys]) => `${t}:${ranges(ys)}`).join(';'), c.aw, c.rings, Object.values(c.ldr), Math.round(c.ws * 10) / 10]);
  save('careers.json', { v: VER, cols: CC, players });
}

// ---- league averages by season
if (!WN) try {
  const html = await brGet('/leagues/NBA_stats_per_game.html');
  const rows = [];
  for (const r of rowsOf(tableOf(html || '', 'stats-Regular-Season'))) {
    const c = cells(r), s = strip(c.season); if (!/^\d{4}-\d\d$/.test(s)) continue;
    rows.push([+s.slice(0, 4) + 1, num(c.pts_per_g), num(c.pace), num(c.off_rtg), num(c.fg3a_per_g), num(c.fga_per_g), num(c.trb_per_g), num(c.ast_per_g), num(c.fg_pct), num(c.fg3_pct), num(c.ft_pct), num(c.ts_pct), strip(c.height), num(c.weight), num(c.age)]);
  }
  if (rows.length >= 70) save('league.json', { v: VER, cols: ['y', 'pts', 'pace', 'ortg', 'tpa', 'fga', 'trb', 'ast', 'fgp', 'tpp', 'ftp', 'ts', 'height', 'weight', 'age'], rows: rows.sort((a, b) => a[0] - b[0]) });
  else console.log('league averages: only', rows.length, 'rows; keeping the published file');
} catch (e) { console.log('league averages failed', e.message); }

// ---- every draft (finished drafts are kept from the last run)
{
  const old = readJSON(`${out}/draft.json`)?.years || {}, D = {};
  const lastDraft = now.getUTCMonth() >= (WN ? 4 : 6) ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // drafts are held in late June (the WNBA's in April)
  for (let y = FIRST; y <= lastDraft; y++) {
    if (old[y]?.length && (y <= lastDraft - 2 || (ONLY && !ONLY.has(y)))) { D[y] = old[y]; continue; }
    try {
      const html = await brGet(WN ? `/wnba/draft/${y}.html` : `/draft/${y <= 1949 ? 'BAA' : 'NBA'}_${y}.html`);
      if (!html) { if (old[y]) D[y] = old[y]; continue; }
      const picks = []; let round = 1;
      for (const r of rowsOf(tableOf(html, 'stats'))) {
        const rd = r.match(/data-stat="header_draft"[^>]*>\s*Round (\d+)/) || (WN && r.match(/over_header[^>]*>\s*Round (\d+)/)); if (rd) { round = +rd[1]; continue; }
        const c = cells(r), pk = num(c.pick_overall), name = strip(c.player); if (!name || pk == null) continue;
        const id = WN ? widOf(c.player || '') : pidOf(c.player);
        if (!id && pk > 60) continue; // deep picks who never played
        picks.push([pk, round, WN ? (c.team || '').match(/\/wnba\/teams\/([A-Z]{3})\//)?.[1] || strip(c.team) : strip(c.team_id), id, name, strip(WN ? c.college : c.college_name) || null]);
      }
      if (picks.length >= 5) { D[y] = picks; console.log('draft', y, picks.length, 'picks, first:', picks[0][4]); } else if (old[y]) D[y] = old[y];
    } catch (e) { console.log('draft failed', y, e.message); if (old[y]) D[y] = old[y]; }
  }
  if (Object.keys(D).length >= (LOCAL ? 1 : WN ? 25 : 70)) save('draft.json', { v: VER, cols: ['pick', 'round', 'tm', 'id', 'name', 'college'], years: D });
  else console.log('drafts: only', Object.keys(D).length, 'years; keeping the published file');
}

// ---- bios: position, height, weight, birth date, college, Hall of Fame (re-read about once a month)
if (!WN) {
  const old = readJSON(`${out}/bio.json`);
  const fresh = old?.players?.length > 4000 && old.v === VER && Date.now() - Date.parse(old.built) < 25 * 864e5;
  if (!fresh) {
    const B = [];
    const iso = s => { const d = new Date(`${s} UTC`); return Number.isFinite(+d) ? d.toISOString().slice(0, 10) : null; };
    for (const L of 'abcdefghijklmnopqrstuvwxyz') {
      try {
        const html = await brGet(`/players/${L}/`); if (!html) continue;
        for (const r of rowsOf(tableOf(html, 'players'))) {
          const id = r.match(/data-append-csv="([a-z0-9]+)"/)?.[1]; if (!id) continue;
          const c = cells(r), h = strip(c.height).match(/^(\d)-(\d{1,2})$/);
          B.push([id, strip(c.pos) || null, h ? +h[1] * 12 + +h[2] : null, num(c.weight), iso(strip(c.birth_date)), strip(c.colleges) || null, /<\/a>\s*\*/.test(c.player || '') ? 1 : 0]);
        }
      } catch (e) { console.log('bios failed', L, e.message); }
    }
    if (B.length > (LOCAL ? 50 : 4000)) save('bio.json', { v: VER, built: new Date().toISOString().slice(0, 10), cols: ['id', 'pos', 'height', 'weight', 'born', 'college', 'hof'], players: B });
    else console.log('bios: only', B.length, 'players; keeping the published file');
  } else console.log('bios kept from', old.built);
}
