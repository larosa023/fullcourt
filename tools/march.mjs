// Bracketology and March Madness odds, men's and women's, built twice a day on GitHub (.github/workflows/march.yml) and
// published to the march-data branch as march.json.
//
// Team ratings (points better than an average Division I team, neutral floor):
//  - every game this season between Division I teams, with the opponent and home court taken out, recent games
//    counting more and blowouts capped (an "adjusted margin")
//  - pulled toward last season's adjusted margin while the sample is small (computed once from last season's games)
//  - men's: blended with ESPN's Basketball Power Index (ESPN has no BPI for the women's game)
// Games come from ESPN's daily scoreboards (past days are cached on the branch, so a run only re-reads recent and
// upcoming days). Then src/m/marchengine.js plays the rest of the season, the conference tournaments, Selection
// Sunday and the tournament 10,000 times.
import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-march/1.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (a === 2) throw e; await sleep(3000 * (a + 1)); }
  }
}
const ENG = readFileSync(new URL('../src/m/marchengine.js', import.meta.url), 'utf8');
const { mPrep, mRun, mBracket } = await import('data:text/javascript;base64,' + Buffer.from(ENG + '\nexport { mPrep, mRun, mBracket, mSeason, mTourney };').toString('base64'));

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball', STD = 'https://site.api.espn.com/apis/v2/sports/basketball', FITT = 'https://site.web.api.espn.com/apis/fitt/v3/sports/basketball';
const RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt/march-data';
const now = new Date(), Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
const today = new Date(now.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
const SEASON = M >= 8 ? Y + 1 : Y, RUNS = +(process.env.RUNS || 10000);
// Selection Sunday (the men's and women's fields are both announced that day)
const SEL = { 2026: '2026-03-15', 2027: '2027-03-14', 2028: '2028-03-12' };
const ymd = d => d.replace(/-/g, '');
const days = (a, b) => { const out = []; for (let t = Date.parse(a + 'T12:00Z'); t <= Date.parse(b + 'T12:00Z'); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const CFG = {
  ncaam: { path: 'mens-college-basketball', hca: 3.0, sd: 11.0, bpi: true },
  ncaaw: { path: 'womens-college-basketball', hca: 3.0, sd: 11.5, bpi: false, women: true },
};

// one day's games: [homeId, awayId, homeScore, awayScore, neutral, 'post'|'pre', conference-tournament?]
async function dayGames(path, d) {
  const sb = await get(`${SITE}/${path}/scoreboard?groups=50&limit=500&dates=${ymd(d)}`).catch(() => null); await sleep(120);
  if (!sb) return null;
  return (sb.events || []).map(e => {
    const c = e.competitions?.[0], h = c?.competitors?.find(x => x.homeAway === 'home'), a = c?.competitors?.find(x => x.homeAway === 'away');
    if (!h || !a || e.season?.type === 3) return null;
    const note = (c.notes || []).map(x => x.headline || '').join(' '), st = c.status?.type?.state;
    const ct = d >= `${SEASON}-03-01` && /tournament|championship/i.test(note) ? 1 : 0;
    return [h.team.id, a.team.id, +(h.score || 0), +(a.score || 0), c.neutralSite ? 1 : 0, st === 'post' ? 'post' : st === 'in' ? 'in' : 'pre', ct];
  }).filter(Boolean);
}
// adjusted margin by iteration: m = r_home - r_away + home court
function adjust(games, ids, hca, prior = {}, K = 0, half = 60) {
  const R = Object.fromEntries(ids.map(id => [id, prior[id] || 0])), by = Object.fromEntries(ids.map(id => [id, []]));
  for (const g of games) {
    const [h, a, hs, as, nt, , , d] = g; if (!(h in by) || !(a in by)) continue;
    const m = Math.max(-25, Math.min(25, hs - as)), hc = nt ? 0 : hca, wt = d ? 0.5 ** ((Date.parse(today) - Date.parse(d)) / 864e5 / half) : 1;
    by[h].push([a, m - hc, wt]); by[a].push([h, -m + hc, wt]);
  }
  for (let it = 0; it < 80; it++) {
    for (const id of ids) { let s = K * (prior[id] || 0), w = K; for (const [o, m, wt] of by[id]) { s += wt * (m + R[o]); w += wt; } R[id] = w ? s / w : 0; }
    const mean = ids.reduce((s, id) => s + R[id], 0) / ids.length; ids.forEach(id => { R[id] -= mean; });
  }
  return R;
}

async function build(key) {
  const C = CFG[key], path = C.path;
  const old = process.env.CACHE_DIR ? JSON.parse(readFileSync(`${process.env.CACHE_DIR}/cache-${key}.json`, 'utf8')) : await get(`${RAW}/cache-${key}.json`).catch(() => null);
  const cache = old?.season === SEASON ? old : { season: SEASON, days: {} };
  // Division I teams and conferences
  const st = await get(`${STD}/${path}/standings?season=${SEASON}`);
  const confs = [], confOf = {};
  for (const c of st.children || []) { const ci = confs.push({ id: c.id, name: c.name.replace(/ Conference$/, ''), abbr: c.abbreviation, teams: [] }) - 1; for (const e of c.standings?.entries || []) confOf[e.team.id] = ci; }
  const tl = await get(`${SITE}/${path}/teams?groups=50&limit=500`).catch(() => null);
  const info = {}; for (const t of tl?.sports?.[0]?.leagues?.[0]?.teams || []) info[t.team.id] = t.team;
  for (const c of st.children || []) for (const e of c.standings?.entries || []) info[e.team.id] = { ...(info[e.team.id] || {}), ...e.team, color: info[e.team.id]?.color };
  const ids = Object.keys(confOf);
  // last season's adjusted margin, once a season
  if (!cache.prior) {
    console.log(key, 'reading last season for the prior');
    const G = []; for (const d of days(`${SEASON - 2}-11-01`, `${SEASON - 1}-04-10`)) { const g = await dayGames(path, d); if (g) G.push(...g.filter(x => x[5] === 'post')); }
    const allIds = [...new Set(G.flatMap(g => [g[0], g[1]]))].filter(id => G.filter(g => g[0] === id || g[1] === id).length >= 8);
    const R = adjust(G, allIds, C.hca);
    cache.prior = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, +v.toFixed(2)]));
  }
  // this season's games: re-read the last few days and everything ahead, plus any day missing
  const end = `${SEASON}-03-${SEL[SEASON] ? SEL[SEASON].slice(8) : '14'}`;
  for (const d of days(`${SEASON - 1}-11-01`, end)) {
    if (cache.days[d] && d < new Date(Date.parse(today) - 3 * 864e5).toISOString().slice(0, 10)) continue;
    const g = await dayGames(path, d); if (g) cache.days[d] = g;
  }
  const all = Object.entries(cache.days).flatMap(([d, gs]) => gs.map(g => [...g, d]));
  const D1 = new Set(ids), played = all.filter(g => g[5] === 'post' && !g[6] && g[2] !== g[3]);
  const left = all.filter(g => g[5] !== 'post' && !g[6] && g[7] < (SEL[SEASON] || end) && g[7] >= today);
  // ratings
  const prior = {}; const cAvg = {}; for (const id of ids) { const ci = confOf[id]; (cAvg[ci] = cAvg[ci] || []).push(cache.prior[id]); }
  for (const id of ids) { const p = cache.prior[id]; const ca = (cAvg[confOf[id]] || []).filter(x => x != null); prior[id] = p != null ? 0.75 * p : (ca.length ? ca.reduce((s, x) => s + x, 0) / ca.length * 0.75 - 3 : -6); }
  const own = adjust(played.filter(g => D1.has(g[0]) && D1.has(g[1])), ids, C.hca, prior, 6);
  const gp = {}; for (const g of played) { gp[g[0]] = (gp[g[0]] || 0) + 1; gp[g[1]] = (gp[g[1]] || 0) + 1; }
  const bpi = {}, espn = {};
  if (C.bpi) {
    const b = await get(`${FITT}/${path}/powerindex?region=us&lang=en&limit=500`).catch(() => null);
    for (const t of b?.teams || []) {
      const cat = k => t.categories?.find(c => c.name === k)?.values || [];
      const [r] = cat('bpi'), tour = cat('tournament'); if (typeof r === 'number') bpi[t.team.id] = r;
      espn[t.team.id] = { seed: tour[0] ?? null, title: tour[3] ?? null, f4: tour[5] ?? null };
    }
  }
  const r = {}; for (const id of ids) { const g = gp[id] || 0, wb = bpi[id] == null ? 0 : g < 8 ? 0.7 : g < 20 ? 0.55 : 0.45; r[id] = wb * (bpi[id] ?? 0) + (1 - wb) * own[id]; }
  const mean = ids.reduce((s, id) => s + r[id], 0) / ids.length; ids.forEach(id => { r[id] -= mean; });
  const bubble = Object.values(r).sort((a, b) => b - a)[45];
  // records and wins above bubble so far
  const T = ids.map(id => ({ id, conf: confOf[id], r: r[id], w: 0, l: 0, cw: 0, cl: 0, wab: 0, sig: +Math.sqrt(1.5 ** 2 + 3.6 ** 2 * 8 / ((gp[id] || 0) + 8)).toFixed(2) }));
  const ix = Object.fromEntries(T.map((t, i) => [t.id, i])); T.forEach((t, i) => confs[t.conf].teams.push(i));
  const ncdf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; };
  for (const [h, a, hs, as, nt] of played) {
    const H = T[ix[h]], A = T[ix[a]], hc = nt ? 0 : C.hca, hw = hs > as;
    if (H) { hw ? H.w++ : H.l++; }
    if (A) { hw ? A.l++ : A.w++; }
    if (H && A) {
      const pbh = ncdf((bubble - A.r + hc) / C.sd), pba = ncdf((bubble - H.r - hc) / C.sd);
      H.wab += hw ? 1 - pbh : -pbh; A.wab += hw ? -pba : 1 - pba;
      if (H.conf === A.conf) { hw ? (H.cw++, A.cl++) : (A.cw++, H.cl++); }
    } else if (H || A) { const t = H || A, won = H ? hw : !hw; if (!won) t.wab -= 1; }
  }
  const games = [], nd = [];
  for (const [h, a, , , nt] of left) { if (h in ix && a in ix) games.push([ix[h], ix[a], nt]); else if (h in ix) nd.push([ix[h], 1]); else if (a in ix) nd.push([ix[a], 0]); }
  const X = { hca: C.hca, sd: C.sd, bubble, women: !!C.women, teams: T, games, nd, confs: confs.map(c => ({ teams: c.teams, size: /ivy/i.test(c.name) ? 4 : Math.min(16, c.teams.length) })) };
  console.log(key, ids.length, 'teams', played.length, 'games played', games.length + nd.length, 'left; bubble rating', bubble.toFixed(1));
  const active = today >= `${SEASON - 1}-11-01` && today < (SEL[SEASON] || end);
  const out = { season: SEASON, sel: SEL[SEASON] || null, active, sd: C.sd, hca: C.hca, confs: confs.map(c => ({ id: c.id, name: c.name, abbr: c.abbr })) };
  const rank = Object.fromEntries(ids.slice().sort((a, b) => r[b] - r[a]).map((id, i) => [id, i + 1]));
  out.teams = T.map(t => { const I = info[t.id] || {}; return { id: t.id, abbr: I.abbreviation || '', name: I.displayName || I.location || t.id, short: I.location || I.shortDisplayName || I.displayName || '', color: I.color || null, conf: t.conf, w: t.w, l: t.l, cw: t.cw, cl: t.cl, r: +t.r.toFixed(2), rk: rank[t.id], own: +own[t.id].toFixed(1), bpi: bpi[t.id] != null ? +bpi[t.id].toFixed(1) : null, last: cache.prior[t.id] ?? null, sig: t.sig, espn: espn[t.id]?.seed != null ? espn[t.id] : null }; });
  if (!active) return { out, cache };
  const t0 = Date.now(), P = mPrep(X), A = mRun(P, RUNS), p = c => +(c / RUNS * 100).toFixed(2);
  console.log(key, RUNS, 'seasons in', Date.now() - t0, 'ms');
  out.runs = RUNS; out.at = now.toISOString();
  out.teams.forEach((t, i) => {
    const mk = A.make[i];
    t.o = { make: p(mk), auto: p(A.auto[i]), ff: p(A.ff[i]), seed: mk ? +(A.seedSum[i] / mk).toFixed(2) : null, seeds: Array.from(A.seed[i].slice(1), c => p(c)),
      r32: p(A.reach[2][i]), s16: p(A.reach[3][i]), e8: p(A.reach[4][i]), f4: p(A.reach[5][i]), fin: p(A.reach[6][i]), title: p(A.reach[7][i]),
      w: +(A.w[i] / RUNS).toFixed(1), l: +(A.l[i] / RUNS).toFixed(1), score: +(A.score[i] / RUNS).toFixed(2) };
  });
  // the projected bracket: each conference's likeliest champion, then the field by average resume score
  const autos = confs.map(c => c.teams.length ? c.teams.reduce((b, i) => A.auto[i] > A.auto[b] ? i : b, c.teams[0]) : -1);
  const ranked = T.map((_, i) => i).sort((a, b) => A.score[b] - A.score[a]);
  const B = mBracket(ranked, autos), aSet = new Set(autos), atl = ranked.filter(i => !aSet.has(i));
  out.bracket = { regions: B.regions.map(R => Object.fromEntries(Object.entries(R).map(([s, v]) => [s, v.ff != null ? { ff: v.ff } : { t: T[v.t].id }]))), pairs: B.pairs.map(pr => pr.map(i => T[i].id)), autos: autos.filter(i => i >= 0).map(i => T[i].id),
    last4: atl.slice(64 - B.autos.length, 68 - B.autos.length).map(i => T[i].id), out4: atl.slice(68 - B.autos.length, 72 - B.autos.length).map(i => T[i].id), next4: atl.slice(72 - B.autos.length, 76 - B.autos.length).map(i => T[i].id) };
  const H = { ...(old?.season === SEASON ? (await get(`${RAW}/march.json`).catch(() => null))?.[key]?.hist || {} : {}) };
  H[today] = Object.fromEntries(out.teams.filter(t => t.o.make >= 1).map(t => [t.id, [t.o.make, t.o.title, t.o.seed]]));
  out.hist = Object.fromEntries(Object.entries(H).sort().slice(-160));
  return { out, cache };
}

