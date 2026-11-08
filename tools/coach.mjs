// Builds coaches.json: each team's head coach (this season, with the franchise, career, playoffs, season by season,
// awards, how they got the job) and, for the NBA, who runs the front office (with their record in charge).
// From Basketball-Reference (one page every ~4 s), weekly on GitHub (.github/workflows/coach.yml).
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-coaches/1.0; weekly; +https://github.com/larosa023/fullcourt)', BR = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function brGet(u) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(BR + u, { headers: { 'user-agent': UA } }); if (r.status === 429) { await sleep(65000); continue; } if (r.status === 404) { await sleep(4200); return null; } if (!r.ok) throw new Error(`${r.status} ${u}`); const t = await r.text(); await sleep(4200); return t.replace(/<!--([\s\S]*?)-->/g, '$1'); }
    catch (e) { if (a === 2) throw e; await sleep(6000 * (a + 1)); }
  }
}
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#x2605;/g, '').replace(/\s+/g, ' ').trim();
const tableOf = (html, id) => { const i = html.indexOf(`id="${id}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</table>', i)); };
const rowsOf = t => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const cells = r => Object.fromEntries([...r.matchAll(/data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => [m[1], m[2]]));
// the first table on the page with a given column (pages name their tables differently, NBA vs WNBA)
const tableWith = (html, stat) => { for (const m of html.matchAll(/<table[^>]*id="([^"]+)"/g)) { const t = tableOf(html, m[1]); if (t.includes(`data-stat="${stat}"`)) return t; } return ''; };
const tds = r => [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => strip(m[1]));
const cut = s => String(s || '').split(/\s+(?:died|college|relatives|hof|player_summary|exec_summary|wnba_summary|social|High School|College:|Died|Relatives|Hall of Fame|More)\b/)[0].trim();
const link = (s, kind) => s?.match(new RegExp(`href=["'](/${kind}/[^"']+)["']`))?.[1] || null;
const n = v => { const x = strip(v); return x === '' ? null : +x; };
const now = new Date(), M = now.getUTCMonth() + 1, Y = now.getUTCFullYear();
const NBA_SEASON = M >= 8 ? Y + 1 : Y, WNBA_SEASON = M >= 5 ? Y : Y - 1; // the WNBA season in progress or just played
// Basketball-Reference team codes -> ESPN's
const ESPN = { BRK: 'BKN', CHO: 'CHA', GSW: 'GS', NOP: 'NO', NYK: 'NY', PHO: 'PHX', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH', LVA: 'LV', LAS: 'LA', NYL: 'NY', GSV: 'GS', CON: 'CON' };
const esp = a => ESPN[a] || a;

async function coachPage(path) {
  const html = await brGet(path); if (!html) return {};
  const m = html.indexOf('id="meta"'), meta = strip(html.slice(m, m + 4000));
  const born = html.match(/data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1] || meta.match(/Born:\s*([A-Za-z]+ \d+, \d{4})/)?.[1] || '';
  const from = cut(meta.match(/Born:.*?\d{4}\s+in\s+(.+)$/)?.[1] || '');
  const college = cut(meta.match(/College:\s*(.+)$/)?.[1] || '');
  const played = meta.match(/As Player:\s*(?:As Player:\s*)?([^()]+?)\s*\(Full Record\)/)?.[1]?.trim() || '';
  const seasons = [], path2 = [];
  for (const r of rowsOf(tableOf(html, 'coach-stats') || tableWith(html, 'wins'))) {
    const c = cells(r), s = strip(c.season); if (!/^\d{4}(-\d{2})?$/.test(s)) continue;
    if (c.role) { path2.push({ s, team: esp(strip(c.team_id)), role: strip(c.role) }); continue; }
    if (c.wins == null) continue;
    seasons.push({ s, team: esp(strip(c.team_id)), lg: strip(c.lg_id), g: n(c.g), w: n(c.wins), l: n(c.losses), fin: strip(c.rank_team), pg: n(c.g_playoffs), pw: n(c.wins_playoffs), pl: n(c.losses_playoffs), note: strip(c.coach_remarks) });
  }
  const awards = rowsOf(tableOf(html, 'coach-awards')).map(tds).filter(c => /^\d{4}/.test(c[0] || '')).map(c => `${c.at(-1)} (${c[0]})`).slice(0, 14);
  const moves = rowsOf(tableOf(html, 'coach-transactions')).map(tds).filter(c => c.length >= 2 && /\d{4}/.test(c[0])).map(c => ({ d: c[0], t: c.slice(1).join(' ') })).slice(-8);
  return { born, from, college, played, seasons, path: path2, awards, moves };
}

async function coachesFor(lg, season) {
  const url = lg === 'nba' ? `/leagues/NBA_${season}_coaches.html` : `/wnba/years/${season}_coaches.html`;
  const html = await brGet(url); if (!html) throw new Error('no coaches page ' + url);
  const tb = tableOf(html, lg === 'nba' ? 'NBA_coaches' : 'coaches');
  const out = {};
  for (const r of rowsOf(tb)) {
    const c = cells(r); if (!c.coach || !c.team || /Coach/.test(strip(c.coach))) continue;
    const team = esp(strip(c.team)), path = link(c.coach, lg === 'nba' ? 'coaches' : 'wnba/coaches');
    const rec = { name: strip(c.coach), id: path?.split('/').pop()?.replace('.html', '') || null, team,
      seasons: { franchise: n(c.seas_num_franch), overall: n(c.seas_num_overall) },
      cur: { g: n(c.cur_g), w: n(c.cur_w), l: n(c.cur_l) }, fr: { g: n(c.fr_g), w: n(c.fr_w), l: n(c.fr_l), pg: n(c.fr_g_p), pw: n(c.fr_w_p), pl: n(c.fr_l_p) },
      car: { g: n(c.car_g), w: n(c.car_w), l: n(c.car_l), pct: n(c.car_wpct), pg: n(c.car_g_p), pw: n(c.car_w_p), pl: n(c.car_l_p) } };
    if (out[team]) continue; // a midseason change lists two coaches; the first row is the current one
    if (path) Object.assign(rec, await coachPage(path));
    out[team] = { coach: rec };
    console.log(lg, team, rec.name, rec.seasons?.length ?? '');
  }
  return out;
}

async function execFor(team) {
  const BRT = Object.entries(ESPN).find(([, v]) => v === team)?.[0] || team;
  const html = await brGet(`/teams/${BRT}/${NBA_SEASON}.html`); if (!html) return null;
  const i = html.indexOf('Executive:'); if (i < 0) return null;
  const seg = html.slice(i, i + 400), path = link(seg, 'executives'), name = strip(seg.match(/<a[^>]*>([^<]+)<\/a>/)?.[1] || '');
  const ex = { name, id: path?.split('/').pop()?.replace('.html', '') || null };
  if (!path) return ex;
  const eh = await brGet(path); if (!eh) return ex;
  // the executive's seasons in charge: any table with season / team / wins / losses
  const tid = [...eh.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1])[0];
  ex.seasons = rowsOf(tableOf(eh, tid)).map(r => { const c = cells(r), s = strip(c.season); return /^\d{4}-\d{2}$/.test(s) ? { s, team: esp(strip(c.team_id || c.team)), w: n(c.wins), l: n(c.losses), pw: n(c.wins_playoffs), pl: n(c.losses_playoffs), note: strip(c.exec_remarks || c.notes || c.remarks || '') } : null; }).filter(Boolean);
  const m = eh.indexOf('id="meta"'); const meta = strip(eh.slice(m, m + 3000));
  ex.born = eh.match(/data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1] || '';
  ex.played = /Player Summary|As Player/.test(meta);
  return ex;
}

const out = { updated: new Date().toISOString(), source: 'Basketball-Reference', nba: { season: NBA_SEASON, teams: {} }, wnba: { season: WNBA_SEASON, teams: {} } };
out.nba.teams = await coachesFor('nba', NBA_SEASON);
for (const t of Object.keys(out.nba.teams)) { try { out.nba.teams[t].exec = await execFor(t); console.log('exec', t, out.nba.teams[t].exec?.name, out.nba.teams[t].exec?.seasons?.length); } catch (e) { console.log('exec failed', t, e.message); } }
try { out.wnba.teams = await coachesFor('wnba', WNBA_SEASON); } catch (e) { console.log('WNBA coaches failed', e.message); }
if (Object.keys(out.nba.teams).length < 25) throw new Error('too few NBA coaches; keeping the last file');
writeFileSync(process.argv[2] || 'coaches.json', JSON.stringify(out));
