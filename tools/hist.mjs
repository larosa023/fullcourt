// Builds history.json for the History tab. Runs weekly on GitHub (.github/workflows/hist.yml).
//  - Basketball-Reference: NBA career leaders (points, rebounds, assists, steals, blocks, threes, games), every champion
//    and Finals MVP, every regular-season MVP, and full profiles (bio, accolades, season-by-season per-game stats) for
//    the all-time greats: anyone near the top of those career lists. One page every ~4 s.
//  - ESPN search: each legend's ESPN id (for photos where ESPN has one, and for ESPN's profile of modern players).
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com';
const LEADERS = [['pts', 'Points'], ['trb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['fg3', '3-pointers'], ['g', 'Games']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#9642;/g, '·').replace(/\s+/g, ' ').trim();
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 429) { console.log('429, waiting'); await sleep(65000); continue; } if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); }
    catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
}
const brGet = async url => { const t = await get(BR + url); await sleep(4200); return t.replace(/<!--([\s\S]*?)-->/g, '$1'); }; // some tables ship inside comments
const tableOf = (html, id) => { const i = html.indexOf(`id="${id}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</table>', i)); };
const rowsOf = t => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const cells = r => Object.fromEntries([...r.matchAll(/data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => [m[1], m[2]]));
const pid = s => s?.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1] || null;

// career leader boards (NBA only, like the league's record book)
const leaders = {};
for (const [k] of LEADERS) {
  const html = await brGet(`/leaders/${k}_career.html`);
  let t = tableOf(html, 'nba'); if (!t) t = tableOf(html, 'tot');
  leaders[k] = rowsOf(t).map(r => { const c = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]); if (c.length < 3) return null; const id = pid(c[1]); return id ? { r: +strip(c[0]).replace('.', '') || null, id, name: strip(c[1]).replace(/\*$/, '').trim(), v: +strip(c[2]).replace(/,/g, ''), active: /<strong>/.test(c[1]), hof: /\*/.test(strip(c[1])) } : null; }).filter(Boolean).slice(0, 100);
  console.log('leaders', k, leaders[k].length, leaders[k][0]?.name);
}
// champions and Finals MVPs
const champions = rowsOf(tableOf(await brGet('/playoffs/'), 'champions_index')).map(r => { const c = cells(r); return c.champion ? { y: +strip(c.year_id), lg: strip(c.lg_id), champ: strip(c.champion), runner: strip(c.runnerup), fmvp: strip(c.mvp_finals), fmvpId: pid(c.mvp_finals) } : null; }).filter(x => x && x.y && x.lg === 'NBA');
console.log('champions', champions.length, champions[0]);
// regular-season MVPs
let mvp = [];
try {
  const html = await brGet('/awards/mvp.html');
  const t = tableOf(html, 'mvp_NBA') || tableOf(html, 'mvp_summary') || html;
  mvp = rowsOf(t).map(r => { const c = cells(r); const id = pid(c.player || ''); const y = strip(c.season || c.year_id || ''); return id && /^\d{4}-\d{2}$/.test(y) ? { y: +y.slice(0, 4) + 1, season: y, name: strip(c.player), id, team: strip(c.team_id || c.team_name_abbr || '') } : null; }).filter(Boolean);
} catch (e) { console.log('mvp page failed', e.message); }
console.log('mvp', mvp.length, mvp[0]);

// legends: near the top of the career lists
const ids = new Set();
for (const [k, n] of [['pts', 80], ['trb', 30], ['ast', 30], ['stl', 20], ['blk', 20], ['fg3', 25], ['g', 15]]) leaders[k].slice(0, n).forEach(x => ids.add(x.id));
for (const m of mvp) ids.add(m.id);
for (const c of champions) if (c.fmvpId) ids.add(c.fmvpId); // every Finals MVP too
console.log('legends to fetch', ids.size);
const legends = {};
const COLS = ['year_id', 'age', 'team_name_abbr', 'games', 'mp_per_g', 'pts_per_g', 'trb_per_g', 'ast_per_g', 'stl_per_g', 'blk_per_g', 'fg_pct', 'fg3_pct', 'ft_pct'];
for (const id of ids) {
  try {
    const html = await brGet(`/players/${id[0]}/${id}.html`);
    const info = html.slice(html.indexOf('id="info"'), html.indexOf('id="bling"') > 0 ? html.indexOf('id="bling"') : html.indexOf('id="info"') + 12000);
    const txt = strip(info);
    const name = strip(info.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '');
    const f = re => txt.match(re)?.[1]?.trim() || '';
    const bi = html.indexOf('id="bling"'), bling = bi > 0 ? [...html.slice(bi, html.indexOf('</ul>', bi)).matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => strip(m[1])).filter(Boolean) : [];
    const t = tableOf(html, 'per_game_stats');
    const seen = new Set(), seasons = [];
    for (const r of rowsOf(t.slice(t.indexOf('<tbody')))) {
      const c = cells(r), y = strip(c.year_id); if (!/^\d{4}-\d{2}$/.test(y) || seen.has(y) || !strip(c.age)) continue; // first row per season (a traded season's total)
      seen.add(y); seasons.push(COLS.map(k => { const v = strip(c[k]); return k === 'year_id' || k === 'team_name_abbr' ? v : v === '' ? null : +v; }));
    }
    const foot = rowsOf(t.slice(t.indexOf('<tfoot'))).map(cells).sort((x, y) => (+strip(y.games) || 0) - (+strip(x.games) || 0))[0] || {}; // the footer row with the most games is the whole career (team splits follow)
    const career = COLS.map(k => { const v = strip(foot[k]); return k === 'year_id' ? v : k === 'team_name_abbr' || k === 'age' ? null : v === '' ? null : +v; });
    legends[id] = {
      name, pos: f(/Position:\s*([^·]+?)\s*(?:·|Shoots|$)/), ht: f(/(\d-\d{1,2}),/), born: info.match(/data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1] || f(/Born:\s*([A-Za-z]+ \d+\s?,\s?\d{4})/),
      died: info.match(/data-death="(\d{4}-\d{2}-\d{2})"/)?.[1] || f(/Died:\s*([A-Za-z]+ \d+\s?,\s?\d{4})/), college: f(/College:\s*([^:]+?)\s+(?:High School|Draft|NBA Debut|Hall of Fame|Recruiting|Career)/),
      draft: f(/Draft:\s*(.+?\d{4} (?:NBA|BAA|ABA) Draft)/), debut: f(/NBA Debut:\s*([A-Za-z]+ \d+, \d{4})/), hof: f(/Hall of Fame:\s*Inducted as Player in (\d{4})/),
      years: f(/Career Length:\s*(\d+) years/), bling, seasons, career,
    };
    console.log('legend', id, name, seasons.length);
  } catch (e) { console.log('legend failed', id, e.message); }
}
// ESPN ids, for photos and ESPN's own profile (names compared without accents or punctuation: Jokić = Jokic, J.R. = JR)
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/gi, '').toLowerCase().trim();
for (const [id, L] of Object.entries(legends)) {
  try {
    const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(L.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))}&limit=6&type=player`, true);
    const hit = (d.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === 'NBA' && fold(c.displayName) === fold(L.name));
    const m = hit?.uid?.match(/a:(\d+)/); if (m) L.espn = m[1];
  } catch (e) {}
  await sleep(150);
}
// ESPN ids for everyone else on the leader boards (photos, and their profile from ESPN)
const espn = {};
for (const r of Object.values(leaders).flat()) {
  if (legends[r.id] || r.id in espn) continue;
  espn[r.id] = null;
  try {
    const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(r.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))}&limit=6&type=player`, true);
    const hit = (d.results || []).flatMap(x => x.type === 'player' ? x.contents || [] : []).find(c => c.description === 'NBA' && fold(c.displayName) === fold(r.name));
    const m = hit?.uid?.match(/a:(\d+)/); if (m) espn[r.id] = m[1]; else delete espn[r.id];
  } catch (e) { delete espn[r.id]; }
  await sleep(150);
}
console.log('leader ESPN ids', Object.keys(espn).length);
console.log('legends', Object.keys(legends).length, 'with ESPN ids', Object.values(legends).filter(l => l.espn).length);
// which of those ESPN ids actually have a headshot (ESPN has none for many retired players): the site draws a
// team-coloured initials card for those straight away instead of trying a photo that isn't there
const hasPhoto = async id => { try { const r = await fetch(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`, { method: 'HEAD', headers: { 'user-agent': UA } }); return r.ok; } catch (e) { return null; } };
const nophoto = [];
for (const L of Object.values(legends)) { if (!L.espn) { L.photo = false; continue; } const ok = await hasPhoto(L.espn); if (ok === false) L.photo = false; }
for (const id of Object.values(espn)) { if (id && (await hasPhoto(id)) === false) nophoto.push(id); }
console.log('without a photo', Object.values(legends).filter(l => l.photo === false).length, 'legends,', nophoto.length, 'others');
if (Object.keys(legends).length < 50 || !leaders.pts?.length) throw new Error('too little parsed; keeping last week\'s file');
writeFileSync(process.argv[2] || 'history.json', JSON.stringify({ updated: new Date().toISOString(), source: 'Basketball-Reference + ESPN', cols: COLS, leaders, champions, mvp, legends, espn, nophoto }));