const res = { updated: now.toISOString(), source: 'ESPN' };
const outDir = process.argv[2] || '.';
for (const key of ['ncaam', 'ncaaw']) {
  try {
    const { out, cache } = await build(key); res[key] = out;
    writeFileSync(`${outDir}/cache-${key}.json`, JSON.stringify(cache));
    const top = out.teams.filter(t => t.o).sort((a, b) => b.o.title - a.o.title).slice(0, 16);
    for (const t of top) console.log(key, t.short.padEnd(16), String(t.r).padStart(6), `#${t.rk}`, `${t.w}-${t.l}`, `make ${t.o.make} seed ${t.o.seed} f4 ${t.o.f4} title ${t.o.title}`, t.espn ? `| ESPN seed ${t.espn.seed} f4 ${t.espn.f4} title ${t.espn.title}` : '', `bpi ${t.bpi} own ${t.own} last ${t.last}`);
    if (out.bracket) console.log(key, 'last four in', out.bracket.last4.map(id => out.teams.find(t => t.id === id)?.short).join(', '), '| first four out', out.bracket.out4.map(id => out.teams.find(t => t.id === id)?.short).join(', '));
  } catch (e) { console.log(key, 'failed:', e.stack || e.message); }
}
if (!res.ncaam && !res.ncaaw) throw new Error('both failed; keeping the last file');
writeFileSync(`${outDir}/march.json`, JSON.stringify(res));
