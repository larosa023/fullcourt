// one-off diagnostics for the highlights job (removed after use)
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; fullcourt-highlights/1.0; +https://github.com/larosa023/fullcourt)', 'accept-language': 'en-US,en;q=0.9' };
for (const [n, id] of Object.entries({ ACC_hl: 'PLd1lJof_DUHc', NBA_full: 'PLftRqjkDhxkg' })) {
  const t = await (await fetch(`https://www.youtube.com/playlist?list=${id}`, { headers: UA })).text();
  const keys = {}; for (const m of t.matchAll(/"([A-Za-z]+(?:Renderer|ViewModel))":/g)) keys[m[1]] = (keys[m[1]] || 0) + 1;
  console.log(n, 'videoId count', (t.match(/"videoId":"/g) || []).length, 'ytInitialData at', t.indexOf('ytInitialData'), '\n ', Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, c]) => k + ':' + c).join(' '));
  const i = t.indexOf('"videoId":"'); console.log('  sample:', t.slice(i - 300, i + 900).replace(/\s+/g, ' '));
  const j = t.indexOf('ytInitialData'); console.log('  head:', t.slice(j - 40, j + 120));
}
