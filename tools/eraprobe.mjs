// probe: Basketball-Reference birthplace and college index pages (format check for the origins map)
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe', { recursive: true });
const UA = 'Mozilla/5.0 (compatible; fullcourt-probe/1.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pages = { bp_index: '/friv/birthplaces.fcgi', bp_ny: '/friv/birthplaces.fcgi?country=US&state=NY', bp_fr: '/friv/birthplaces.fcgi?country=FR&state=', col_index: '/friv/colleges.fcgi', col_duke: '/friv/colleges.fcgi?college=duke' };
for (const [k, u] of Object.entries(pages)) {
  try { const r = await fetch('https://www.basketball-reference.com' + u, { headers: { 'user-agent': UA } }); const t = await r.text(); writeFileSync(`probe/${k}.html`, `<!-- ${r.status} ${t.length} -->\n` + t.slice(0, 400000)); console.log(k, r.status, t.length); }
  catch (e) { writeFileSync(`probe/${k}.err`, String(e)); }
  await sleep(4500);
}
