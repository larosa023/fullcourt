// Builds draft-history.json: every NBA draft class from 2001, pick by pick, with how each career turned out.
// Picks (team, school, position, trade notes, ESPN ids) come from ESPN's draft feed; careers (seasons, games, points,
// rebounds, assists, Win Shares, VORP) from Basketball-Reference's draft pages; All-Star games and awards (MVP, ROY,
// DPOY, Sixth Man, Most Improved, All-NBA) from its award pages. About 33 Basketball-Reference pages, one every ~4 s.
// Runs daily on GitHub (careers change through the season) and publishes to the draft-data branch.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-drafthistory/1.0; daily; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com', ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 429) { console.log('429, waiting'); await sleep(65000); continue; } if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); }
    catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
}
const brGet = async u => { const t = await get(BR + u); await sleep(4200); return t; };
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Basketball-Reference hides some tables in HTML comments; read those too
const uncomment = h => String(h || '').replace(/<!--([\s\S]*?)-->/g, '$1');
const cells = row => Object.fromEntries([...row.matchAll(/<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => [m[1], m[2]]));
const brId = html => String(html || '').match(/\/players\/[a-z]\/([a-z0-9]+)\.html/)?.[1] || null;
const num = v => { const n = parseFloat(strip(v)); return Number.isFinite(n) ? n : null; };

const now = new Date(), lastDraft = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const YEARS = []; for (let y = 2001; y <= lastDraft; y++) YEARS.push(y);

// ---- awards and All-Star games, by Basketball-Reference player id ----
const tags = {}; // id -> { 'All-Star': n, MVP: n, ... }
const bump = (id, k) => { if (!id) return; (tags[id] ||= {}); tags[id][k] = (tags[id][k] || 0) + 1; };
{
  const h = uncomment(await brGet('/awards/all_star_by_player.html'));
  for (const row of h.split(/<tr/).slice(1)) {
    const c = cells(row), id = brId(c.player); if (!id) continue;
    const n = num(c.count) ?? num(c.all_star_games) ?? num(c.g) ?? null;
    if (n) { (tags[id] ||= {}); tags[id]['All-Star'] = Math.max(tags[id]['All-Star'] || 0, n); }
  }
  console.log('all-star players', Object.values(tags).filter(t => t['All-Star']).length);
  if (!Object.values(tags).some(t => t['All-Star'])) { console.log('ALLSTAR tables', [...h.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]).join(',')); const r = h.split(/<tr/).filter(x => /players\//.test(x)).slice(0, 2); console.log('ALLSTAR rows', r.map(x => x.slice(0, 600).replace(/\s+/g, ' ')).join('\n---\n')); }
}
for (const [page, label] of [['mvp', 'MVP'], ['roy', 'Rookie of the Year'], ['dpoy', 'Defensive Player of the Year'], ['smoy', 'Sixth Man'], ['mip', 'Most Improved']]) {
  const h = uncomment(await brGet(`/awards/${page}.html`)); if (!h) continue;
  // the NBA table only (the ABA one, where there is one, comes after it)
  const i = h.indexOf('id="mvp_NBA"') >= 0 ? h.indexOf('id="mvp_NBA"') : h.indexOf(`id="${page}_NBA"`) >= 0 ? h.indexOf(`id="${page}_NBA"`) : h.indexOf('<table');
  const tb = h.slice(i, h.indexOf('</table>', i));
  let n = 0; for (const row of tb.split(/<tr/).slice(1)) { const id = brId(cells(row).player); if (id) { bump(id, label); n++; } }
  console.log(label, n);
}
{
  const h = uncomment(await brGet('/awards/all_league.html'));
  const i = h.indexOf('id="awards_all_league"') >= 0 ? h.indexOf('id="awards_all_league"') : h.indexOf('<table');
  const tb = h.slice(i, h.indexOf('</table>', i)); let n = 0;
  for (const row of tb.split(/<tr/).slice(1)) { if (!/>NBA</.test(row)) continue; for (const m of row.matchAll(/\/players\/[a-z]\/([a-z0-9]+)\.html/g)) { bump(m[1], 'All-NBA'); n++; } }
  console.log('All-NBA spots', n);
}

// ---- each class ----
const years = {};
for (const y of YEARS) {
  const [E, html] = [await get(`${ESPN}/draft?season=${y}`, true).catch(() => null), uncomment(await brGet(`/draft/NBA_${y}.html`).catch(() => null))];
  const br = {};
  const i = html.indexOf('id="stats"'), tb = i >= 0 ? html.slice(i, html.indexOf('</table>', i)) : '';
  for (const row of tb.split(/<tr/).slice(1)) {
    const c = cells(row), ov = num(c.pick_overall); if (!ov) continue;
    br[ov] = { br: brId(c.player), name: strip(c.player), school: strip(c.college_name), c: { s: num(c.seasons), g: num(c.g), mp: num(c.mp), pts: num(c.pts), trb: num(c.trb), ast: num(c.ast), ppg: num(c.pts_per_g), rpg: num(c.trb_per_g), apg: num(c.ast_per_g), ws: num(c.ws), vorp: num(c.vorp) } };
  }
  const teams = Object.fromEntries((E?.teams || []).map(t => [String(t.id), t.abbreviation]));
  const pos = Object.fromEntries((E?.positions || []).map(p => [String(p.id), p.abbreviation]));
  const brByName = Object.fromEntries(Object.values(br).filter(b => b.name).map(b => [fold(b.name), b]));
  const picks = [];
  for (const p of E?.picks || []) {
    const a = p.athlete || {}, link = a.proLink || a.link || '';
    let b = br[p.overall]; if (!b || fold(b.name) !== fold(a.displayName)) b = brByName[fold(a.displayName)] || b;
    const t = b?.br ? tags[b.br] : null;
    picks.push({ ov: p.overall, rd: p.round, pk: p.pick, name: a.displayName || b?.name || '', pid: a.alternativeId || link.match(/\/id\/(\d+)/)?.[1] || '', tm: teams[String(p.teamId)] || '', tmId: String(p.teamId || ''), school: a.team?.shortDisplayName || b?.school || '', pos: pos[String(a.position?.id)] || '', note: p.tradeNote || '', br: b?.br || null, c: b?.c && b.c.g ? b.c : null, t: t || null });
  }
  // ESPN ids for picks the draft feed leaves without one (overseas, G League Ignite), by exact name
  for (const p of picks.filter(p => !p.pid && p.name)) {
    const r = await get(`${SEARCH}?query=${encodeURIComponent(p.name)}&limit=6&type=player&sport=basketball&league=nba`, true).catch(() => null);
    const hit = (r?.items || []).find(it => it.league === 'nba' && fold(it.displayName) === fold(p.name));
    if (hit) p.pid = String(hit.id);
    await sleep(250);
  }
  years[y] = picks;
  console.log(y, picks.length, 'picks,', picks.filter(p => p.c).length, 'with careers,', picks.filter(p => p.t).length, 'with honours');
}
const out = process.argv[2] || 'draft-history.json';
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), years }));
console.log('wrote', out);
