// Playoff Odds, built every 3 hours on GitHub (.github/workflows/sim.yml) and published to the sim-data branch as sim.json.
//
// Team ratings (points better than an average team per game, on a neutral floor), from three things:
//  1. ESPN's Basketball Power Index (BPI): ESPN's own team rating, built on player ratings and results
//  2. Fullcourt's adjusted margin: every game this season, with the opponent and home court taken out, recent games
//     counting more and blowouts capped, pulled toward last season's level while the sample is small
//  3. health: a team gets credit for games it played without regulars (it's better than those results with them back),
//     and loses its injured players' value for the games they'll miss (until ESPN's expected return date)
// A player's value comes from his box-score production per minute (Game Score) over a replacement-level player,
// scaled by his minutes, this season blended with last.
// Today's games use the betting spread instead (it already knows who's playing).
// Then src/m/simengine.js (the same engine "Sim the season" uses on the page) plays the rest of the season 20,000 times,
// with the NBA's tiebreakers, the Play-In and the playoffs. Results, plus a daily history, go into sim.json.
import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-sim/2.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (a === 2) throw e; await sleep(3000 * (a + 1)); }
  }
}
// the engine, from the page's own module (it's plain JS with no page code)
const ENG = readFileSync(new URL('../src/m/simengine.js', import.meta.url), 'utf8');
const { simPrep, simRun } = await import('data:text/javascript;base64,' + Buffer.from(ENG + '\nexport { simPrep, simRun, simSeason };').toString('base64'));

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball', STD = 'https://site.api.espn.com/apis/v2/sports/basketball';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball', FITT = 'https://site.web.api.espn.com/apis/fitt/v3/sports/basketball';
const now = new Date(), Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
// "today" in US Eastern time, which is how ESPN dates games
const today = new Date(now.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
const RUNS = +(process.env.RUNS || 20000);
const LG = {
  nba: { season: M >= 8 ? Y + 1 : Y, games: 82, hca: 2.3, sd: 12.2, prior: 14, active: M >= 10 || M <= 6 },
  wnba: { season: Y, games: 44, hca: 2.0, sd: 11.0, prior: 8, active: M >= 5 && M <= 10 },
};
const OLD = await get('https://raw.githubusercontent.com/larosa023/fullcourt/sim-data/sim.json').catch(() => null);

function standingsRows(d) {
  const out = [];
  for (const [ci, c] of (d.children || []).entries()) for (const e of c.standings?.entries || []) {
    const st = Object.fromEntries((e.stats || []).map(s => [s.name, s.value]));
    out.push({ id: e.team.id, abbr: e.team.abbreviation, name: e.team.displayName, short: e.team.shortDisplayName || e.team.name, conf: d.children.length > 1 ? ci : 0, w: st.wins || 0, l: st.losses || 0, diff: st.differential || 0 });
  }
  return out;
}
const v = (a, cat, k, names) => { const c = a.categories?.find(x => x.name === cat), i = names[cat]?.indexOf(k) ?? -1; return i >= 0 ? +c?.values?.[i] || 0 : 0; };
// every player's season line: Game Score per 36 minutes, minutes per game, games
async function playerLines(lg, season) {
  const out = {};
  for (let page = 1; page <= 3; page++) {
    const d = await get(`${WEB}/${lg}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=${page}&limit=500&sort=offensive.avgPoints:desc&season=${season}&seasontype=2`).catch(() => null);
    if (!d?.athletes?.length) break;
    const names = Object.fromEntries((d.categories || []).map(c => [c.name, c.names || []]));
    for (const a of d.athletes) {
      const g = v(a, 'general', 'gamesPlayed', names), mpg = v(a, 'general', 'avgMinutes', names); if (!g || !mpg) continue;
      const P = k => v(a, 'offensive', k, names), D = k => v(a, 'defensive', k, names);
      // Hollinger's Game Score (rebounds aren't split into offensive and defensive here, so they share one weight)
      const gs = P('avgPoints') + 0.4 * P('avgFieldGoalsMade') - 0.7 * P('avgFieldGoalsAttempted') - 0.4 * (P('avgFreeThrowsAttempted') - P('avgFreeThrowsMade'))
        + 0.4 * v(a, 'general', 'avgRebounds', names) + D('avgSteals') + 0.7 * P('avgAssists') + 0.7 * D('avgBlocks') - 0.4 * v(a, 'general', 'avgFouls', names) - P('avgTurnovers');
      out[a.athlete.id] = { name: a.athlete.displayName, team: String(a.athlete.teamId || ''), g, mpg, gs36: gs / mpg * 36 };
    }
    if (d.athletes.length < 500) break;
  }
  return out;
}
// points per game a player is worth over a replacement-level fill-in
function impact(cur, last) {
  const cm = cur ? cur.g * cur.mpg : 0, lm = last ? last.g * last.mpg * 0.6 : 0; if (cm + lm < 60) return 0;
  const gs36 = ((cur?.gs36 || 0) * cm + (last?.gs36 || 0) * lm) / (cm + lm), mpg = cur && cur.g >= 3 ? cur.mpg : last?.mpg || cur?.mpg || 0;
  return Math.max(0, Math.min(9, 0.42 * (gs36 - 9.5) * mpg / 36));
}

async function build(lg) {
  const C = LG[lg];
  const cur = standingsRows(await get(`${STD}/${lg}/standings?season=${C.season}`));
  const prev = Object.fromEntries(standingsRows(await get(`${STD}/${lg}/standings?season=${C.season - 1}`).catch(() => ({}))).map(r => [r.id, r]));
  if (cur.length < 10) throw new Error(`${lg}: too few teams`);
  const byAbbr = Object.fromEntries(cur.map(t => [t.abbr, t]));
  // divisions (NBA)
  const divNames = [], divOf = {};
  if (lg === 'nba') {
    const d = await get(`${STD}/nba/standings?season=${C.season}&level=3`).catch(() => null);
    for (const c of d?.children || []) for (const dv of c.children || []) { const k = divNames.push(dv.name) - 1; for (const e of dv.standings?.entries || []) divOf[e.team.id] = k; }
  }
  // schedules: games played (with scores) and games left
  const left = new Map(), played = new Map();
  for (const t of cur) {
    const d = await get(`${SITE}/${lg}/teams/${t.id}/schedule?season=${C.season}&seasontype=2`);
    for (const e of d.events || []) {
      const c = e.competitions?.[0]; if (!c) continue;
      const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
      if (!h?.team?.id || !a?.team?.id) continue;
      const st = c.status?.type?.state, date = e.date.slice(0, 10);
      if (st === 'post') { const hs = +(h.score?.value ?? h.score), as = +(a.score?.value ?? a.score); if (hs !== as && !played.has(e.id)) played.set(e.id, [h.team.id, a.team.id, hs, as, date, c.neutralSite ? 1 : 0]); }
      else if (!left.has(e.id)) left.set(e.id, { id: e.id, d: new Date(new Date(e.date).getTime() - 5 * 3600e3).toISOString().slice(0, 10), h: h.team.id, a: a.team.id, n: c.neutralSite ? 1 : 0 });
    }
    await sleep(100);
  }
  // today's betting lines
  const spread = {};
  const sb = await get(`${SITE}/${lg}/scoreboard?dates=${today.replace(/-/g, '')}`).catch(() => null);
  for (const e of sb?.events || []) { const o = e.competitions?.[0]?.odds?.[0]; if (o && typeof o.spread === 'number' && e.competitions[0].status?.type?.state === 'pre') spread[e.id] = o.spread; }
  // ESPN BPI
  const bpi = {};
  const b = await get(`${FITT}/${lg}/powerindex?region=us&lang=en&limit=50`).catch(() => null);
  for (const t of b?.teams || []) {
    const cat = k => t.categories?.find(c => c.name === k)?.values || [];
    const [r] = cat('bpi'), pr = cat('projections'), po = cat('playoffs');
    if (typeof r === 'number') bpi[t.team.id] = { r, projW: pr[0], po: pr[3], title: po[7] };
  }
  // adjusted margin: opponent and home court removed, recent games weighted more, blowouts capped,
  // pulled toward last season's level (worth C.prior games)
  const ids = cur.map(t => t.id), R = Object.fromEntries(ids.map(id => [id, 0])), prior = Object.fromEntries(ids.map(id => [id, (prev[id]?.diff ?? 0) * 0.5]));
  const G = [...played.values()].map(([h, a, hs, as, d, n]) => ({ h, a, m: Math.max(-22, Math.min(22, hs - as)), hc: n ? 0 : C.hca, wt: 0.5 ** ((Date.parse(today) - Date.parse(d)) / 864e5 / 45) }));
  for (let it = 0; it < 200; it++) {
    for (const id of ids) {
      let s = C.prior * prior[id] * 0.35, wsum = C.prior * 0.35;
      for (const g of G) { if (g.h === id) { s += g.wt * (g.m - g.hc + (R[g.a] || 0)); wsum += g.wt; } else if (g.a === id) { s += g.wt * (-g.m + g.hc + (R[g.h] || 0)); wsum += g.wt; } }
      R[id] = s / wsum;
    }
    const mean = ids.reduce((s, id) => s + R[id], 0) / ids.length; ids.forEach(id => { R[id] -= mean; });
  }
  // players: value, games missed, who's injured
  const [pc, pl] = await Promise.all([playerLines(lg, C.season), playerLines(lg, C.season - 1)]);
  const injRaw = await get(`${SITE}/${lg}/injuries`).catch(() => ({ injuries: [] }));
  const inj = {}, missCredit = Object.fromEntries(ids.map(id => [id, 0])), injured = new Set();
  for (const T of injRaw.injuries || []) for (const i of T.injuries || []) {
    const pid = i.athlete?.links?.[0]?.href?.match(/\/id\/(\d+)/)?.[1], tid = String(T.id || i.athlete?.team?.id || ''); if (!pid || !R.hasOwnProperty(tid)) continue;
    const imp = impact(pc[pid], pl[pid]); injured.add(pid); if (imp < 0.3) continue;
    const ofs = /OFS/.test(i.details?.fantasyStatus?.abbreviation || '') || /out for (the )?season/i.test(i.longComment || '');
    const until = ofs ? null : (i.details?.returnDate || null), dtd = /day-to-day/i.test(i.status || '');
    (inj[tid] = inj[tid] || []).push({ n: i.athlete.displayName, id: pid, imp: +imp.toFixed(2), until, dtd: dtd ? 1 : 0, note: i.shortComment || '' });
    // out all season so far: his absence is in the results already, so the team is that much better with him
    if (!pc[pid]) { const t = cur.find(x => x.id === tid); if (t && t.w + t.l >= 3) missCredit[tid] += imp * 0.8; }
  }
  // regulars who missed some of the team's games (whether hurt now or not)
  for (const [pid, p] of Object.entries(pc)) {
    const t = cur.find(x => x.id === p.team); if (!t) continue;
    const tg = t.w + t.l, missed = Math.max(0, 1 - p.g / Math.max(1, tg)); if (tg < 3 || missed <= 0.05) continue;
    missCredit[t.id] += impact(p, pl[pid]) * missed * 0.8;
  }
  // blend: BPI half, our adjusted margin (with credit for missing players) half; early in a season BPI's player-based
  // view counts a bit more
  const teams = cur.map(t => {
    const g = t.w + t.l, own = R[t.id] + missCredit[t.id], bp = bpi[t.id]?.r;
    const wb = bp == null ? 0 : g < 20 ? 0.6 : 0.5, r = wb * (bp ?? 0) + (1 - wb) * own;
    return { id: t.id, abbr: t.abbr, name: t.name, short: t.short, conf: t.conf, div: divOf[t.id] ?? null, w: t.w, l: t.l,
      r, sig: +Math.sqrt(1.0 ** 2 + 2.6 ** 2 * C.prior / (g + C.prior)).toFixed(2),
      parts: { bpi: bp == null ? null : +bp.toFixed(1), adj: +R[t.id].toFixed(1), miss: +missCredit[t.id].toFixed(1), raw: +t.diff.toFixed(1), last: +(prev[t.id]?.diff ?? 0).toFixed(1), wb },
      espn: bpi[t.id] ? { w: +(bpi[t.id].projW || 0).toFixed(1), po: +(bpi[t.id].po || 0).toFixed(1), title: +(bpi[t.id].title || 0).toFixed(1) } : null,
      inj: (inj[t.id] || []).sort((a, b) => b.imp - a.imp),
      pad: 0 };
  });
  const mean = teams.reduce((s, t) => s + t.r, 0) / teams.length; teams.forEach(t => { t.r = +(t.r - mean).toFixed(2); });
  const games = [...left.values()].sort((x, y) => x.d.localeCompare(y.d)).map(g => [g.h, g.a, g.n, g.d, spread[g.id] ?? null]);
  const remaining = {}; for (const g of games) { remaining[g[0]] = (remaining[g[0]] || 0) + 1; remaining[g[1]] = (remaining[g[1]] || 0) + 1; }
  teams.forEach(t => { t.pad = Math.max(0, C.games - t.w - t.l - (remaining[t.id] || 0)); });
  // strength of the schedule left: average opponent rating
  const rOf = Object.fromEntries(teams.map(t => [t.id, t.r]));
  teams.forEach(t => { const opp = games.filter(g => g[0] === t.id || g[1] === t.id).map(g => rOf[g[0] === t.id ? g[1] : g[0]]); t.sos = opp.length ? +(opp.reduce((s, x) => s + x, 0) / opp.length).toFixed(2) : 0; });
  const X = { season: C.season, active: C.active, total: C.games, hca: C.hca, sd: C.sd, confs: lg === 'nba' ? ['East', 'West'] : ['League'], divs: divNames, teams, games, played: [...played.values()].map(p => p.slice(0, 5)) };
  console.log(lg, teams.length, 'teams,', games.length, 'games left,', played.size, 'played,', Object.keys(spread).length, 'lines,', Object.values(inj).flat().length, 'injured regulars');
  // the run
  if (games.length || teams.some(t => t.pad)) {
    const t0 = Date.now(), P = simPrep(X, today), A = simRun(P, RUNS), n = teams.length, pc1 = c => +(c / RUNS * 100).toFixed(2);
    const q = (h, p) => { let s = 0; const tot = RUNS * p; for (let k = 0; k < h.length; k++) { s += h[k]; if (s >= tot) return k; } return h.length - 1; };
    X.odds = { runs: RUNS, at: now.toISOString(), teams: Object.fromEntries(teams.map((t, i) => {
      const nx = A.nx[i], k = P.next[i], g = k >= 0 ? games[k] : null;
      return [t.abbr, { w: +(A.w[i] / RUNS).toFixed(2), lo: q(A.hist[i], 0.1), mid: q(A.hist[i], 0.5), hi: q(A.hist[i], 0.9),
        po: pc1(A.po[i]), t6: pc1(A.direct[i]), pin: pc1(A.pin[i]), top: pc1(A.top[i]), div: pc1(A.div[i]), r2: pc1(A.r2[i]), cf: pc1(A.cf[i]), fin: pc1(A.fin[i]), title: pc1(A.title[i]),
        seeds: Array.from(A.seed[i].slice(0, lg === 'nba' ? 15 : n), c => pc1(c)),
        next: g && nx.w + nx.l ? { opp: teams.find(x => x.id === (g[0] === t.id ? g[1] : g[0]))?.abbr, home: g[0] === t.id ? 1 : 0, d: g[3], p: +(nx.w / (nx.w + nx.l) * 100).toFixed(1), line: g[4],
          win: { po: +(nx.wpo / Math.max(1, nx.w) * 100).toFixed(1), t6: +(nx.wt6 / Math.max(1, nx.w) * 100).toFixed(1), title: +(nx.wti / Math.max(1, nx.w) * 100).toFixed(2) },
          loss: { po: +(nx.lpo / Math.max(1, nx.l) * 100).toFixed(1), t6: +(nx.lt6 / Math.max(1, nx.l) * 100).toFixed(1), title: +(nx.lti / Math.max(1, nx.l) * 100).toFixed(2) } } : null }];
    })) };
    console.log(lg, RUNS, 'seasons in', Date.now() - t0, 'ms');
    // history: one point per day (the latest run that day), last 240 days
    const H = { ...(OLD?.[lg]?.season === C.season ? OLD[lg].hist || {} : {}) };
    H[today] = Object.fromEntries(teams.map(t => [t.abbr, [X.odds.teams[t.abbr].po, X.odds.teams[t.abbr].title, X.odds.teams[t.abbr].w]]));
    X.hist = Object.fromEntries(Object.entries(H).sort().slice(-240));
  }
  return X;
}

const out = { updated: now.toISOString(), source: 'ESPN', v: 2 };
out.nba = await build('nba');
try { out.wnba = await build('wnba'); } catch (e) { console.log('WNBA skipped:', e.message); }
writeFileSync(process.argv[2] || 'sim.json', JSON.stringify(out));
for (const t of out.nba.teams.slice().sort((a, b) => b.r - a.r)) { const o = out.nba.odds?.teams[t.abbr]; console.log(t.abbr.padEnd(5), String(t.r).padStart(6), JSON.stringify(t.parts), o ? `${o.w} (${o.lo}-${o.hi}) po ${o.po} title ${o.title}` : '', t.espn ? `| ESPN ${t.espn.w} po ${t.espn.po} title ${t.espn.title}` : '', t.inj.map(i => `${i.n}:${i.imp}${i.until ? '→' + i.until : i.dtd ? ' dtd' : ' season'}`).join(', ')); }
