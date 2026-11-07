// one-off: save sample pages so the history parser can be written against the real markup
import { writeFileSync, mkdirSync } from 'node:fs';
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; +https://github.com/larosa023/fullcourt)';
mkdirSync('raw', { recursive: true });
for (const [n, u] of [['pts_career', 'https://www.basketball-reference.com/leaders/pts_career.html'], ['jordami01', 'https://www.basketball-reference.com/players/j/jordami01.html'], ['birdla01', 'https://www.basketball-reference.com/players/b/birdla01.html'], ['champions', 'https://www.basketball-reference.com/playoffs/']]) {
  const r = await fetch(u, { headers: { 'user-agent': UA } }); const t = await r.text(); console.log(n, r.status, t.length); writeFileSync(`raw/${n}.html`, t); await new Promise(r => setTimeout(r, 4200));
}
