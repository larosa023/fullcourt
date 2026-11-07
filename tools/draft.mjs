// Builds draft.json for the Mock Draft section. Runs daily on GitHub (.github/workflows/draft.yml). All from ESPN:
//  - draft order: the NBA's from this season's standings (the 14 teams outside each conference's top 8 make the lottery),
//    the WNBA's from last season's final standings (teams outside the top 8 make its lottery)
//  - team needs: where each team ranks in shooting, rebounding, playmaking, rim protection and steals, and how deep
//    its roster is at guard, forward and center
//  - the prospect board: ESPN's big board once ESPN publishes one; until then Fullcourt's own, built from college stats
//    (last season and this one, per 40 minutes, weighted by conference), class, and height. The WNBA's only
//    takes seniors and grad students, who are the ones eligible.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-draft/1.0; daily; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (a === 2) throw e; await sleep(3000 * (a + 1)); }
  }
}
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball', WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball', STD = 'https://site.api.espn.com/apis/v2/sports/basketball';
const now = new Date(), Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
const collegeSeason = M >= 8 ? Y + 1 : Y; // the season that ends next spring

// conference strength: the big five, then the best of the rest
const TIER = { acc: 1, big12: 1, bige: 1, big10: 1, sec: 1, American: .9, atl10: .9, mwest: .9, wcc: .9, mvc: .88, pac12: .9 };
async function confMap(college) {
  const d = await get(`${SITE}/${college}/groups`);
  const m = {};
  for (const c of d.groups?.[0]?.children || []) for (const t of c.teams || []) m[t.id] = { conf: c.abbreviation, confName: c.name.replace(/ Conference$/, ''), tier: TIER[c.abbreviation] || .8, school: t.shortDisplayName || t.abbreviation, abbr: t.abbreviation };
  return m;
}
async function seasonStats(college, season) {
  const out = new Map();
  for (let page = 1; page <= 15; page++) {
    const d = await get(`${WEB}/${college}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=${page}&limit=1000&sort=offensive.avgPoints:desc&season=${season}&seasontype=2`).catch(() => null);
    if (!d?.athletes?.length) break;
    const names = Object.fromEntries((d.categories || []).map(c => [c.name, c.names || []]));
    for (const a of d.athletes) {
      const v = (cat, k) => { const c = a.categories.find(x => x.name === cat); const i = names[cat]?.indexOf(k) ?? -1; return i >= 0 ? +c?.values?.[i] || 0 : 0; };
      const g = v('general', 'gamesPlayed'); if (!g) continue;
      out.set(a.athlete.id, { id: a.athlete.id, name: a.athlete.displayName, team: a.athlete.teamId, pos: a.athlete.position?.abbreviation || '', g, min: v('general', 'minutes') || v('general', 'avgMinutes') * g,
        pts: v('offensive', 'points'), reb: v('general', 'rebounds'), ast: v('offensive', 'assists'), tov: v('offensive', 'turnovers'), stl: v('defensive', 'steals'), blk: v('defensive', 'blocks'),
        fgm: v('offensive', 'fieldGoalsMade'), fga: v('offensive', 'fieldGoalsAttempted'), ftm: v('offensive', 'freeThrowsMade'), fta: v('offensive', 'freeThrowsAttempted'), tpm: v('offensive', 'threePointFieldGoalsMade'), tpa: v('offensive', 'threePointFieldGoalsAttempted') });
    }
    if (page >= (d.pagination?.pages || 1)) break;
    await sleep(400);
  }
  return out;
}
const inches = s => { const m = String(s || '').match(/(\d+)'\s*(\d+)/); return m ? +m[1] * 12 + +m[2] : null; };

async function board(college, lg) {
  const conf = await confMap(college);
  const [prev, cur] = await Promise.all([seasonStats(college, collegeSeason - 1), seasonStats(college, collegeSeason)]);
  console.log(lg, 'players', prev.size, cur.size);
  const K = ['g', 'min', 'pts', 'reb', 'ast', 'tov', 'stl', 'blk', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'tpa'];
  const rows = [];
  for (const [id, c] of cur) {
    const C = conf[c.team]; if (!C) continue; // Division I only
    const p = prev.get(id), w = 1.5; // this season's games count a bit more
    const T = Object.fromEntries(K.map(k => [k, (c[k] || 0) * w + (p?.[k] || 0)]));
    const G = c.g * w + (p?.g || 0), mpg = T.min / Math.max(1, G);
    if (mpg < 12 || T.min < 60) continue;
    const per = k => T[k] / T.min * 40;
    const ts = T.pts / Math.max(1, 2 * (T.fga + .44 * T.fta));
    // scoring (more for efficient scorers), creating, defence and rebounding, per 40 minutes
    const gs = per('pts') * (1 + (ts - .55) * 1.6) * .75 + .8 * per('ast') - .7 * per('tov') + 1.3 * per('stl') + .8 * per('blk') + .25 * per('reb');
    rows.push({ id, name: c.name, pos: c.pos, teamId: c.team, school: C.school, conf: C.confName, tier: C.tier, g: c.g, gPrev: p?.g || 0, G, mpg,
      pts: T.pts / G, reb: T.reb / G, ast: T.ast / G, stl: T.stl / G, blk: T.blk / G, tov: T.tov / G, fg: T.fgm / Math.max(1, T.fga), tp: T.tpm / Math.max(1, T.tpa), tpa: T.tpa / G, ft: T.ftm / Math.max(1, T.fta), ts,
      p40: { pts: per('pts'), reb: per('reb'), ast: per('ast'), stl: per('stl'), blk: per('blk'), tpa: per('tpa') }, raw: gs * C.tier });
  }
  const mean = rows.reduce((t, r) => t + r.raw, 0) / Math.max(1, rows.length);
  rows.forEach(r => { r.prod = (r.G * r.raw + 10 * mean) / (r.G + 10); }); // few games: pulled toward average
  rows.sort((a, b) => b.prod - a.prod);
  // details (class, height, age, photo) for the best few hundred
  const short = rows.slice(0, 320);
  for (const r of short) {
    const a = (await get(`${WEB}/${college}/athletes/${r.id}`).catch(() => null))?.athlete;
    r.cls = a?.displayExperience || ''; r.ht = inches(a?.displayHeight); r.htd = a?.displayHeight?.replace(/\s+/g, '') || ''; r.wt = a?.displayWeight || ''; r.age = a?.age || null;
    r.pos = a?.position?.abbreviation || r.pos; r.head = !!a?.headshot?.href; r.color = a?.team?.color || null; r.teamAbbr = a?.team?.abbreviation || r.school;
    await sleep(120);
  }
  const CLS = lg === 'nba' ? { Freshman: 5, Sophomore: 2.5, Junior: 0, Senior: -3, Graduate: -5, 'Graduate Student': -5, 'Fifth Year': -5 } : { Senior: 0, Graduate: 0, 'Graduate Student': 0, 'Fifth Year': 0 };
  let pool = short.filter(r => r.cls !== undefined);
  if (lg === 'wnba') pool = pool.filter(r => /Senior|Graduate|Fifth/.test(r.cls)); // only these are draft-eligible
  for (const r of pool) {
    const clsKey = Object.keys(CLS).find(k => r.cls.includes(k));
    const htBase = lg === 'nba' ? 78 : 73, ht = r.ht ? Math.max(-1.5, Math.min(1.5, (r.ht - htBase) * .2)) : 0;
    r.score = +(r.prod + (clsKey ? CLS[clsKey] : 0) + ht).toFixed(2);
    const t = [];
    if (r.tp >= .355 && r.p40.tpa >= 5) t.push('shooter');
    if (r.p40.ast >= (lg === 'nba' ? 6 : 6.5)) t.push('playmaker');
    if (r.p40.reb >= (lg === 'nba' ? 11 : 12)) t.push('rebounder');
    if (r.p40.blk >= 2) t.push('rim');
    if (r.p40.stl >= 2.3) t.push('defender');
    r.tags = t;
  }
  pool.sort((a, b) => b.score - a.score);
  const R = n => +n.toFixed(3);
  return pool.slice(0, 110).map((r, i) => ({ rk: i + 1, id: r.id, name: r.name, pos: r.pos, ht: r.htd, wt: r.wt, cls: r.cls, age: r.age, school: r.school, schoolAbbr: r.teamAbbr, color: r.color, conf: r.conf, head: r.head,
    g: r.g, gPrev: r.gPrev, mpg: R(r.mpg), pts: R(r.pts), reb: R(r.reb), ast: R(r.ast), stl: R(r.stl), blk: R(r.blk), tov: R(r.tov), fg: R(r.fg), tp: R(r.tp), tpa: R(r.tpa), ft: R(r.ft), ts: R(r.ts), score: r.score, tags: r.tags }));
}

// ESPN's own big board, once it exists (the draft feed's ranked prospects before the draft)
async function espnBoard(lg, year) {
  const d = await get(`${SITE}/${lg}/draft?season=${year}`).catch(() => null);
  if (!d || d.status?.state !== 'pre') return null;
  const list = (d.picks || []).map(p => p.athlete && { rk: +(p.athlete.attributes || []).find(a => a.name === 'overall')?.displayValue || p.overall, id: p.athlete.alternativeId || p.athlete.id, name: p.athlete.displayName }).filter(x => x?.rk);
  return list.length >= 30 ? list.sort((a, b) => a.rk - b.rk) : null;
}

async function league(lg, college, standSeason, draftYear) {
  const std = await get(`${STD}/${lg}/standings?season=${standSeason}`);
  const confs = (std.children || []).map(cf => (cf.standings?.entries || []).map(e => { const st = n => +(e.stats?.find(s => s.name === n)?.value || 0); return { id: e.team.id, abbr: e.team.abbreviation, name: e.team.displayName, short: e.team.shortDisplayName, w: st('wins'), l: st('losses'), conf: cf.abbreviation || cf.name }; }));
  const pct = t => (t.w + .5) / (t.w + t.l + 1), all = confs.flat();
  if (!all.length) throw new Error(`no ${lg} standings`);
  let lottery;
  if (lg === 'nba') lottery = confs.flatMap(c => c.slice().sort((a, b) => pct(b) - pct(a)).slice(8)); // outside each conference's top 8
  else lottery = all.slice().sort((a, b) => pct(b) - pct(a)).slice(8);
  lottery.sort((a, b) => pct(a) - pct(b));
  const rest = all.filter(t => !lottery.includes(t)).sort((a, b) => pct(a) - pct(b));
  const r1 = [...lottery, ...rest], rounds = lg === 'nba' ? 2 : 3;
  const byWorst = all.slice().sort((a, b) => pct(a) - pct(b));
  const order = [];
  for (let r = 1; r <= rounds; r++) (r === 1 ? r1 : byWorst).forEach(t => order.push({ pick: order.length + 1, round: r, team: t.abbr }));
  // NBA lottery odds for the top four picks (per 1000), worst record first; the WNBA's spread over its lottery teams
  const odds = lg === 'nba' ? [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5] : (() => { const n = lottery.length, w = lottery.map((_, i) => (n - i) ** 2), s = w.reduce((a, b) => a + b, 0); return w.map(x => Math.round(x / s * 1000)); })();
  // needs
  const ts = await get(`${WEB}/${lg}/statistics/byteam?region=us&lang=en&contentorigin=espn&limit=50&season=${standSeason}&seasontype=2`).catch(() => null);
  const stat = {};
  if (ts) { const names = {}; (ts.categories || []).forEach(c => { if (c.names) names[c.name] = c.names; });
    for (const t of ts.teams || []) { const a = t.team.abbreviation, o = {}; for (const c of t.categories) { const n = names[c.name]; if (!n || !c.values) continue; n.forEach((k, i) => { if (o[k] == null) o[k] = +c.values[i]; }); } stat[a] = o; } }
  const rank = (k, hi = true) => { const ab = Object.keys(stat).filter(a => stat[a][k] != null).sort((a, b) => hi ? stat[b][k] - stat[a][k] : stat[a][k] - stat[b][k]); return a => { const i = ab.indexOf(a); return i < 0 ? null : (i + 1) / ab.length; }; };
  const R = { Shooting: rank('threePointFieldGoalPct'), Rebounding: rank('avgRebounds'), Playmaking: rank('avgAssists'), 'Rim protection': rank('avgBlocks'), Defense: rank('avgSteals'), 'Ball security': rank('avgTurnovers', false) };
  const needs = {};
  for (const t of all) {
    const n = Object.entries(R).map(([k, f]) => [k, f(t.abbr)]).filter(([, v]) => v != null && v > .62).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const ro = await get(`${SITE}/${lg}/teams/${t.id}/roster`).catch(() => null); await sleep(150);
    const ath = (ro?.athletes || []).flatMap(x => x.items || [x]);
    const cnt = { G: 0, F: 0, C: 0 }; ath.forEach(p => { const a = p.position?.abbreviation || ''; if (/C/.test(a)) cnt.C++; else if (/F/.test(a)) cnt.F++; else if (/G/.test(a)) cnt.G++; });
    const depth = Object.entries(cnt).sort((a, b) => a[1] - b[1])[0];
    if (ath.length && depth[1] <= (depth[0] === 'C' ? 2 : 4)) n.push({ G: 'Guard depth', F: 'Wing depth', C: 'Big depth' }[depth[0]]);
    needs[t.abbr] = n.slice(0, 3);
  }
  const teams = Object.fromEntries(all.map(t => [t.abbr, { id: t.id, name: t.name, short: t.short, w: t.w, l: t.l, conf: t.conf }]));
  const eb = await espnBoard(lg, draftYear);
  const stats = await board(college, lg);
  let prospects = stats, source = 'stats';
  if (eb) { const byId = Object.fromEntries(stats.map(p => [p.id, p])); prospects = eb.map(e => ({ ...(byId[e.id] || { id: e.id, name: e.name, tags: [] }), rk: e.rk })); source = 'espn'; }
  return { year: draftYear, standingsSeason: standSeason, rounds, order, lottery: lottery.map(t => t.abbr), odds, teams, needs, source, prospects };
}

const out = { updated: new Date().toISOString() };
const nbaSeason = M >= 8 ? Y + 1 : Y; // the NBA season in progress (ends next June)
out.nba = await league('nba', 'mens-college-basketball', nbaSeason, nbaSeason);
console.log('nba', out.nba.order.length, 'picks', out.nba.prospects.length, 'prospects', out.nba.source, out.nba.prospects.slice(0, 5).map(p => p.name));
const wSeason = M >= 10 || M <= 4 ? (M <= 4 ? Y - 1 : Y) : Y; // the last finished WNBA season (Oct-Apr: the one just played)
out.wnba = await league('wnba', 'womens-college-basketball', wSeason, wSeason + 1);
console.log('wnba', out.wnba.order.length, 'picks', out.wnba.prospects.length, 'prospects', out.wnba.source, out.wnba.prospects.slice(0, 5).map(p => p.name));
if (out.nba.prospects.length < 60 || out.wnba.prospects.length < 20) throw new Error('too few prospects; keeping the last file');
writeFileSync(process.argv[2] || 'draft.json', JSON.stringify(out));
