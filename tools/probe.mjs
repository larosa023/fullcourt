// temporary: a coach page and the executive link on Basketball-Reference
const UA = 'Mozilla/5.0 (compatible; fullcourt-coaches/1.0; weekly; +https://github.com/larosa023/fullcourt)', B = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = async u => { const r = await fetch(B + u, { headers: { 'user-agent': UA } }); const t = (await r.text()).replace(/<!--([\s\S]*?)-->/g, '$1'); await sleep(4500); return [r.status, t]; };
let [s, t] = await g('/leagues/NBA_2027_coaches.html');
const i = t.indexOf('id="NBA_coaches"'), tb = t.slice(i, t.indexOf('</table>', i));
console.log('LINKS', [...tb.matchAll(/data-stat="coach"[^>]*>(?:<a href=["']([^"']+)["']>)?([^<]+)/g)].slice(0, 4).map(m => m[1] + ' ' + m[2]));
const link = tb.match(/href=["'](\/coaches\/[^"']+)["']/)[1];
[s, t] = await g(link); console.log('COACH', link, s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]));
const j = t.indexOf('<table'); const ct = t.slice(j, t.indexOf('</table>', j)); console.log([...ct.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(0, 6).map(m => m[1].replace(/<[^>]+data-stat="([^"]+)"[^>]*>/g, ' [$1]').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).join('\n'));
const m = t.indexOf('id="meta"'); console.log('META', t.slice(m, m + 3000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
[s, t] = await g('/teams/BOS/2027.html'); const mm = t.indexOf('Executive:'); console.log('EXEC', t.slice(mm - 50, mm + 300));
