// Builds origins.json for "Where they're from" (History > Map): every NBA player's birthplace (US state or country)
// and college, with his teams and seasons so the map can be filtered by team and era.
//   Birthplaces: Basketball-Reference's birthplace pages (one per state or country, about 140, one every ~4 s).
//   Colleges: Basketball-Reference's draft pages (every drafted player since 1947, about 80 pages), then ESPN for
//   undrafted players since 2000-01.
//   Teams and seasons: the era data (tools/eras.mjs); ESPN ids from the careers data (tools/careers.mjs).
// Runs weekly on GitHub (.github/workflows/origins.yml) and publishes to the origins-data branch.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-origins/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com', RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const OUT = process.argv[2] || 'origins.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 429) { console.log('429, waiting'); await sleep(65000); continue; } if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); }
    catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
}
const brGet = async u => { const t = await get(BR + u).catch(() => null); await sleep(4200); return t; };
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const uncomment = h => String(h || '').replace(/<!--([\s\S]*?)-->/g, '$1');
const cells = row => Object.fromEntries([...row.matchAll(/<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => [m[1], m[2]]));
const brId = html => String(html || '').match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1] || null;

// ---- birthplaces ----
const place = {}, places = {};
{
  const idx = await brGet('/friv/birthplaces.fcgi'); if (!idx) throw new Error('birthplace index missing');
  const links = [...new Map([...idx.matchAll(/birthplaces\.fcgi\?country=([A-Z]+)&(?:amp;)?state=([A-Z]*)"[^>]*>([^<]+)<\/a>/g)].map(m => [`${m[1]}|${m[2]}`, m])).values()];
  console.log('birthplace pages', links.length);
  for (const [, c, st, name] of links) {
    const key = c === 'US' && st ? `US-${st}` : c; places[key] = strip(name);
    const h = uncomment(await brGet(`/friv/birthplaces.fcgi?country=${c}&state=${st}`)); if (!h) continue;
    const i = h.indexOf('id="stats"'), tb = i >= 0 ? h.slice(i, h.indexOf('</table>', i)) : '';
    let n = 0; for (const row of tb.split(/<tr/).slice(1)) { const id = row.match(/data-append-csv="([a-z0-9]+)"/)?.[1] || brId(row); if (id && !place[id]) { place[id] = key; n++; } }
    console.log(key, n);
  }
}
// ---- colleges, from every draft ----
const college = {};
{
  const now = new Date(), lastDraft = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = 1947; y <= lastDraft; y++) {
    const h = uncomment(await brGet(y <= 1949 ? `/draft/BAA_${y}.html` : `/draft/NBA_${y}.html`) || ''); if (!h) continue;
    const i = h.indexOf('id="stats"'), tb = i >= 0 ? h.slice(i, h.indexOf('</table>', i)) : '';
    let n = 0; for (const row of tb.split(/<tr/).slice(1)) { const c = cells(row), id = brId(c.player), col = strip(c.college_name); if (id && col && !college[id]) { college[id] = col; n++; } }
    console.log('draft', y, n);
  }
}
// ---- teams and seasons (era data), ESPN ids (careers data) ----
const LINEAGE = { ATL: ['ATL', 'STL', 'MLH', 'TRI'], BOS: ['BOS'], BKN: ['BRK', 'NJN', 'NYN'], CHA: ['CHO', 'CHA', 'CHH'], CHI: ['CHI'], CLE: ['CLE'], DAL: ['DAL'], DEN: ['DEN'], DET: ['DET', 'FTW'],
  GS: ['GSW', 'SFW', 'PHW'], HOU: ['HOU', 'SDR'], IND: ['IND'], LAC: ['LAC', 'SDC', 'BUF'], LAL: ['LAL', 'MNL'], MEM: ['MEM', 'VAN'], MIA: ['MIA'], MIL: ['MIL'], MIN: ['MIN'], NO: ['NOP', 'NOH', 'NOK'],
  NY: ['NYK'], OKC: ['OKC', 'SEA'], ORL: ['ORL'], PHI: ['PHI', 'SYR'], PHX: ['PHO'], POR: ['POR'], SAC: ['SAC', 'KCK', 'KCO', 'CIN', 'ROC'], SA: ['SAS'], TOR: ['TOR'], UTAH: ['UTA', 'NOJ'], WSH: ['WAS', 'WSB', 'CAP', 'BAL', 'CHZ', 'CHP'] };
const FR_OF = {}; for (const [fr, abs] of Object.entries(LINEAGE)) for (const ab of abs) FR_OF[ab] = fr;
const idx = await get(`${RAW}/era-data/index.json`, true); if (!idx?.players?.length) throw new Error('era index missing');
const IC = Object.fromEntries(idx.cols.map((k, i) => [k, i]));
const teams = {}, played = {};
for (let y = idx.first; y <= idx.last; y++) {
  const S = await get(`${RAW}/era-data/seasons/${y}.json`, true).catch(() => null); if (!S?.reg) continue;
  const ti = S.cols.indexOf('tm'), ii = S.cols.indexOf('id');
  for (const r of S.reg) for (const t of String(r[ti] || '').split('/')) { const fr = FR_OF[t]; if (fr) (teams[r[ii]] ||= new Set()).add(fr); if (t && t !== 'TOT') (played[r[ii]] ||= new Set()).add(t); }
}
const ids = await get(`${RAW}/careers-data/ids.json`, true).catch(() => null);
const espnOf = {}; for (const [e, br] of Object.entries(ids?.espn || {})) espnOf[br] = e;
for (const p of idx.players) if (p[IC.espn] && !espnOf[p[IC.id]]) espnOf[p[IC.id]] = String(p[IC.espn]);
// ESPN names some schools differently from Basketball-Reference's draft pages: use one name per school
const ESPN_COLLEGE = { 'North Carolina': 'UNC', Pittsburgh: 'Pitt', UTEP: 'Texas-El Paso', Miami: 'Miami (FL)', 'Miami University': 'Miami (OH)', Connecticut: 'UConn', Mississippi: 'Ole Miss',
  'Southern California': 'USC', 'Louisiana State': 'LSU', "Saint John's": "St. John's", 'Brigham Young': 'BYU', 'Nevada-Las Vegas': 'UNLV', 'Virginia Commonwealth': 'VCU', 'Central Florida': 'UCF', 'Southern Methodist': 'SMU',
  'Massachusetts': 'UMass', 'California': 'Cal', 'Texas Christian': 'TCU', 'Mississippi Valley State University': 'Mississippi Valley State' };
// undrafted players since 2000-01 still without a college: ESPN's player record
{
  const left = idx.players.filter(p => p[IC.y1] >= 2001 && !college[p[IC.id]] && espnOf[p[IC.id]]);
  let n = 0;
  for (const p of left) {
    const a = (await get(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${espnOf[p[IC.id]]}`, true).catch(() => null))?.athlete;
    if (a?.college?.name) { college[p[IC.id]] = ESPN_COLLEGE[a.college.name] || a.college.name; n++; }
    await sleep(150);
  }
  console.log('ESPN colleges', n, 'of', left.length);
}
const players = idx.players.map(p => { const id = p[IC.id]; return [id, p[IC.name], espnOf[id] || '', p[IC.y0], p[IC.y1], p[IC.score] ?? 0, place[id] || '', college[id] || '', [...(teams[id] || [])].join(','), [...(played[id] || [])].join(',')]; });
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), cols: ['id', 'name', 'espn', 'first', 'last', 'score', 'born', 'college', 'teams', 'played'], places, players }));
console.log('players', players.length, 'with a birthplace', players.filter(p => p[6]).length, 'with a college', players.filter(p => p[7]).length);
