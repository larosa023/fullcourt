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

async function season(Y) {
  const file = `${OUT}/gl/${Y}.json`;
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (old?.done && Y < CUR) { console.log(Y, 'kept'); return old; }
  // the game list: every team's schedule (regular season, playoffs, play-in)
  const sched = new Map();
  await pool(TEAMS.flatMap(t => [2, 3, 5].map(st => [t, st])), 6, async ([t, st]) => {
    const d = await get(`${E}/teams/${t}/schedule?season=${Y}&seasontype=${st}`).catch(() => null);
    for (const ev of d?.events || []) {
      const c = ev.competitions?.[0]; if (!c || !c.status?.type?.completed) continue;
      sched.set(String(ev.id), { st: st === 5 ? 5 : st, date: ev.date });
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
    G.st.push(sched.get(id)?.st || 2); G.ot.push(Math.max(0, int(c.status?.period) - 4));
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
  const done = Y < CUR && sched.size > 0 && G.id.length >= sched.size;
  const out = { v: 1, y: Y, done, cols: COLS, teams, games: G, players: P, r: R, dnp };
  writeFileSync(file, JSON.stringify(out));
  console.log(Y, 'wrote', G.id.length, 'games,', R.g.length, 'player lines', done ? '(final)' : '');
  return out;
}

// ---- every season, then the players and their bests ----
const players = new Map(); // espn id -> { n, y0, y1, gp }
const bests = {};
const keep = (b, k, v, info, n = 1) => { const L = (b[k] ||= []); L.push([v, ...info]); L.sort((x, y) => y[0] - x[0] || x[2] - y[2]); if (L.length > n) L.length = n; };
for (let Y = FIRST; Y <= LAST; Y++) {
  const S = await season(Y);
  const { games: G, players: P, r: R, teams } = S;
  const abbr = id => teams[id]?.[0] || '';
  // per player: lines in this season by team, for highs and for games missed
  const byP = new Map();
  for (let i = 0; i < R.g.length; i++) {
    const pid = String(P.id[R.p[i]]), gi = R.g[i], tid = R.t[i] ? G.a[gi] : G.h[gi], oid = R.t[i] ? G.h[gi] : G.a[gi];
    let pl = players.get(pid); if (!pl) players.set(pid, pl = { n: P.n[R.p[i]], y0: Y, y1: Y, gp: 0 });
    pl.y1 = Y; pl.gp++; pl.n = P.n[R.p[i]];
    const b = (bests[pid] ||= { c: {} }), c = b.c;
    const pts = R.pts[i], reb = R.reb[i], ast = R.ast[i], stl = R.stl[i], blk = R.blk[i];
    const info = [G.id[gi], G.d[gi], abbr(oid), R.t[i] ? '@' : 'vs', G.st[gi]];
    keep(b, 'pts', pts, info, 3); keep(b, 'reb', reb, info); keep(b, 'ast', ast, info); keep(b, 'stl', stl, info); keep(b, 'blk', blk, info); keep(b, 'tpm', R.tpm[i], info);
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
        if (run.length >= 10) {
          const rs = run.map(gi => why.get(`${pid}|${gi}`)).filter(Boolean), top = rs.length ? Object.entries(rs.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0][0] : '';
          (bests[pid].out ||= []).push([Y, abbr(tid), G.d[run[0]], G.d[run.at(-1)], run.length, top, run.at(-1) === sched[sched.length - 1] && end === sched.length - 1 ? 1 : 0]);
        }
        run = [];
      };
      for (let k = first; k <= end; k++) { const gi = sched[k]; if (mine.has(gi)) flush(); else run.push(gi); }
      flush();
    }
  }
}
writeFileSync(`${OUT}/players.json`, JSON.stringify({ updated: new Date().toISOString(), first: FIRST, last: CUR, cols: ['id', 'name', 'y0', 'y1', 'gp'], players: [...players].map(([id, p]) => [+id, p.n, p.y0, p.y1, p.gp]) }));
// split 20 ways by ESPN id so a player page loads a small piece: bests/<id % 20>.json
mkdirSync(`${OUT}/bests`, { recursive: true });
for (let k = 0; k < 20; k++) writeFileSync(`${OUT}/bests/${k}.json`, JSON.stringify({ updated: new Date().toISOString(), cols: ['value', 'game id', 'date', 'opponent', 'at', 'season type'], out: ['season', 'team', 'from', 'to', 'games', 'reason', 'to the end of the season'], players: Object.fromEntries(Object.entries(bests).filter(([id]) => +id % 20 === k)) }));
console.log('players', players.size);
