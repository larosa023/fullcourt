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
  // no sportsbook line in the feed for these: Fullcourt sets a line at the player's recent average
  ['fga', 'FG att', 'FGA', null, 'field goals attempted'],
  ['tpa', '3PT att', '3PA', null, 'three pointers attempted'],
  ['q1p', '1Q Pts', '1Q PTS', null, '1st quarter points'],
  ['q1r', '1Q Reb', '1Q REB', null, '1st quarter rebounds'],
  ['q1a', '1Q Ast', '1Q AST', null, '1st quarter assists'],
];
const EST = new Set(['fga', 'tpa', 'q1p', 'q1r', 'q1a']), Q1 = new Set(['q1p', 'q1r', 'q1a']);
const BD = { q1: new Map(), q1done: new Set(), mk: 'pts', side: 'o', game: 'all', q: '', sort: 'edge', dir: -1, day: 0, tab: 'props', logs: new Map(), lines: new Map(), slates: new Map(), alts: new Map() };
// your last market, side and sort come back next time
try { const v = JSON.parse(lsGet('fc-bd-view') || 'null'); if (v) Object.assign(BD, { mk: v.mk || BD.mk, side: v.side || BD.side, sort: v.sort || BD.sort, dir: v.dir || BD.dir }); } catch (e) {}
const saveView = () => lsSet('fc-bd-view', JSON.stringify({ mk: BD.mk, side: BD.side, sort: BD.sort, dir: BD.dir }));
const readStars = () => { try { return JSON.parse(lsGet('fc-bd-stars') || '{}') || {}; } catch (e) { return {}; } };
const writeStars = o => lsSet('fc-bd-stars', Object.keys(o).length ? JSON.stringify(o) : null);
const MILES = { 'Points Milestones': 'pts', 'Rebounds Milestones': 'reb', 'Assists Milestones': 'ast', '3-Point Field Goals Milestones': 'tpm', 'Points + Assists + Rebounds Milestones': 'pra', 'Points + Rebounds Milestones': 'pr', 'Points + Assists Milestones': 'pa', 'Rebounds + Assists Milestones': 'ra' };
const bdVal = (g, k) => Q1.has(k) ? BD.q1.get(String(g.id))?.get(String(g._pid))?.[k] : k === 'fga' ? g.fg[1] : k === 'tpa' ? g.tp[1] : k === 'pra' ? g.pts + g.reb + g.ast : k === 'pr' ? g.pts + g.reb : k === 'pa' ? g.pts + g.ast : k === 'ra' ? g.reb + g.ast : k === 'tpm' ? g.tp[0] : g[k];
const amer = v => { const n = +v; return Number.isFinite(n) ? (n > 0 ? '+' + n : String(n)) : '–'; };

