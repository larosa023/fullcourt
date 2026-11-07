// Builds contracts.json for Capsheet and Deadline. Runs weekly on GitHub (see .github/workflows/cap.yml).
//  - Basketball-Reference team contract pages (30 pages, one every ~4 s): salary by season, player/team options
//    (cell classes), non-guaranteed years (italics + payroll notes), two-way deals and signing notes.
//  - ESPN team rosters: ESPN ids (photos, links), positions, current team, trade kickers and trade values.
// Cap lines are the NBA's published 2026-27 figures.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-cap/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR_TEAMS = ['ATL', 'BOS', 'BRK', 'CHI', 'CHO', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHO', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
const TO_ESPN = { BRK: 'BKN', CHO: 'CHA', GSW: 'GS', NOP: 'NO', NYK: 'NY', PHO: 'PHX', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };
const CAP = { season: '2026-27', cap: 164961000, tax: 200428000, apron1: 209015000, apron2: 221686000, min: 148465000, mle: 15044000, tpmle: 6064000, room: 9366000, source: 'https://pr.nba.com/2026-27-salary-cap/' };
// 2026-27 trade salary matching for teams over the cap and below the first apron (indexed to the cap)
const MATCH = { low: 9100000, high: 35200000, cushion: 250000, mid: 9100000, roomExtra: 100000 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
async function get(url, json = false) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 429) { await sleep(60000); continue; } if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); }
    catch (e) { if (a === 2) throw e; await sleep(5000 * (a + 1)); }
  }
}

function parseTeam(html, abbr) {
  const i = html.indexOf('id="contracts"'); if (i < 0) throw new Error(`no contracts table for ${abbr}`);
  const t = html.slice(i, html.indexOf('</table>', i));
  const seasons = [...t.matchAll(/data-stat="y(\d)"[^>]*>(\d{4}-\d{2})</g)].map(m => m[2]);
  // payroll notes (inside an HTML comment): player name -> text
  const notes = {};
  const ni = html.indexOf('id="payroll-notes"');
  if (ni >= 0) { const nt = html.slice(ni, html.indexOf('</table>', ni)); for (const r of nt.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) { const c = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => strip(m[1])); if (c.length >= 2 && c[0] !== 'Player') notes[norm(c[0])] = c[1]; } }
  const out = [];
  for (const r of t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = r[1]; const idm = row.match(/data-stat="player"[^>]*csk="([^"]+)"/); if (!idm) continue;
    const name = strip(row.match(/data-stat="player"[^>]*>([\s\S]*?)<\/th>/)?.[1] || ''); if (!name || name === 'Team Totals') continue;
    const cell = k => { const m = row.match(new RegExp(`<td class="([^"]*)" data-stat="${k}"([^>]*)>([\\s\\S]*?)</td>`)); return m ? [m[0], m[1], m[2].match(/csk="(\d+)"/)?.[1], m[3]] : null; };
    const sal = [], opt = [], ng = [];
    for (let y = 1; y <= 6; y++) {
      const m = cell('y' + y); const v = m?.[2] ? +m[2] : null; sal.push(v);
      opt.push(/salary-pl/.test(m?.[1] || '') ? 'P' : /salary-tm/.test(m?.[1] || '') ? 'T' : '');
      ng.push(v != null && /<em>/.test(m?.[3] || '') ? 1 : 0);
    }
    const g = cell('remain_gtd'), gtd = g?.[2] ? +g[2] : 0;
    const note = notes[norm(name)] || '';
    // notes name the non-guaranteed / partially guaranteed seasons in words too
    for (const m of note.matchAll(/((?:\d{4}-\d{2})(?:(?:,| and) \d{4}-\d{2})*) (?:is|are) (not|partially) guaranteed/g)) for (const s of m[1].match(/\d{4}-\d{2}/g)) { const k = seasons.indexOf(s); if (k >= 0 && sal[k] != null) ng[k] = m[2] === 'not' ? 1 : 2; }
    const signed = note.match(/Signed ([^.]*?(?:contract|extension|deal)[^.]*?)(?=\.|$)/)?.[1] || '';
    const twoWay = /two-way/i.test(signed) && sal.every(v => v == null);
    const traded = note.match(/Traded from ([A-Z]{3}) to ([A-Z]{3}) ([A-Za-z]+ \d+, \d{4})/);
    out.push({ br: idm[1], name, team: TO_ESPN[abbr] || abbr, age: +strip(cell('age_today')?.[3] || '') || null, sal, opt, ng, gtd, twoWay, signed, traded: traded ? { from: TO_ESPN[traded[1]] || traded[1], on: traded[3] } : null, note });
  }
  return { seasons, players: out };
}

const espnTeams = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams', true)).sports[0].leagues[0].teams.map(x => x.team);
const espn = new Map(); // normalized name -> roster entry
for (const t of espnTeams) {
  const d = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/roster`, true);
  for (const a of d.athletes || []) espn.set(norm(a.displayName), { id: String(a.id), team: t.abbreviation, pos: a.position?.abbreviation || '', k: a.contract || null });
}
console.log('ESPN players', espn.size);

let seasons = null; const players = [];
for (const abbr of BR_TEAMS) {
  const html = await get(`https://www.basketball-reference.com/contracts/${abbr}.html`);
  const p = parseTeam(html, abbr); seasons ||= p.seasons; players.push(...p.players);
  console.log(abbr, p.players.length);
  await sleep(4200);
}
let matched = 0;
for (const p of players) {
  const e = espn.get(norm(p.name)); if (!e) continue; matched++;
  p.espn = e.id; p.pos = e.pos;
  if (e.team && e.team !== p.team) p.espnTeam = e.team; // moved since the weekly read (trade or signing)
  const k = e.k; if (k?.tradeKicker?.active) p.kicker = k.tradeKicker.percentage;
  if (k?.incomingTradeValue && k.incomingTradeValue !== p.sal[0]) p.tradeIn = k.incomingTradeValue;
}
console.log('players', players.length, 'matched to ESPN', matched);
if (players.length < 400) throw new Error('too few contracts parsed; keeping last week\'s file');
writeFileSync(process.argv[2] || 'contracts.json', JSON.stringify({ updated: new Date().toISOString(), seasons, cap: CAP, match: MATCH, source: 'Basketball-Reference contracts pages + ESPN rosters', players }));
