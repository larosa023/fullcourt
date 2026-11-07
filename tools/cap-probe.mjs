// one-off: save the raw contract pages so the parser can be written against the real markup
import { writeFileSync, mkdirSync } from 'node:fs';
const UA = 'Mozilla/5.0 (compatible; fullcourt-cap/1.0; +https://github.com/larosa023/fullcourt)';
mkdirSync('raw', { recursive: true });
for (const [name, url] of [['players', 'https://www.basketball-reference.com/contracts/players.html'], ['BOS', 'https://www.basketball-reference.com/contracts/BOS.html']]) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  const t = await r.text(); console.log(name, r.status, t.length);
  writeFileSync(`raw/${name}.html`, t);
  await new Promise(r => setTimeout(r, 4000));
}
