/* ---------------- History: Game finder ----------------
   Every NBA game since 2000-01, every player's line, searchable: "Knicks 40-point games", "triple-doubles against the
   Celtics", "Kobe's 50-point games", "games decided in triple overtime". The data is built daily on GitHub
   (tools/gamelogs.mjs) and published to the gamelog-data branch, one file per season; the seasons a search needs are
   loaded the first time, then kept in the browser (past seasons don't change, the current one is refreshed every few
   hours). */
const GF_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt/gamelog-data';
const GF_STORE = 'fc-keep-gf-v1';
// ESPN's franchise ids, named as they are now (older games show the name of the day: NJ, SEA, VAN ...)
const GF_TEAMS = [[1, 'ATL', 'Atlanta Hawks'], [2, 'BOS', 'Boston Celtics'], [17, 'BKN', 'Brooklyn Nets'], [30, 'CHA', 'Charlotte Hornets'], [4, 'CHI', 'Chicago Bulls'], [5, 'CLE', 'Cleveland Cavaliers'], [6, 'DAL', 'Dallas Mavericks'], [7, 'DEN', 'Denver Nuggets'], [8, 'DET', 'Detroit Pistons'], [9, 'GS', 'Golden State Warriors'], [10, 'HOU', 'Houston Rockets'], [11, 'IND', 'Indiana Pacers'], [12, 'LAC', 'LA Clippers'], [13, 'LAL', 'Los Angeles Lakers'], [29, 'MEM', 'Memphis Grizzlies'], [14, 'MIA', 'Miami Heat'], [15, 'MIL', 'Milwaukee Bucks'], [16, 'MIN', 'Minnesota Timberwolves'], [3, 'NO', 'New Orleans Pelicans'], [18, 'NY', 'New York Knicks'], [25, 'OKC', 'Oklahoma City Thunder'], [19, 'ORL', 'Orlando Magic'], [20, 'PHI', 'Philadelphia 76ers'], [21, 'PHX', 'Phoenix Suns'], [22, 'POR', 'Portland Trail Blazers'], [23, 'SAC', 'Sacramento Kings'], [24, 'SA', 'San Antonio Spurs'], [28, 'TOR', 'Toronto Raptors'], [26, 'UTAH', 'Utah Jazz'], [27, 'WSH', 'Washington Wizards']];
const GF_TNAME = Object.fromEntries(GF_TEAMS.map(([id, , n]) => [id, n]));
// what a player's game can be searched on
const GF_PSTATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-pointers made'], ['tpa', '3-pointers tried'], ['fgm', 'Field goals made'], ['fga', 'Field goals tried'], ['fgp', 'FG %'], ['ftm', 'Free throws made'], ['fta', 'Free throws tried'], ['oreb', 'Offensive rebounds'], ['tov', 'Turnovers'], ['min', 'Minutes'], ['pm', 'Plus-minus'], ['pra', 'Pts + reb + ast'], ['stocks', 'Steals + blocks']];
const GF_TSTATS = [['tp', 'Team points'], ['op', 'Opponent points'], ['mg', 'Winning margin'], ['tot', 'Combined points'], ['ot', 'Overtimes']];
const GF_PRESETS = [
  ['40-point games', { kind: 'p', conds: [['pts', '>=', 40]] }], ['50-point games', { kind: 'p', conds: [['pts', '>=', 50]] }],
  ['Triple-doubles', { kind: 'p', conds: [['td', 'yes', 1]] }], ['20-20 games', { kind: 'p', conds: [['pts', '>=', 20], ['reb', '>=', 20]] }],
  ['10+ threes', { kind: 'p', conds: [['tpm', '>=', 10]] }], ['20+ assists', { kind: 'p', conds: [['ast', '>=', 20]] }],
  ['10+ blocks', { kind: 'p', conds: [['blk', '>=', 10]] }], ['Team scored 150+', { kind: 't', conds: [['tp', '>=', 150]] }],
  ['Won by 40+', { kind: 't', conds: [['mg', '>=', 40]] }], ['Triple overtime', { kind: 't', conds: [['ot', '>=', 3]] }],
];
const GF_SHOW = 100;

