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
const BD = { q1: new Map(), q1done: new Set(), mk: 'pts', side: 'o', game: 'all', q: '', sort: 'edge', dir: -1, day: 0, tab: 'props', logs: new Map(), lines: new Map(), slates: new Map() };
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
    const mk = MARKETS.find(m => m[3] === it.type?.name); if (!mk) continue;
    const pid = (it.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1]; if (!pid) continue;
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
function rowStats(r) {
  const lg = (r.log || []).map(g => ({ ...g, _pid: r.pid })).filter(g => bdVal(g, r.k) != null);
  const vals = lg.map(g => bdVal(g, r.k));
  const vsOpp = lg.filter(g => g.opp === r.opp.abbr || String(g.oppId) === String(r.opp.id)).map(g => bdVal(g, r.k));
  if (r.est) { if (!vals.length) return null; const L = vals.slice(0, 10), mean = L.reduce((a, b) => a + b, 0) / L.length; r.line = Math.floor(mean) + 0.5; }
  const L5 = vals.slice(0, 5), L10 = vals.slice(0, 10), avg = L10.length ? L10.reduce((a, b) => a + b, 0) / L10.length : null;
  const s = BD.side;
  const h5 = bdPct(L5, r.line, s), h10 = bdPct(L10, r.line, s), hs = bdPct(vals, r.line, s), hv = bdPct(vsOpp, r.line, s);
  const diff = avg == null ? null : (s === 'u' ? r.line - avg : avg - r.line);
  // edge: mostly how often it's cashed lately, nudged by how far the average sits from the line
  const edge = h10 == null ? null : h10 * 0.55 + (h5 ?? h10) * 0.25 + (hs ?? h10) * 0.2 + Math.max(-0.15, Math.min(0.15, (diff || 0) / Math.max(2, r.line) * 0.6));
  let streak = 0; for (const v of vals) { if (s === 'u' ? v < r.line : v > r.line) streak++; else break; }
  return { vals, L5, L10, h5, h10, hs, hv, nv: vsOpp.length, avg, diff, edge, streak };
}
const pill = (p, n) => p == null ? '<span class="bd-pill na">–</span>' : `<span class="bd-pill ${p >= 0.7 ? 'hot' : p >= 0.55 ? 'warm' : p <= 0.3 ? 'cold' : ''}" title="${Math.round(p * (n || 0))}/${n || 0}">${Math.round(p * 100)}%</span>`;

