// One-off: saves sample Basketball-Reference pages so their table formats can be read before writing parsers.
import { writeFileSync, mkdirSync } from 'node:fs';
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = [
  ['totals_1962', '/leagues/NBA_1962_totals.html'], ['totals_2024', '/leagues/NBA_2024_totals.html'],
  ['adv_1962', '/leagues/NBA_1962_advanced.html'], ['adv_2024', '/leagues/NBA_2024_advanced.html'],
  ['draft_2003', '/draft/NBA_2003.html'], ['draft_1960', '/draft/NBA_1960.html'], ['draft_1947', '/draft/BAA_1947.html'],
  ['players_a', '/players/a/'], ['players_x', '/players/x/'],
  ['playoffs_1996', '/playoffs/NBA_1996.html'], ['playoffs_1962', '/playoffs/NBA_1962.html'], ['playoffs_2024', '/playoffs/NBA_2024.html'],
  ['league_2024', '/leagues/NBA_2024.html'], ['league_1962', '/leagues/NBA_1962.html'],
  ['lgavg', '/leagues/NBA_stats_per_game.html'],
  ['wnba_2024', '/wnba/years/2024_per_game.html'], ['wnba_2024_sum', '/wnba/years/2024.html'], ['wnba_1997', '/wnba/years/1997_per_game.html'],
  ['allstar_1992', '/allstar/NBA_1992.html'],
];
mkdirSync('probe', { recursive: true });
const note = [];
for (const [name, url] of PAGES) {
  try {
    const r = await fetch(BR + url, { headers: { 'user-agent': UA } });
    const t = await r.text();
    note.push(`${name} ${r.status} ${t.length}`);
    if (r.ok) writeFileSync(`probe/${name}.html`, t.replace(/<!--([\s\S]*?)-->/g, '$1').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  } catch (e) { note.push(`${name} failed ${e.message}`); }
  await sleep(4200);
}
writeFileSync('probe/_status.txt', note.join('\n'));
console.log(note.join('\n'));
