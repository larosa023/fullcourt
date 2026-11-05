/* =====================================================================
   BET DESK — sportsbook player props (DraftKings, via ESPN) next to each
   player's real hit rates, plus game lines. Loads only when opened.
   ===================================================================== */
const CORE = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/${LG}`;
const MARKETS = [
  ['pts', 'Points', 'PTS', 'Total Points', 'points'],
  ['reb', 'Rebounds', 'REB', 'Total Rebounds', 'rebounds'],
  ['ast', 'Assists', 'AST', 'Total Assists', 'assists'],
  ['tpm', 'Threes', '3PM', 'Total 3-Point Field Goals', 'threes'],
  ['pra', 'Pts+Reb+Ast', 'PRA', 'Total Points, Rebounds, and Assists', 'points + rebounds + assists'],
  ['pr', 'Pts+Reb', 'P+R', 'Total Points and Rebounds', 'points + rebounds'],
  ['pa', 'Pts+Ast', 'P+A', 'Total Points and Assists', 'points + assists'],
  ['ra', 'Reb+Ast', 'R+A', 'Total Assists and Rebounds', 'rebounds + assists'],
  ['stl', 'Steals', 'STL', 'Total Steals', 'steals'],
  ['blk', 'Blocks', 'BLK', 'Total Blocks', 'blocks'],
  ['sb', 'Stl+Blk', 'S+B', 'Total Steals and Blocks', 'steals + blocks'],
  // no sportsbook line in the feed for these: Fullcourt sets a line at the player's recent average
  ['fga', 'FG att', 'FGA', null, 'field goals attempted'],
  ['tpa', '3PT att', '3PA', null, 'three pointers attempted'],
  ['fg2', '2PT made', '2PM', null, 'two pointers made'],
  ['fg2a', '2PT att', '2PA', null, 'two pointers attempted'],
  ['q1p', '1Q Pts', '1Q PTS', null, '1st quarter points'],
  ['q1r', '1Q Reb', '1Q REB', null, '1st quarter rebounds'],
  ['q1a', '1Q Ast', '1Q AST', null, '1st quarter assists'],
];
const EST = new Set(['fga', 'tpa', 'fg2', 'fg2a', 'q1p', 'q1r', 'q1a']), Q1 = new Set(['q1p', 'q1r', 'q1a']);
const BD = { q1: new Map(), q1done: new Set(), mk: 'pts', side: 'o', game: 'all', q: '', sort: 'edge', dir: -1, day: 0, tab: 'props', logs: new Map(), lines: new Map(), slates: new Map(), alts: new Map(), books: new Map() };
// your last market, side and sort come back next time
try { const v = JSON.parse(lsGet('fc-bd-view') || 'null'); if (v) Object.assign(BD, { mk: v.mk || BD.mk, side: v.side || BD.side, sort: v.sort || BD.sort, dir: v.dir || BD.dir, radar: !!v.radar, odds: v.odds || null }); } catch (e) {}
// markets can be combined (pts,reb,...); 'all' is every book market
const mkSel = () => BD.mk === 'all' ? null : BD.mk.split(',').filter(k => MARKETS.some(m => m[0] === k));
const mkHas = k => BD.mk === 'all' ? !Q1.has(k) : mkSel().includes(k);
/* ---------- other sportsbooks (SportsGameOdds, refreshed a few times a day by a GitHub job) ---------- */
const ODDS_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/odds-data/odds.json';
const BOOK = { draftkings: ['DK', 'DraftKings'], fanduel: ['FD', 'FanDuel'], espnbet: ['ESPN', 'ESPN BET'], betmgm: ['MGM', 'BetMGM'], caesars: ['CZR', 'Caesars'], fanatics: ['FAN', 'Fanatics'], hardrockbet: ['HR', 'Hard Rock'], bet365: ['365', 'bet365'], bovada: ['BOV', 'Bovada'], unibet: ['UNI', 'Unibet'], pointsbet: ['PB', 'PointsBet'], williamhill: ['WH', 'William Hill'], betrivers: ['BR', 'BetRivers'] };
const bookAb = b => BOOK[b]?.[0] || b.slice(0, 3).toUpperCase(), bookName = b => BOOK[b]?.[1] || b;
const SGO_ABBR = { GSW: 'GS', NYK: 'NY', SAS: 'SA', NOP: 'NO', UTA: 'UTAH', WAS: 'WSH' };
let oddsP = null, oddsAt = 0;
async function loadBooks(games) {
  if (IS_W) return;
  if (!oddsP || Date.now() - oddsAt > 5 * 60e3) { oddsAt = Date.now(); oddsP = getJSON(ODDS_URL + '?t=' + Math.floor(Date.now() / 300e3), { retries: 0, timeout: 10000 }).catch(() => null); }
  const d = await oddsP; if (!d?.events) return;
  BD.booksAt = d.updated;
  const ab = a => SGO_ABBR[a] || a;
  for (const e of d.events) {
    const g = games.find(x => x.home.abbr === ab(e.home) && x.away.abbr === ab(e.away) && Math.abs(new Date(x.date) - new Date(e.starts)) < 18 * 3600e3);
    if (!g) continue;
    for (const [name, st] of Object.entries(e.props || {})) for (const [k, v] of Object.entries(st)) BD.books.set(g.id + '|' + nameKey(name) + '|' + k, v.books);
  }
}
const booksOf = x => BD.books.get(x.g.id + '|' + nameKey(x.p.name) + '|' + x.k) || null;
// every price we have for this prop: DraftKings (ESPN feed) plus the other books
function pricesOf(x) {
  const out = [];
  if (!x.est && !x.alt && !x.fromBook && Number.isFinite(x.line)) out.push({ b: 'draftkings', l: x.line, o: +x.over, u: +x.under });
  for (const [b, v] of Object.entries(booksOf(x) || {})) if (b !== 'draftkings' || !out.length) out.push({ b, l: v.l, o: v.o, u: v.u });
  return out.filter(p => Number.isFinite(p.l));
}
// best for the side shown: the friendlier line first (lower for overs, higher for unders), then the better price
function bestOf(x, side = BD.side) {
  const P = pricesOf(x).filter(p => Number.isFinite(side === 'u' ? p.u : p.o)); if (P.length < 2) return null;
  const pr = p => side === 'u' ? p.u : p.o, dec = o => o > 0 ? 1 + o / 100 : 1 + 100 / -o;
  P.sort((a, b) => (side === 'u' ? b.l - a.l : a.l - b.l) || dec(pr(b)) - dec(pr(a)));
  return { ...P[0], price: pr(P[0]) };
}

// odds filter: American odds on one line from -1500 to +1500 with even money in the middle
const oddsPos = o => o <= -100 ? o + 100 : o >= 100 ? o - 100 : 0;
const posOdds = p => p < 0 ? p - 100 : p > 0 ? p + 100 : 100;
const oddsTxt = o => o == null ? '' : o >= 100 ? '+' + o : String(o);
const inOdds = o => { if (!BD.odds) return true; const n = +o; if (!Number.isFinite(n) || !n) return false; const p = oddsPos(n); return (BD.odds.min == null || p >= oddsPos(BD.odds.min)) && (BD.odds.max == null || p <= oddsPos(BD.odds.max)); };
const mkQ1 = () => (mkSel() || []).some(k => Q1.has(k));
const saveView = () => lsSet('fc-bd-view', JSON.stringify({ mk: BD.mk, side: BD.side, sort: BD.sort, dir: BD.dir, radar: BD.radar, odds: BD.odds }));
const readStars = () => { try { return JSON.parse(lsGet('fc-bd-stars') || '{}') || {}; } catch (e) { return {}; } };
const writeStars = o => lsSet('fc-bd-stars', Object.keys(o).length ? JSON.stringify(o) : null);
const MILES = { 'Points Milestones': 'pts', 'Rebounds Milestones': 'reb', 'Assists Milestones': 'ast', '3-Point Field Goals Milestones': 'tpm', 'Points + Assists + Rebounds Milestones': 'pra', 'Points + Rebounds Milestones': 'pr', 'Points + Assists Milestones': 'pa', 'Rebounds + Assists Milestones': 'ra', 'Steals Milestones': 'stl', 'Blocks Milestones': 'blk' };
const bdVal = (g, k) => Q1.has(k) ? BD.q1.get(String(g.id))?.get(String(g._pid))?.[k] : k === 'fga' ? g.fg[1] : k === 'tpa' ? g.tp[1] : k === 'fg2' ? g.fg[0] - g.tp[0] : k === 'fg2a' ? g.fg[1] - g.tp[1] : k === 'pra' ? g.pts + g.reb + g.ast : k === 'pr' ? g.pts + g.reb : k === 'pa' ? g.pts + g.ast : k === 'ra' ? g.reb + g.ast : k === 'sb' ? g.stl + g.blk : k === 'tpm' ? g.tp[0] : g[k];
const amer = v => { const n = +v; return Number.isFinite(n) ? (n > 0 ? '+' + n : String(n)) : '–'; };

async function bdSlate(offset) {
  // kept 90 seconds so game states (and which games are left) stay current
  const c = BD.slates.get(offset); if (c && Date.now() - c.t < 90e3) return c;
  // "Next up": today until every game is final, then the next day with games.
  // "Tomorrow": the day after whatever Next up shows, so the two never repeat
  let d, games;
  if (offset === 0) {
    d = S.today; games = await scoreboardOn(d).catch(() => []);
    for (let i = 0; i < 4 && (!games.length || games.every(g => g.state === 'post')); i++) { d = addDays(d, 1); games = await scoreboardOn(d).catch(() => []); }
  } else {
    const first = await bdSlate(0);
    d = addDays(first.date, 1); games = await scoreboardOn(d).catch(() => []);
    for (let i = 0; i < 3 && !games.length; i++) { d = addDays(d, 1); games = await scoreboardOn(d).catch(() => []); }
  }
  const out = { date: d, games, t: Date.now() };
  BD.slates.set(offset, out);
  return out;
}
// one game's props: Total X markets come as an over/under pair (over first)
async function gameProps(g) {
  if (BD.lines.has(g.id) && Date.now() - BD.lines.get(g.id).t < 5 * 60e3) return BD.lines.get(g.id).rows;
  const url = id => `${CORE}/events/${g.id}/competitions/${g.id}/odds/${id}/propBets?lang=en&region=us&limit=1000`;
  let d = await getJSON(url(100), { retries: 0, timeout: 15000 }).catch(() => null);
  if (!d?.items?.length) {
    // not DraftKings? find whichever book ESPN has props from
    const o = await getJSON(`${CORE}/events/${g.id}/competitions/${g.id}/odds?lang=en&region=us`, { retries: 0, timeout: 12000 }).catch(() => null);
    const ref = o?.items?.find(i => i.propBets?.$ref)?.propBets?.$ref;
    if (ref) d = await getJSON(ref.replace(/^http:/, 'https:') + '&limit=1000', { retries: 0, timeout: 15000 }).catch(() => null);
  }
  const by = new Map(), ladders = new Map();
  for (const it of d?.items || []) {
    const pid = (it.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1]; if (!pid) continue;
    const mi = MILES[it.type?.name];
    if (mi) {
      // the feed can hold more than one ladder under the same name (a partial-game one too), each listed in
      // ascending order: start a new ladder whenever the target stops climbing
      const t = +(it.current?.target?.value ?? parseFloat(it.odds?.total?.value)); if (!Number.isFinite(t)) continue;
      const k = pid + '|' + mi, L = ladders.get(k) || [[]], cur = L.at(-1);
      if (cur.length && t <= cur.at(-1).t) L.push([{ t, o: +it.odds?.american?.value }]); else cur.push({ t, o: +it.odds?.american?.value });
      ladders.set(k, L); continue;
    }
    const mk = MARKETS.find(m => m[3] === it.type?.name); if (!mk) continue;
    const key = pid + '|' + mk[0];
    const e = by.get(key) || { pid, k: mk[0], gid: g.id, odds: [], line: null, open: null };
    e.odds.push(it.odds?.american?.value);
    e.line = +(it.current?.target?.value ?? it.odds?.total?.value);
    e.open = +(it.open?.target?.value ?? it.odds?.total?.open ?? e.line);
    by.set(key, e);
  }
  const rows = [...by.values()].filter(e => Number.isFinite(e.line)).map(e => ({ ...e, over: e.odds[0], under: e.odds[1] }));
  // keep the full-game ladder: the one whose rung at the main line is priced like the main over
  const imp = o => o > 0 ? 100 / (o + 100) : -o / (-o + 100);
  for (const [k, L] of ladders) {
    const main = rows.find(r => r.pid + '|' + r.k === k), t = main ? Math.floor(main.line) + 1 : null, ov = main ? +main.over : NaN;
    const withT = t != null && Number.isFinite(ov) ? L.filter(l => l.some(x => x.t === t)) : [];
    const best = withT.length ? withT.sort((a, b) => Math.abs(imp(a.find(x => x.t === t).o) - imp(ov)) - Math.abs(imp(b.find(x => x.t === t).o) - imp(ov)))[0]
      : [...L].sort((a, b) => b.at(-1).t - a.at(-1).t || b.length - a.length)[0];
    if (best?.length) BD.alts.set(k, best.filter(x => Number.isFinite(x.o)));
  }
  BD.lines.set(g.id, { t: Date.now(), rows });
  return rows;
}
async function prevOf(pid, yr) {
  const k = pid + '@' + yr; if (BD.logs.has(k)) return BD.logs.get(k);
  const p = gameLog(pid, yr).then(l => l.filter(x => x.min > 0)).catch(() => []); BD.logs.set(k, p); return p;
}
async function logOf(pid) {
  if (BD.logs.has(pid)) return BD.logs.get(pid);
  const p = gameLog(pid).then(l => l.filter(x => x.min > 0)).catch(() => []);
  BD.logs.set(pid, p);
  return p;
}
function defRankOf(teamId) {
  const all = (S.standings?.confs || []).flatMap(c => c.rows).filter(r => parseFloat(r.opp));
  const s = [...all].sort((a, b) => parseFloat(a.opp) - parseFloat(b.opp));
  const i = s.findIndex(r => r.id === teamId);
  return i < 0 ? null : i + 1;
}
const bdPct = (vals, line, side) => vals.length ? vals.filter(v => side === 'u' ? v < line : v > line).length / vals.length : null;
function rowStats(r, side = BD.side) {
  const lg = (r.log || []).map(g => ({ ...g, _pid: r.pid })).filter(g => bdVal(g, r.k) != null);
  const vals = lg.map(g => bdVal(g, r.k));
  // last season's games fill out L5 / L10 / H2H early in a season (same as the prop breakdown); Season stays this season
  const pg = (r.prevLog || []).map(g => ({ ...g, _pid: r.pid })).filter(g => bdVal(g, r.k) != null);
  const ext = [...vals, ...pg.map(g => bdVal(g, r.k))];
  const vsOpp = [...lg, ...pg].filter(g => g.opp === r.opp.abbr || String(g.oppId) === String(r.opp.id)).map(g => bdVal(g, r.k));
  if (r.est) {
    // no book line: Fullcourt's. Early in a season a handful of games swing it, so lean on last season too:
    // his recent average blended with last season's, averaged with the median of his last 15 games
    if (!vals.length) return null;
    const pv = (r.prevLog || []).map(g => bdVal({ ...g, _pid: r.pid }, r.k)).filter(v => v != null);
    const cur = vals.slice(0, 10), mCur = cur.reduce((a, b) => a + b, 0) / cur.length;
    const w = pv.length >= 10 ? Math.max(0, 10 - cur.length) : 0, mPrev = pv.length ? pv.reduce((a, b) => a + b, 0) / pv.length : 0;
    const blend = (cur.length * mCur + w * mPrev) / (cur.length + w);
    const L15 = [...vals, ...pv].slice(0, 15).sort((a, b) => a - b), med = L15.length % 2 ? L15[L15.length >> 1] : (L15[L15.length / 2 - 1] + L15[L15.length / 2]) / 2;
    r.line = Math.max(0.5, Math.floor((blend + med) / 2) + 0.5);
  }
  const L5 = ext.slice(0, 5), L10 = ext.slice(0, 10), avg = L10.length ? L10.reduce((a, b) => a + b, 0) / L10.length : null;
  const s = side;
  const h5 = bdPct(L5, r.line, s), h10 = bdPct(L10, r.line, s), hs = bdPct(vals, r.line, s), hv = bdPct(vsOpp, r.line, s);
  const diff = avg == null ? null : (s === 'u' ? r.line - avg : avg - r.line);
  // edge: mostly how often it's cashed lately, nudged by how far the average sits from the line
  const edge = h10 == null ? null : h10 * 0.55 + (h5 ?? h10) * 0.25 + (hs ?? h10) * 0.2 + Math.max(-0.15, Math.min(0.15, (diff || 0) / Math.max(2, r.line) * 0.6));
  let streak = 0; for (const v of ext) { if (s === 'u' ? v < r.line : v > r.line) streak++; else break; }
  return { vals, L5, L10, h5, h10, hs, hv, nv: vsOpp.length, avg, diff, edge, streak };
}
// defense vs position, from the game logs already loaded: how far players at this position run above or below
// their own average when they face this team, for this stat
const posGroup = p => /C/.test(p || '') && !/G/.test(p || '') ? 'C' : /G/.test(p || '') ? 'G' : 'F';
function dvpTable(k) {
  const key = k + '|' + BD.logN;
  if ((BD.dvpC ||= new Map()).has(key)) return BD.dvpC.get(key);
  const agg = new Map(), seen = new Set();
  for (const x of BD.all || []) {
    if (!x.log?.length || seen.has(x.pid) || Q1.has(k)) continue;
    seen.add(x.pid);
    const vals = x.log.map(g => bdVal(g, k)).filter(v => v != null); if (vals.length < 3) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length, grp = posGroup(x.p.pos);
    for (const g of x.log) { const v = bdVal(g, k); if (v == null) continue; const kk = g.opp + '|' + grp; const a = agg.get(kk) || { s: 0, n: 0 }; a.s += v - mean; a.n++; agg.set(kk, a); }
  }
  if (BD.dvpC.size > 40) BD.dvpC.clear();
  BD.dvpC.set(key, agg);
  return agg;
}
const dvpOf = x => { const a = dvpTable(x.k).get(x.opp.abbr + '|' + posGroup(x.p.pos)); return a && a.n >= 3 ? { v: a.s / a.n, n: a.n } : null; };
function flagsOf(x) {
  const f = [];
  const L = x.log || [];
  if (L.length >= 5) { const m3 = (L[0].min + L[1].min + L[2].min) / 3, ms = L.reduce((a, g) => a + g.min, 0) / L.length; if (m3 - ms >= 4) f.push(['up', `MIN ↑ ${Math.round(m3)}`]); else if (ms - m3 >= 4) f.push(['dn', `MIN ↓ ${Math.round(m3)}`]); }
  const out = (BD.outByTeam?.get(String(x.p.teamId)) || []).filter(n => n.id !== String(x.p.id));
  if (out.length) f.push(['out', `${out[0].last} out${out.length > 1 ? ` +${out.length - 1}` : ''}`]);
  const rs = BD.rest?.get(String(x.p.teamId));
  if (rs?.b2b) f.push(['dn', 'B2B']); else if (rs?.three4) f.push(['dn', '3 in 4']);
  const pc = paceOf(BD.pbpT, x.g.home.abbr, x.g.away.abbr);
  if (pc && Math.abs(pc.diff) >= 2) f.push([pc.diff > 0 ? 'up' : 'dn', pc.diff > 0 ? 'Fast pace' : 'Slow pace']);
  const sp = Math.abs(parseFloat(x.g.odds?.home?.spread));
  if (sp >= 10 && (x.p.min || 0) >= 26) f.push(['dn', 'Blowout risk']);
  return f;
}
// under the radar: role players (under 15 a game) whose minutes are climbing
function radarOf(x) {
  const L = x.log || []; if (L.length < 4 || !(x.p.pts < 15)) return null;
  const m3 = (L[0].min + L[1].min + L[2].min) / 3, ms = L.reduce((a, g) => a + g.min, 0) / L.length;
  return m3 - ms >= 2 ? m3 - ms : null;
}
// live props: his stat right now and where he's pacing, from the game's box score
BD.live = new Map(); BD.liveFin = new Set();
const liveVal = (b, k) => ({ pts: b.pts, reb: b.reb, ast: b.ast, tpm: b.tpm, tpa: b.tpa, fga: b.fga, fg2: b.fgm - b.tpm, fg2a: b.fga - b.tpa, pra: b.pts + b.reb + b.ast, pr: b.pts + b.reb, pa: b.pts + b.ast, ra: b.reb + b.ast })[k];
async function refreshLive() {
  const ids = [...new Set((BD.all || []).filter(x => Date.parse(x.g.date) <= Date.now() + 60e3 && !BD.liveFin.has(x.g.id)).map(x => x.g.id))];
  if (!ids.length) return false;
  const m = await lazy('bets');
  let changed = false;
  await Promise.all(ids.map(async id => {
    try {
      const d = await summaryCached(id, 20000), g = m.gameState(d); if (!g || g.state === 'pre') return;
      BD.live.set(id, { d, g, frac: m.gameFrac(g), box: pid => m.boxStats(d, pid) }); changed = true;
      if (g.state === 'post') BD.liveFin.add(id);
    } catch (e) {}
  }));
  return changed;
}
function liveOf(x) {
  const L = BD.live.get(x.g.id); if (!L || Q1.has(x.k)) return null;
  const b = L.box(x.pid); if (!b || b.dnp) return { label: L.g.label, none: true, fin: L.g.state === 'post' };
  const v = liveVal(b, x.k); if (v == null) return null;
  const fin = L.g.state === 'post', pace = !fin && L.frac > 0.12 ? Math.round(v / L.frac) : null, over = BD.side !== 'u';
  const hit = over ? v > x.line : fin && v < x.line, dead = over ? fin && v <= x.line : v >= x.line;
  const good = hit || (!dead && pace != null && (over ? pace > x.line : pace < x.line));
  return { v, pace, fin, hit, dead, good, label: L.g.label, min: b.min };
}
setInterval(async () => {
  if (document.hidden || S.view !== 'bets' || BD.tab !== 'props' || !BD.all) return;
  if (await refreshLive()) bdTable($('#bdMain'), true);
}, 30e3);
const pill = (p, n) => p == null ? '<span class="bd-pill na">–</span>' : `<span class="bd-pill ${p >= 0.7 ? 'hot' : p >= 0.55 ? 'warm' : p <= 0.3 ? 'cold' : ''}" title="${Math.round(p * (n || 0))}/${n || 0}">${Math.round(p * 100)}%</span>`;

async function renderBetDesk() {
  const body = $('#bdBody'); if (!body) return;
  if (IS_W) { body.innerHTML = `<div class="empty"><b>Bet desk is NBA only for now</b>Sportsbook props come back when the WNBA season starts.</div>`; return; }
  if (!body.dataset.wired) bdWire(body);
  drawSlip();
  body.innerHTML = `${bdShell()}<div id="bdMain"><div class="sk" style="height:60px;margin-bottom:10px"></div><div class="sk" style="height:520px"></div></div>`;
  await Promise.all([leagueTable(), loadStandings().catch(() => {})]).catch(() => {});
  bdDraw();
}
function bdShell() {
  return `<div class="bd-top">
    <div class="seg bd-seg" data-bdtab><span class="knob"></span><button data-bdt="props" aria-pressed="${BD.tab === 'props'}">Props</button><button data-bdt="games" aria-pressed="${BD.tab === 'games'}">Game lines</button><button data-bdt="mine" aria-pressed="${BD.tab === 'mine'}">My bets</button></div>
    <button class="chip sm bd-priv" data-bdpriv ${BD.tab === 'mine' || BD.tab === 'record' ? '' : 'hidden'}></button>
    <div class="bd-days"><button class="chip sm" data-bdday="0" aria-pressed="${BD.day === 0}">Next up</button><button class="chip sm" data-bdday="1" aria-pressed="${BD.day === 1}">Tomorrow</button></div>
  </div>`;
}
// hide your numbers for screen sharing: blurs My bets and Record until you show them again
const privOn = () => lsGet('fc-bd-priv') === '1';
function privApply() {
  const on = privOn(), b = $('[data-bdpriv]'), tab = BD.tab === 'mine' || BD.tab === 'record';
  if (b) { b.hidden = !tab; b.setAttribute('aria-pressed', on); b.innerHTML = `${on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.4 6.4C3.9 8.1 2.5 12 2.5 12s3.5 7 9.5 7a9.7 9.7 0 0 0 5.6-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'}<span>${on ? 'Show' : 'Hide'}</span>`; b.title = on ? 'Show your numbers' : 'Blur your numbers (for screen sharing)'; }
  $('#bdMain')?.classList.toggle('bd-blur', on && tab);
}
function tabChrome(slate) {
  const hist = BD.tab === 'mine' || BD.tab === 'record';
  $('#bdEyebrow').textContent = `${{ props: 'Player props', games: 'Game lines', mine: 'Your bets', record: "Fullcourt's record" }[BD.tab]} · ${hist ? 'All time' : slate.date === S.today ? 'Today' : fmtDay(slate.date, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  $('.bd-days')?.toggleAttribute('hidden', hist);
  // label the second day by what it really is (it's not "tomorrow" once tonight's slate is done)
  bdSlate(1).then(s1 => { const b = $('[data-bdday="1"]'); if (b) b.textContent = s1.date === addDays(S.today, 1) ? 'Tomorrow' : fmtDay(s1.date, { weekday: 'long' }); }).catch(() => {});
  privApply();
}
let drawN = 0;
async function bdDraw() {
  const n = ++drawN, main = $('#bdMain'), day = BD.day; if (!main) return;
  placeKnob($('[data-bdtab]'));
  // switching days: paint the last build for that day right away, before anything is fetched
  const early = BD.tab === 'props' && BD.dayCache?.get('o' + day);
  if (early) { Object.assign(BD, { all: early.list, missing: early.missing, missingIds: early.missingIds, allDay: BD.day, allDone: true }); tabChrome(early.slate); bdTable(main); }
  const slate = await bdSlate(BD.day);
  if (n !== drawN) return;
  const games = slate.games.filter(g => g.state !== 'post');
  tabChrome(slate);

  if (BD.tab === 'mine') { const sk = setTimeout(() => { if (n === drawN) main.innerHTML = '<div class="sk" style="height:300px"></div>'; }, 150); const m = await lazy('bets'); const html = await m.historyHTML(); clearTimeout(sk); if (n === drawN) main.innerHTML = html; return; }
  if (BD.tab === 'record') return drawRecord(main, n);
  if (!games.length) { main.innerHTML = `<div class="empty"><b>No games left on this slate</b>Try tomorrow.</div>`; return; }
  if (BD.tab === 'games') return drawGames(main, games);
  // props: show the last build for this day at once; rebuild quietly if it's more than 4 minutes old
  const dc = (BD.dayCache ||= new Map()).get('o' + day); if (dc && dc.slate.date !== slate.date) BD.dayCache.delete('o' + day);
  if (dc && dc.slate.date === slate.date) {
    if (!early) { Object.assign(BD, { all: dc.list, missing: dc.missing, missingIds: dc.missingIds, allDay: BD.day, allDone: true }); bdTable(main); }
    if (Date.now() - dc.t < 4 * 60e3) return;
  }
  if (!dc) main.innerHTML = `<div class="sk" style="height:520px"></div>`;
  // start everything at once instead of one after another
  const injP = leagueInjuries().catch(() => null), booksP = loadBooks(games).catch(() => {});
  const [rows, per] = await Promise.all([leagueTable(), Promise.all(games.map(g => gameProps(g).catch(() => [])))]);
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const applyInj = inj => { try {
    BD.outByTeam = new Map();
    for (const e of inj?.injuries || inj?.teams || []) for (const x of (e.injuries || []).map(normInjury)) {
      if (!/^out/i.test(x.status)) continue; const r = rows.find(y => String(y.id) === String(x.id)); if (!r || r.pts < 15) continue;
      const t = String(r.teamId); if (!BD.outByTeam.has(t)) BD.outByTeam.set(t, []); BD.outByTeam.get(t).push({ id: String(r.id), last: r.last || r.name.split(' ').slice(-1)[0] });
    }
  } catch (e) {} };
  // rest, pace and blowout flags
  BD.missing = games.filter((g, i) => !per[i].length).map(g => `${g.away.abbr} @ ${g.home.abbr}`);
  BD.missingIds = new Set(games.filter((g, i) => !per[i].length).map(g => g.id));
  (BD.missingIdsFor ||= {})[slate.date] = [...BD.missingIds];
  const all = per.flat();
  if (n !== drawN) return;
  const games2 = new Map(games.map(g => [g.id, g]));
  const unknown = [...new Set(all.map(e => String(e.pid)).filter(id => !byId.has(id)))];
  await poolRun(unknown, 10, async id => {
    if (BD.ath?.has(id)) { byId.set(id, BD.ath.get(id)); return; }
    const a = await getJSON(`${CORE}/athletes/${id}?lang=en&region=us`, { retries: 0, timeout: 8000 }).catch(() => null);
    if (!a?.displayName) return;
    const tid = String(a.team?.$ref || '').match(/teams\/(\d+)/)?.[1];
    const t = tid && S.teams[tid];
    const p = { id, name: a.displayName, short: a.shortName || a.displayName, last: a.lastName || '', teamId: tid, abbr: t?.abbr || '', pos: a.position?.abbreviation || '', gp: 0 };
    (BD.ath = BD.ath || new Map()).set(id, p); byId.set(id, p);
  });
  if (n !== drawN) return;
  const list = all.map(e => {
    const p = byId.get(String(e.pid)); if (!p) return null;
    const g = games2.get(e.gid); if (!g) return null;
    const home = g.home.id === p.teamId, opp = home ? g.away : g.home;
    return { ...e, p, g, opp, at: home ? 'vs' : '@' };
  }).filter(Boolean);
  // Fullcourt-line markets: every rotation player on the slate
  const seen = new Set(list.map(x => String(x.pid)));
  for (const g of games) for (const side of [g.home, g.away]) {
    const opp = side === g.home ? g.away : g.home;
    for (const p of rows.filter(r => r.teamId === side.id && r.gp >= 2 && (r.min || 0) >= 18)) {
      // games the books haven't posted yet get Fullcourt lines in every market, so every game shows up
      const noBook = BD.missingIds?.has(g.id);
      for (const k of [...EST, ...(noBook ? MARKETS.filter(m => m[3]).map(m => m[0]) : [])]) list.push({ pid: String(p.id), k, gid: g.id, line: null, est: true, p, g, opp, at: side === g.home ? 'vs' : '@' });
      seen.add(String(p.id));
    }
  }
  // other books: when DraftKings hasn't posted (or the market is one ESPN doesn't carry), use a real line from another book
  await booksP;
  for (const x of list) {
    if (!x.est || Q1.has(x.k)) continue;
    const bk = booksOf(x); if (!bk) continue;
    const b = ['fanduel', 'espnbet', 'betmgm', 'caesars', ...Object.keys(bk)].find(n => bk[n]); const v = bk[b];
    Object.assign(x, { est: false, fromBook: b, line: v.l, over: v.o, under: v.u, open: null });
  }
  if (n !== drawN) return;
  BD.all = list; BD.allDay = BD.day; BD.allDone = false;
  // cache right away: the rows keep filling in (logs) even if the user switches days mid-load
  { const mi = new Set(BD.missingIdsFor?.[slate.date] || []); BD.dayCache.set('o' + day, { list, slate, missing: slate.games.filter(g => mi.has(g.id)).map(g => `${g.away.abbr} @ ${g.home.abbr}`), missingIds: mi, t: Date.now() }); }
  bdTable(main, !!dc);
  // injuries, rest and pace flags fill in when they land; they don't hold up the table
  let late = null; const lateDraw = () => { clearTimeout(late); late = setTimeout(() => { if (n === drawN && BD.tab === 'props' && BD.all === list) bdTable(main, true, false, true); }, 150); };
  injP.then(inj => { if (inj) { applyInj(inj); lateDraw(); } });
  // rest flags need every team's schedule (30 requests), so they start only after the table is up
  const restP = Promise.all([poolAll(games.flatMap(g => [g.home.id, g.away.id]), 6, async t => [String(t), await restOf(t, slate.date)]), pbpTeams()]).catch(() => null);
  restP.then(r => { if (r) { BD.rest = new Map(r[0]); BD.pbpT = r[1]; lateDraw(); } });
  // fill hit rates as each player's games arrive (players in the shown market first)
  const order = [...new Set([...list.filter(x => mkHas(x.k)), ...list].map(x => String(x.pid)))];
  let done = 0, pending = null;
  const refresh = () => { if (pending) return; pending = setTimeout(() => { pending = null; if (n === drawN && BD.tab === 'props') bdTable(main, true, false, true); }, 900); };
  const seasonYr = (() => { const n = new Date(); return n.getFullYear() + (n.getMonth() >= 7 ? 1 : 0); })();
  await poolRun(order, 10, async pid => { const log = await logOf(pid);
    const needPrev = log.length < 10;
    const prev = needPrev ? await prevOf(pid, seasonYr - 1) : null;
    list.forEach(x => { if (String(x.pid) === pid) { x.log = log; if (prev) x.prevLog = prev; } }); done++; BD.logN = done; refresh(); });
  if (n === drawN && BD.tab === 'props') bdTable(main, true, true, true);
  if (BD.all === list) BD.allDone = true;
  { const mi = new Set(BD.missingIdsFor?.[slate.date] || []), gs = slate.games.filter(g => mi.has(g.id));
    BD.dayCache.set('o' + day, { list, slate, missing: gs.map(g => `${g.away.abbr} @ ${g.home.abbr}`), missingIds: mi, t: Date.now() }); }
  // warm the other day in the background so switching is quick
  if (n === drawN) setTimeout(() => warmDay(day === 0 ? 1 : 0, rows), 1200);
  refreshLive().then(c => { if (c && BD.all === list && BD.tab === 'props' && n === drawN) bdTable(main, true, false, true); });
  checkStars(list);
  if (mkQ1()) loadQ1(games, n, main);
}
// like Promise.all over items, but only `k` running at once
async function poolAll(items, k, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]); } })); return out; }
async function warmDay(off, rows) {
  try {
    const sl = await bdSlate(off); const gs = sl.games.filter(g => g.state !== 'post'); if (!gs.length) return;
    await Promise.all(gs.map(g => gameProps(g).catch(() => [])));
    const ids = new Set(gs.flatMap(g => [g.home.id, g.away.id]));
    const pids = rows.filter(r => ids.has(r.teamId) && r.gp >= 2 && (r.min || 0) >= 18).map(r => String(r.id));
    await poolRun(pids, 3, pid => logOf(pid));
  } catch (e) {}
}
// first-quarter numbers come from play-by-play: each team's last 5 games
async function loadQ1(games, n, main) {
  const teams = [...new Set(games.flatMap(g => [g.home.id, g.away.id]))];
  const ids = new Set();
  await Promise.all(teams.map(async t => {
    try {
      const d = await scheduleOf(t);
      (d.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed).slice(-5).forEach(e => ids.add(String(e.id)));
    } catch (e) {}
  }));
  const todo = [...ids].filter(id => !BD.q1done.has(id));
  if (!todo.length) return;
  BD.q1busy = true; if (n === drawN) bdTable(main, true);
  await poolRun(todo, 5, async id => {
    const d = await summaryCached(id, 3600e3);
    const m = new Map(), add = (pid, k, v) => { if (!pid) return; const o = m.get(String(pid)) || { q1p: 0, q1r: 0, q1a: 0 }; o[k] += v; m.set(String(pid), o); };
    for (const pl of d.plays || []) {
      if (pl.period?.number !== 1) continue;
      const who = (pl.participants || []).map(a => a.athlete?.id);
      if (pl.scoringPlay && pl.scoreValue) { add(who[0], 'q1p', +pl.scoreValue); if (who[1] && /assist/i.test(pl.text || '')) add(who[1], 'q1a', 1); }
      else if (/rebound/i.test(pl.type?.text || '') && who[0]) add(who[0], 'q1r', 1);
    }
    // everyone who played gets a row, zeros included
    for (const T of d.boxscore?.players || []) for (const a of T.statistics?.[0]?.athletes || []) if (a.stats?.length && !m.has(String(a.athlete.id))) m.set(String(a.athlete.id), { q1p: 0, q1r: 0, q1a: 0 });
    BD.q1.set(id, m); BD.q1done.add(id);
  });
  BD.q1busy = false;
  if (n === drawN && mkQ1()) bdTable(main, true);
}
async function poolRun(items, k, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) {} } })); }

function bdTable(main, keepScroll, final, soft) {
  if (BD.mk !== 'all' && !mkSel().length) BD.mk = 'pts';
  const SEL = mkSel(), ALL = !SEL || SEL.length > 1; // ALL: show the Market column
  let list = (BD.all || []).filter(x => mkHas(x.k) && (BD.game === 'all' || x.gid === BD.game) && (!BD.q || nameKey(x.p.name).includes(nameKey(BD.q))));
  list.forEach(x => { x.st = x.log && (!Q1.has(x.k) || BD.q1.size) ? rowStats(x) : null; });
  list = list.filter(x => !x.est || !x.log || x.st || (Q1.has(x.k) && (BD.q1busy || !BD.q1.size))); // estimated rows with no games drop out
  if (BD.radar) list = list.filter(x => !x.log || radarOf(x) != null);
  if (BD.odds) {
    // only lines priced inside the range; overs also bring in DraftKings' alt lines at those prices
    const sd = BD.odds.side, alts = [];
    if (sd !== 'u' && BD.side === 'o') for (const x of list) { if (x.est || Q1.has(x.k)) continue; for (const a of BD.alts.get(x.pid + '|' + x.k) || []) if (a.t - 0.5 !== x.line && inOdds(a.o)) { const y = { ...x, line: a.t - 0.5, over: a.o, under: null, alt: true, open: null }; y.st = y.log ? rowStats(y) : null; alts.push(y); } }
    // Fullcourt-estimated lines have no price to judge, so they stay (otherwise FGA, 3PA and 2PT markets vanish)
    list = list.filter(x => x.est || (sd === 'o' ? inOdds(x.over) : sd === 'u' ? inOdds(x.under) : inOdds(x.over) || inOdds(x.under))).concat(alts);
  }
  BD.shown = list;
  const stars = readStars(), starred = x => !!stars[x.pid + '|' + x.k];
  const key = { best: x => { const b = bestOf(x); return b ? (b.price > 0 ? 1 + b.price / 100 : 1 + 100 / -b.price) - (BD.side === 'u' ? -b.l : b.l) * 0.001 : null; }, dvp: x => dvpOf(x)?.v * (BD.side === 'u' ? -1 : 1), mk: x => MARKETS.findIndex(q => q[0] === x.k), edge: x => x.st?.edge, line: x => x.line, h5: x => x.st?.h5, h10: x => x.st?.h10, hs: x => x.st?.hs, hv: x => x.st?.hv, avg: x => x.st?.avg, diff: x => x.st?.diff, odds: x => +(BD.side === 'u' ? x.under : x.over), def: x => defRankOf(x.opp.id), name: x => x.p.name }[BD.sort];
  list.sort((a, b) => { const sa = starred(a), sb = starred(b); if (sa !== sb) return sa ? -1 : 1; const A = key(a), B = key(b); if (A == null && B == null) return b.line - a.line; if (A == null) return 1; if (B == null) return -1; return (A > B ? 1 : A < B ? -1 : 0) * BD.dir; });
  const games = [...new Map((BD.all || []).map(x => [x.gid, x.g])).values()];
  const loading = list.some(x => !x.log) || (mkQ1() && BD.q1busy);
  const total = list.length;
  // only build the top rows (sorted over everything); a full slate is 1,000+ rows and drawing them all is what made the desk heavy
  const lim = BD.limit || 80, full = list; list = list.slice(0, lim);
  const mk = SEL?.length === 1 ? MARKETS.find(m => m[0] === SEL[0]) : [null, SEL ? SEL.map(k => MARKETS.find(m => m[0] === k)[1]).join(' / ') : 'stat'];
  const sd = BD.side === 'u' ? 'under' : 'over';
  const TIP = {
    name: 'Player and matchup. Tap a row for the full breakdown.',
    mk: 'Which stat the line is for.',
    line: 'DraftKings line. EST is Fullcourt\'s estimate where the book has none; ALT is a DraftKings alt line.',
    best: `The friendliest ${sd} across every book we track (DraftKings, FanDuel, ESPN BET and more): the better line first, then the better price. A small number in front means that book has a different line.`,
    odds: `DraftKings price for the ${sd} (or the book named under the line when DraftKings hasn't posted). -150 risks $150 to win $100; +150 wins $150 on $100.`,
    h5: `How often he went ${sd} this line in his last 5 games.`,
    h10: `How often he went ${sd} this line in his last 10 games. Early in a season, last season fills the gap.`,
    hs: `How often he went ${sd} this line this season.`,
    hv: `How often he went ${sd} this line against tonight's opponent, this season and last.`,
    avg: 'His average in this stat over his last 10 games.',
    diff: `How far his last-10 average sits ${BD.side === 'u' ? 'below' : 'above'} the line. Positive is good for the ${sd}.`,
    def: 'Opponent\'s rank in points allowed per game. 30th is the softest defense.',
    dvp: 'Defense vs position: how players at his position do against this team compared with their own averages. + means they run hot here.',
    edge: 'Fullcourt\'s score: mostly his last-10 hit rate, plus last 5 and season, nudged by the gap between his average and the line. Longer bar, stronger trend.',
  };
  const th = (k, l, cls = '') => `<th class="${cls}${BD.sort === k ? ' on' : ''}"${TIP[k] ? ` data-tip="${esc(TIP[k])}"` : ''}><button data-bdsort="${k}" aria-label="${esc(l)}: ${esc(TIP[k] || '')}">${l}${BD.sort === k ? (BD.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  const sc = $('.bd-wrap', main)?.scrollLeft || 0;
  const html = `<div class="bd-ctrl">
      <div class="hs-wrap"><div class="hs chips drag-x bd-mk" data-drag><button class="chip" data-bdmk="all" aria-pressed="${!SEL}">All stats</button>${MARKETS.map(m => `<button class="chip${EST.has(m[0]) ? ' est' : ''}" data-bdmk="${m[0]}" aria-pressed="${!!SEL?.includes(m[0])}">${m[1]}</button>`).join('')}</div></div>
      <div class="bd-row2">
        <div class="seg bd-side" data-bdsideseg><span class="knob"></span><button data-bdside="o" aria-pressed="${BD.side === 'o'}">Over</button><button data-bdside="u" aria-pressed="${BD.side === 'u'}">Under</button></div>
        <select class="bd-sel" data-bdgame aria-label="Game"><option value="all">All ${games.length} games</option>${games.map(g => `<option value="${g.id}" ${BD.game === g.id ? 'selected' : ''}>${esc(g.away.abbr)} @ ${esc(g.home.abbr)} · ${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</option>`).join('')}</select>
        <button class="chip sm bd-oddsbtn" data-bdodds aria-expanded="${!!BD.oddsOpen}" aria-pressed="${!!BD.odds}">Odds${BD.odds ? `<span class="lgx"> ${esc(oddsTxt(BD.odds.min) || 'any')} to ${esc(oddsTxt(BD.odds.max) || 'any')}</span><i class="shx bd-dot"></i>` : ''}</button>
        <button class="chip sm bd-radar" data-bdradar aria-pressed="${!!BD.radar}" title="Only role players (under 15 a game) whose minutes are up 2+ over their last 3 games"><span class="lgx">Under the radar</span><span class="shx">Radar</span></button>
        <input class="bd-q" type="search" placeholder="Find a player" value="${esc(BD.q)}" data-bdq aria-label="Find a player">
      </div>
    </div>
    ${BD.oddsOpen ? oddsPanel() : ''}
    <div class="bd-body">${list.length ? `<div class="bd-wrap drag-x" data-drag><table class="bd-t">
      <thead><tr>${th('name', 'Player', 'pl')}${ALL ? th('mk', 'Market', 'dk') : ''}${th('line', 'Line')}${th('odds', BD.side === 'u' ? 'Under' : 'Over', 'dk')}${BD.books.size ? th('best', 'Best', 'dk') : ''}${th('h5', 'L5')}${th('h10', 'L10')}${th('hs', 'Season', 'dk')}${th('hv', 'H2H', 'dk')}${th('avg', 'Avg L10', 'dk')}${th('diff', '+/−', 'dk')}${th('def', 'Opp D', 'dk')}${th('dvp', 'DvP', 'dk')}${th('edge', 'Score', 'dk')}<th class="tr"></th></tr></thead>
      <tbody>${list.map(x => {
        const s = x.st, mv = Number.isFinite(x.open) && x.open !== x.line ? `<em class="${x.line > x.open ? 'up' : 'dn'}" title="Opened ${x.open}">${x.line > x.open ? '▲' : '▼'}</em>` : '';
        const dr = defRankOf(x.opp.id), dv = s ? dvpOf(x) : null, fl = x.log ? flagsOf(x) : [], st = starred(x), lv = liveOf(x);
        if (lv && !lv.none) fl.unshift([`live ${lv.hit ? 'hit' : lv.dead ? 'dead' : lv.good ? 'good' : 'bad'}`, lv.hit ? `✓ ${lv.v}${lv.fin ? ' final' : ' · hit'}` : lv.dead ? `✗ ${lv.v}${lv.fin ? ' final' : ''}` : `${lv.v}${lv.pace != null ? ` · pace ${lv.pace}` : ' now'}`]);
        else if (lv?.none && !lv.fin) fl.unshift(['live', 'Live · not in yet']);
        const rd = BD.radar && x.log ? radarOf(x) : null; if (rd) { const i = fl.findIndex(f => f[0] === 'up'); if (i >= 0) fl.splice(i, 1); fl.push(['up', `MIN +${rd.toFixed(1)}`]); }
        return `<tr class="${st ? 'starred' : ''}" data-bdrow="${x.pid}|${x.k}|${x.line}" ${Q1.has(x.k) ? `data-player="${x.p.id}"` : ''}>
          <td class="pl"><span class="bd-pl"><button class="bd-star${st ? ' on' : ''}" data-bdstar="${x.pid}|${x.k}" aria-pressed="${st}" title="${st ? 'Unstar' : 'Star: pin to the top and get an alert if the line moves'}" aria-label="${st ? 'Unstar' : 'Star'} ${esc(x.p.name)}">${st ? '★' : '☆'}</button>${face(x.p.id, x.p.name, 'bd-face', 120)}<span><b>${esc(x.p.name)}</b>${fl.length ? `<span class="bd-flags">${fl.map(([c, t]) => `<i class="${c}">${esc(t)}</i>`).join('')}</span>` : ''}<small>${logo(x.p.abbr, 32)}${esc(x.p.abbr)} ${x.at} ${esc(x.opp.abbr)} · ${esc(lv ? lv.label : x.g.state === 'pre' ? fmtTime(x.g.date) : statusText(x.g))}</small><small class="bd-mob">${amer(BD.side === 'u' ? x.under : x.over)}${s?.avg != null ? ` · avg ${s.avg.toFixed(1)}` : ''}${s?.hs != null ? ` · season ${Math.round(s.hs * 100)}%` : ''}${dr ? ` · ${ordN(dr)} D` : ''}</small></span></span></td>
          ${ALL ? `<td class="mk dk"><span class="bd-mkt">${esc(MARKETS.find(q => q[0] === x.k)[2])}</span></td>` : ''}
          <td class="ln">${ALL ? `<small class="bd-mkm">${esc(MARKETS.find(q => q[0] === x.k)[2])}</small>` : ''}${x.line != null ? `<b>${x.line}</b>${x.est ? '<em class="est" title="Fullcourt line: set at his average over the last 10 games. No sportsbook line in the feed.">est</em>' : x.alt ? '<em class="est alt" title="DraftKings alt line">alt</em>' : x.fromBook ? `<em class="est bk" title="${esc(bookName(x.fromBook))} line: DraftKings hasn't posted this one">${esc(bookAb(x.fromBook))}</em>` : x.g.state === 'in' || BD.live.get(x.g.id)?.g.state === 'in' ? '<em class="est livel" title="In-game line: DraftKings moves this during the game">live</em>' : mv}` : '<span class="bd-ld st"></span>'}</td>
          <td class="od dk">${x.est ? '<span class="bd-pill na">–</span>' : amer(BD.side === 'u' ? x.under : x.over)}</td>
          ${BD.books.size ? (() => { const bs = bestOf(x); return `<td class="od dk bd-best" title="${bs ? `Best ${BD.side === 'u' ? 'under' : 'over'} across books: ${esc(bookName(bs.b))} ${bs.l} at ${amer(bs.price)}` : 'Only one book has this line'}">${bs ? `${bs.l !== x.line ? `<small>${bs.l}</small> ` : ''}${amer(bs.price)}<i>${esc(bookAb(bs.b))}</i>` : '<span class="bd-pill na">–</span>'}</td>`; })() : ''}
          <td>${s ? pill(s.h5, s.L5.length) : '<span class="bd-ld st"></span>'}</td>
          <td>${s ? pill(s.h10, s.L10.length) : '<span class="bd-ld st"></span>'}</td>
          <td class="dk">${s ? pill(s.hs, s.vals.length) : '<span class="bd-ld st"></span>'}</td>
          <td class="dk">${s ? (s.nv ? pill(s.hv, s.nv) : '<span class="bd-pill na">–</span>') : '<span class="bd-ld st"></span>'}</td>
          <td class="nm dk">${s?.avg != null ? s.avg.toFixed(1) : '–'}</td>
          <td class="nm dk ${s?.diff > 0 ? 'pos' : s?.diff < 0 ? 'neg' : ''}">${s?.diff != null ? (s.diff > 0 ? '+' : '') + s.diff.toFixed(1) : '–'}</td>
          <td class="nm dk">${dr ? `<span class="bd-def ${dr >= 21 ? 'soft' : dr <= 10 ? 'tough' : ''}">${ordN(dr)}</span>` : '–'}</td>
          <td class="nm dk ${dv ? (dv.v * (BD.side === 'u' ? -1 : 1) > 0.5 ? 'pos' : dv.v * (BD.side === 'u' ? -1 : 1) < -0.5 ? 'neg' : '') : ''}" title="${dv ? `${posGroup(x.p.pos) === 'G' ? 'Guards' : posGroup(x.p.pos) === 'C' ? 'Centers' : 'Forwards'} vs ${esc(x.opp.abbr)}: ${dv.v >= 0 ? '+' : ''}${dv.v.toFixed(1)} vs their own average (${dv.n} games)` : 'Not enough games vs this team yet'}">${dv ? (dv.v >= 0 ? '+' : '') + dv.v.toFixed(1) : '–'}</td>
          <td class="sc dk">${s?.edge != null ? `<span class="bd-score"><i style="width:${Math.round(Math.max(0, Math.min(1, s.edge)) * 100)}%"></i></span>` : ''}</td>
          <td class="tr">${Q1.has(x.k) ? '' : (() => { const on = inSlip(x); return `<button class="bd-add${on ? ' on' : ''}" data-bdslip="${x.pid}|${x.k}|${x.line}" title="${on ? 'Remove from parlay' : 'Add to parlay'}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(x.p.name)} ${BD.side === 'u' ? 'under' : 'over'} ${x.line} ${on ? 'from' : 'to'} the parlay">${on ? '✓' : '+'}</button>`; })()}</td>

        </tr>`;
      }).join('')}</tbody></table></div>${full.length > list.length ? `<button class="btn bd-more" data-bdmore>Show ${Math.min(100, full.length - list.length)} more <small>${list.length} of ${full.length}</small></button>` : ''}` : `<div class="empty"><b>No ${esc(mk[1].toLowerCase())} props${BD.game !== 'all' ? ' for this game' : ''}${BD.q ? ' for that search' : ''}</b>${BD.radar ? 'Nobody fits Under the radar here yet: it shows role players whose minutes are up 2+ lately. Turn it off to see everyone.' : BD.odds ? `Your odds filter (${esc(oddsTxt(BD.odds.min) || 'any')} to ${esc(oddsTxt(BD.odds.max) || 'any')}) may be hiding them. <button class="link-btn" data-bdoclear>Clear it</button>` : 'Try another market or game.'}</div>`}
    ${(SEL || []).some(k => EST.has(k)) ? `<p class="bd-note bd-miss">No sportsbook posts ${esc(SEL.filter(k => EST.has(k)).map(k => MARKETS.find(q => q[0] === k)[1]).join(', '))} lines to this feed, so the line marked <em class="est">est</em> is Fullcourt's, set at the half-point just above or below his average over the last 10 games, the way books usually set them. ${mkQ1() ? 'First-quarter numbers come from play-by-play of each team\'s last 5 games.' : ''}</p>` : ''}
    ${BD.missing?.length ? `<p class="bd-note bd-miss">DraftKings hasn't posted props yet for ${esc(BD.missing.join(', '))}. Lines tagged with another book (FD, ESPN…) are that book's real line; <em class="est">est</em> lines are Fullcourt's, set at each player's recent average, until a book posts.</p>` : ''}
    ${loading ? '<p class="bd-note"><span class="bd-ld"></span> Loading each player\'s games…</p>' : ''}</div>
    <details class="bd-about"><summary>How to read this table</summary><p class="bd-note">Lines and odds from DraftKings via ESPN, refreshed every few minutes. Hit rates are how often he's gone ${BD.side === 'u' ? 'under' : 'over'} this exact line: last 5, last 10, the season, and against tonight's opponent (H2H). Opp D ranks points allowed (30th is the softest). DvP is how far players at his position have run above (+) or below (−) their own average against this team, from games loaded here. Score blends the hit rates and the gap to the line. ★ pins a prop to the top and alerts you if its line moves a point or the book posts it. Flags: MIN ↑/↓ when his minutes over the last 3 games are 4+ off his season, a key teammate out, B2B or 3 games in 4 nights, a fast or slow matchup (2+ possessions off the league pace, from PBPStats), and blowout risk for starters when the spread is 10 or more. Tap a row for the full breakdown, or + to add it to a parlay. Trends, not betting advice.</p></details>`;
  // background refreshes (hit rates filling in, live stats) swap just the table, so the filters, search box
  // and anything you're about to click stay put
  const oldBody = soft && $('.bd-body', main);
  if (oldBody) { const t = document.createElement('div'); t.innerHTML = html; morph(oldBody, $('.bd-body', t)); }
  else main.innerHTML = html;
  const w = $('.bd-wrap', main); if (w && keepScroll) w.scrollLeft = sc;
  wireDrag(main);
  placeKnob($('[data-bdsideseg]', main)); if ($('[data-bdopside]', main)) placeKnob($('[data-bdopside]', main));
}
// update `a` to match `b` while reusing every element that didn't change (table rows are matched by their key),
// so a background refresh never yanks a row or button out from under the cursor
function morph(a, b) {
  if (a.isEqualNode(b)) return;
  if (a.nodeType !== 1 || a.tagName !== b.tagName) { a.replaceWith(b); return; }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const keyed = a.tagName === 'TBODY', kOf = el => el.nodeType === 1 && el.dataset.bdrow, olds = [...a.childNodes];
  const pool = new Map(); if (keyed) olds.forEach(o => { const k = kOf(o); if (k) (pool.get(k) || pool.set(k, []).get(k)).push(o); });
  const news = [...b.childNodes]; let i = 0;
  const out = news.map(n => {
    let o = keyed ? pool.get(kOf(n))?.shift() : olds[i++];
    if (!o) return n;
    if (o.nodeType !== n.nodeType || (o.nodeType === 1 && o.tagName !== n.tagName)) return n;
    if (o.nodeType === 1) { morph(o, n); return o; }
    if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return o;
  });
  out.forEach((n, j) => { if (a.childNodes[j] !== n) a.insertBefore(n, a.childNodes[j] || null); });
  while (a.childNodes.length > out.length) a.lastChild.remove();
}
function oddsPanel() {
  const o = BD.odds || { side: 'e', min: null, max: null }, lo = o.min == null ? -1400 : oddsPos(o.min), hi = o.max == null ? 1400 : oddsPos(o.max);
  const an = BD.oddsAnim; BD.oddsAnim = false;
  return `<div class="bd-op${an ? ' anim' : ''}" data-bdop>
    <div class="bd-op-h"><div><b>Min / max odds</b><small>DraftKings · ${{ e: 'Either side', o: 'Overs', u: 'Unders' }[o.side]}${BD.odds ? ` · ${esc(oddsTxt(o.min) || 'any')} to ${esc(oddsTxt(o.max) || 'any')}` : ''}</small></div><span class="bd-op-act"><button class="btn ghost sm" data-bdoclear>Clear</button><button class="btn sm" data-bdodds>Done</button></span></div>
    <div class="seg bd-op-side" data-bdopside><span class="knob"></span>${[['e', 'Either'], ['o', 'Overs'], ['u', 'Unders']].map(([k, l]) => `<button data-bdoside="${k}" aria-pressed="${o.side === k}">${l}</button>`).join('')}</div>
    <div class="bd-op-in"><label><span>From</span><input inputmode="numeric" placeholder="-1500" value="${esc(oddsTxt(o.min))}" data-bdomin></label><label><span>To</span><input inputmode="numeric" placeholder="+1500" value="${esc(oddsTxt(o.max))}" data-bdomax></label></div>
    <div class="bd-op-sl"><div class="bd-op-tr"><i style="left:${(lo + 1400) / 28}%;right:${100 - (hi + 1400) / 28}%"></i></div><input type="range" min="-1400" max="1400" step="10" value="${lo}" data-bdolo aria-label="Lowest odds"><input type="range" min="-1400" max="1400" step="10" value="${hi}" data-bdohi aria-label="Highest odds"><div class="bd-op-lb"><span>-1500</span><span>EVEN</span><span>+1500</span></div></div>
    <p class="bd-note">Overs also show DraftKings alt lines priced in this range, marked <em class="est alt">alt</em>, with each one's hit rates.</p>
  </div>`;
}
function setOdds(patch) {
  const o = { ...(BD.odds || { side: 'e', min: null, max: null }), ...patch };
  BD.odds = o.min == null && o.max == null && o.side === 'e' ? null : o;
  if (o.side === 'o') BD.side = 'o'; if (o.side === 'u') BD.side = 'u';
  saveView();
}
const ordN = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function leanOf(g, std) {
  const o = g.odds, H = std.get(g.home.id), A = std.get(g.away.id);
  let proj = null, margin = null;
  if (H && A) { const hp = parseFloat(H.ppg), ho = parseFloat(H.opp), ap = parseFloat(A.ppg), ao = parseFloat(A.opp); if ([hp, ho, ap, ao].every(Number.isFinite)) { proj = (hp + ao) / 2 + (ap + ho) / 2; margin = ((hp - ho) - (ap - ao)) / 2 + 1.5; } }
  const hs = parseFloat(o?.home?.spread);
  const tl = o?.ou != null && proj != null ? proj - o.ou : null, sl = Number.isFinite(hs) && margin != null ? margin + hs : null;
  return { proj, margin, hs, tl, sl, tot: tl != null && Math.abs(tl) >= 3 ? { side: tl > 0 ? 'o' : 'u', line: +o.ou } : null, spr: sl != null && Math.abs(sl) >= 2.5 ? { home: sl > 0, line: sl > 0 ? hs : -hs } : null };
}

/* ---------- Fullcourt's record: the strongest props and leans, saved before tip and graded after ---------- */
const SIG = 'fc-bd-signals';
const readSig = () => { try { return JSON.parse(lsGet(SIG) || '{}') || {}; } catch (e) { return {}; } };
function writeSig(o) { const days = Object.keys(o).sort(); while (days.length > 45) delete o[days.shift()]; lsSet(SIG, JSON.stringify(o)); }
function snapProps(date, list) {
  if (IS_W) return;
  const o = readSig(), d = o[date] || (o[date] = {}), P = d.props || (d.props = {});
  let changed = false;
  for (const x of list) {
    if (x.est || Q1.has(x.k) || x.g.state !== 'pre' || !x.log?.length) continue;
    for (const side of ['o', 'u']) {
      const st = rowStats(x, side); if (!st || st.edge == null || st.edge < 0.8 || st.vals.length < 5) continue;
      const key = x.pid + '|' + x.k; if (P[key]?.side && P[key].side !== side) continue;
      P[key] = { pid: String(x.pid), k: x.k, side, line: x.line, gid: x.g.id, name: x.p.name, abbr: x.p.abbr, edge: +st.edge.toFixed(2) }; changed = true;
    }
  }
  const keep = Object.entries(P).sort((a, b) => b[1].edge - a[1].edge);
  if (keep.length > 12) { for (const [k] of keep.slice(12)) delete P[k]; changed = true; }
  if (changed) writeSig(o);
}
function snapLeans(date, games) {
  if (IS_W) return;
  const std = new Map((S.standings?.confs || []).flatMap(c => c.rows).map(r => [r.id, r]));
  const o = readSig(), d = o[date] || (o[date] = {}), L = d.leans || (d.leans = {});
  let changed = false;
  for (const g of games) {
    if (g.state !== 'pre') continue;
    const l = leanOf(g, std);
    if (l.tot) { L[g.id + '|t'] = { gid: g.id, t: 't', side: l.tot.side, line: l.tot.line, game: `${g.away.abbr} @ ${g.home.abbr}` }; changed = true; }
    if (l.spr) { L[g.id + '|s'] = { gid: g.id, t: 's', home: l.spr.home, line: l.spr.line, team: l.spr.home ? g.home.abbr : g.away.abbr, game: `${g.away.abbr} @ ${g.home.abbr}` }; changed = true; }
  }
  if (changed) writeSig(o);
}
// grade everything that's final: props against his game log, leans against the final score
async function gradeSignals() {
  const o = readSig(); let changed = false;
  for (const date of Object.keys(o).sort()) {
    if (date > S.today) continue;
    const d = o[date];
    const open = [...Object.values(d.props || {}), ...Object.values(d.leans || {})].filter(x => !x.res);
    if (!open.length) continue;
    const games = await scoreboardOn(date).catch(() => []);
    const byG = new Map(games.map(g => [g.id, g]));
    for (const x of Object.values(d.leans || {})) {
      if (x.res) continue; const g = byG.get(x.gid); if (!g || g.state !== 'post') continue;
      const h = +g.home.score, a = +g.away.score; if (!Number.isFinite(h + a)) continue;
      if (x.t === 't') { const t = h + a; x.res = t === x.line ? 'p' : (t > x.line) === (x.side === 'o') ? 'w' : 'l'; x.act = t; }
      else { const m = (x.home ? h - a : a - h) + x.line; x.res = m === 0 ? 'p' : m > 0 ? 'w' : 'l'; x.act = x.home ? h - a : a - h; }
      changed = true;
    }
    await poolRun(Object.values(d.props || {}).filter(x => !x.res && byG.get(x.gid)?.state === 'post'), 4, async x => {
      const lg = (await logOf(x.pid)).find(g => String(g.id) === String(x.gid));
      if (!lg) { if (date < addDays(S.today, -2)) { x.res = 'v'; changed = true; } return; } // didn't play: void
      const v = bdVal(lg, x.k); if (v == null) return;
      x.act = v; x.res = v === x.line ? 'p' : (v > x.line) === (x.side === 'o') ? 'w' : 'l'; changed = true;
    });
  }
  if (changed) writeSig(o);
  return o;
}
async function drawRecord(main, n) {
  const sk = setTimeout(() => { if (n === drawN) main.innerHTML = '<div class="sk" style="height:300px"></div>'; }, 150);
  const o = await gradeSignals(); clearTimeout(sk); if (n !== drawN) return;
  const props = Object.entries(o).flatMap(([date, d]) => Object.values(d.props || {}).map(x => ({ ...x, date })));
  const leans = Object.entries(o).flatMap(([date, d]) => Object.values(d.leans || {}).map(x => ({ ...x, date })));
  const rec = a => { const w = a.filter(x => x.res === 'w').length, l = a.filter(x => x.res === 'l').length, p = a.filter(x => x.res === 'p').length; return { w, l, p, pct: w + l ? w / (w + l) : null }; };
  const recTxt = r => `${r.w}–${r.l}${r.p ? `–${r.p}` : ''}`;
  const pctCell = r => r.pct == null ? '<span class="bd-pill na">–</span>' : `<span class="bd-pill ${r.pct >= 0.58 ? 'hot' : r.pct >= 0.5 ? 'warm' : 'cold'}">${Math.round(r.pct * 100)}%</span>`;
  const graded = props.filter(x => x.res && x.res !== 'v'), all = rec(graded), pend = props.filter(x => !x.res).length;
  if (!props.length && !leans.length) { main.innerHTML = `<div class="empty"><b>Nothing graded yet</b>Fullcourt saves each day's top sportsbook props by Score and its game-line leans before tip-off whenever you open the Bet desk, then grades them here once the games are final. Check back tomorrow.</div>`; return; }
  const byMk = MARKETS.filter(m => !EST.has(m[0])).map(m => [m, rec(graded.filter(x => x.k === m[0]))]).filter(([, r]) => r.w + r.l + r.p);
  const lt = rec(leans.filter(x => x.t === 't' && x.res)), ls = rec(leans.filter(x => x.t === 's' && x.res));
  const recent = [...props.filter(x => x.res && x.res !== 'v'), ...leans.filter(x => x.res)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const mkS = k => MARKETS.find(m => m[0] === k)?.[2] || k;
  const itemTxt = x => x.k ? `${esc(x.name)} ${x.side === 'u' ? 'U' : 'O'} ${x.line} ${mkS(x.k)}` : x.t === 't' ? `${esc(x.game)} ${x.side === 'u' ? 'Under' : 'Over'} ${x.line}` : `${esc(x.team)} ${x.line > 0 ? '+' : ''}${x.line} (${esc(x.game)})`;
  main.innerHTML = `<div class="rc-top">
      <div class="rc-big"><small>Top props</small><b>${recTxt(all)}</b><span>${all.pct != null ? Math.round(all.pct * 100) + '% hit' : 'no results yet'}${pend ? ` · ${pend} pending` : ''}</span></div>
      <div class="rc-big"><small>Total leans</small><b>${recTxt(lt)}</b><span>${lt.pct != null ? Math.round(lt.pct * 100) + '%' : '–'}</span></div>
      <div class="rc-big"><small>Spread leans</small><b>${recTxt(ls)}</b><span>${ls.pct != null ? Math.round(ls.pct * 100) + '%' : '–'}</span></div>
    </div>
    ${byMk.length ? `<div class="card rc-card"><div class="card-h"><h4>By market</h4></div><table class="bd-t rc-t"><thead><tr><th class="pl">Market</th><th>Record</th><th>Hit</th></tr></thead><tbody>${byMk.map(([m, r]) => `<tr><td class="pl">${esc(m[1])}</td><td class="nm">${recTxt(r)}</td><td>${pctCell(r)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${recent.length ? `<div class="card rc-card"><div class="card-h"><h4>Recent results</h4></div><ul class="rc-list">${recent.map(x => `<li><span class="rc-r ${x.res}">${{ w: 'W', l: 'L', p: 'P' }[x.res]}</span><span class="rc-what">${itemTxt(x)}</span><small>${esc(fmtDay(x.date, { month: 'short', day: 'numeric' }))}${x.act != null ? ` · ${x.t === 's' ? (x.act > 0 ? 'won by ' + x.act : x.act < 0 ? 'lost by ' + -x.act : 'tied') : 'had ' + x.act}` : ''}</small></li>`).join('')}</ul></div>` : ''}
    <p class="bd-note">Saved on this device whenever the Bet desk is open before tip-off: each day's top 12 sportsbook props by Score (80 and up), and every game-line lean. Players who sit are voided. A record of how the numbers have done, not betting advice.</p>`;
}

/* ---------- starred props: alert when the line moves a point, the odds swing, or the book posts it ---------- */
async function checkStars(list) {
  if (IS_W) return;
  const st = readStars(), keys = Object.keys(st); if (!keys.length) return;
  let rows = list;
  if (!rows) {
    const sl = await bdSlate(0).catch(() => null); if (!sl) return;
    BD.lines.clear(); BD.slates.delete(0);
    const fresh = await bdSlate(0).catch(() => sl);
    const gids = new Set(keys.map(k => st[k].gid));
    rows = (await Promise.all(fresh.games.filter(g => gids.has(g.id)).map(g => gameProps(g).catch(() => [])))).flat();
    for (const g of fresh.games) if (g.state === 'post') for (const k of keys) if (st[k].gid === g.id) delete st[k];
  }
  const msgs = [];
  for (const k of keys) {
    const s = st[k]; if (!s) continue;
    const r = rows.find(x => !x.est && String(x.pid) + '|' + x.k === k && Number.isFinite(x.line)); if (!r) continue;
    const mk = MARKETS.find(m => m[0] === s.k)?.[2] || s.k, od = +r.over;
    if (s.est) msgs.push(`${s.name}: book posted ${mk} ${r.line} (${amer(od)})`);
    else if (Math.abs(r.line - s.line) >= 1) msgs.push(`${s.name} ${mk} moved ${s.line} → ${r.line}`);
    else if (Number.isFinite(od) && Number.isFinite(s.odds) && Math.abs(od - s.odds) >= 25) msgs.push(`${s.name} ${mk} ${r.line}: over ${amer(s.odds)} → ${amer(od)}`);
    else continue;
    Object.assign(s, { line: r.line, odds: Number.isFinite(od) ? od : s.odds, est: false });
  }
  writeStars(st);
  if (!msgs.length) return;
  const body = msgs.slice(0, 3).join(' · ') + (msgs.length > 3 ? ` · +${msgs.length - 3} more` : '');
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') notify('Starred prop moved', body, st[keys[0]]?.gid || 'stars');
  else toast('★ ' + body);
  if (!list && BD.tab === 'props' && S.view === 'bets') bdDraw();
}

/* first basket: from each team's recent play-by-play — who got the first possession, who scored first, and who
   made the team's first basket */
const fbMemo = new Map();
async function firstBasket(teamId) {
  if (fbMemo.has(teamId)) return fbMemo.get(teamId);
  const p = (async () => {
    const d = await scheduleCached(teamId);
    const ids = (d.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed).slice(-8).map(e => String(e.id));
    const out = { n: 0, tip: 0, first: 0, scorers: new Map(), names: new Map() };
    await poolRun(ids, 4, async id => {
      const s = await summaryCached(id, 6 * 3600e3), plays = s.plays || []; if (!plays.length) return;
      for (const T of s.boxscore?.players || []) for (const a of T.statistics?.[0]?.athletes || []) out.names.set(String(a.athlete.id), a.athlete.shortName || a.athlete.displayName);
      const poss = plays.find(x => x.team?.id && !/jump ball/i.test(x.type?.text || '') && x.period?.number === 1);
      const firstScore = plays.find(x => x.scoringPlay), mineFirst = plays.find(x => x.scoringPlay && String(x.team?.id) === String(teamId));
      out.n++;
      if (poss && String(poss.team.id) === String(teamId)) out.tip++;
      if (firstScore && String(firstScore.team?.id) === String(teamId)) out.first++;
      const who = mineFirst?.participants?.[0]?.athlete?.id; if (who) out.scorers.set(String(who), (out.scorers.get(String(who)) || 0) + 1);
    });
    return out;
  })();
  fbMemo.set(teamId, p); p.catch(() => fbMemo.delete(teamId));
  return p;
}
async function fillFirstBasket(el, g) {
  const box = el.querySelector('.bg-fbb'); if (el._done) return; el._done = true;
  try {
    const [A, H] = await Promise.all([firstBasket(g.away.id), firstBasket(g.home.id)]);
    const team = (t, x) => { const top = [...x.scorers].sort((a, b) => b[1] - a[1]).slice(0, 4); return `<div class="fb-t"><div class="fb-h">${logo(t.abbr, 32)}<b>${esc(t.abbr)}</b></div>
      <div class="fb-s"><span>First possession <b>${x.tip}/${x.n}</b></span><span>Scored first <b>${x.first}/${x.n}</b></span></div>
      <ol class="fb-l">${top.map(([id, c]) => `<li><span>${esc(x.names.get(id) || '—')}</span><b>${c}/${x.n}</b></li>`).join('') || '<li><span>No games yet</span></li>'}</ol></div>`; };
    box.innerHTML = `<div class="fb-g">${team(g.away, A)}${team(g.home, H)}</div><p class="bd-note">From each team's last ${Math.max(A.n, H.n)} games of play-by-play. "First possession" is who had the ball first, usually the tip winner. The list is who made that team's first basket of the game.</p>`;
  } catch (e) { box.innerHTML = '<p class="bd-note">Couldn\'t load the play-by-play. Try again in a bit.</p>'; el._done = false; }
}

function drawGames(main, games) {
  const std = new Map((S.standings?.confs || []).flatMap(c => c.rows).map(r => [r.id, r]));
  const card = g => {
    const o = g.odds, { proj, margin, hs, tl, sl } = leanOf(g, std);
    const team = (s, side) => `<div class="bg-tm"><span>${logo(s.abbr, 48)}<b>${esc(s.name)}</b><small>${esc(s.rec || '')}</small></span>
      <span class="bg-c"><small>Spread</small><b>${esc(o?.[side]?.spread || '–')}</b><small>${esc(o?.[side]?.spreadOdds || '')}</small></span>
      <span class="bg-c"><small>Money</small><b>${esc(o?.[side]?.ml || '–')}</b>${o?.[side]?.mlOpen && o[side].mlOpen !== o[side].ml ? `<small>opened ${esc(o[side].mlOpen)}</small>` : '<small>&nbsp;</small>'}</span>
      <span class="bg-c"><small>${side === 'away' ? 'Over' : 'Under'}</small><b>${o?.ou != null ? esc(String(o.ou)) : '–'}</b><small>${esc(o?.[side === 'away' ? 'over' : 'under']?.odds || '')}</small></span></div>`;
    return `<div class="bg-card">
      <button class="bg-h" data-game="${g.id}"><span>${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</span><span>${esc(g.tv || '')}</span></button>
      ${team(g.away, 'away')}${team(g.home, 'home')}
      <details class="bg-fb" data-fbgame="${g.id}"><summary>First basket <small>first possession, first score, first scorers</small></summary><div class="bg-fbb"><div class="sk" style="height:120px"></div></div></details>
      <div class="bg-lean">${proj != null ? `<span>Teams project <b>${Math.round(proj)}</b> total${tl != null ? ` · ${Math.abs(tl) >= 3 ? `<b class="on">lean ${tl > 0 ? 'Over' : 'Under'}</b>` : 'no lean'}` : ''}</span><span>Project <b>${margin >= 0 ? esc(g.home.abbr) : esc(g.away.abbr)} by ${Math.abs(margin).toFixed(1)}</b>${sl != null ? ` · ${Math.abs(sl) >= 2.5 ? `<b class="on">lean ${sl > 0 ? `${esc(g.home.abbr)} ${hs > 0 ? '+' : ''}${hs}` : `${esc(g.away.abbr)} ${-hs > 0 ? '+' : ''}${-hs}`}</b>` : 'no lean'}` : ''}</span>` : '<span>Not enough games for a projection yet.</span>'}</div>
    </div>`;
  };
  BD.gmap = new Map(games.map(g => [g.id, g]));
  main.innerHTML = `<div class="bg-grid">${games.map(card).join('')}</div><p class="bd-note">Lines from ${esc(games.find(g => g.odds?.provider)?.odds.provider || 'the sportsbook')} via ESPN. Projections use each team's points scored and allowed this season with about 1.5 points for home court. A lean shows when the line is 3+ points off on a total or 2.5+ on a spread. Not betting advice.</p>`;
}

function bdWire(body) {
  body.dataset.wired = '1';
  document.addEventListener('fcbets', () => { if (S.view === 'bets' && BD.tab === 'mine') bdDraw(); });
  const parseO = v => { const n = parseInt(String(v).replace(/[^\d+-]/g, ''), 10); return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null; };
  body.addEventListener('change', e => {
    const a = e.target.closest('[data-bdomin]'), b = e.target.closest('[data-bdomax]');
    if (a || b) { setOdds(a ? { min: parseO(a.value) } : { max: parseO(b.value) }); bdTable($('#bdMain'), true); }
  });
  let slT = 0;
  body.addEventListener('input', e => {
    const lo = e.target.closest('[data-bdolo]'), hi = e.target.closest('[data-bdohi]'); if (!lo && !hi) return;
    const P = e.target.closest('.bd-op'), L = $('[data-bdolo]', P), Hh = $('[data-bdohi]', P);
    let a = +L.value, c = +Hh.value; if (a > c) { if (lo) c = a; else a = c; L.value = a; Hh.value = c; }
    $('.bd-op-tr i', P).style.cssText = `left:${(a + 1400) / 28}%;right:${100 - (c + 1400) / 28}%`;
    $('[data-bdomin]', P).value = a <= -1400 ? '' : oddsTxt(posOdds(a)); $('[data-bdomax]', P).value = c >= 1400 ? '' : oddsTxt(posOdds(c));
    clearTimeout(slT); slT = setTimeout(() => { setOdds({ min: a <= -1400 ? null : posOdds(a), max: c >= 1400 ? null : posOdds(c) }); bdTable($('#bdMain'), true); }, 250);
  });
  body.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('[data-fbgame]') && d.open) { const g = BD.gmap?.get(d.dataset.fbgame); if (g) fillFirstBasket(d, g); } }, true);
  body.addEventListener('click', e => {
    if (e.target.closest('[data-bdpriv]')) { lsSet('fc-bd-priv', privOn() ? null : '1'); privApply(); return; }
    const t = e.target.closest('[data-bdt]'); if (t) {
      if (t.dataset.bdt === BD.tab) return;
      BD.tab = t.dataset.bdt; $$('[data-bdt]').forEach(b => b.setAttribute('aria-pressed', b === t)); placeKnob($('[data-bdtab]'));
      const sl = BD.slates.get(BD.day);
      if (BD.tab === 'props' && sl && BD.all && BD.allDay === BD.day && BD.allDone) { drawN++; tabChrome(sl); bdTable($('#bdMain')); return; }
      if (sl) tabChrome(sl);
      bdDraw(); return; }
    const d = e.target.closest('[data-bdday]'); if (d) { BD.day = +d.dataset.bdday; BD.game = 'all'; BD.limit = 0; $$('[data-bdday]').forEach(b => b.setAttribute('aria-pressed', b === d)); bdDraw(); return; }
    const m = e.target.closest('[data-bdmk]'); if (m) {
      // tap markets to combine them; tapping a selected one removes it; All stats resets
      const k = m.dataset.bdmk, cur = mkSel();
      BD.limit = 0;
      if (k === 'all' || !cur) BD.mk = k;
      else { const nx = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; BD.mk = nx.length ? MARKETS.map(q => q[0]).filter(q => nx.includes(q)).join(',') : 'all'; }
      saveView(); if (mkSel()?.length !== 1 && BD.sort === 'line') BD.sort = 'edge'; bdTable($('#bdMain')); if (mkQ1()) bdSlate(BD.day).then(sl => loadQ1(sl.games.filter(g => g.state !== 'post'), drawN, $('#bdMain'))); return; }
    const sd = e.target.closest('[data-bdside]'); if (sd) { BD.side = sd.dataset.bdside; saveView(); bdTable($('#bdMain'), true); return; }
    const so = e.target.closest('[data-bdsort]'); if (so) { const k = so.dataset.bdsort; if (BD.sort === k) BD.dir = -BD.dir; else { BD.sort = k; BD.dir = k === 'name' || k === 'mk' || k === 'def' && BD.side === 'u' ? 1 : -1; } saveView(); bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-bdodds]')) { BD.oddsOpen = !BD.oddsOpen; BD.oddsAnim = BD.oddsOpen; bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-bdoclear]')) { BD.odds = null; saveView(); bdTable($('#bdMain'), true); return; }
    const os = e.target.closest('[data-bdoside]'); if (os) { setOdds({ side: os.dataset.bdoside }); bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-bdmore]')) { BD.limit = (BD.limit || 80) + 100; bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-bdradar]')) { BD.radar = !BD.radar; saveView(); bdTable($('#bdMain'), true); return; }
    const sr = e.target.closest('[data-bdstar]');
    if (sr) { const [pid, k] = sr.dataset.bdstar.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k); const st = readStars(), key = pid + '|' + k;
      if (st[key]) delete st[key]; else if (x) { st[key] = { name: x.p.name, k, gid: x.g.id, line: x.line, odds: +(x.over) || null, est: !!x.est, game: `${x.g.away.abbr} @ ${x.g.home.abbr}` }; }
      writeStars(st); bdTable($('#bdMain'), true);
      if (st[key]) { toast(`★ Starred: you'll get a heads-up if this line moves`); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()?.catch?.(() => {}); } catch (e) {} }
      return; }
    const sl = e.target.closest('[data-bdslip]');
    if (sl) { const [pid, k, ln] = sl.dataset.bdslip.split('|'); const x = (BD.shown || []).find(y => String(y.pid) === pid && y.k === k && String(y.line) === ln) || BD.all.find(y => String(y.pid) === pid && y.k === k); if (x) { toggleSlip(x); bdTable($('#bdMain'), true); } return; }
    const row = e.target.closest('[data-bdrow]');
    if (row && !e.target.closest('button') && !Q1.has(row.dataset.bdrow.split('|')[1])) {
      const [pid, k, line] = row.dataset.bdrow.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k);
      if (!x) return;
      openPropDetail(pid, k, Math.floor(+line) + 1, { r: x.p, g: x.g, opp: x.opp, dr: (() => { const r = defRankOf(x.opp.id); const t = (S.standings?.confs || []).flatMap(c => c.rows).find(z => z.id === x.opp.id); return r ? { rank: r, of: (S.standings?.confs || []).flatMap(c => c.rows).length, opp: parseFloat(t?.opp) } : null; })(), mates: [], alts: BD.alts.get(pid + '|' + k) || null, side: BD.side, book: x.est ? null : { line: x.line, over: +x.over, under: +x.under }, gameLabel: `${x.g.away.abbr} @ ${x.g.home.abbr}`, prices: pricesOf(x), peers: (BD.all || []).filter(y => y.k === k && y.log?.length && String(y.pid) !== pid).map(y => ({ pid: String(y.pid), name: y.p.name, abbr: y.p.abbr, line: y.line, log: y.log })), ...(x.log ? { log: x.log } : {}) });
    }
  });
  body.addEventListener('change', e => { if (e.target.matches('[data-bdgame]')) { BD.game = e.target.value; BD.limit = 0; bdTable($('#bdMain')); } });
  body.addEventListener('input', e => { if (e.target.matches('[data-bdq]')) { BD.q = e.target.value; clearTimeout(BD.qt); BD.qt = setTimeout(() => { const pos = e.target.selectionStart; bdTable($('#bdMain'), true); const q = $('[data-bdq]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200); } });
}

/* ---------------- parlay builder ---------------- */
const SLIP_KEY = 'fc-slip';
const STATS_OF = { pts: ['pts'], reb: ['reb'], ast: ['ast'], tpm: ['tpm'], pra: ['pts', 'reb', 'ast'], pr: ['pts', 'reb'], pa: ['pts', 'ast'], ra: ['reb', 'ast'], fga: ['fga'], tpa: ['tpa'], fg2: ['fg2'], fg2a: ['fg2a'], stl: ['stl'], blk: ['blk'], sb: ['stl', 'blk'] };
const SLIP = (() => { try { const v = JSON.parse(sessionStorage.getItem(SLIP_KEY) || 'null'); if (v && Array.isArray(v.legs)) return v; } catch (e) {} return { legs: [], stake: 10, open: false }; })();
const saveSlip = () => { try { sessionStorage.setItem(SLIP_KEY, JSON.stringify(SLIP)); } catch (e) {} };
const legKey = (pid, k) => `${pid}|${k}`;
const inSlip = x => SLIP.legs.some(l => legKey(l.pid, l.k) === legKey(x.pid, x.k) && l.line === x.line);
const decOf = o => { const n = +o; return n > 0 ? 1 + n / 100 : n < 0 ? 1 + 100 / -n : 1; };
const amerOf = d => d >= 2 ? '+' + Math.round((d - 1) * 100) : d > 1 ? String(Math.round(-100 / (d - 1))) : '–';
const usd = v => '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// a leg built in the prop breakdown (any line he picked there)
function addSlipLeg(l) {
  const i = SLIP.legs.findIndex(y => legKey(y.pid, y.k) === legKey(l.pid, l.k));
  if (i >= 0) SLIP.legs.splice(i, 1, l); else SLIP.legs.push(l);
  if (!PHONE()) SLIP.open = true; saveSlip(); drawSlip(); bumpSlip();
  if ($('#bdMain') && BD.tab === 'props') bdTable($('#bdMain'), true);
  toast(S.view === 'bets' ? `Added to your parlay: ${l.name} ${l.side === 'u' ? 'under' : 'over'} ${l.line}` : `Added to your parlay in the Bets tab`);
}
const PHONE = () => matchMedia('(max-width: 760px)').matches;
const bumpSlip = () => { const n = $('#bdSlip .bs-n'); if (!n) return; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); };
function toggleSlip(x) {
  const i = SLIP.legs.findIndex(l => legKey(l.pid, l.k) === legKey(x.pid, x.k));
  if (i >= 0 && SLIP.legs[i].line === x.line) SLIP.legs.splice(i, 1);
  else {
    if (i >= 0) SLIP.legs.splice(i, 1); // same player and stat at another line: swap it
    const side = BD.side, odds = x.est ? -115 : +(side === 'u' ? x.under : x.over) || -110;
    SLIP.legs.push({ pid: String(x.pid), k: x.k, side, line: x.line, odds, est: !!x.est, name: x.p.name, teamId: x.p.teamId, abbr: x.p.abbr, gid: x.g.id, game: `${x.g.away.abbr} @ ${x.g.home.abbr}`, date: (x.g.date || '').slice(0, 10).replace(/-/g, ''), time: x.g.state === 'pre' ? fmtTime(x.g.date) : statusText(x.g) });
    if (SLIP.legs.length === 1 && !PHONE()) SLIP.open = true;
  }
  saveSlip(); drawSlip(); bumpSlip();
}
function slipMath() {
  // profit boosts multiply the winnings (not the stake), the way books apply them
  const d = SLIP.legs.reduce((a, l) => a * decOf(l.odds), 1), stake = Math.max(0, +SLIP.stake || 0), bo = +SLIP.boost || 0;
  const bd = 1 + (d - 1) * (1 + bo / 100);
  return { d, bd, boost: bo, stake, pays: stake * bd, win: stake * (bd - 1), amer: SLIP.legs.length ? amerOf(d) : '–', bamer: SLIP.legs.length ? amerOf(bd) : '–' };
}
// sportsbooks and pick'em apps: copy the slip in their wording, then open them
const BOOKS = [['dk', 'DraftKings', 'https://sportsbook.draftkings.com/leagues/basketball/nba'], ['fd', 'FanDuel', 'https://sportsbook.fanduel.com/navigation/nba'], ['fan', 'Fanatics', 'https://sportsbook.fanatics.com/'], ['hr', 'Hard Rock', 'https://app.hardrock.bet/'], ['score', 'theScore Bet', 'https://thescore.bet/'], ['b365', 'bet365', 'https://www.bet365.com/'], ['pp', 'PrizePicks', 'https://app.prizepicks.com/', 1], ['sl', 'Sleeper', 'https://sleeper.com/', 1]];
// the book buttons are real links: a tap on a link (not a script opening a window) is what lets iOS and Android
// hand the address to the installed app; copying the picks runs alongside it
function exportSlip(id) {
  const b = BOOKS.find(x => x[0] === id); if (!b) return;
  const dfs = !!b[3], mk = k => MARKETS.find(q => q[0] === k)[1];
  const lines = SLIP.legs.map(l => `${l.name} ${dfs ? (l.side === 'u' ? 'Less' : 'More') : l.side === 'u' ? 'Under' : 'Over'} ${l.line} ${mk(l.k)}${dfs ? '' : ` (${l.odds > 0 ? '+' + l.odds : l.odds})`}`);
  const m = slipMath(), txt = `${dfs ? `${SLIP.legs.length}-pick entry` : SLIP.legs.length > 1 ? `${SLIP.legs.length}-leg parlay` : 'Single'} for ${b[1]}\n${lines.join('\n')}${!dfs && m.stake ? `\n${usd(m.stake)} at ${m.amer} pays ${usd(m.pays)}` : ''}`;
  try { navigator.clipboard.writeText(txt).then(() => toast(`Picks copied: paste them in ${b[1]}`), () => toast(`Opening ${b[1]}`)); } catch (e) { toast(`Opening ${b[1]}`); }
}
function drawSlip() {
  const view = $('#v-bets'); if (!view) return;
  let dock = $('#bdSlip');
  if (!SLIP.legs.length) { dock?.remove(); $('#bsScrim')?.classList.remove('on'); return; }
  if (!dock) { dock = document.createElement('div'); dock.id = 'bdSlip'; dock.className = 'bd-slip'; view.append(dock); wireSlip(dock); }
  const m = slipMath(), n = SLIP.legs.length, mk = k => MARKETS.find(q => q[0] === k);
  const sameGame = new Set(SLIP.legs.map(l => l.gid)).size < n;
  dock.classList.toggle('open', !!SLIP.open);
  let sc = $('#bsScrim');
  if (!sc) { sc = document.createElement('div'); sc.id = 'bsScrim'; sc.className = 'bs-scrim'; sc.addEventListener('click', () => { SLIP.open = false; saveSlip(); drawSlip(); }); view.append(sc); }
  sc.classList.toggle('on', !!SLIP.open);
  dock.innerHTML = `<button class="bs-bar" data-slipopen aria-expanded="${!!SLIP.open}">
      <span class="bs-n">${n}</span><span class="bs-t"><b>${n > 1 ? `${n}-leg parlay` : 'Single'}</b><small>${m.amer} · ${usd(m.stake)} pays ${usd(m.pays)}</small></span><span class="bs-pill"><b><span class="wd">${n > 1 ? 'Parlay' : 'Single'} </span>${m.amer}</b><em>${usd(m.pays)}</em></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>
    </button>
    <div class="bs-body">
      <div class="bs-legs">${SLIP.legs.map((l, i) => `<div class="bs-lg">
        ${face(l.pid, l.name, 'bs-lf', 120)}
        <span class="bs-lt"><b>${esc(l.name)}</b><small>${l.side === 'u' ? 'Under' : 'Over'} ${l.line} ${esc(mk(l.k)[2])} · ${esc(l.game)}</small></span>
        <label class="bs-od" title="${l.est ? 'No book price in the feed: set your own odds' : 'DraftKings odds (you can change them)'}"><input inputmode="numeric" value="${l.odds > 0 ? '+' + l.odds : l.odds}" data-slipodds="${i}" aria-label="Odds for ${esc(l.name)}">${l.est ? '<em>est</em>' : ''}</label>
        <button class="bs-x" data-slipdel="${i}" aria-label="Remove ${esc(l.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg></button>
      </div>`).join('')}</div>
      <div class="bs-sum">
        <label class="bs-stake"><span>Stake</span><span class="bs-in">$<input inputmode="decimal" value="${m.stake}" data-slipstake aria-label="Stake"></span></label>
        <div><span>Odds</span><b>${m.boost ? `<s>${m.amer}</s> ${m.bamer}` : m.amer}</b></div>
        <div><span>To win</span><b>${usd(m.win)}</b></div>
        <div><span>Pays</span><b class="pay">${usd(m.pays)}</b></div>
      </div>
      <div class="bs-boost" role="group" aria-label="Profit boost"><span>Profit boost</span>${[0, 10, 25, 50].map(v => `<button data-slipboost="${v}" aria-pressed="${(+SLIP.boost || 0) === v}">${v ? v + '%' : 'None'}</button>`).join('')}</div>
      <div class="bs-books" hidden>${BOOKS.map(([id, name, url]) => `<a class="bs-book" href="${url}" ${matchMedia('(pointer: coarse)').matches ? '' : 'target="_blank"'} rel="noopener" data-slipbook="${id}">${name}</a>`).join('')}<p class="bs-note">No sportsbook lets other sites fill your bet slip, so this copies your picks and opens the book. Paste or rebuild them there; lines can differ by book.</p></div>
      ${sameGame ? '<p class="bs-note">Some legs are from the same game. Books price same-game parlays differently, so your app may pay a bit less.</p>' : ''}
      <div class="bs-act"><button class="btn" data-sliptrack>Track ${n > 1 ? 'parlay' : 'bet'}</button><button class="btn ghost bs-exp" data-slipexp aria-expanded="false">Export</button><button class="btn ghost bs-share" data-slipshare title="Share as an image" aria-label="Share as an image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></button><button class="btn ghost" data-slipclear>Clear</button></div>
    </div>`;
}
function wireSlip(dock) {
  dock.addEventListener('click', e => {
    if (e.target.closest('[data-slipopen]')) { SLIP.open = !SLIP.open; saveSlip(); drawSlip(); return; }
    const d = e.target.closest('[data-slipdel]'); if (d) { SLIP.legs.splice(+d.dataset.slipdel, 1); saveSlip(); drawSlip(); bdTable($('#bdMain'), true); return; }
    const bb = e.target.closest('[data-slipboost]'); if (bb) { SLIP.boost = +bb.dataset.slipboost || 0; saveSlip(); drawSlip(); return; }
    const ex = e.target.closest('[data-slipexp]'); if (ex) { const bx = dock.querySelector('.bs-books'); bx.hidden = !bx.hidden; ex.setAttribute('aria-expanded', !bx.hidden); return; }
    const bk = e.target.closest('[data-slipbook]'); if (bk) { exportSlip(bk.dataset.slipbook); return; } // the link itself does the opening
    if (e.target.closest('[data-slipshare]')) { const m = slipMath(), mk = k => MARKETS.find(q => q[0] === k)[2];
      lazy('bets').then(b => b.shareCard({ title: SLIP.legs.length > 1 ? `${SLIP.legs.length}-leg parlay` : 'Single', sub: 'Built on Fullcourt', legs: SLIP.legs.map(l => ({ name: l.name, what: `${l.side === 'u' ? 'Under' : 'Over'} ${l.line} ${mk(l.k)} · ${l.game}`, val: l.odds > 0 ? '+' + l.odds : String(l.odds) })), foot: [['Stake', usd(m.stake)], ['Odds', m.amer], ['Pays', usd(m.pays), true]] }, 'fullcourt-parlay.png')); return; }
    if (e.target.closest('[data-slipclear]')) { SLIP.legs = []; SLIP.boost = 0; saveSlip(); drawSlip(); bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-sliptrack]')) {
      const m = slipMath();
      const legs = SLIP.legs.map(l => ({ k: 'prop', pid: l.pid, name: l.name, teamId: l.teamId, abbr: l.abbr, stats: STATS_OF[l.k], side: l.side, line: l.line, gid: l.gid, date: l.date, game: l.game, odds: l.odds }));
      const bet = { id: 'p' + Date.now().toString(36), at: Date.now(), legs, stake: m.stake || null, odds: legs.length > 1 ? Math.round(m.d >= 2 ? (m.d - 1) * 100 : -100 / (m.d - 1)) : null, toWin: m.stake ? Math.round(m.win * 100) / 100 : null, ...(m.boost ? { boost: m.boost } : {}) };
      lazy('bets').then(b => b.addBet(bet));
      SLIP.legs = []; SLIP.boost = 0; saveSlip(); drawSlip(); bdTable($('#bdMain'), true);
    }
  });
  const num = v => { const n = parseFloat(String(v).replace(/[^\d.+-]/g, '')); return Number.isFinite(n) ? n : null; };
  dock.addEventListener('change', e => {
    const o = e.target.closest('[data-slipodds]');
    if (o) { const v = num(o.value); if (v && Math.abs(v) >= 100) SLIP.legs[+o.dataset.slipodds].odds = Math.round(v); saveSlip(); drawSlip(); return; }
    const st = e.target.closest('[data-slipstake]'); if (st) { const v = num(st.value); SLIP.stake = v != null && v >= 0 ? v : SLIP.stake; saveSlip(); drawSlip(); }
  });
  dock.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
}