async function bdSlate(offset) {
  if (BD.slates.has(offset)) return BD.slates.get(offset);
  // "today" means the next games that haven't tipped; once tonight is done, roll to tomorrow
  let d = addDays(S.today, offset), games = await scoreboardOn(d).catch(() => []);
  if (offset === 0 && games.length && games.every(g => g.state === 'post')) { d = addDays(S.today, 1); games = await scoreboardOn(d).catch(() => []); }
  const out = { date: d, games };
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
  const by = new Map();
  for (const it of d?.items || []) {
    const pid = (it.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1]; if (!pid) continue;
    const mi = MILES[it.type?.name];
    if (mi) { const t = +(it.current?.target?.value ?? parseFloat(it.odds?.total?.value)); if (Number.isFinite(t)) { const k = pid + '|' + mi; const a = BD.alts.get(k) || []; if (!a.some(x => x.t === t)) a.push({ t, o: +it.odds?.american?.value }); a.sort((x, y) => x.t - y.t); BD.alts.set(k, a); } continue; }
    const mk = MARKETS.find(m => m[3] === it.type?.name); if (!mk) continue;
    const key = pid + '|' + mk[0];
    const e = by.get(key) || { pid, k: mk[0], gid: g.id, odds: [], line: null, open: null };
    e.odds.push(it.odds?.american?.value);
    e.line = +(it.current?.target?.value ?? it.odds?.total?.value);
    e.open = +(it.open?.target?.value ?? it.odds?.total?.open ?? e.line);
    by.set(key, e);
  }
  const rows = [...by.values()].filter(e => Number.isFinite(e.line)).map(e => ({ ...e, over: e.odds[0], under: e.odds[1] }));
  BD.lines.set(g.id, { t: Date.now(), rows });
  return rows;
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
  const vsOpp = lg.filter(g => g.opp === r.opp.abbr || String(g.oppId) === String(r.opp.id)).map(g => bdVal(g, r.k));
  if (r.est) { if (!vals.length) return null; const L = vals.slice(0, 10), mean = L.reduce((a, b) => a + b, 0) / L.length; r.line = Math.floor(mean) + 0.5; }
  const L5 = vals.slice(0, 5), L10 = vals.slice(0, 10), avg = L10.length ? L10.reduce((a, b) => a + b, 0) / L10.length : null;
  const s = side;
  const h5 = bdPct(L5, r.line, s), h10 = bdPct(L10, r.line, s), hs = bdPct(vals, r.line, s), hv = bdPct(vsOpp, r.line, s);
  const diff = avg == null ? null : (s === 'u' ? r.line - avg : avg - r.line);
  // edge: mostly how often it's cashed lately, nudged by how far the average sits from the line
  const edge = h10 == null ? null : h10 * 0.55 + (h5 ?? h10) * 0.25 + (hs ?? h10) * 0.2 + Math.max(-0.15, Math.min(0.15, (diff || 0) / Math.max(2, r.line) * 0.6));
  let streak = 0; for (const v of vals) { if (s === 'u' ? v < r.line : v > r.line) streak++; else break; }
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
  return f;
}
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
    <div class="seg bd-seg" data-bdtab><span class="knob"></span><button data-bdt="props" aria-pressed="${BD.tab === 'props'}">Props</button><button data-bdt="games" aria-pressed="${BD.tab === 'games'}">Game lines</button><button data-bdt="mine" aria-pressed="${BD.tab === 'mine'}">My bets</button><button data-bdt="record" aria-pressed="${BD.tab === 'record'}">Record</button></div>
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
let drawN = 0;
async function bdDraw() {
  const n = ++drawN, main = $('#bdMain'); if (!main) return;
  placeKnob($('[data-bdtab]'));
  const slate = await bdSlate(BD.day);
  if (n !== drawN) return;
  const games = slate.games.filter(g => g.state !== 'post');
  $('#bdEyebrow').textContent = `${{ props: 'Player props', games: 'Game lines', mine: 'Your bets', record: "Fullcourt's record" }[BD.tab]} · ${BD.tab === 'mine' || BD.tab === 'record' ? 'All time' : slate.date === S.today ? 'Today' : fmtDay(slate.date, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  $('.bd-days')?.toggleAttribute('hidden', BD.tab === 'mine' || BD.tab === 'record');
  privApply();
  if (BD.tab === 'mine') { main.innerHTML = '<div class="sk" style="height:300px"></div>'; const m = await lazy('bets'); const html = await m.historyHTML(); if (n === drawN) main.innerHTML = html; return; }
  if (BD.tab === 'record') return drawRecord(main, n);
  if (!games.length) { main.innerHTML = `<div class="empty"><b>No games left on this slate</b>Try tomorrow.</div>`; return; }
  snapLeans(slate.date, games);
  if (BD.tab === 'games') return drawGames(main, games);
  // props
  const rows = await leagueTable();
  const byId = new Map(rows.map(r => [String(r.id), r]));
  main.innerHTML = `<div class="sk" style="height:520px"></div>`;
  const per = await Promise.all(games.map(g => gameProps(g).catch(() => [])));
  try {
    const inj = await leagueInjuries(); BD.outByTeam = new Map();
    for (const e of inj?.injuries || inj?.teams || []) for (const x of (e.injuries || []).map(normInjury)) {
      if (!/^out/i.test(x.status)) continue; const r = rows.find(y => String(y.id) === String(x.id)); if (!r || r.pts < 15) continue;
      const t = String(r.teamId); if (!BD.outByTeam.has(t)) BD.outByTeam.set(t, []); BD.outByTeam.get(t).push({ id: String(r.id), last: r.last || r.name.split(' ').slice(-1)[0] });
    }
  } catch (e) {}
  BD.missing = games.filter((g, i) => !per[i].length).map(g => `${g.away.abbr} @ ${g.home.abbr}`);
  BD.missingIds = new Set(games.filter((g, i) => !per[i].length).map(g => g.id));
  const all = per.flat();
  if (n !== drawN) return;
  const games2 = new Map(games.map(g => [g.id, g]));
  const unknown = [...new Set(all.map(e => String(e.pid)).filter(id => !byId.has(id)))];
  await poolRun(unknown, 6, async id => {
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
  BD.all = list;
  bdTable(main);
  // fill hit rates as each player's games arrive (players in the shown market first)
  const order = [...new Set([...list.filter(x => x.k === BD.mk), ...list].map(x => String(x.pid)))];
  let done = 0, pending = null;
  const refresh = () => { if (pending) return; pending = setTimeout(() => { pending = null; if (n === drawN && BD.tab === 'props') bdTable(main, true); }, 250); };
  await poolRun(order, 6, async pid => { const log = await logOf(pid); list.forEach(x => { if (String(x.pid) === pid) x.log = log; }); done++; BD.logN = done; if (done % 6 === 0) refresh(); });
  if (n === drawN && BD.tab === 'props') bdTable(main, true, true);
  snapProps(slate.date, list); checkStars(list);
  if (Q1.has(BD.mk)) loadQ1(games, n, main);
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
  if (n === drawN && Q1.has(BD.mk)) bdTable(main, true);
}
async function poolRun(items, k, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) {} } })); }

function bdTable(main, keepScroll, final) {
  const ALL = BD.mk === 'all';
  let list = (BD.all || []).filter(x => (ALL ? !Q1.has(x.k) : x.k === BD.mk) && (BD.game === 'all' || x.gid === BD.game) && (!BD.q || nameKey(x.p.name).includes(nameKey(BD.q))));
  list.forEach(x => { x.st = x.log && (!Q1.has(x.k) || BD.q1.size) ? rowStats(x) : null; });
  list = list.filter(x => !x.est || !x.log || x.st || (Q1.has(x.k) && (BD.q1busy || !BD.q1.size))); // estimated rows with no games drop out
  const stars = readStars(), starred = x => !!stars[x.pid + '|' + x.k];
  const key = { dvp: x => dvpOf(x)?.v * (BD.side === 'u' ? -1 : 1), mk: x => MARKETS.findIndex(q => q[0] === x.k), edge: x => x.st?.edge, line: x => x.line, h5: x => x.st?.h5, h10: x => x.st?.h10, hs: x => x.st?.hs, hv: x => x.st?.hv, avg: x => x.st?.avg, diff: x => x.st?.diff, odds: x => +(BD.side === 'u' ? x.under : x.over), def: x => defRankOf(x.opp.id), name: x => x.p.name }[BD.sort];
  list.sort((a, b) => { const sa = starred(a), sb = starred(b); if (sa !== sb) return sa ? -1 : 1; const A = key(a), B = key(b); if (A == null && B == null) return b.line - a.line; if (A == null) return 1; if (B == null) return -1; return (A > B ? 1 : A < B ? -1 : 0) * BD.dir; });
  const games = [...new Map((BD.all || []).map(x => [x.gid, x.g])).values()];
  const loading = list.some(x => !x.log) || (Q1.has(BD.mk) && BD.q1busy);
  const total = list.length;
  const mk = MARKETS.find(m => m[0] === BD.mk);
  const th = (k, l, cls = '') => `<th class="${cls}${BD.sort === k ? ' on' : ''}"><button data-bdsort="${k}">${l}${BD.sort === k ? (BD.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  const sc = $('.bd-wrap', main)?.scrollLeft || 0;
  main.innerHTML = `<div class="bd-ctrl">
      <div class="hs-wrap"><div class="hs chips drag-x bd-mk" data-drag><button class="chip" data-bdmk="all" aria-pressed="${ALL}">All stats</button>${MARKETS.map(m => `<button class="chip${EST.has(m[0]) ? ' est' : ''}" data-bdmk="${m[0]}" aria-pressed="${m[0] === BD.mk}">${m[1]}</button>`).join('')}</div></div>
      <div class="bd-row2">
        <div class="seg bd-side" data-bdsideseg><span class="knob"></span><button data-bdside="o" aria-pressed="${BD.side === 'o'}">Over</button><button data-bdside="u" aria-pressed="${BD.side === 'u'}">Under</button></div>
        <select class="bd-sel" data-bdgame aria-label="Game"><option value="all">All ${games.length} games</option>${games.map(g => `<option value="${g.id}" ${BD.game === g.id ? 'selected' : ''}>${esc(g.away.abbr)} @ ${esc(g.home.abbr)} · ${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</option>`).join('')}</select>
        <input class="bd-q" type="search" placeholder="Find a player" value="${esc(BD.q)}" data-bdq aria-label="Find a player">
      </div>
    </div>
    ${list.length ? `<div class="bd-wrap drag-x" data-drag><table class="bd-t">
      <thead><tr>${th('name', 'Player', 'pl')}${ALL ? th('mk', 'Market', 'dk') : ''}${th('line', 'Line')}${th('odds', BD.side === 'u' ? 'Under' : 'Over', 'dk')}${th('h5', 'L5')}${th('h10', 'L10')}${th('hs', 'Season', 'dk')}${th('hv', 'H2H', 'dk')}${th('avg', 'Avg L10', 'dk')}${th('diff', '+/−', 'dk')}${th('def', 'Opp D', 'dk')}${th('dvp', 'DvP', 'dk')}${th('edge', 'Score', 'dk')}<th class="tr"></th></tr></thead>
      <tbody>${list.map(x => {
        const s = x.st, mv = Number.isFinite(x.open) && x.open !== x.line ? `<em class="${x.line > x.open ? 'up' : 'dn'}" title="Opened ${x.open}">${x.line > x.open ? '▲' : '▼'}</em>` : '';
        const dr = defRankOf(x.opp.id), dv = s ? dvpOf(x) : null, fl = x.log ? flagsOf(x) : [], st = starred(x);
        return `<tr class="${st ? 'starred' : ''}" data-bdrow="${x.pid}|${x.k}|${x.line}" ${Q1.has(x.k) ? `data-player="${x.p.id}"` : ''}>
          <td class="pl"><span class="bd-pl"><button class="bd-star${st ? ' on' : ''}" data-bdstar="${x.pid}|${x.k}" aria-pressed="${st}" title="${st ? 'Unstar' : 'Star: pin to the top and get an alert if the line moves'}" aria-label="${st ? 'Unstar' : 'Star'} ${esc(x.p.name)}">${st ? '★' : '☆'}</button>${face(x.p.id, x.p.name, 'bd-face', 120)}<span><b>${esc(x.p.name)}</b>${fl.length ? `<span class="bd-flags">${fl.map(([c, t]) => `<i class="${c}">${esc(t)}</i>`).join('')}</span>` : ''}<small>${logo(x.p.abbr, 32)}${esc(x.p.abbr)} ${x.at} ${esc(x.opp.abbr)} · ${esc(x.g.state === 'pre' ? fmtTime(x.g.date) : statusText(x.g))}</small><small class="bd-mob">${amer(BD.side === 'u' ? x.under : x.over)}${s?.avg != null ? ` · avg ${s.avg.toFixed(1)}` : ''}${s?.hs != null ? ` · season ${Math.round(s.hs * 100)}%` : ''}${dr ? ` · ${ordN(dr)} D` : ''}</small></span></span></td>
          ${ALL ? `<td class="mk dk"><span class="bd-mkt">${esc(MARKETS.find(q => q[0] === x.k)[2])}</span></td>` : ''}
          <td class="ln">${ALL ? `<small class="bd-mkm">${esc(MARKETS.find(q => q[0] === x.k)[2])}</small>` : ''}${x.line != null ? `<b>${x.line}</b>${x.est ? '<em class="est" title="Fullcourt line: set at his average over the last 10 games. No sportsbook line in the feed.">est</em>' : mv}` : '<span class="bd-ld"></span>'}</td>
          <td class="od dk">${x.est ? '<span class="bd-pill na">–</span>' : amer(BD.side === 'u' ? x.under : x.over)}</td>
          <td>${s ? pill(s.h5, s.L5.length) : '<span class="bd-ld"></span>'}</td>
          <td>${s ? pill(s.h10, s.L10.length) : '<span class="bd-ld"></span>'}</td>
          <td class="dk">${s ? pill(s.hs, s.vals.length) : '<span class="bd-ld"></span>'}</td>
          <td class="dk">${s ? (s.nv ? pill(s.hv, s.nv) : '<span class="bd-pill na">–</span>') : '<span class="bd-ld"></span>'}</td>
          <td class="nm dk">${s?.avg != null ? s.avg.toFixed(1) : '–'}</td>
          <td class="nm dk ${s?.diff > 0 ? 'pos' : s?.diff < 0 ? 'neg' : ''}">${s?.diff != null ? (s.diff > 0 ? '+' : '') + s.diff.toFixed(1) : '–'}</td>
          <td class="nm dk">${dr ? `<span class="bd-def ${dr >= 21 ? 'soft' : dr <= 10 ? 'tough' : ''}">${ordN(dr)}</span>` : '–'}</td>
          <td class="nm dk ${dv ? (dv.v * (BD.side === 'u' ? -1 : 1) > 0.5 ? 'pos' : dv.v * (BD.side === 'u' ? -1 : 1) < -0.5 ? 'neg' : '') : ''}" title="${dv ? `${posGroup(x.p.pos) === 'G' ? 'Guards' : posGroup(x.p.pos) === 'C' ? 'Centers' : 'Forwards'} vs ${esc(x.opp.abbr)}: ${dv.v >= 0 ? '+' : ''}${dv.v.toFixed(1)} vs their own average (${dv.n} games)` : 'Not enough games vs this team yet'}">${dv ? (dv.v >= 0 ? '+' : '') + dv.v.toFixed(1) : '–'}</td>
          <td class="sc dk">${s?.edge != null ? `<span class="bd-score"><i style="width:${Math.round(Math.max(0, Math.min(1, s.edge)) * 100)}%"></i></span>` : ''}</td>
          <td class="tr">${Q1.has(x.k) ? '' : (() => { const on = inSlip(x); return `<button class="bd-add${on ? ' on' : ''}" data-bdslip="${x.pid}|${x.k}" title="${on ? 'Remove from parlay' : 'Add to parlay'}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(x.p.name)} ${BD.side === 'u' ? 'under' : 'over'} ${x.line} ${on ? 'from' : 'to'} the parlay">${on ? '✓' : '+'}</button>`; })()}</td>

        </tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty"><b>No ${esc(mk[1].toLowerCase())} props${BD.game !== 'all' ? ' for this game' : ''}${BD.q ? ' for that search' : ''}</b>Try another market or game.</div>`}
    ${EST.has(BD.mk) ? `<p class="bd-note bd-miss">No sportsbook posts ${esc(MARKETS.find(q => q[0] === BD.mk)[1])} lines to this feed, so the line marked <em class="est">est</em> is Fullcourt's, set at the half-point just above or below his average over the last 10 games, the way books usually set them. ${Q1.has(BD.mk) ? 'First-quarter numbers come from play-by-play of each team\'s last 5 games.' : ''}</p>` : ''}
    ${BD.missing?.length ? `<p class="bd-note bd-miss">Sportsbook props aren't posted yet for ${esc(BD.missing.join(', '))}, so those games show Fullcourt lines marked <em class="est">est</em> (set at each player's recent average) until the book's lines arrive, usually the morning of the game.</p>` : ''}
    ${loading ? '<p class="bd-note"><span class="bd-ld"></span> Loading each player\'s games…</p>' : ''}
    <details class="bd-about"><summary>How to read this table</summary><p class="bd-note">Lines and odds from DraftKings via ESPN, refreshed every few minutes. Hit rates are how often he's gone ${BD.side === 'u' ? 'under' : 'over'} this exact line: last 5, last 10, the season, and against tonight's opponent (H2H). Opp D ranks points allowed (30th is the softest). DvP is how far players at his position have run above (+) or below (−) their own average against this team, from games loaded here. Score blends the hit rates and the gap to the line. ★ pins a prop to the top and alerts you if its line moves a point or the book posts it. Flags: MIN ↑/↓ when his minutes over the last 3 games are 4+ off his season, and a key teammate out. Tap a row for the full breakdown, or + to add it to a parlay. Trends, not betting advice.</p></details>`;
  const w = $('.bd-wrap', main); if (w && keepScroll) w.scrollLeft = sc;
  wireDrag(main);
  placeKnob($('[data-bdsideseg]', main));
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
  main.innerHTML = '<div class="sk" style="height:300px"></div>';
  const o = await gradeSignals(); if (n !== drawN) return;
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
      <div class="bg-lean">${proj != null ? `<span>Teams project <b>${Math.round(proj)}</b> total${tl != null ? ` · ${Math.abs(tl) >= 3 ? `<b class="on">lean ${tl > 0 ? 'Over' : 'Under'}</b>` : 'no lean'}` : ''}</span><span>Project <b>${margin >= 0 ? esc(g.home.abbr) : esc(g.away.abbr)} by ${Math.abs(margin).toFixed(1)}</b>${sl != null ? ` · ${Math.abs(sl) >= 2.5 ? `<b class="on">lean ${sl > 0 ? `${esc(g.home.abbr)} ${hs > 0 ? '+' : ''}${hs}` : `${esc(g.away.abbr)} ${-hs > 0 ? '+' : ''}${-hs}`}</b>` : 'no lean'}` : ''}</span>` : '<span>Not enough games for a projection yet.</span>'}</div>
    </div>`;
  };
  main.innerHTML = `<div class="bg-grid">${games.map(card).join('')}</div><p class="bd-note">Lines from ${esc(games.find(g => g.odds?.provider)?.odds.provider || 'the sportsbook')} via ESPN. Projections use each team's points scored and allowed this season with about 1.5 points for home court. A lean shows when the line is 3+ points off on a total or 2.5+ on a spread. Not betting advice.</p>`;
}

function bdWire(body) {
  body.dataset.wired = '1';
  body.addEventListener('click', e => {
    if (e.target.closest('[data-bdpriv]')) { lsSet('fc-bd-priv', privOn() ? null : '1'); privApply(); return; }
    const t = e.target.closest('[data-bdt]'); if (t) { BD.tab = t.dataset.bdt; $$('[data-bdt]').forEach(b => b.setAttribute('aria-pressed', b === t)); bdDraw(); return; }
    const d = e.target.closest('[data-bdday]'); if (d) { BD.day = +d.dataset.bdday; BD.game = 'all'; $$('[data-bdday]').forEach(b => b.setAttribute('aria-pressed', b === d)); bdDraw(); return; }
    const m = e.target.closest('[data-bdmk]'); if (m) { BD.mk = m.dataset.bdmk; saveView(); BD.cap = 150; if (BD.mk === 'all' && BD.sort === 'line') BD.sort = 'edge'; bdTable($('#bdMain')); if (Q1.has(BD.mk)) bdSlate(BD.day).then(sl => loadQ1(sl.games.filter(g => g.state !== 'post'), drawN, $('#bdMain'))); return; }
    if (e.target.closest('[data-bdmore]')) { BD.cap = (BD.cap || 150) + 150; bdTable($('#bdMain'), true); return; }
    const sd = e.target.closest('[data-bdside]'); if (sd) { BD.side = sd.dataset.bdside; saveView(); bdTable($('#bdMain'), true); return; }
    const so = e.target.closest('[data-bdsort]'); if (so) { const k = so.dataset.bdsort; if (BD.sort === k) BD.dir = -BD.dir; else { BD.sort = k; BD.dir = k === 'name' || k === 'mk' || k === 'def' && BD.side === 'u' ? 1 : -1; } saveView(); bdTable($('#bdMain'), true); return; }
    const sr = e.target.closest('[data-bdstar]');
    if (sr) { const [pid, k] = sr.dataset.bdstar.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k); const st = readStars(), key = pid + '|' + k;
      if (st[key]) delete st[key]; else if (x) { st[key] = { name: x.p.name, k, gid: x.g.id, line: x.line, odds: +(x.over) || null, est: !!x.est, game: `${x.g.away.abbr} @ ${x.g.home.abbr}` }; }
      writeStars(st); bdTable($('#bdMain'), true);
      if (st[key]) { toast(`★ Starred: you'll get a heads-up if this line moves`); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()?.catch?.(() => {}); } catch (e) {} }
      return; }
    const sl = e.target.closest('[data-bdslip]');
    if (sl) { const [pid, k] = sl.dataset.bdslip.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k); if (x) { toggleSlip(x); bdTable($('#bdMain'), true); } return; }
    const row = e.target.closest('[data-bdrow]');
    if (row && !e.target.closest('button') && !Q1.has(row.dataset.bdrow.split('|')[1])) {
      const [pid, k, line] = row.dataset.bdrow.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k);
      if (!x) return;
      openPropDetail(pid, k, Math.floor(+line) + 1, { r: x.p, g: x.g, opp: x.opp, dr: (() => { const r = defRankOf(x.opp.id); const t = (S.standings?.confs || []).flatMap(c => c.rows).find(z => z.id === x.opp.id); return r ? { rank: r, of: (S.standings?.confs || []).flatMap(c => c.rows).length, opp: parseFloat(t?.opp) } : null; })(), mates: [], alts: BD.alts.get(pid + '|' + k) || null, peers: (BD.all || []).filter(y => y.k === k && y.log?.length && String(y.pid) !== pid).map(y => ({ pid: String(y.pid), name: y.p.name, abbr: y.p.abbr, line: y.line, log: y.log })), ...(x.log ? { log: x.log } : {}) });
    }
  });
  body.addEventListener('change', e => { if (e.target.matches('[data-bdgame]')) { BD.game = e.target.value; bdTable($('#bdMain')); } });
  body.addEventListener('input', e => { if (e.target.matches('[data-bdq]')) { BD.q = e.target.value; clearTimeout(BD.qt); BD.qt = setTimeout(() => { const pos = e.target.selectionStart; bdTable($('#bdMain'), true); const q = $('[data-bdq]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200); } });
}

/* ---------------- parlay builder ---------------- */
const SLIP_KEY = 'fc-slip';
const STATS_OF = { pts: ['pts'], reb: ['reb'], ast: ['ast'], tpm: ['tpm'], pra: ['pts', 'reb', 'ast'], pr: ['pts', 'reb'], pa: ['pts', 'ast'], ra: ['reb', 'ast'], fga: ['fga'], tpa: ['tpa'] };
const SLIP = (() => { try { const v = JSON.parse(sessionStorage.getItem(SLIP_KEY) || 'null'); if (v && Array.isArray(v.legs)) return v; } catch (e) {} return { legs: [], stake: 10, open: false }; })();
const saveSlip = () => { try { sessionStorage.setItem(SLIP_KEY, JSON.stringify(SLIP)); } catch (e) {} };
const legKey = (pid, k) => `${pid}|${k}`;
const inSlip = x => SLIP.legs.some(l => legKey(l.pid, l.k) === legKey(x.pid, x.k));
const decOf = o => { const n = +o; return n > 0 ? 1 + n / 100 : n < 0 ? 1 + 100 / -n : 1; };
const amerOf = d => d >= 2 ? '+' + Math.round((d - 1) * 100) : d > 1 ? String(Math.round(-100 / (d - 1))) : '–';
const usd = v => '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function toggleSlip(x) {
  const i = SLIP.legs.findIndex(l => legKey(l.pid, l.k) === legKey(x.pid, x.k));
  if (i >= 0) SLIP.legs.splice(i, 1);
  else {
    const side = BD.side, odds = x.est ? -115 : +(side === 'u' ? x.under : x.over) || -110;
    SLIP.legs.push({ pid: String(x.pid), k: x.k, side, line: x.line, odds, est: !!x.est, name: x.p.name, teamId: x.p.teamId, abbr: x.p.abbr, gid: x.g.id, game: `${x.g.away.abbr} @ ${x.g.home.abbr}`, date: (x.g.date || '').slice(0, 10).replace(/-/g, ''), time: x.g.state === 'pre' ? fmtTime(x.g.date) : statusText(x.g) });
    if (SLIP.legs.length === 1) SLIP.open = true;
  }
  saveSlip(); drawSlip();
}
function slipMath() {
  const d = SLIP.legs.reduce((a, l) => a * decOf(l.odds), 1), stake = Math.max(0, +SLIP.stake || 0);
  return { d, stake, pays: stake * d, win: stake * (d - 1), amer: SLIP.legs.length ? amerOf(d) : '–' };
}
function drawSlip() {
  const view = $('#v-bets'); if (!view) return;
  let dock = $('#bdSlip');
  if (!SLIP.legs.length) { dock?.remove(); return; }
  if (!dock) { dock = document.createElement('div'); dock.id = 'bdSlip'; dock.className = 'bd-slip'; view.append(dock); wireSlip(dock); }
  const m = slipMath(), n = SLIP.legs.length, mk = k => MARKETS.find(q => q[0] === k);
  const sameGame = new Set(SLIP.legs.map(l => l.gid)).size < n;
  dock.classList.toggle('open', !!SLIP.open);
  dock.innerHTML = `<button class="bs-bar" data-slipopen aria-expanded="${!!SLIP.open}">
      <span class="bs-n">${n}</span><span class="bs-t"><b>${n > 1 ? `${n}-leg parlay` : 'Single'}</b><small>${m.amer} · ${usd(m.stake)} pays ${usd(m.pays)}</small></span>
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
        <div><span>Odds</span><b>${m.amer}</b></div>
        <div><span>To win</span><b>${usd(m.win)}</b></div>
        <div><span>Pays</span><b class="pay">${usd(m.pays)}</b></div>
      </div>
      ${sameGame ? '<p class="bs-note">Some legs are from the same game. Books price same-game parlays differently, so your app may pay a bit less.</p>' : ''}
      <div class="bs-act"><button class="btn" data-sliptrack>Track ${n > 1 ? 'parlay' : 'bet'}</button><button class="btn ghost" data-slipclear>Clear</button></div>
    </div>`;
}
function wireSlip(dock) {
  dock.addEventListener('click', e => {
    if (e.target.closest('[data-slipopen]')) { SLIP.open = !SLIP.open; saveSlip(); drawSlip(); return; }
    const d = e.target.closest('[data-slipdel]'); if (d) { SLIP.legs.splice(+d.dataset.slipdel, 1); saveSlip(); drawSlip(); bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-slipclear]')) { SLIP.legs = []; saveSlip(); drawSlip(); bdTable($('#bdMain'), true); return; }
    if (e.target.closest('[data-sliptrack]')) {
      const m = slipMath();
      const legs = SLIP.legs.map(l => ({ k: 'prop', pid: l.pid, name: l.name, teamId: l.teamId, abbr: l.abbr, stats: STATS_OF[l.k], side: l.side, line: l.line, gid: l.gid, date: l.date, game: l.game, odds: l.odds }));
      const bet = { id: 'p' + Date.now().toString(36), at: Date.now(), legs, stake: m.stake || null, odds: legs.length > 1 ? Math.round(m.d >= 2 ? (m.d - 1) * 100 : -100 / (m.d - 1)) : null, toWin: m.stake ? Math.round(m.win * 100) / 100 : null };
      lazy('bets').then(b => b.addBet(bet));
      SLIP.legs = []; saveSlip(); drawSlip(); bdTable($('#bdMain'), true);
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
