// probe: other sources for box scores ESPN's summary returns empty (Warriors at Pelicans, Oct 28, 2016, game 400899459)
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe', { recursive: true });
const UA = 'Mozilla/5.0 (compatible; fullcourt-probe/1.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const urls = {
  cdn_box: 'https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=400899459',
  core_roster: 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/400899459/competitions/400899459/competitors/9/roster',
  core_stats: 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/400899459/competitions/400899459/competitors/9/roster/6589/statistics/0',
  site_summary: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=400899459',
  web_summary: 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=400899459',
  br_box: 'https://www.basketball-reference.com/boxscores/201610280NOP.html',
};
for (const [k, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { 'user-agent': UA } }); const t = await r.text(); writeFileSync(`probe/${k}.txt`, `${r.status} ${t.length}\n` + t.slice(0, 600000)); console.log(k, r.status, t.length); }
  catch (e) { writeFileSync(`probe/${k}.err`, String(e)); console.log(k, 'error', e.message); }
  await sleep(4500);
}