let GF_IDX = null; // players.json
const GF_SEAS = new Map(); // year -> season data (promise)
const GF0 = () => ({ kind: 'p', pid: '', pname: '', team: '', opp: '', from: 0, to: 0, type: 'all', loc: 'all', res: 'all', conds: [['pts', '>=', 40]], sort: '', n: GF_SHOW });
const GF = (() => { try { return { ...GF0(), ...JSON.parse(lsGet('fc-gf') || '{}'), n: GF_SHOW }; } catch (e) { return GF0(); } })();
const gfSave = () => { const { n, ...keep } = GF; lsSet('fc-gf', JSON.stringify(keep)); };
let gfLast = null; // the last search's results

const gfYearLabel = y => `${y - 1}-${String(y).slice(2)}`;
const gfFold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const gfDate = d => { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };

async function gfFetch(path, fresh) {
  const url = `${GF_RAW}/${path}`, key = `${location.origin}/__fc-gf/${encodeURIComponent(path)}`;
  try {
    if (self.caches) {
      const c = await caches.open(GF_STORE), hit = await c.match(key);
      if (hit) { const t = +hit.headers.get('x-t') || 0; if (!fresh || Date.now() - t < fresh) return await hit.json(); }
      const r = await fetch(`${url}?t=${Math.floor(Date.now() / 36e5)}`); if (!r.ok) throw new Error(r.status);
      const txt = await r.text();
      c.put(key, new Response(txt, { headers: { 'content-type': 'application/json', 'x-t': String(Date.now()) } })).catch(() => {});
      return JSON.parse(txt);
    }
  } catch (e) { if (String(e.message) === '404') throw e; }
  const r = await fetch(`${url}?t=${Math.floor(Date.now() / 36e5)}`); if (!r.ok) throw new Error(r.status); return r.json();
}
const gfIndex = () => GF_IDX ||= gfFetch('players.json', 3 * 36e5).catch(e => { GF_IDX = null; throw e; });
function gfSeason(y, cur) {
  if (!GF_SEAS.has(y)) GF_SEAS.set(y, gfFetch(`gl/${y}.json`, y >= cur ? 3 * 36e5 : 0).catch(e => { GF_SEAS.delete(y); throw e; }));
  return GF_SEAS.get(y);
}

