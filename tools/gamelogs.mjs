// Builds the game logs behind the Game finder and the career timeline: every NBA game since the 2000-01 season, every
// player's line in it. From ESPN only (team schedules for the game list, each game's summary for the box score).
// Runs daily on GitHub (.github/workflows/gamelogs.yml) and publishes to the gamelog-data branch:
//   gl/<year>.json  one season (<year> = the year it ended), stored by column so it packs small:
//                   games (id, date, home, away, scores, season type, overtimes) and one row per player per game played
//   players.json    every player in them: ESPN id, name, first and last season, games played
//   bests/<n>.json  per player (split by ESPN id % 20): career highs (with the game), 30/40/50-point games, double- and triple-doubles, and
//                   long runs of games missed while on a team's roster (with ESPN's reason when it gives one)
// Finished seasons are kept as they are (the workflow checks the branch out first); only the current one is refetched.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-gamelogs/1.0; daily; +https://github.com/larosa023/fullcourt)';
const E = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const OUT = process.argv[2] || 'pub';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) { if (a === 3) throw e; await sleep(3000 * (a + 1)); }
  }
  return null;
}
// run fn over items, n at a time
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; await fn(items[j], j); await sleep(60); } })); }

const now = new Date(), CUR = now.getUTCMonth() + 1 >= 10 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
const FIRST = +(process.env.GL_FROM || 2001), LAST = +(process.env.GL_TO || CUR); // GL_FROM/GL_TO: a test run over a few seasons
mkdirSync(`${OUT}/gl`, { recursive: true });

const TEAMS = (await get(`${E}/teams`))?.sports?.[0]?.leagues?.[0]?.teams?.map(t => String(t.team.id)) || [];
if (TEAMS.length < 30) throw new Error('team list missing');

const COLS = ['g', 'p', 't', 's', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'pf', 'pm'];
const LABEL = { MIN: 'min', PTS: 'pts', REB: 'reb', AST: 'ast', STL: 'stl', BLK: 'blk', TO: 'tov', OREB: 'oreb', PF: 'pf', '+/-': 'pm' };
const int = v => { const n = parseInt(String(v ?? '').replace('+', ''), 10); return Number.isFinite(n) ? n : 0; };

