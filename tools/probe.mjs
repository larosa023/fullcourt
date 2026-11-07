// temporary: look at Basketball-Reference's WNBA pages from GitHub (the sandbox can't reach them)
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)', B = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = async u => { const r = await fetch(B + u, { headers: { 'user-agent': UA } }); const t = (await r.text()).replace(/<!--([\s\S]*?)-->/g, '$1'); await sleep(4500); return [r.status, t]; };
let [s, t] = await g('/wnba/leaders/pts_career.html');
const i = t.indexOf('<table'); console.log('LEADERS', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), t.slice(i, i + 3000));
[s, t] = await g('/wnba/players/t/tauradi01w.html');
const m = t.indexOf('id="meta"'); console.log('META', t.slice(m, m + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000));
console.log('BIRTH', t.match(/data-birth="[^"]+"/)?.[0], 'BLING', t.slice(t.indexOf('id="bling"'), t.indexOf('id="bling"') + 1200));
const p = t.indexOf('id="per_game0"'), e = t.indexOf('</table>', p), tb = t.slice(p, e); console.log('TFOOT', tb.slice(tb.indexOf('<tfoot'), tb.indexOf('<tfoot') + 2000));
for (const k of ['trb', 'ast', 'stl', 'blk', 'fg3', 'g']) { const [s2] = await g(`/wnba/leaders/${k}_career.html`); console.log(k, s2); }