/* ---------- the form ---------- */
async function histFinder(pane) {
  let idx;
  try { idx = await gfIndex(); }
  catch (e) { pane.innerHTML = `<div class="empty"><b>The game archive is still being built</b><span>Every game since 2000-01 is being collected for the first time. Check back in a little while.</span><button class="btn" data-gfretry>Try again</button></div>`; gfWire(pane); return; }
  const first = idx.first, cur = idx.last;
  if (!GF.from || GF.from < first || GF.from > cur) GF.from = first;
  if (!GF.to || GF.to > cur || GF.to < GF.from) GF.to = cur;
  const yOpts = sel => Array.from({ length: cur - first + 1 }, (_, i) => cur - i).map(y => `<option value="${y}"${y === sel ? ' selected' : ''}>${gfYearLabel(y)}</option>`).join('');
  const tOpts = (sel, any) => `<option value="">${any}</option>${GF_TEAMS.map(([id, ab, n]) => `<option value="${id}"${String(sel) === String(id) ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;
  const stats = GF.kind === 'p' ? GF_PSTATS : GF_TSTATS;
  const condRow = ([k, op, v], i) => k === 'td' || k === 'dd'
    ? `<div class="gf-cond"><span class="gf-flag">${k === 'td' ? 'Triple-double' : 'Double-double'}</span><button class="gf-x" data-gfdel="${i}" aria-label="Remove">×</button></div>`
    : `<div class="gf-cond"><select class="bd-sel" data-gfck="${i}" aria-label="Stat">${stats.map(([s, l]) => `<option value="${s}"${s === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select class="bd-sel gf-op" data-gfco="${i}" aria-label="Compare">${[['>=', 'at least'], ['<=', 'at most'], ['=', 'exactly']].map(([o, l]) => `<option value="${o}"${o === op ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input class="gf-num" type="number" inputmode="numeric" value="${esc(String(v))}" data-gfcv="${i}" aria-label="Value">${k === 'fgp' ? '<em>%</em>' : ''}
        <button class="gf-x" data-gfdel="${i}" aria-label="Remove">×</button></div>`;
  pane.innerHTML = `<div class="gf">
    <div class="gf-pre" role="group" aria-label="Quick searches">${GF_PRESETS.map(([l], i) => `<button class="chip" data-gfpre="${i}">${esc(l)}</button>`).join('')}</div>
    <div class="card gf-form">
      <div class="gf-row">
        <div class="seg sm" data-gfkind><span class="knob"></span><button data-gfkind="p" aria-pressed="${GF.kind === 'p'}">Player games</button><button data-gfkind="t" aria-pressed="${GF.kind === 't'}">Team games</button></div>
      </div>
      <div class="gf-grid">
        ${GF.kind === 'p' ? `<label class="gf-f gf-who"><span>Player</span><div class="gf-pwrap"><input type="search" placeholder="Any player" value="${esc(GF.pname)}" data-gfpq autocomplete="off" aria-label="Player">${GF.pid ? '<button class="gf-x" data-gfpclr aria-label="Any player">×</button>' : ''}<div class="gf-sug" hidden></div></div></label>` : ''}
        <label class="gf-f"><span>${GF.kind === 'p' ? 'Playing for' : 'Team'}</span><select class="bd-sel" data-gff="team">${tOpts(GF.team, 'Any team')}</select></label>
        <label class="gf-f"><span>Against</span><select class="bd-sel" data-gff="opp">${tOpts(GF.opp, 'Any opponent')}</select></label>
        <label class="gf-f"><span>From</span><select class="bd-sel" data-gff="from">${yOpts(GF.from)}</select></label>
        <label class="gf-f"><span>To</span><select class="bd-sel" data-gff="to">${yOpts(GF.to)}</select></label>
        <label class="gf-f"><span>Games</span><select class="bd-sel" data-gff="type">${[['all', 'Regular season + playoffs'], ['reg', 'Regular season'], ['post', 'Playoffs']].map(([k, l]) => `<option value="${k}"${GF.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="gf-f"><span>Where</span><select class="bd-sel" data-gff="loc">${[['all', 'Home or away'], ['home', 'Home'], ['away', 'Away']].map(([k, l]) => `<option value="${k}"${GF.loc === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="gf-f"><span>Result</span><select class="bd-sel" data-gff="res">${[['all', 'Win or loss'], ['W', 'Wins'], ['L', 'Losses']].map(([k, l]) => `<option value="${k}"${GF.res === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="gf-conds"><span class="gf-lab">Where the ${GF.kind === 'p' ? 'player had' : 'game had'}</span>${GF.conds.map(condRow).join('') || '<span class="gf-none">Any game</span>'}
        <div class="gf-add"><button class="btn sm ghost" data-gfadd>+ Stat</button>${GF.kind === 'p' ? '<button class="btn sm ghost" data-gfadd="td">+ Triple-double</button><button class="btn sm ghost" data-gfadd="dd">+ Double-double</button>' : ''}</div></div>
      <div class="gf-go"><button class="btn" data-gfgo>Find games</button><span class="gf-cover">${gfYearLabel(first)} to now · ${idx.players.length.toLocaleString()} players</span></div>
    </div>
    <div class="gf-out" id="gfOut">${gfLast ? '' : '<p class="gf-hint">Pick a quick search above, or set the filters and press Find games.</p>'}</div>
  </div>`;
  $$('.seg', pane).forEach(placeKnob);
  gfWire(pane);
  if (gfLast) gfDraw();
}

/* ---------- the search ---------- */
async function gfRun() {
  const out = $('#gfOut'); if (!out) return;
  const idx = await gfIndex(), years = []; for (let y = GF.from; y <= GF.to; y++) years.push(y);
  const my = (gfRun.n = (gfRun.n || 0) + 1);
  let done = 0;
  const bar = () => { if (my === gfRun.n && out.isConnected) out.innerHTML = `<div class="gf-load"><span>Loading ${years.length === 1 ? gfYearLabel(years[0]) : `seasons ${done} of ${years.length}`}</span><div class="gf-bar"><i style="width:${Math.round(done / years.length * 100)}%"></i></div></div>`; };
  bar();
  const seasons = new Array(years.length); let i = 0, failed = 0;
  await Promise.all([0, 1, 2].map(async () => { while (i < years.length) { const j = i++; try { seasons[j] = await gfSeason(years[j], idx.last); } catch (e) { failed++; } done++; bar(); } }));
  if (my !== gfRun.n) return;
  const res = [];
  const cmp = (v, op, x) => op === '>=' ? v >= x : op === '<=' ? v <= x : v === x;
  const conds = GF.conds.map(([k, op, v]) => [k, op, +v]).filter(([k, , v]) => k === 'td' || k === 'dd' || Number.isFinite(v));
  const team = +GF.team || 0, opp = +GF.opp || 0, pid = GF.kind === 'p' && GF.pid ? +GF.pid : 0;
  for (const S of seasons) {
    if (!S) continue;
    const G = S.games, R = S.r, P = S.players;
    const okGame = gi => (GF.type === 'all' || (GF.type === 'post' ? G.st[gi] === 3 : G.st[gi] !== 3));
    if (GF.kind === 't') {
      for (let gi = 0; gi < G.id.length; gi++) {
        if (!okGame(gi)) continue;
        for (const side of [0, 1]) {
          const t = side ? G.a[gi] : G.h[gi], o = side ? G.h[gi] : G.a[gi], tp = side ? G.as[gi] : G.hs[gi], op = side ? G.hs[gi] : G.as[gi];
          if (team && t !== team) continue; if (opp && o !== opp) continue;
          if (!team && !opp && side === 1 && !conds.some(c => c[0] === 'tp' || c[0] === 'op' || c[0] === 'mg')) continue; // one row a game unless a side matters
          if (GF.loc !== 'all' && (GF.loc === 'home') !== (side === 0)) continue;
          const win = tp > op; if (GF.res !== 'all' && (GF.res === 'W') !== win) continue;
          const val = { tp, op, mg: tp - op, tot: tp + op, ot: G.ot[gi] };
          if (!conds.every(([k, o2, x]) => cmp(val[k], o2, x))) continue;
          res.push({ S, gi, side, t, o, val });
        }
      }
      continue;
    }
    if (S.nopm && conds.some(c => c[0] === 'pm')) continue; // no plus-minus on ESPN before 2007-08
    const pix = pid ? P.id.indexOf(pid) : -1; if (pid && pix < 0) continue;
    for (let r = 0; r < R.g.length; r++) {
      if (pid && R.p[r] !== pix) continue;
      const gi = R.g[r]; if (!okGame(gi)) continue;
      const side = R.t[r], t = side ? G.a[gi] : G.h[gi], o = side ? G.h[gi] : G.a[gi];
      if (team && t !== team) continue; if (opp && o !== opp) continue;
      if (GF.loc !== 'all' && (GF.loc === 'home') !== (side === 0)) continue;
      const tp = side ? G.as[gi] : G.hs[gi], op = side ? G.hs[gi] : G.as[gi]; if (GF.res !== 'all' && (GF.res === 'W') !== (tp > op)) continue;
      let ok = true;
      for (const [k, o2, x] of conds) {
        let v;
        if (k === 'td' || k === 'dd') { const n = [R.pts[r], R.reb[r], R.ast[r], R.stl[r], R.blk[r]].filter(y => y >= 10).length; if (n < (k === 'td' ? 3 : 2)) { ok = false; break; } continue; }
        if (k === 'pra') v = R.pts[r] + R.reb[r] + R.ast[r]; else if (k === 'stocks') v = R.stl[r] + R.blk[r];
        else if (k === 'fgp') v = R.fga[r] ? R.fgm[r] / R.fga[r] * 100 : -1; else v = R[k][r];
        if (!cmp(v, o2, x)) { ok = false; break; }
      }
      if (ok) res.push({ S, gi, r, side, t, o });
    }
  }
  // newest first, or by the stat searched on (the first one), biggest first
  const sk = GF.sort || (conds.find(c => c[0] !== 'td' && c[0] !== 'dd' && c[1] !== '<=')?.[0]) || 'date';
  const sv = x => sk === 'date' ? 0 : x.val ? x.val[sk] ?? 0 : sk === 'pra' ? x.S.r.pts[x.r] + x.S.r.reb[x.r] + x.S.r.ast[x.r] : sk === 'stocks' ? x.S.r.stl[x.r] + x.S.r.blk[x.r] : sk === 'fgp' ? (x.S.r.fga[x.r] ? x.S.r.fgm[x.r] / x.S.r.fga[x.r] : 0) : x.S.r[sk]?.[x.r] ?? 0;
  res.sort((a, b) => sv(b) - sv(a) || b.S.games.d[b.gi] - a.S.games.d[a.gi]);
  gfLast = { res, sk, failed, conds, kind: GF.kind, pid };
  GF.n = GF_SHOW;
  gfDraw();
}

/* ---------- the results ---------- */
function gfDraw() {
  const out = $('#gfOut'); if (!out || !gfLast) return;
  const { res, sk, failed, conds, kind, pid } = gfLast;
  if (!res.length) { out.innerHTML = `<div class="empty"><b>No games found</b><span>Try a wider range of seasons or fewer conditions.</span></div>`; return; }
  const hot = new Set(conds.map(c => c[0] === 'td' || c[0] === 'dd' ? ['pts', 'reb', 'ast'] : c[0] === 'pra' ? ['pts', 'reb', 'ast'] : c[0] === 'stocks' ? ['stl', 'blk'] : c[0] === 'fgp' ? ['fg'] : [c[0]]).flat());
  const abbr = (S, id) => S.teams[id]?.[0] || '';
  const wins = res.filter(x => (x.side ? x.S.games.as[x.gi] : x.S.games.hs[x.gi]) > (x.side ? x.S.games.hs[x.gi] : x.S.games.as[x.gi])).length;
  // who has the most of them (any player), or which teams (team games)
  let leaders = '';
  if (kind === 'p' && !pid) {
    const by = new Map(); for (const x of res) { const id = x.S.players.id[x.S.r.p[x.r]]; const e = by.get(id) || by.set(id, { n: 0, name: x.S.players.n[x.S.r.p[x.r]] }).get(id); e.n++; }
    const top = [...by].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (top.length > 1) leaders = `<div class="gf-lead"><span class="gf-lab">Most</span>${top.map(([id, e]) => `<button class="gf-lp" data-gfwho="${id}" data-name="${esc(e.name)}" title="Only ${esc(e.name)}">${face(id, e.name, 'gf-lf', 60)}<span>${esc(e.name)}</span><b>${e.n}</b></button>`).join('')}</div>`;
  }
  const head = kind === 'p'
    ? '<tr><th>Date</th><th class="gf-pl">Player</th><th>Game</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>3PM</th><th>FG</th><th>FT</th><th>TO</th><th>+/−</th></tr>'
    : '<tr><th>Date</th><th>Team</th><th>Game</th><th>Result</th><th>Score</th><th>Margin</th><th>Total</th></tr>';
  const phone = matchMedia('(max-width: 600px)').matches;
  const rows = res.slice(0, GF.n).map(x => {
    const { S, gi, side, t, o } = x, G = S.games, tp = side ? G.as[gi] : G.hs[gi], op = side ? G.hs[gi] : G.as[gi], w = tp > op;
    const ot = G.ot[gi] ? ` ${G.ot[gi] > 1 ? G.ot[gi] : ''}OT` : '', po = G.st[gi] === 3 ? '<em class="gf-po">Playoffs</em>' : G.st[gi] === 5 ? '<em class="gf-po">Play-in</em>' : '';
    const game = `${side ? '@' : 'vs'} ${esc(abbr(S, o))}`, result = `<span class="${w ? 'strk-w' : 'strk-l'}">${w ? 'W' : 'L'}</span> ${tp}-${op}${ot}`;
    if (kind === 't') return `<tr data-game="${G.id[gi]}"><td>${gfDate(G.d[gi])}${po}</td><td><b>${esc(abbr(S, t))}</b></td><td>${game}</td><td>${result}</td><td>${tp}-${op}</td><td class="${sk === 'mg' ? 'hot' : ''}">${tp - op > 0 ? '+' : ''}${tp - op}</td><td class="${sk === 'tot' ? 'hot' : ''}">${tp + op}</td></tr>`;
    const R = S.r, r = x.r, pi = R.p[r], id = S.players.id[pi], nm = S.players.n[pi], c = k => hot.has(k) ? ' class="hot"' : '';
    // a phone gets one compact card a game: who, when, the result, then his line with the searched numbers lit
    if (phone) {
      const st = (k, v, l) => `<span${hot.has(k) ? ' class="hot"' : ''}><b>${v}</b> ${l}</span>`;
      return `<div class="gf-mi" data-game="${G.id[gi]}" data-legpid="${id}" role="button" tabindex="0"><div class="gf-mh"><button class="gf-pn" data-player="${id}">${face(id, nm, 'gf-pf', 60)}<span>${esc(nm)}</span></button><small>${esc(abbr(S, t))} ${game} · ${gfDate(G.d[gi])}</small></div>
        <div class="gf-ms"><span class="gf-mr">${result}</span>${po}${st('pts', R.pts[r], 'PTS')}${st('reb', R.reb[r], 'REB')}${st('ast', R.ast[r], 'AST')}${R.stl[r] || hot.has('stl') ? st('stl', R.stl[r], 'STL') : ''}${R.blk[r] || hot.has('blk') ? st('blk', R.blk[r], 'BLK') : ''}${R.tpm[r] || hot.has('tpm') ? st('tpm', R.tpm[r], '3PM') : ''}${st('fg', `${R.fgm[r]}-${R.fga[r]}`, 'FG')}${st('min', R.min[r], 'MIN')}${hot.has('tov') ? st('tov', R.tov[r], 'TO') : ''}${hot.has('pm') && !S.nopm ? st('pm', (R.pm[r] > 0 ? '+' : '') + R.pm[r], '+/−') : ''}</div></div>`;
    }
    return `<tr data-game="${G.id[gi]}" data-legpid="${id}"><td>${gfDate(G.d[gi])}${po}</td><td class="gf-pl"><button class="gf-pn" data-player="${id}">${face(id, nm, 'gf-pf', 60)}<span>${esc(nm)}</span></button><small>${esc(abbr(S, t))}</small></td><td>${game}</td><td>${result}</td>
      <td${c('min')}>${R.min[r]}</td><td${c('pts')}>${R.pts[r]}</td><td${c('reb')}>${R.reb[r]}</td><td${c('ast')}>${R.ast[r]}</td><td${c('stl')}>${R.stl[r]}</td><td${c('blk')}>${R.blk[r]}</td><td${c('tpm')}>${R.tpm[r]}</td><td${c('fg')}>${R.fgm[r]}-${R.fga[r]}</td><td>${R.ftm[r]}-${R.fta[r]}</td><td${c('tov')}>${R.tov[r]}</td><td${c('pm')}>${S.nopm ? '–' : `${R.pm[r] > 0 ? '+' : ''}${R.pm[r]}`}</td></tr>`;
  }).join('');
  const sortOpts = [['date', 'Newest first'], ...(kind === 'p' ? GF_PSTATS : GF_TSTATS).map(([k, l]) => [k, `Most ${l.toLowerCase()}`])];
  out.innerHTML = `<div class="gf-sum"><b>${res.length.toLocaleString()}</b><span>game${res.length === 1 ? '' : 's'}${GF.team || pid ? ` · ${wins}-${res.length - wins}` : ''}</span>
      <label class="gf-sort">Sort <select class="bd-sel" data-gfsort>${sortOpts.map(([k, l]) => `<option value="${k}"${k === sk ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    ${failed ? `<p class="gf-hint">${failed} season${failed === 1 ? '' : 's'} didn't load, so a few games may be missing.</p>` : ''}
    ${leaders}
    ${phone && kind === 'p' ? `<div class="card gf-ml">${rows}</div>` : `<div class="card gf-tw"><table class="gf-t"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`}
    ${res.length > GF.n ? `<button class="btn ghost gf-more" data-gfmore>Show more (${(res.length - GF.n).toLocaleString()} left)</button>` : ''}
    <p class="gf-hint">Tap a game for its box score${kind === 'p' ? ', or a player for his page' : ''}. Box scores from ESPN, back to the 2000-01 season.</p>`;
}

/* ---------- events ---------- */
function gfWire(pane) {
  if (pane._gf) return; pane._gf = true;
  const redraw = () => { gfSave(); const host = pane; histFinder(host); };
  pane.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-gfretry]')) { GF_IDX = null; redraw(); return; }
    const k = t.closest('button[data-gfkind]'); if (k) { if (GF.kind !== k.dataset.gfkind) { GF.kind = k.dataset.gfkind; GF.conds = GF.kind === 'p' ? [['pts', '>=', 40]] : [['tp', '>=', 140]]; GF.sort = ''; gfLast = null; redraw(); } return; }
    const pr = t.closest('[data-gfpre]'); if (pr) { const P0 = GF_PRESETS[+pr.dataset.gfpre][1]; Object.assign(GF, { kind: P0.kind, conds: P0.conds.map(c => [...c]), sort: '' }); if (P0.kind === 't') { GF.pid = ''; GF.pname = ''; } redraw(); gfRun(); return; }
    const d = t.closest('[data-gfdel]'); if (d) { GF.conds.splice(+d.dataset.gfdel, 1); redraw(); return; }
    const a = t.closest('[data-gfadd]'); if (a) { const f = a.dataset.gfadd; if (f) { if (!GF.conds.some(c => c[0] === f)) GF.conds.push([f, 'yes', 1]); } else GF.conds.push([GF.kind === 'p' ? 'reb' : 'mg', '>=', GF.kind === 'p' ? 10 : 20]); redraw(); return; }
    if (t.closest('[data-gfgo]')) { gfSave(); gfRun(); return; }
    if (t.closest('[data-gfmore]')) { GF.n += GF_SHOW * 2; gfDraw(); return; }
    if (t.closest('[data-gfpclr]')) { GF.pid = ''; GF.pname = ''; redraw(); return; }
    const s = t.closest('[data-gfsug]'); if (s) { GF.pid = s.dataset.gfsug; GF.pname = s.dataset.name; redraw(); return; }
    const w = t.closest('[data-gfwho]'); if (w) { e.stopPropagation(); GF.pid = w.dataset.gfwho; GF.pname = w.dataset.name; redraw(); gfRun(); return; }
    // the player's name opens his page; the rest of the row opens the game
    const pn = t.closest('.gf-pn'); if (pn) { e.stopPropagation(); openPlayer(pn.dataset.player); }
  }, true);
  pane.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-gff]')) { const f = t.dataset.gff; GF[f] = f === 'from' || f === 'to' ? +t.value : t.value; if (GF.from > GF.to) { if (f === 'from') GF.to = GF.from; else GF.from = GF.to; redraw(); } gfSave(); return; }
    if (t.matches('[data-gfck]')) { GF.conds[+t.dataset.gfck][0] = t.value; gfSave(); return; }
    if (t.matches('[data-gfco]')) { GF.conds[+t.dataset.gfco][1] = t.value; gfSave(); return; }
    if (t.matches('[data-gfsort]')) { GF.sort = t.value; gfSave(); gfRun(); }
  });
  pane.addEventListener('input', async e => {
    const t = e.target;
    if (t.matches('[data-gfcv]')) { GF.conds[+t.dataset.gfcv][2] = t.value; gfSave(); return; }
    if (!t.matches('[data-gfpq]')) return;
    const box = t.parentElement.querySelector('.gf-sug'), q = gfFold(t.value);
    if (!q) { box.hidden = true; if (GF.pid) { GF.pid = ''; GF.pname = ''; gfSave(); } return; }
    const idx = await gfIndex(), words = q.split(' ');
    const hits = idx.players.filter(p => { const n = gfFold(p[1]); return words.every(w => n.includes(w)); }).sort((a, b) => b[4] - a[4]).slice(0, 8);
    box.innerHTML = hits.length ? hits.map(p => `<button type="button" data-gfsug="${p[0]}" data-name="${esc(p[1])}">${face(p[0], p[1], 'gf-sf', 60)}<span><b>${esc(p[1])}</b><small>${gfYearLabel(p[2])} to ${gfYearLabel(p[3])} · ${p[4].toLocaleString()} games</small></span></button>`).join('') : '<p class="gf-none">No player by that name since 2000-01</p>';
    box.hidden = false;
  });
  pane.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.gf-num')) { gfSave(); gfRun(); }
    if (e.key === 'Enter' && e.target.matches('.gf-mi')) e.target.click();
    if (e.key === 'Enter' && e.target.matches('[data-gfpq]')) { const b = e.target.parentElement.querySelector('[data-gfsug]'); if (b) b.click(); }
  });
}