async function renderBetDesk() {
  const body = $('#bdBody'); if (!body) return;
  if (IS_W) { body.innerHTML = `<div class="empty"><b>Bet desk is NBA only for now</b>Sportsbook props come back when the WNBA season starts.</div>`; return; }
  if (!body.dataset.wired) bdWire(body);
  body.innerHTML = `${bdShell()}<div id="bdMain"><div class="sk" style="height:60px;margin-bottom:10px"></div><div class="sk" style="height:520px"></div></div>`;
  await Promise.all([leagueTable(), loadStandings().catch(() => {})]).catch(() => {});
  bdDraw();
}
function bdShell() {
  return `<div class="bd-top">
    <div class="seg bd-seg" data-bdtab><span class="knob"></span><button data-bdt="props" aria-pressed="${BD.tab === 'props'}">Player props</button><button data-bdt="games" aria-pressed="${BD.tab === 'games'}">Game lines</button></div>
    <div class="bd-days"><button class="chip sm" data-bdday="0" aria-pressed="${BD.day === 0}">Next up</button><button class="chip sm" data-bdday="1" aria-pressed="${BD.day === 1}">Tomorrow</button></div>
  </div>`;
}
let drawN = 0;
async function bdDraw() {
  const n = ++drawN, main = $('#bdMain'); if (!main) return;
  placeKnob($('[data-bdtab]'));
  const slate = await bdSlate(BD.day);
  if (n !== drawN) return;
  const games = slate.games.filter(g => g.state !== 'post');
  $('#bdEyebrow').textContent = `${BD.tab === 'props' ? 'Player props' : 'Game lines'} · ${slate.date === S.today ? 'Today' : fmtDay(slate.date, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  if (!games.length) { main.innerHTML = `<div class="empty"><b>No games left on this slate</b>Try tomorrow.</div>`; return; }
  if (BD.tab === 'games') return drawGames(main, games);
  // props
  const rows = await leagueTable();
  const byId = new Map(rows.map(r => [String(r.id), r]));
  main.innerHTML = `<div class="sk" style="height:520px"></div>`;
  const per = await Promise.all(games.map(g => gameProps(g).catch(() => [])));
  BD.missing = games.filter((g, i) => !per[i].length).map(g => `${g.away.abbr} @ ${g.home.abbr}`);
  const all = per.flat();
  if (n !== drawN) return;
  const games2 = new Map(games.map(g => [g.id, g]));
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
      for (const k of EST) list.push({ pid: String(p.id), k, gid: g.id, line: null, est: true, p, g, opp, at: side === g.home ? 'vs' : '@' });
      seen.add(String(p.id));
    }
  }
  BD.all = list;
  bdTable(main);
  // fill hit rates as each player's games arrive (players in the shown market first)
  const order = [...new Set([...list.filter(x => x.k === BD.mk), ...list].map(x => String(x.pid)))];
  let done = 0, pending = null;
  const refresh = () => { if (pending) return; pending = setTimeout(() => { pending = null; if (n === drawN && BD.tab === 'props') bdTable(main, true); }, 250); };
  await poolRun(order, 6, async pid => { const log = await logOf(pid); list.forEach(x => { if (String(x.pid) === pid) x.log = log; }); done++; if (done % 6 === 0) refresh(); });
  if (n === drawN && BD.tab === 'props') bdTable(main, true, true);
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
  const key = { mk: x => MARKETS.findIndex(q => q[0] === x.k), edge: x => x.st?.edge, line: x => x.line, h5: x => x.st?.h5, h10: x => x.st?.h10, hs: x => x.st?.hs, hv: x => x.st?.hv, avg: x => x.st?.avg, diff: x => x.st?.diff, odds: x => +(BD.side === 'u' ? x.under : x.over), def: x => defRankOf(x.opp.id), name: x => x.p.name }[BD.sort];
  list.sort((a, b) => { const A = key(a), B = key(b); if (A == null && B == null) return b.line - a.line; if (A == null) return 1; if (B == null) return -1; return (A > B ? 1 : A < B ? -1 : 0) * BD.dir; });
  const games = [...new Map((BD.all || []).map(x => [x.gid, x.g])).values()];
  const loading = list.some(x => !x.log) || (Q1.has(BD.mk) && BD.q1busy);
  const total = list.length; list = list.slice(0, BD.cap || 150);
  const mk = MARKETS.find(m => m[0] === BD.mk);
  const th = (k, l, cls = '') => `<th class="${cls}${BD.sort === k ? ' on' : ''}"><button data-bdsort="${k}">${l}${BD.sort === k ? (BD.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  const sc = $('.bd-wrap', main)?.scrollLeft || 0;
  main.innerHTML = `<div class="bd-ctrl">
      <div class="hs-wrap"><div class="hs chips drag-x bd-mk" data-drag><button class="chip" data-bdmk="all" aria-pressed="${ALL}">All stats</button>${MARKETS.map(m => `<button class="chip${EST.has(m[0]) ? ' est' : ''}" data-bdmk="${m[0]}" aria-pressed="${m[0] === BD.mk}">${m[1]}</button>`).join('')}</div></div>
      <div class="bd-row2">
        <div class="seg bd-side" data-bdsideseg><span class="knob"></span><button data-bdside="o" aria-pressed="${BD.side === 'o'}">Over</button><button data-bdside="u" aria-pressed="${BD.side === 'u'}">Under</button></div>
        <select class="bd-sel" data-bdgame aria-label="Game"><option value="all">All games with props</option>${games.map(g => `<option value="${g.id}" ${BD.game === g.id ? 'selected' : ''}>${esc(g.away.abbr)} @ ${esc(g.home.abbr)} · ${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</option>`).join('')}</select>
        <input class="bd-q" type="search" placeholder="Find a player" value="${esc(BD.q)}" data-bdq aria-label="Find a player">
      </div>
    </div>
    ${list.length ? `<div class="bd-wrap drag-x" data-drag><table class="bd-t">
      <thead><tr>${th('name', 'Player', 'pl')}${ALL ? th('mk', 'Market') : ''}${th('line', 'Line')}${th('odds', BD.side === 'u' ? 'Under' : 'Over', 'dk')}${th('h5', 'L5')}${th('h10', 'L10')}${th('hs', 'Season', 'dk')}${th('hv', 'H2H', 'dk')}${th('avg', 'Avg L10', 'dk')}${th('diff', '+/−', 'dk')}${th('def', 'Opp D', 'dk')}${th('edge', 'Score', 'dk')}<th class="tr"></th></tr></thead>
      <tbody>${list.map(x => {
        const s = x.st, mv = Number.isFinite(x.open) && x.open !== x.line ? `<em class="${x.line > x.open ? 'up' : 'dn'}" title="Opened ${x.open}">${x.line > x.open ? '▲' : '▼'}</em>` : '';
        const dr = defRankOf(x.opp.id);
        return `<tr data-bdrow="${x.pid}|${x.k}|${x.line}" ${Q1.has(x.k) ? `data-player="${x.p.id}"` : ''}>
          <td class="pl"><span class="bd-pl">${face(x.p.id, x.p.name, 'bd-face', 120)}<span><b>${esc(x.p.name)}</b><small>${logo(x.p.abbr, 32)}${esc(x.p.abbr)} ${x.at} ${esc(x.opp.abbr)} · ${esc(x.g.state === 'pre' ? fmtTime(x.g.date) : statusText(x.g))}</small><small class="bd-mob">${amer(BD.side === 'u' ? x.under : x.over)}${s?.avg != null ? ` · avg ${s.avg.toFixed(1)}` : ''}${s?.hs != null ? ` · season ${Math.round(s.hs * 100)}%` : ''}${dr ? ` · ${ordN(dr)} D` : ''}</small></span></span></td>
          ${ALL ? `<td class="mk"><span class="bd-mkt">${esc(MARKETS.find(q => q[0] === x.k)[2])}</span></td>` : ''}
          <td class="ln">${x.line != null ? `<b>${x.line}</b>${x.est ? '<em class="est" title="Fullcourt line: set at his average over the last 10 games. No sportsbook line in the feed.">est</em>' : mv}` : '<span class="bd-ld"></span>'}</td>
          <td class="od dk">${x.est ? '<span class="bd-pill na">–</span>' : amer(BD.side === 'u' ? x.under : x.over)}</td>
          <td>${s ? pill(s.h5, s.L5.length) : '<span class="bd-ld"></span>'}</td>
          <td>${s ? pill(s.h10, s.L10.length) : '<span class="bd-ld"></span>'}</td>
          <td class="dk">${s ? pill(s.hs, s.vals.length) : '<span class="bd-ld"></span>'}</td>
          <td class="dk">${s ? (s.nv ? pill(s.hv, s.nv) : '<span class="bd-pill na">–</span>') : '<span class="bd-ld"></span>'}</td>
          <td class="nm dk">${s?.avg != null ? s.avg.toFixed(1) : '–'}</td>
          <td class="nm dk ${s?.diff > 0 ? 'pos' : s?.diff < 0 ? 'neg' : ''}">${s?.diff != null ? (s.diff > 0 ? '+' : '') + s.diff.toFixed(1) : '–'}</td>
          <td class="nm dk">${dr ? `<span class="bd-def ${dr >= 21 ? 'soft' : dr <= 10 ? 'tough' : ''}">${ordN(dr)}</span>` : '–'}</td>
          <td class="sc dk">${s?.edge != null ? `<span class="bd-score"><i style="width:${Math.round(Math.max(0, Math.min(1, s.edge)) * 100)}%"></i></span>` : ''}</td>
          <td class="tr">${Q1.has(x.k) ? '' : `<button class="bd-add" data-bdtrack="${x.pid}|${x.k}|${x.line}" title="Track this" aria-label="Track ${esc(x.p.name)} ${BD.side === 'u' ? 'under' : 'over'} ${x.line}">+</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty"><b>No ${esc(mk[1].toLowerCase())} props${BD.game !== 'all' ? ' for this game' : ''}${BD.q ? ' for that search' : ''}</b>Try another market or game.</div>`}
    ${total > list.length ? `<div class="bd-more"><button class="btn ghost" data-bdmore>Show ${Math.min(150, total - list.length)} more of ${total}</button></div>` : ''}
    ${EST.has(BD.mk) ? `<p class="bd-note bd-miss">No sportsbook posts ${esc(MARKETS.find(q => q[0] === BD.mk)[1])} lines to this feed, so the line marked <em class="est">est</em> is Fullcourt's, set at the half-point just above or below his average over the last 10 games, the way books usually set them. ${Q1.has(BD.mk) ? 'First-quarter numbers come from play-by-play of each team\'s last 5 games.' : ''}</p>` : ''}
    ${BD.missing?.length ? `<p class="bd-note bd-miss">Props aren't posted yet for ${esc(BD.missing.join(', '))}. Books usually add them the morning of the game.</p>` : ''}
    <p class="bd-note">${loading ? '<span class="bd-ld"></span> Loading each player\'s games… ' : ''}Lines and odds from DraftKings via ESPN, refreshed every few minutes. Hit rates are how often he's gone ${BD.side === 'u' ? 'under' : 'over'} this exact line: last 5, last 10, the season, and against tonight's opponent (H2H). Opp D ranks points allowed (30th is the softest). Score blends those. Tap a row for the full breakdown. Trends, not betting advice.</p>`;
  const w = $('.bd-wrap', main); if (w && keepScroll) w.scrollLeft = sc;
  wireDrag(main);
  placeKnob($('[data-bdsideseg]', main));
}
const ordN = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function drawGames(main, games) {
  const std = new Map((S.standings?.confs || []).flatMap(c => c.rows).map(r => [r.id, r]));
  const card = g => {
    const o = g.odds, H = std.get(g.home.id), A = std.get(g.away.id);
    let proj = null, margin = null;
    if (H && A) { const hp = parseFloat(H.ppg), ho = parseFloat(H.opp), ap = parseFloat(A.ppg), ao = parseFloat(A.opp); if ([hp, ho, ap, ao].every(Number.isFinite)) { proj = (hp + ao) / 2 + (ap + ho) / 2; margin = ((hp - ho) - (ap - ao)) / 2 + 1.5; } }
    const hs = parseFloat(o?.home?.spread);
    const tl = o?.ou != null && proj != null ? proj - o.ou : null, sl = Number.isFinite(hs) && margin != null ? margin + hs : null;
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
    const t = e.target.closest('[data-bdt]'); if (t) { BD.tab = t.dataset.bdt; $$('[data-bdt]').forEach(b => b.setAttribute('aria-pressed', b === t)); bdDraw(); return; }
    const d = e.target.closest('[data-bdday]'); if (d) { BD.day = +d.dataset.bdday; BD.game = 'all'; $$('[data-bdday]').forEach(b => b.setAttribute('aria-pressed', b === d)); bdDraw(); return; }
    const m = e.target.closest('[data-bdmk]'); if (m) { BD.mk = m.dataset.bdmk; BD.cap = 150; if (BD.mk === 'all' && BD.sort === 'line') BD.sort = 'edge'; bdTable($('#bdMain')); if (Q1.has(BD.mk)) bdSlate(BD.day).then(sl => loadQ1(sl.games.filter(g => g.state !== 'post'), drawN, $('#bdMain'))); return; }
    if (e.target.closest('[data-bdmore]')) { BD.cap = (BD.cap || 150) + 150; bdTable($('#bdMain'), true); return; }
    const sd = e.target.closest('[data-bdside]'); if (sd) { BD.side = sd.dataset.bdside; bdTable($('#bdMain'), true); return; }
    const so = e.target.closest('[data-bdsort]'); if (so) { const k = so.dataset.bdsort; if (BD.sort === k) BD.dir = -BD.dir; else { BD.sort = k; BD.dir = k === 'name' || k === 'mk' || k === 'def' && BD.side === 'u' ? 1 : -1; } bdTable($('#bdMain'), true); return; }
    const tr = e.target.closest('[data-bdtrack]');
    if (tr) { const [pid, k, line] = tr.dataset.bdtrack.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k); const mk = MARKETS.find(q => q[0] === k); if (x && !Q1.has(k)) openAsk(`Track: ${x.p.name} ${BD.side === 'u' ? 'under' : 'over'} ${line} ${mk[4]} ${amer(BD.side === 'u' ? x.under : x.over)}`); return; }
    const row = e.target.closest('[data-bdrow]');
    if (row && !e.target.closest('button') && !Q1.has(row.dataset.bdrow.split('|')[1])) {
      const [pid, k, line] = row.dataset.bdrow.split('|'); const x = BD.all.find(y => String(y.pid) === pid && y.k === k);
      if (!x) return;
      openPropDetail(pid, k, Math.floor(+line) + 1, { r: x.p, g: x.g, opp: x.opp, dr: (() => { const r = defRankOf(x.opp.id); const t = (S.standings?.confs || []).flatMap(c => c.rows).find(z => z.id === x.opp.id); return r ? { rank: r, of: (S.standings?.confs || []).flatMap(c => c.rows).length, opp: parseFloat(t?.opp) } : null; })(), mates: [], ...(x.log ? { log: x.log } : {}) });
    }
  });
  body.addEventListener('change', e => { if (e.target.matches('[data-bdgame]')) { BD.game = e.target.value; bdTable($('#bdMain')); } });
  body.addEventListener('input', e => { if (e.target.matches('[data-bdq]')) { BD.q = e.target.value; clearTimeout(BD.qt); BD.qt = setTimeout(() => { const pos = e.target.selectionStart; bdTable($('#bdMain'), true); const q = $('[data-bdq]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200); } });
}
