// one-off diagnostics for the highlights job (removed after use)
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' };
const get = async u => { const r = await fetch(u, { headers: UA }); return [r.status, await r.text()]; };
for (const h of ['BigTenNetwork', 'btn', 'BTN', 'bigten', 'BigTen', 'FOXCollegeHoops', 'foxcollegehoops', 'FOXCBB', 'CBBonFOX', 'FOXSportsCollegeHoops', 'ACCNetwork', 'SECNetworkVideo', 'secnetwork']) {
  const [s, t] = await get(`https://www.youtube.com/@${h}`);
  console.log(`@${h}`, s, t.match(/"externalId":"(UC[\w-]{22})"/)?.[1] || '', t.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || '');
}
const CH = { NBA: 'UCWJ2lWNubArHWmf3FIHbfcQ', ACC: 'UC0hy7TcR1gGD8nQBqrF2FaA', Big12: 'UCLnfOCTbfqMy_3ah8OmTHEQ', SEC: 'UC60q_WUDde_NK-ze3frvtiA', BigEast: 'UCAcXdiimhsuivSn2PxtsRFw', FOX: 'UCwNqHDsnBCKT-olwJwIFyfg', NCAA: 'UC0nOdMq78X8ifkIxnIoqfHQ' };
const KNOWN = { BTNwbb: 'PL2RRF9GtC9s32jHtkN74wyLXRtTR5Ash8', B12wbb2526: 'PLhh7fyF6r5qXCuhDgwdKKfCIzXkgF4fqx', ACCwbb2627: 'PLd1lJof_DUHc' };
for (const [n, pl] of Object.entries(KNOWN)) {
  const [s, t] = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${pl}`);
  const e = [...t.matchAll(/<entry>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<published>([^<]+)/g)].map(m => m[2].slice(0, 10) + ' ' + m[1]);
  console.log('KNOWN', n, pl, s, e.length, '\n   ' + e.slice(0, 6).join('\n   '));
}
for (const [n, id] of Object.entries(CH)) {
  const [s, t] = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=UU${id.slice(2)}`);
  const e = [...t.matchAll(/<entry>[\s\S]*?<title>([^<]+)<\/title>/g)].map(m => m[1]);
  console.log(n, 'uploads feed', s, e.length, '|', e.slice(0, 5).join(' / '));
  for (const tab of ['playlists', 'playlists?view=1&sort=lad']) {
    const [s2, t2] = await get(`https://www.youtube.com/channel/${id}/${tab}`);
    const found = new Map();
    for (const m of t2.matchAll(/"(?:playlistId|contentId)":"(PL[\w-]{10,40})"/g)) {
      const after = t2.slice(m.index, m.index + 4000);
      const title = after.match(/"title":\{"(?:simpleText|content)":"([^"]+)"/)?.[1] || after.match(/"content":"([^"]+)"/)?.[1] || '';
      if (!found.has(m[1])) found.set(m[1], title);
    }
    const hits = [...found].filter(([, t]) => /women|wbb|full game|game highlights|highlights/i.test(t));
    console.log(' ', tab, s2, 'playlists seen', found.size, '\n    ' + hits.slice(0, 15).map(([p, t]) => p + ' ' + t).join('\n    '));
  }
}
