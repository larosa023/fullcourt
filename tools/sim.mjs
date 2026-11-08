// Builds sim.json, the inputs for Playoff Odds and the season simulator (src/m/sim.js runs the simulations in the browser):
//  - every team's record and a rating (points better than an average team, per game): this season's scoring margin,
//    blended with last season's while the sample is small, then pulled a little toward average
//  - every regular-season game still to play (from each team's ESPN schedule), plus how many games a team has that aren't
//    on the schedule yet (NBA Cup knockout games are added in December)
// All from ESPN. Runs every few hours on GitHub (.github/workflows/sim.yml) and publishes to the sim-data branch.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-sim/1.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (a === 2) throw e; await sleep(3000 * (a + 1)); }
  }
}
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball', STD = 'https://site.api.espn.com/apis/v2/sports/basketball';
const now = new Date(), Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
const LG = {
  nba: { season: M >= 8 ? Y + 1 : Y, games: 82, k: 12, hca: 2.4, sd: 12.5, active: M >= 10 || M <= 4 },
  wnba: { season: Y, games: 44, k: 8, hca: 2.0, sd: 11.5, active: M >= 5 && M <= 9 },
};

function standingsRows(d) {
  const out = [];
  for (const [ci, c] of (d.children || []).entries()) for (const e of c.standings?.entries || []) {
    const st = Object.fromEntries((e.stats || []).map(s => [s.name, s.value]));
    out.push({ id: e.team.id, abbr: e.team.abbreviation, name: e.team.displayName, short: e.team.shortDisplayName || e.team.name, conf: d.children.length > 1 ? ci : 0, w: st.wins || 0, l: st.losses || 0, diff: st.differential || 0 });
  }
  return out;
}

async function build(lg) {
  const C = LG[lg];
  const cur = standingsRows(await get(`${STD}/${lg}/standings?season=${C.season}`));
  const prev = Object.fromEntries(standingsRows(await get(`${STD}/${lg}/standings?season=${C.season - 1}`).catch(() => ({}))).map(r => [r.id, r]));
  if (cur.length < 10) throw new Error(`${lg}: too few teams`);
  const games = new Map(), played = {};
  for (const t of cur) {
    const d = await get(`${SITE}/${lg}/teams/${t.id}/schedule?season=${C.season}&seasontype=2`);
    played[t.id] = 0;
    for (const e of d.events || []) {
      const c = e.competitions?.[0]; if (!c) continue;
      const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
      if (!h?.team?.id || !a?.team?.id) continue;
      const st = c.status?.type?.state;
      if (st === 'post') { played[t.id]++; continue; }
      if (!games.has(e.id)) games.set(e.id, { d: e.date.slice(0, 10), h: h.team.id, a: a.team.id, n: c.neutralSite ? 1 : 0 });
    }
    await sleep(120);
  }
  const left = [...games.values()].sort((x, y) => x.d.localeCompare(y.d));
  const remaining = {}; for (const g of left) { remaining[g.h] = (remaining[g.h] || 0) + 1; remaining[g.a] = (remaining[g.a] || 0) + 1; }
  // ratings: margin of victory per game, this season blended with last season (worth k games, regressed a third of the way to 0)
  const teams = cur.map(t => {
    const g = t.w + t.l, p = prev[t.id]?.diff ?? 0, raw = (g * t.diff + C.k * p * 0.66) / (g + C.k);
    return { id: t.id, abbr: t.abbr, name: t.name, short: t.short, conf: t.conf, w: t.w, l: t.l, mov: +t.diff.toFixed(1), prev: +p.toFixed(1), r: +(raw * 0.92).toFixed(2), pad: Math.max(0, C.games - g - (remaining[t.id] || 0)) };
  });
  const mean = teams.reduce((s, t) => s + t.r, 0) / teams.length; teams.forEach(t => t.r = +(t.r - mean).toFixed(2));
  console.log(lg, teams.length, 'teams,', left.length, 'games left; padded', teams.filter(t => t.pad).map(t => `${t.abbr}+${t.pad}`).join(' ') || 'none');
  return { season: C.season, active: C.active, total: C.games, hca: C.hca, sd: C.sd, confs: lg === 'nba' ? ['East', 'West'] : ['League'], teams, games: left.map(g => [g.h, g.a, g.n, g.d]) };
}

const out = { updated: now.toISOString(), source: 'ESPN' };
out.nba = await build('nba');
try { out.wnba = await build('wnba'); } catch (e) { console.log('WNBA skipped:', e.message); }
writeFileSync(process.argv[2] || 'sim.json', JSON.stringify(out));
