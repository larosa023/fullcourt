// temporary: how Basketball-Reference shows nicknames
const UA = 'Mozilla/5.0 (compatible; fullcourt-history/1.0; weekly; +https://github.com/larosa023/fullcourt)', B = 'https://www.basketball-reference.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const u of ['/players/j/jordami01.html', '/players/i/iversal01.html', '/players/g/gilgesh01.html', '/players/w/wembavi01.html', '/wnba/players/t/tauradi01w.html', '/teams/BOS/2027.html']) {
  const r = await fetch(B + u, { headers: { 'user-agent': UA } }); const t = await r.text();
  const m = t.indexOf('id="meta"'); const blk = t.slice(m, m + 3000);
  console.log('==', u, r.status, [...blk.matchAll(/<p>\s*\(([^<]{2,200})\)\s*<\/p>/g)].map(x => x[1]), blk.match(/Nicknames?:[^<]{0,200}/)?.[0]);
  if (u.includes('teams')) { const i = t.indexOf('id="roster"'); console.log(t.slice(i, i + 1500).replace(/\s+/g, ' ')); }
  await sleep(4500);
}
