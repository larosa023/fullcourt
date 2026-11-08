// temporary: coach / executive pages on Basketball-Reference
const UA = 'Mozilla/5.0 (compatible; fullcourt-coaches/1.0; weekly; +https://github.com/larosa023/fullcourt)', B = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = async u => { const r = await fetch(B + u, { headers: { 'user-agent': UA } }); const t = (await r.text()).replace(/<!--([\s\S]*?)-->/g, '$1'); await sleep(4500); return [r.status, t]; };
const rows = (t, id, n = 3) => { const i = t.indexOf(`id="${id}"`); if (i < 0) return 'NO TABLE ' + id; const tb = t.slice(i, t.indexOf('</table>', i)); return [...tb.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(0, n).map(m => m[1].replace(/<[^>]+data-stat="([^"]+)"[^>]*>/g, ' [$1]').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).join('\n'); };
let [s, t] = await g('/leagues/NBA_2027_coaches.html'); console.log('COACHES2027', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), '\n', rows(t, 'NBA_coaches', 5), '\n', t.match(/href="\/coaches\/[a-z0-9]+\.html"/g)?.slice(0, 3));
[s, t] = await g('/coaches/mazzujo01c.html'); console.log('COACH', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), '\n', rows(t, 'coach-stats', 4)); const m = t.indexOf('id="meta"'); console.log('META', t.slice(m, m + 2500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
[s, t] = await g('/teams/BOS/2027.html'); const mm = t.indexOf('id="meta"'); console.log('TEAMMETA', s, t.slice(mm, mm + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200), t.match(/href="\/executives\/[a-z0-9]+\.html"/g)?.slice(0, 2));
const ex = t.match(/href="(\/executives\/[a-z0-9]+\.html)"/)?.[1];
if (ex) { [s, t] = await g(ex); console.log('EXEC', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), '\n', rows(t, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)][0]?.[1] || 'x', 5)); const e = t.indexOf('id="meta"'); console.log(t.slice(e, e + 1500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)); }
[s, t] = await g('/wnba/years/2026_coaches.html'); console.log('WCOACH', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), rows(t, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)][0]?.[1] || 'x', 3));
[s, t] = await g('/coaches/NBA_stats.html'); console.log('ALL', s, [...t.matchAll(/<table[^>]*id="([^"]+)"/g)].map(m => m[1]), rows(t, 'NBA_coaches', 4));
