// Where the Discord bot's numbers come from, and the small "model" each reply and image card is built from.
// The feeds are the ones the site reads: ESPN's public scoreboard, game, standings and player feeds, plus this repo's
// own data branches (sportsbook lines, highlight videos). A model is plain data, a few KB: bot.mjs turns it into the
// Discord message and cards.mjs draws the picture from the same object, so the two can't disagree.
import { TEAMS } from './teams.mjs';
import { STATS } from './commands.mjs';

export const LGS = { nba: 'NBA', wnba: 'WNBA' };
const API = lg => `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}`;
const API2 = lg => `https://site.api.espn.com/apis/v2/sports/basketball/${lg}`;
// the site reads these two from site.web.api.espn.com; that host answers 403 to Cloudflare's servers (checked 2026-11-12), and this one serves the same paths
const WEB = lg => `https://site.api.espn.com/apis/common/v3/sports/basketball/${lg}`;
const SEARCH = 'https://site.api.espn.com/apis/common/v3/search';
const RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const TZ = 'America/New_York';

// a message for the person who ran the command (shown only to them), as opposed to a bug
export class Say extends Error {}

// Parsed answers are kept for a short while inside the running copy of the bot: a command and the picture that goes
// with it are two requests seconds apart, and reading a 500 KB feed twice is most of the processor time we're allowed.
const KEEP = new Map();
export async function get(url, ttl = 30) {
  const hit = KEEP.get(url); if (hit && Date.now() - hit.at < Math.min(ttl, 60) * 1000) return hit.data;
  // cf.cacheTtl: Cloudflare keeps the answer for that many seconds, so a busy server costs one upstream read, not one per command
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Fullcourt-Discord/1.0 (+https://github.com/larosa023/fullcourt)' }, cf: { cacheTtl: ttl, cacheEverything: true }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  const data = await r.json();
  KEEP.set(url, { at: Date.now(), data }); if (KEEP.size > 10) KEEP.delete(KEEP.keys().next().value);
  return data;
}

/* ---------- small helpers ---------- */
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
// date formatters are slow to build, so each is built once
const FMT = {}, fmt = (k, opts, loc = 'en-US') => (FMT[k] ||= new Intl.DateTimeFormat(loc, opts));
const isoDay = t => fmt('iso', { timeZone: TZ }, 'en-CA').format(new Date(t)).replace(/-/g, '');
// the site's day: New York time, and it doesn't roll over until 4 AM so late West Coast games stay on their night
export const dayET = (off = 0) => isoDay(Date.now() - 4 * 3600e3 + off * 86400e3);
const ymdDate = ymd => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), 12));
export const addDays = (ymd, n) => new Date(ymdDate(ymd).getTime() + n * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
export const dayLabel = ymd => fmt('day', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(ymdDate(ymd));
export const shortDate = iso => fmt('short', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(iso));
export const timeET = iso => fmt('time', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const dayOfET = iso => isoDay(Date.parse(iso) - 4 * 3600e3);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

/* ---------- teams and players ---------- */
const teamObj = (lg, t) => ({ lg, id: t[0], ab: t[1], loc: t[2], name: t[3], full: `${t[2]} ${t[3]}`, color: t[4] });
export const teamById = (lg, id) => { const t = TEAMS[lg]?.find(x => x[0] === String(id)); return t ? teamObj(lg, t) : null; };
export const allTeams = lg => (lg ? [lg] : ['nba', 'wnba']).flatMap(l => TEAMS[l].map(t => teamObj(l, t)));
// what the person picked from the suggestions ("nba:18"), or whatever they typed
export function findTeam(text, lg) {
  const m = /^(nba|wnba):(\d+)$/.exec(String(text || '').trim());
  if (m) return teamById(m[1], m[2]);
  const q = norm(text); if (!q) return null;
  for (const l of lg ? [lg] : ['nba', 'wnba']) {
    const L = TEAMS[l], hit = L.find(t => norm(t[1]) === q) || L.find(t => norm(t[3]) === q || norm(`${t[2]} ${t[3]}`) === q) || L.find(t => norm(`${t[2]} ${t[3]}`).includes(q)) || L.find(t => q.split(' ').some(w => w.length > 2 && norm(t[3]).startsWith(w)));
    if (hit) return teamObj(l, hit);
  }
  return null;
}
// a team as the cards and replies carry it: [id, abbreviation, colour]
const tm = (lg, t) => { const k = teamById(lg, t?.id); return { id: String(t?.id || ''), ab: t?.abbreviation || k?.ab || '?', name: t?.displayName || k?.full || '', nick: t?.shortDisplayName || t?.name || k?.name || '', color: k?.color || t?.color || '' }; };

export async function searchPlayers(q, lg) {
  const d = await get(`${SEARCH}?query=${encodeURIComponent(q)}&limit=12&type=player&sport=basketball${lg ? '&league=' + lg : ''}`, 300);
  // the search also knows retired players and other leagues' players filed under the NBA: keep the ones on a current team
  return (d.items || []).filter(x => LGS[x.league] && (!lg || x.league === lg) && x.isRetired !== true).map(x => ({ lg: x.league, id: String(x.id), name: x.displayName, team: x.teamRelationships?.[0]?.displayName || '' }))
    .filter(p => TEAMS[p.lg].some(t => `${t[2]} ${t[3]}` === p.team));
}
// a typed name -> the player it most likely means (null when nobody matches)
export async function findPlayer(raw, lg) {
  raw = String(raw || '').trim(); if (raw.length < 2) return null;
  let hits = await searchPlayers(raw, lg).catch(() => []);
  // the search wants names spelled its way ("A'ja", "Dončić"): try the surname and match the rest ourselves
  const words = norm(raw).split(' ').filter(w => w.length > 1);
  if (!hits.length && words.length > 1) hits = (await searchPlayers(words[words.length - 1], lg).catch(() => [])).filter(h => words.every(w => norm(h.name).includes(w)));
  if (!hits.length && words.length > 1) hits = (await searchPlayers(words[0], lg).catch(() => [])).filter(h => words.every(w => norm(h.name).includes(w)));
  return hits.find(h => norm(h.name) === norm(raw)) || hits[0] || null;
}

/* ---------- games ---------- */
const leadOf = (t, names) => { const l = (t.leaders || []).find(x => names.includes(x.name))?.leaders?.[0]; return l ? [l.athlete?.shortName || l.athlete?.displayName || '', l.displayValue] : null; };
function sideOf(lg, t) {
  return { ...tm(lg, t.team), s: String(t.score?.displayValue ?? t.score ?? ''), rec: (t.records || t.record || []).find(r => r.type === 'total')?.summary || (t.records || t.record)?.[0]?.summary || '', win: !!t.winner,
    lines: (t.linescores || []).map(l => String(l.displayValue ?? l.value ?? '')), pts: leadOf(t, ['points', 'pointsPerGame']), reb: leadOf(t, ['rebounds', 'reboundsPerGame']), ast: leadOf(t, ['assists', 'assistsPerGame']) };
}
// the few characters a score tile has room for: FINAL, F/OT, Q3 5:21, HALF, 7:30 PM, PPD
function tagOf(type, status, date) {
  const per = status.period || 0, ot = per > 4 ? (per > 5 ? `${per - 4}OT` : 'OT') : '';
  if (type.state === 'post') return /postponed/i.test(type.description || '') ? 'PPD' : /cancel/i.test(type.description || '') ? 'CANC' : ot ? `F/${ot}` : 'FINAL';
  if (type.state === 'in') return /half/i.test(type.description || '') ? 'HALF' : /end/i.test(type.description || '') ? `END ${ot || 'Q' + per}` : `${ot || 'Q' + per} ${status.displayClock || ''}`.trim();
  return /postponed/i.test(type.description || '') ? 'PPD' : /cancel/i.test(type.description || '') ? 'CANC' : /tbd/i.test(type.shortDetail || '') ? 'TBD' : timeET(date);
}
// one game off the scoreboard
function gameOf(lg, e) {
  const c = e.competitions?.[0] || {}, st = e.status?.type || c.status?.type || {}, o = c.odds?.[0], side = ha => sideOf(lg, (c.competitors || []).find(x => x.homeAway === ha) || {});
  const ml = s => { const v = o?.moneyline?.[s]?.close?.odds ?? o?.[s + 'TeamOdds']?.moneyLine; return v == null ? null : String(v); };
  return { lg, id: String(e.id), date: e.date, ds: shortDate(e.date), st: st.state || 'pre', det: st.shortDetail || st.description || '', tag: tagOf(st, (e.status || c.status || {}), e.date), a: side('away'), h: side('home'), tv: (c.broadcasts || []).flatMap(b => b.names || []).slice(0, 2).join(', '),
    line: o?.details || '', ou: o?.overUnder ?? null, mlA: ml('away'), mlH: ml('home'), book: o?.provider?.name || '', note: c.headlines?.[0]?.shortLinkText || '' };
}
async function board(lg, ymd) { const sb = await get(`${API(lg)}/scoreboard?dates=${ymd}`, 15); return (sb.events || []).map(e => gameOf(lg, e)); }

async function loadScore({ lg = 'nba', d }) {
  const ymd = /^\d{8}$/.test(d || '') ? d : dayET(0), order = { in: 0, pre: 1, post: 2 };
  const games = (await board(lg, ymd)).sort((x, y) => (order[x.st] ?? 3) - (order[y.st] ?? 3) || Date.parse(x.date) - Date.parse(y.date));
  return { lg, ymd, label: dayLabel(ymd), today: dayET(0), games: games.map(g => ({ id: g.id, date: g.date, st: g.st, det: g.det, tag: g.tag, a: { id: g.a.id, ab: g.a.ab, color: g.a.color, s: g.a.s, win: g.a.win, rec: g.a.rec }, h: { id: g.h.id, ab: g.h.ab, color: g.h.color, s: g.h.s, win: g.h.win, rec: g.h.rec } })) };
}

// the full game: box score, team totals and the win-probability line come from the game's own feed
function gameFromSummary(lg, id, s) {
  const c = s.header?.competitions?.[0] || {}, st = c.status?.type || {}, pc = s.pickcenter?.[0];
  const side = ha => {
    const t = (c.competitors || []).find(x => x.homeAway === ha) || {}, out = sideOf(lg, t), ld = (s.leaders || []).find(x => String(x.team?.id) === String(t.team?.id));
    if (ld) for (const [k, n] of [['pts', 'points'], ['reb', 'rebounds'], ['ast', 'assists']]) { const l = ld.leaders?.find(x => x.name === n || x.name === n + 'PerGame')?.leaders?.[0]; if (l) out[k] = [l.athlete?.shortName || '', (l.displayValue || '').split(' ')[0]]; }
    return out;
  };
  const g = { lg, id: String(id), date: c.date, ds: c.date ? shortDate(c.date) : '', st: st.state || 'pre', det: st.shortDetail || st.description || '', tag: tagOf(st, c.status || {}, c.date), a: side('away'), h: side('home'), tv: (c.broadcasts || []).map(b => b.media?.shortName).filter(Boolean).slice(0, 2).join(', '),
    line: pc?.details || '', ou: pc?.overUnder ?? null, mlA: null, mlH: null, book: pc?.provider?.name || '', note: '' };
  // players: [name, starter, min, pts, reb, ast, stl, blk, fg, 3pt, +/-], most minutes first
  g.box = {}; g.tot = {};
  for (const bp of s.boxscore?.players || []) {
    const key = String(bp.team?.id) === g.a.id ? 'a' : 'h', S = bp.statistics?.[0]; if (!S) continue;
    const at = n => S.names.indexOf(n), v = (x, n) => x.stats?.[at(n)] ?? '';
    g.box[key] = (S.athletes || []).filter(x => !x.didNotPlay && x.stats?.length).map(x => [x.athlete?.shortName || x.athlete?.displayName || '', x.starter ? 1 : 0, v(x, 'MIN'), v(x, 'PTS'), v(x, 'REB'), v(x, 'AST'), v(x, 'STL'), v(x, 'BLK'), v(x, 'FG'), v(x, '3PT'), v(x, '+/-')])
      .sort((p, q) => (num(q[2]) || 0) - (num(p[2]) || 0)).slice(0, 10);
  }
  for (const bt of s.boxscore?.teams || []) {
    const key = String(bt.team?.id) === g.a.id ? 'a' : 'h', v = n => bt.statistics?.find(x => x.name === n)?.displayValue ?? null;
    g.tot[key] = { fg: v('fieldGoalsMade-fieldGoalsAttempted'), fgp: v('fieldGoalPct'), tp: v('threePointFieldGoalsMade-threePointFieldGoalsAttempted'), tpp: v('threePointFieldGoalPct'), ft: v('freeThrowsMade-freeThrowsAttempted'), ftp: v('freeThrowPct'),
      reb: v('totalRebounds'), oreb: v('offensiveRebounds'), ast: v('assists'), stl: v('steals'), blk: v('blocks'), to: v('totalTurnovers') ?? v('turnovers'), paint: v('pointsInPaint'), fast: v('fastBreakPoints'), lead: v('largestLead') };
  }
  // home win probability, thinned to at most 160 points
  const wp = (s.winprobability || []).map(x => x.homeWinPercentage).filter(x => typeof x === 'number');
  if (wp.length > 8) { const step = Math.max(1, wp.length / 160); g.wp = []; for (let k = 0; k < wp.length; k += step) g.wp.push(Math.round(wp[Math.floor(k)] * 1000) / 1000); g.wp.push(Math.round(wp[wp.length - 1] * 1000) / 1000); }
  return g;
}
async function loadGame({ lg = 'nba', id, d, tab = 'score' }) {
  if (tab === 'score' && /^\d{8}$/.test(d || '')) { const g = (await board(lg, d).catch(() => [])).find(x => x.id === String(id)); if (g) return g; }
  return gameFromSummary(lg, id, await get(`${API(lg)}/summary?event=${id}`, 15));
}

/* ---------- teams ---------- */
async function teamGames(t) {
  const sc = await get(`${API(t.lg)}/teams/${t.id}/schedule`, 120);
  const evs = (sc.events || []).map(e => {
    const c = e.competitions?.[0] || {}, me = (c.competitors || []).find(x => String(x.team?.id) === t.id) || {}, op = (c.competitors || []).find(x => x !== me) || {};
    return { id: String(e.id), date: e.date, state: c.status?.type?.state, done: !!c.status?.type?.completed, home: me.homeAway === 'home', win: !!me.winner, my: String(me.score?.displayValue ?? ''), their: String(op.score?.displayValue ?? ''), opp: op.team?.abbreviation || '?', oid: String(op.team?.id || ''), tv: (c.broadcasts || []).map(b => b.media?.shortName).filter(Boolean)[0] || '' };
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { last: evs.filter(e => e.done), next: evs.filter(e => e.state === 'pre') };
}
// the game a "how did they do" question means: that day's game, or today's, or else the last one they finished
export async function teamGame(t, off) {
  const ymd = dayET(off ?? 0), g = (await board(t.lg, ymd)).find(x => x.a.id === t.id || x.h.id === t.id);
  if (g) return { id: g.id, d: ymd };
  if (off != null) return null;
  const { last } = await teamGames(t), e = last[last.length - 1];
  return e ? { id: e.id, d: dayOfET(e.date) } : null;
}
async function loadTeam({ lg = 'nba', id }) {
  const t = teamById(lg, id); if (!t) throw new Say('I don\'t know that team.');
  const [d, g] = await Promise.all([get(`${API(lg)}/teams/${id}`, 120), teamGames(t).catch(() => ({ last: [], next: [] }))]);
  const T = d.team || {}, rec = k => (T.record?.items || []).find(x => x.type === k), stat = n => rec('total')?.stats?.find(s => s.name === n)?.value;
  const slim = e => ({ id: e.id, date: e.date, ds: shortDate(e.date), ts: timeET(e.date), home: e.home, win: e.win, my: e.my, their: e.their, opp: e.opp, oc: teamById(lg, e.oid)?.color || '', tv: e.tv });
  return { lg, id: t.id, ab: t.ab, name: t.full, nick: t.name, color: t.color, rec: rec('total')?.summary || '', home: rec('home')?.summary || '', road: rec('road')?.summary || '', place: T.standingSummary || '', seed: stat('playoffSeed') ?? null, streak: stat('streak') ?? 0,
    ppg: stat('avgPointsFor') ?? null, opp: stat('avgPointsAgainst') ?? null, diff: stat('differential') ?? null, last: g.last.slice(-10).map(slim), next: g.next.slice(0, 8).map(slim) };
}
async function loadInjuries({ lg = 'nba', id }) {
  const t = teamById(lg, id); if (!t) throw new Say('I don\'t know that team.');
  const d = await get(`${API(lg)}/injuries`, 300), list = (d.injuries || []).find(x => String(x.id) === t.id)?.injuries || [];
  return { lg, id: t.id, ab: t.ab, name: t.full, nick: t.name, color: t.color, rows: list.slice(0, 12).map(x => ({ name: x.athlete?.displayName || '', pos: x.athlete?.position?.abbreviation || '', status: x.status || '', what: [x.details?.side, x.details?.type].filter(v => v && v !== 'Not Specified').join(' '), date: x.date || '', back: x.details?.returnDate ? shortDate(x.details.returnDate + 'T17:00:00Z') : '', note: cut(x.shortComment || x.longComment || '', 170) })) };
}

/* ---------- standings ---------- */
async function loadStandings({ lg = 'nba' }) {
  const d = await get(`${API2(lg)}/standings`, 120);
  const groups = (d.children?.length ? d.children : [d]).map(c => ({ name: (c.name || LGS[lg]).replace(/ Conference$/, ''), rows: (c.standings?.entries || []).map(e => {
    const s = n => e.stats?.find(x => x.name === n || x.type === n || x.displayName === n), k = teamById(lg, e.team?.id);
    return { id: String(e.team?.id || ''), ab: e.team?.abbreviation || '?', nick: k?.name || e.team?.name || '', color: k?.color || '', seed: s('playoffSeed')?.value ?? 99, w: s('wins')?.value ?? 0, l: s('losses')?.value ?? 0, pct: s('winPercent')?.displayValue ?? '', gb: s('gamesBehind')?.displayValue ?? '', home: s('Home')?.displayValue ?? '', road: s('Road')?.displayValue ?? '', l10: s('Last Ten Games')?.displayValue ?? s('lasttengames')?.displayValue ?? '', strk: s('streak')?.displayValue ?? '', diff: s('differential')?.displayValue ?? '' };
  }).sort((a, b) => a.seed - b.seed || b.w - a.w) }));
  return { lg, groups };
}

/* ---------- players ---------- */
async function playerCore(lg, id) {
  const [a, st] = await Promise.all([get(`${WEB(lg)}/athletes/${id}`, 300), get(`${WEB(lg)}/athletes/${id}/stats`, 300).catch(() => ({}))]);
  const A = a.athlete || {}, k = teamById(lg, A.team?.id), avg = st.categories?.find(c => c.name === 'averages');
  const at = n => avg?.names?.indexOf(n) ?? -1, pick = row => (row ? Object.fromEntries([['gp', 'gamesPlayed'], ['min', 'avgMinutes'], ['fgp', 'fieldGoalPct'], ['tpp', 'threePointFieldGoalPct'], ['ftp', 'freeThrowPct'], ['reb', 'avgRebounds'], ['ast', 'avgAssists'], ['blk', 'avgBlocks'], ['stl', 'avgSteals'], ['to', 'avgTurnovers'], ['pts', 'avgPoints'], ['tpm', 'avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted']].map(([key, n]) => [key, at(n) < 0 ? '' : key === 'tpm' ? String(row[at(n)] || '').split('-')[0] : row[at(n)] ?? ''])) : null);
  const seasons = (avg?.statistics || []).map(r => ({ yr: r.season?.displayName || '', ab: Object.values(st.teams || {}).find(t => String(t.id) === String(r.teamId))?.abbreviation || '', ...pick(r.stats) }));
  const rank = n => { const s = A.statsSummary?.statistics?.find(x => x.name === n); return s?.rank ? s.rankDisplayValue || '' : ''; };
  return { lg, id: String(id), name: A.displayName || '', pos: A.position?.abbreviation || '', jersey: A.displayJersey || '', tid: String(A.team?.id || ''), ab: A.team?.abbreviation || '', team: A.team?.displayName || '', color: k?.color || A.team?.color || '',
    ht: A.displayHeight || '', wt: A.displayWeight || '', age: A.age || null, from: A.college?.name || '', exp: A.displayExperience || '', draft: A.displayDraft || '', away: A.status && A.status.type !== 'active' ? A.status.name : '', head: A.headshot?.href || '',
    label: (A.statsSummary?.displayName || '').replace(/ stats$/i, ''), now: seasons.length ? seasons[seasons.length - 1] : null, career: pick(avg?.totals), seasons: seasons.slice(-9), ranks: { pts: rank('avgPoints'), reb: rank('avgRebounds'), ast: rank('avgAssists'), fgp: rank('fieldGoalPct') } };
}
async function loadPlayer({ lg = 'nba', id }) {
  const [p, gl] = await Promise.all([playerCore(lg, id), get(`${WEB(lg)}/athletes/${id}/gamelog`, 120).catch(() => ({}))]);
  const at = n => gl.names?.indexOf(n) ?? -1, reg = (gl.seasonTypes || []).find(s => /regular/i.test(s.displayName)) || gl.seasonTypes?.[0];
  const rows = (reg?.categories || []).filter(c => c.type === 'event').flatMap(c => c.events || []).map(ev => {
    const g = gl.events?.[ev.eventId] || {}, v = n => ev.stats?.[at(n)] ?? '';
    return { id: String(ev.eventId), date: g.gameDate || '', ds: g.gameDate ? shortDate(g.gameDate) : '', opp: g.opponent?.abbreviation || '', at: g.atVs || '', res: g.gameResult || '', score: g.score || '', min: v('minutes'), pts: v('points'), reb: v('totalRebounds'), ast: v('assists'), stl: v('steals'), blk: v('blocks'), fg: v('fieldGoalsMade-fieldGoalsAttempted'), tp: v('threePointFieldGoalsMade-threePointFieldGoalsAttempted') };
  }).sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
  p.log = rows.slice(0, 10);
  return p;
}
async function loadCompare({ lg = 'nba', a, b, lb }) { const [A, B] = await Promise.all([playerCore(lg, a), playerCore(lb || lg, b)]); return { lg, a: A, b: B }; }

/* ---------- leaders ---------- */
async function loadLeaders({ lg = 'nba', stat }) {
  const S = STATS.find(s => s[2] === stat) || STATS[0];
  const d = await get(`${WEB(lg)}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=10&sort=${S[1]}.${S[2]}:desc`, 300);
  const k = d.categories?.find(c => c.name === S[1])?.names?.indexOf(S[2]) ?? -1;
  return { lg, stat: S[2], label: S[0], unit: S[3], rows: (d.athletes || []).map(x => { const c = x.categories?.find(q => q.name === S[1]), t = allTeams(lg).find(q => q.id === String(x.athlete?.teamId)) || allTeams(lg).find(q => q.ab === x.athlete?.teamShortName); return { id: String(x.athlete?.id || ''), name: x.athlete?.displayName || '', ab: x.athlete?.teamShortName || t?.ab || '', color: t?.color || '', val: String(c?.totals?.[k] ?? c?.values?.[k] ?? '-') }; }) };
}

/* ---------- sportsbook lines ---------- */
export const MARKETS = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: 'Threes', pra: 'Pts+Reb+Ast', pr: 'Pts+Reb', pa: 'Pts+Ast', ra: 'Reb+Ast', stl: 'Steals', blk: 'Blocks', sb: 'Stl+Blk' };
export const BOOK = { draftkings: 'DK', fanduel: 'FD', espnbet: 'ESPN', betmgm: 'MGM', caesars: 'CZR', fanatics: 'FAN', hardrockbet: 'HR', bet365: '365', bovada: 'BOV', betrivers: 'BR' };
async function loadProps({ id, n }) {
  const d = await get(`${RAW}/odds-data/odds.json?t=${Math.floor(Date.now() / 300e3)}`, 120);
  let ev = null, st = null;
  for (const e of d.events || []) { const k = Object.keys(e.props || {}).find(x => norm(x) === norm(n)); if (k) { ev = e; st = e.props[k]; break; } }
  const rows = st ? Object.keys(MARKETS).filter(k => st[k] && Object.keys(st[k].books || {}).length).map(k => {
    const bs = Object.entries(st[k].books).map(([b, v]) => [BOOK[b] || b.slice(0, 3).toUpperCase(), v.l, v.o ?? null, v.u ?? null]);
    // the line most books agree on, and the friendliest price each way at that line
    const count = {}; for (const b of bs) count[b[1]] = (count[b[1]] || 0) + 1;
    const line = +Object.keys(count).sort((x, y) => count[y] - count[x] || x - y)[0], at = bs.filter(b => b[1] === line), best = col => at.filter(b => Number.isFinite(b[col])).sort((x, y) => y[col] - x[col])[0];
    const o = best(2), u = best(3);
    return { k, label: MARKETS[k], line, o: o ? [o[2], o[0]] : null, u: u ? [u[3], u[0]] : null, books: bs };
  }) : [];
  return { id: String(id || ''), name: n, game: ev ? `${ev.away} @ ${ev.home}` : '', starts: ev?.starts || '', ts: ev?.starts ? timeET(ev.starts) : '', updated: d.updated || '', rows };
}
async function loadOdds({ lg = 'nba', d }) {
  const ymd = /^\d{8}$/.test(d || '') ? d : dayET(0);
  const games = (await board(lg, ymd)).filter(g => g.line || g.ou != null).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  return { lg, ymd, label: dayLabel(ymd), book: games[0]?.book || '', games: games.map(g => ({ id: g.id, date: g.date, st: g.st, det: g.det, tag: g.tag, a: { id: g.a.id, ab: g.a.ab, color: g.a.color }, h: { id: g.h.id, ab: g.h.ab, color: g.h.color }, line: g.line, ou: g.ou, mlA: g.mlA, mlH: g.mlH })) };
}

/* ---------- highlights (no picture: Discord plays the video itself) ---------- */
export async function highlights(lg, t) {
  const d = await get(`${RAW}/yt-data/highlights.json?t=${Math.floor(Date.now() / 600e3)}`, 300);
  let vids;
  if (lg === 'nba') {
    const nick = t && norm(t.name).replace(/ /g, '');
    vids = Object.entries(d.games || {}).filter(([k, v]) => v?.id && (!v.lg || v.lg === 'nba') && (!nick || k.split('|').slice(1).includes(nick))).map(([k, v]) => ({ d: k.slice(0, 8), id: v.id, title: v.title, at: v.at }));
  } else {
    vids = Object.values(d.wnba || {}).filter(v => v?.fgh?.id && (!t || norm(v.fgh.title).includes(norm(t.name)))).map(v => ({ d: v.d, id: v.fgh.id, title: v.fgh.title, at: v.fgh.at }));
  }
  return vids.sort((a, b) => b.d.localeCompare(a.d) || String(b.at).localeCompare(String(a.at)));
}

// Can Cloudflare reach each feed the commands read? (GET /api/discord?check=1; kept for a minute so it can't be used to hammer them)
let checked = null, checkedAt = 0;
export async function check() {
  if (checked && Date.now() - checkedAt < 60e3) return checked;
  const feeds = { scores: `${API('nba')}/scoreboard`, standings: `${API2('nba')}/standings`, player: `${WEB('nba')}/athletes/3975/stats`, gamelog: `${WEB('nba')}/athletes/3975/gamelog`, leaders: `${WEB('nba')}/statistics/byathlete?isqualified=true&page=1&limit=1&sort=offensive.avgPoints:desc`, search: `${SEARCH}?query=curry&limit=1&type=player&sport=basketball`, odds: `${RAW}/odds-data/odds.json`, highlights: `${RAW}/yt-data/highlights.json` };
  const out = {};
  await Promise.all(Object.entries(feeds).map(async ([k, u]) => { const t0 = Date.now(); try { await get(u, 60); out[k] = `ok ${Date.now() - t0} ms`; } catch (e) { out[k] = String(e.message); } }));
  checkedAt = Date.now(); return (checked = out);
}

/* ---------- one way in: a view ({ k: kind, ...settings }) -> its model ---------- */
const LOAD = { score: loadScore, game: loadGame, team: loadTeam, injuries: loadInjuries, standings: loadStandings, player: loadPlayer, compare: loadCompare, leaders: loadLeaders, props: loadProps, odds: loadOdds };
// how long a model may be reused, in seconds (live scores move; a season line doesn't)
const FRESH = { score: 15, game: 15, odds: 60, props: 120, team: 120, standings: 120, injuries: 300, player: 120, compare: 300, leaders: 300 };
// which settings change the data (a tab or a filter only changes how it's shown)
const DATA_KEYS = { score: ['lg', 'd'], game: ['lg', 'id', 'd', 'tab'], team: ['lg', 'id'], injuries: ['lg', 'id'], standings: ['lg'], player: ['lg', 'id'], compare: ['lg', 'a', 'b', 'lb'], leaders: ['lg', 'stat'], props: ['id', 'n'], odds: ['lg', 'd'] };
export const hasModel = k => !!LOAD[k];
const MODELS = new Map();
export async function model(view, store) {
  if (!LOAD[view.k]) throw new Error('unknown view ' + view.k);
  const tabKey = view.k === 'game' ? (view.tab === 'score' || !view.tab ? 'score' : 'full') : '';
  const key = view.k + '|' + DATA_KEYS[view.k].map(n => (n === 'tab' ? tabKey : view[n] ?? '')).join('|') + '|' + Math.floor(Date.now() / (FRESH[view.k] * 1000));
  const hit = MODELS.get(key); if (hit) return hit;
  let m = store ? await store.get(key).catch(() => null) : null;
  if (!m) { m = await LOAD[view.k](view); if (store) store.put(key, m, FRESH[view.k] * 2); }
  MODELS.set(key, m); if (MODELS.size > 40) MODELS.delete(MODELS.keys().next().value);
  return m;
}