// ---- box scores ESPN has empty ----
// For about one game in eight from 2012-13 to 2017-18 (and a handful elsewhere) ESPN lists both teams' players with no
// numbers at all, in every one of its feeds. Those games are filled from Basketball-Reference's box score page (one
// page every ~4 s, about 75 minutes once; a season remembers the games it tried in `bf`, so each is fetched once).
// Players are matched to ESPN by the careers data's id map, then by name within ESPN's roster for the game.
const BRX = 'https://www.basketball-reference.com', brSleep = ms => new Promise(r => setTimeout(r, ms));
const BR_CODE = (ab, y) => ({ GS: 'GSW', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', UTA: 'UTA', WSH: 'WAS', PHX: 'PHO', BKN: 'BRK', NJ: 'NJN', SEA: 'SEA', VAN: 'VAN', NO: y >= 2014 ? 'NOP' : y >= 2006 && y <= 2007 ? 'NOK' : 'NOH', NOK: 'NOK', CHA: y >= 2015 ? 'CHO' : y <= 2002 ? 'CHH' : 'CHA', OKC: 'OKC' }[ab] || ab);
const bfold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
let BR2ESPN = null;
async function fillGaps(S) {
  const G = S.games, R = S.r, P = S.players, tried = new Set(S.bf || []);
  const seen = new Set(); for (let i = 0; i < R.g.length; i++) seen.add(R.g[i] * 2 + R.t[i]);
  const gaps = G.id.map((_, gi) => gi).filter(gi => (!seen.has(gi * 2) || !seen.has(gi * 2 + 1)) && !tried.has(G.id[gi]));
  if (!gaps.length) return 0;
  if (!BR2ESPN) { BR2ESPN = {}; const ids = await get('https://raw.githubusercontent.com/larosa023/fullcourt/careers-data/ids.json').catch(() => null); for (const [e, br] of Object.entries(ids?.espn || {})) BR2ESPN[br] = e; }
  const pIx = new Map(P.id.map((id, i) => [String(id), i])); let filled = 0;
  for (const gi of gaps) {
    S.bf = [...(S.bf || []), G.id[gi]];
    const ab = id => S.teams[id]?.[0] || '', hb = BR_CODE(ab(G.h[gi]), S.y), d = G.d[gi];
    // ESPN's roster for the game (names and ids, even when the numbers are blank)
    const sum = await get(`${E}/summary?event=${G.id[gi]}`).catch(() => null);
    const roster = {}; for (const tb of sum?.boxscore?.players || []) for (const a of tb.statistics?.[0]?.athletes || []) roster[bfold(a.athlete?.displayName)] = { id: String(a.athlete?.id), name: a.athlete?.displayName, team: String(tb.team?.id) };
    let html = null; try { const r = await fetch(`${BRX}/boxscores/${d}0${hb}.html`, { headers: { 'user-agent': UA } }); if (r.ok) html = await r.text(); else console.log('box score', d, hb, r.status); } catch (e) { console.log('box score', d, hb, e.message); }
    await brSleep(4200);
    if (!html) continue;
    html = html.replace(/<!--([\s\S]*?)-->/g, '$1');
    let got = 0;
    for (const side of [0, 1]) {
      const tid = side ? G.a[gi] : G.h[gi]; if (seen.has(gi * 2 + side)) continue;
      const code = BR_CODE(ab(tid), S.y), i0 = html.indexOf(`id="box-${code}-game-basic"`); if (i0 < 0) { console.log('no table', code, d); continue; }
      const tb = html.slice(i0, html.indexOf('</table>', i0));
      let starters = 0;
      for (const row of tb.split(/<tr/).slice(1)) {
        const br = row.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1]; if (!br || /data-stat="reason"/.test(row)) { if (/Reserves/.test(row)) starters = 99; continue; }
        const cell = k => (row.match(new RegExp(`data-stat="${k}"[^>]*>([^<]*)<`)) || [])[1] || '';
        const name = (row.match(/\.html">([^<]+)</) || [])[1] || '';
        const e = BR2ESPN[br] || roster[bfold(name)]?.id; if (!e) { console.log('no ESPN id for', name, d); continue; }
        let pi = pIx.get(e); if (pi == null) { pi = P.id.length; P.id.push(+e); P.n.push(roster[bfold(name)]?.name || name); pIx.set(e, pi); }
        const n = k => parseInt(cell(k), 10) || 0, mp = cell('mp'), min = mp.includes(':') ? Math.round(+mp.split(':')[0] + +mp.split(':')[1] / 60) : n('mp');
        const v = { g: gi, p: pi, t: side, s: starters++ < 5 ? 1 : 0, min, pts: n('pts'), reb: n('trb'), ast: n('ast'), stl: n('stl'), blk: n('blk'), tov: n('tov'), fgm: n('fg'), fga: n('fga'), tpm: n('fg3'), tpa: n('fg3a'), ftm: n('ft'), fta: n('fta'), oreb: n('orb'), pf: n('pf'), pm: parseInt(cell('plus_minus').replace('+', ''), 10) || 0 };
        for (const k of COLS) R[k].push(v[k] ?? 0); got++;
      }
    }
    if (got) filled++;
  }
  console.log(S.y, 'filled', filled, 'of', gaps.length, 'empty box scores from Basketball-Reference');
  return filled;
}

async function season(Y) {
  const file = `${OUT}/gl/${Y}.json`;
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  // v2 takes overtimes from the schedule (the game summary doesn't say) and marks seasons ESPN has no plus-minus for;
  // an older finished season is brought up to date from the schedule alone
  if (old?.done && Y < CUR && old.v >= 2) { const n = await fillGaps(old); if (n) writeFileSync(file, JSON.stringify(old)); console.log(Y, 'kept', n ? `(${n} empty box scores filled)` : ''); return old; }
  // the game list: every team's schedule (regular season, playoffs, play-in)
  const sched = new Map();
  await pool(TEAMS.flatMap(t => [2, 3, 5].map(st => [t, st])), 6, async ([t, st]) => {
    const d = await get(`${E}/teams/${t}/schedule?season=${Y}&seasontype=${st}`).catch(() => null);
    for (const ev of d?.events || []) {
      const c = ev.competitions?.[0]; if (!c || !c.status?.type?.completed) continue;
      sched.set(String(ev.id), { st: st === 5 ? 5 : st, date: ev.date, per: c.status?.period || 4 });
    }
  });
  const have = new Set(old ? old.games.id.map(String) : []);
  const todo = [...sched.keys()].filter(id => !have.has(id));
  console.log(Y, sched.size, 'games,', todo.length, 'to fetch');
  // start from what's there
  const G = old ? old.games : { id: [], d: [], h: [], a: [], hs: [], as: [], st: [], ot: [] };
  const P = old ? old.players : { id: [], n: [] }, pIx = new Map(P.id.map((id, i) => [String(id), i]));
  const R = old ? old.r : Object.fromEntries(COLS.map(k => [k, []]));
  const teams = old?.teams || {};
  const dnp = old?.dnp || {}; // game index -> [[player index, reason]]
  let n = 0;
  const got = [];
  await pool(todo, 6, async id => {
    const d = await get(`${E}/summary?event=${id}`).catch(() => null);
    if (d) got.push([id, d]);
    if (++n % 200 === 0) console.log(Y, n, '/', todo.length);
  });
  // add in date order so a season's rows read oldest to newest
  got.sort((a, b) => Date.parse(a[1].header?.competitions?.[0]?.date || 0) - Date.parse(b[1].header?.competitions?.[0]?.date || 0));
  for (const [id, d] of got) {
    const c = d.header?.competitions?.[0]; if (!c) continue;
    const home = c.competitors?.find(x => x.homeAway === 'home'), away = c.competitors?.find(x => x.homeAway === 'away');
    const box = d.boxscore?.players || [];
    if (!home || !away || box.length < 2) continue;
    for (const x of [home, away]) teams[x.id] = [x.team?.abbreviation || '', x.team?.displayName || ''];
    const gi = G.id.length, dt = new Date(c.date);
    // the date in New York, which is the date the game is listed under
    const ny = new Date(dt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    G.id.push(+id); G.d.push(ny.getFullYear() * 10000 + (ny.getMonth() + 1) * 100 + ny.getDate());
    G.h.push(+home.id); G.a.push(+away.id); G.hs.push(int(home.score)); G.as.push(int(away.score));
    G.st.push(sched.get(id)?.st || 2); G.ot.push(Math.max(0, (sched.get(id)?.per || 4) - 4));
    for (const tb of box) {
      const side = String(tb.team?.id) === String(home.id) ? 0 : 1, S = tb.statistics?.[0]; if (!S) continue;
      const lab = S.labels || S.names || [];
      for (const a of S.athletes || []) {
        const aid = String(a.athlete?.id || ''); if (!aid) continue;
        let pi = pIx.get(aid); if (pi == null) { pi = P.id.length; P.id.push(+aid); P.n.push(String(a.athlete.displayName || '').replace(/\s+/g, ' ').trim()); pIx.set(aid, pi); }
        if (a.didNotPlay || !a.stats?.length) { if (a.reason) (dnp[gi] ||= []).push([pi, String(a.reason).slice(0, 60)]); continue; }
        const v = {}; lab.forEach((l, i) => { const s = a.stats[i];
          if (LABEL[l]) v[LABEL[l]] = int(s);
          else if (l === 'FG') [v.fgm, v.fga] = String(s).split('-').map(int);
          else if (l === '3PT') [v.tpm, v.tpa] = String(s).split('-').map(int);
          else if (l === 'FT') [v.ftm, v.fta] = String(s).split('-').map(int); });
        if (!v.min && !v.pts && !v.reb && !v.ast && !v.fga) continue; // listed but no line
        const row = { g: gi, p: pi, t: side, s: a.starter ? 1 : 0, ...v };
        for (const k of COLS) R[k].push(row[k] ?? 0);
      }
    }
  }
  // overtimes for every game (older files had none), from the schedule
  G.id.forEach((gid, i) => { const x = sched.get(String(gid)); if (x) G.ot[i] = Math.max(0, (x.per || 4) - 4); });
  const done = Y < CUR && sched.size > 0 && G.id.length >= sched.size;
  // ESPN has plus-minus from 2007-08; before that every line says 0
  const nopm = R.pm.length > 0 && R.pm.every(v => v === 0);
  const out = { v: 2, y: Y, done, nopm, cols: COLS, teams, games: G, players: P, r: R, dnp, bf: old?.bf || [] };
  await fillGaps(out);
  writeFileSync(file, JSON.stringify(out));
  console.log(Y, 'wrote', G.id.length, 'games,', R.g.length, 'player lines', done ? '(final)' : '');
  return out;
}

// ---- every season, then the players and their bests ----
const players = new Map(); // espn id -> { n, y0, y1, gp }
const bests = {};
const keep = (b, k, v, info, n = 1) => { const L = (b[k] ||= []); L.push([v, ...info]); L.sort((x, y) => y[0] - x[0] || x[2] - y[2]); if (L.length > n) L.length = n; };
// team records (2000-01 on), by ESPN team id: highest and lowest scores, most allowed, biggest wins and losses, longest
// winning and losing runs (regular season, carried across seasons), and the best single games by its players
const TR = {}; const tr = id => TR[id] ||= { hi: [], lo: [], al: [], bw: [], bl: [], run: { w: 0, l: 0, cur: 0, from: 0, bestW: null, bestL: null }, pg: { pts: [], reb: [], ast: [], tpm: [] }, cnt: {} };
const top = (L, item, n, di = 2) => { L.push(item); L.sort((a, b) => b[0] - a[0] || a[di] - b[di]); if (L.length > n) L.length = n; }; // biggest first, then the earliest
for (let Y = FIRST; Y <= LAST; Y++) {
  const S = await season(Y);
  const { games: G, players: P, r: R, teams } = S;
  const abbr = id => teams[id]?.[0] || '';
  // team games, oldest first
  {
    const order = G.id.map((_, gi) => gi).sort((a, b) => G.d[a] - G.d[b] || G.id[a] - G.id[b]);
    for (const gi of order) for (const side of [0, 1]) {
      const t = side ? G.a[gi] : G.h[gi], o = side ? G.h[gi] : G.a[gi], f = side ? G.as[gi] : G.hs[gi], ag = side ? G.hs[gi] : G.as[gi], T = tr(t);
      const g = [G.id[gi], G.d[gi], abbr(o), side ? '@' : 'vs', f, ag, G.ot[gi], G.st[gi]];
      top(T.hi, [f, ...g], 3); top(T.lo, [-f, ...g], 3); top(T.al, [ag, ...g], 3); top(T.bw, [f - ag, ...g], 3); top(T.bl, [ag - f, ...g], 3);
      if (G.st[gi] !== 2) continue;
      const R0 = T.run, w = f > ag;
      if (R0.cur && (R0.cur > 0) === w) R0.cur += w ? 1 : -1; else { R0.cur = w ? 1 : -1; R0.from = G.d[gi]; }
      const n = Math.abs(R0.cur), k = w ? 'bestW' : 'bestL';
      if (!R0[k] || n > R0[k][0]) R0[k] = [n, R0.from, G.d[gi]];
    }
  }
  // per player: lines in this season by team, for highs and for games missed
  const byP = new Map();
  for (let i = 0; i < R.g.length; i++) {
    const pid = String(P.id[R.p[i]]), gi = R.g[i], tid = R.t[i] ? G.a[gi] : G.h[gi], oid = R.t[i] ? G.h[gi] : G.a[gi];
    let pl = players.get(pid); if (!pl) players.set(pid, pl = { n: P.n[R.p[i]], y0: Y, y1: Y, gp: 0 });
    pl.y1 = Y; pl.gp++; pl.n = P.n[R.p[i]];
    const b = (bests[pid] ||= { c: {} }), c = b.c;
    const pts = R.pts[i], reb = R.reb[i], ast = R.ast[i], stl = R.stl[i], blk = R.blk[i];
    const info = [G.id[gi], G.d[gi], abbr(oid), R.t[i] ? '@' : 'vs', G.st[gi]];
    { const T = tr(tid), pg = [P.id[R.p[i]], P.n[R.p[i]], G.id[gi], G.d[gi], abbr(oid), R.t[i] ? '@' : 'vs'];
      top(T.pg.pts, [pts, ...pg], 5, 4); top(T.pg.reb, [reb, ...pg], 3, 4); top(T.pg.ast, [ast, ...pg], 3, 4); top(T.pg.tpm, [R.tpm[i], ...pg], 3, 4);
      const tens = [pts, reb, ast, stl, blk].filter(v => v >= 10).length, k = P.id[R.p[i]];
      if (tens >= 3 || pts >= 40) { const c = (T.cnt[k] ||= { n: P.n[R.p[i]], td: 0, p40: 0 }); if (tens >= 3) c.td++; if (pts >= 40) c.p40++; } }
    keep(b, 'pts', pts, info, 3); keep(b, 'reb', reb, info); keep(b, 'ast', ast, info); keep(b, 'stl', stl, info); keep(b, 'blk', blk, info); keep(b, 'tpm', R.tpm[i], info);
    // career highs the way Basketball-Reference counts them: regular season (h.r) and playoffs (h.p) apart, play-in in
    // neither; plus Game Score, John Hollinger's one-number rating of a box-score line
    {
      const st = G.st[gi], side = st === 2 ? 'r' : st === 3 ? 'p' : null;
      if (side) {
        const H = ((b.h ||= { r: {}, p: {} })[side]), oreb = R.oreb[i], gs = Math.round((pts + 0.4 * R.fgm[i] - 0.7 * R.fga[i] - 0.4 * (R.fta[i] - R.ftm[i]) + 0.7 * oreb + 0.3 * (reb - oreb) + stl + 0.7 * ast + 0.7 * blk - 0.4 * R.pf[i] - R.tov[i]) * 10) / 10;
        for (const [k, v] of [['pts', pts], ['reb', reb], ['ast', ast], ['stl', stl], ['blk', blk], ['tpm', R.tpm[i]], ['fgm', R.fgm[i]], ['ftm', R.ftm[i]], ['gs', gs]]) keep(H, k, v, info);
        if (side === 'r') { const t10 = [pts, reb, ast, stl, blk].filter(v => v >= 10).length; if (t10 >= 3) c.tdR = (c.tdR || 0) + 1; if (t10 >= 2) c.ddR = (c.ddR || 0) + 1; c.gpR = (c.gpR || 0) + 1; }
        else c.gpP = (c.gpP || 0) + 1;
      }
    }
    if (pts >= 30) c.p30 = (c.p30 || 0) + 1; if (pts >= 40) c.p40 = (c.p40 || 0) + 1; if (pts >= 50) c.p50 = (c.p50 || 0) + 1;
    const tens = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
    if (tens >= 2) c.dd = (c.dd || 0) + 1; if (tens >= 3) c.td = (c.td || 0) + 1;
    let t = byP.get(pid); if (!t) byP.set(pid, t = new Map());
    (t.get(tid) || t.set(tid, []).get(tid)).push(gi);
  }
  // games missed: a run of 10+ of a team's games between his first and last game for them that season, or after his
  // last one when he didn't play for anyone else afterwards
  const tg = new Map(); G.id.forEach((_, gi) => { if (G.st[gi] !== 2) return; for (const t of [G.h[gi], G.a[gi]]) (tg.get(t) || tg.set(t, []).get(t)).push(gi); });
  const why = new Map(); for (const [gi, L] of Object.entries(S.dnp || {})) for (const [pi, r] of L) why.set(`${P.id[pi]}|${gi}`, r);
  for (const [pid, t] of byP) {
    const teamsHe = [...t.keys()];
    for (const [tid, gis] of t) {
      const sched = tg.get(tid) || []; if (!sched.length) continue;
      const mine = new Set(gis), first = sched.findIndex(gi => mine.has(gi)); let last = -1; sched.forEach((gi, k) => { if (mine.has(gi)) last = k; });
      if (first < 0) continue;
      const lastGame = sched[last], laterElsewhere = teamsHe.some(o => o !== tid && t.get(o).some(gi => gi > lastGame));
      const end = laterElsewhere ? last : sched.length - 1;
      let run = [];
      const flush = () => {
        // a run to the end of the season only counts when ESPN still lists him (inactive, with a reason) for most of
        // it; otherwise he was likely let go or traded and never played again that season
        const toEndRun = run.length && run.at(-1) === sched[sched.length - 1] && end === sched.length - 1;
        const listed = run.filter(gi => why.has(`${pid}|${gi}`)).length;
        if (run.length >= 10 && (!toEndRun || listed >= run.length * 0.6)) {
          const rs = run.map(gi => why.get(`${pid}|${gi}`)).filter(Boolean), top = rs.length ? Object.entries(rs.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0][0] : '';
          (bests[pid].out ||= []).push([Y, abbr(tid), G.d[run[0]], G.d[run.at(-1)], run.length, top, toEndRun ? 1 : 0]);
        }
        run = [];
      };
      for (let k = first; k <= end; k++) { const gi = sched[k]; if (mine.has(gi)) flush(); else run.push(gi); }
      flush();
    }
  }
}
// team records: lowest scores were kept as negatives so one sort serves all
for (const T of Object.values(TR)) { T.lo = T.lo.map(x => [-x[0], ...x.slice(1)]); const cs = Object.entries(T.cnt); T.td = cs.filter(c => c[1].td).sort((a, b) => b[1].td - a[1].td).slice(0, 3).map(([id, c]) => [+id, c.n, c.td]); T.p40 = cs.filter(c => c[1].p40).sort((a, b) => b[1].p40 - a[1].p40).slice(0, 3).map(([id, c]) => [+id, c.n, c.p40]); T.run = { w: T.run.bestW, l: T.run.bestL }; delete T.cnt; }
writeFileSync(`${OUT}/teams.json`, JSON.stringify({ updated: new Date().toISOString(), first: FIRST, gcols: ['value', 'game id', 'date', 'opponent', 'at', 'scored', 'allowed', 'overtimes', 'season type'], pcols: ['value', 'player', 'name', 'game id', 'date', 'opponent', 'at'], teams: TR }));
writeFileSync(`${OUT}/players.json`, JSON.stringify({ updated: new Date().toISOString(), first: FIRST, last: CUR, cols: ['id', 'name', 'y0', 'y1', 'gp'], players: [...players].map(([id, p]) => [+id, p.n, p.y0, p.y1, p.gp]) }));
// split 20 ways by ESPN id so a player page loads a small piece: bests/<id % 20>.json
mkdirSync(`${OUT}/bests`, { recursive: true });
for (let k = 0; k < 20; k++) writeFileSync(`${OUT}/bests/${k}.json`, JSON.stringify({ updated: new Date().toISOString(), cols: ['value', 'game id', 'date', 'opponent', 'at', 'season type'], out: ['season', 'team', 'from', 'to', 'games', 'reason', 'to the end of the season'], players: Object.fromEntries(Object.entries(bests).filter(([id]) => +id % 20 === k)) }));
console.log('players', players.size);
