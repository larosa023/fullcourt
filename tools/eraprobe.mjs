// One-off: saves sample Basketball-Reference WNBA pages so their table formats can be read before writing parsers.
import { writeFileSync, mkdirSync } from 'node:fs';
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const BR = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = [
  ['w_totals_2024', '/wnba/years/2024_totals.html'], ['w_adv_2024', '/wnba/years/2024_advanced.html'], ['w_adv_1997', '/wnba/years/1997_advanced.html'],
  ['w_awards_2024', '/wnba/awards/awards_2024.html'], ['w_awards', '/wnba/awards/'], ['w_all_league', '/wnba/awards/all_league.html'], ['w_all_defense', '/wnba/awards/all_defense.html'], ['w_mvp', '/wnba/awards/mvp.html'],
  ['w_draft_2024', '/wnba/draft/2024.html'], ['w_draft_1997', '/wnba/draft/1997.html'], ['w_players_a', '/wnba/players/a/'],
  ['w_allstar', '/wnba/allstar/'], ['w_sum_2003', '/wnba/years/2003.html'], ['w_sum_2026', '/wnba/years/2026.html'], ['w_years', '/wnba/years/'],
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
