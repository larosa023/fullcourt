// one-off: what the WNBA posts on YouTube (removed after use)
const K = process.env.YT_KEY, H = { referer: 'https://nbafullcourty.netlify.app/' };
const api = async p => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${p}&key=${K}`, { headers: H }); const j = await r.json(); if (!r.ok) console.log('API', r.status, j.error?.message); return j; };
for (const h of ['WNBA', 'wnba']) {
  const c = await api(`channels?part=snippet,contentDetails&forHandle=${h}`); const ch = c.items?.[0]; if (!ch) { console.log('no channel for', h); continue; }
  console.log('channel', ch.id, ch.snippet.title);
  let page = '', n = 0;
  do { const j = await api(`playlists?part=snippet,contentDetails&channelId=${ch.id}&maxResults=50${page ? `&pageToken=${page}` : ''}`); for (const p of j.items || []) if (/full game|highlight|2026|game/i.test(p.snippet.title)) console.log('  PL', p.id, p.contentDetails.itemCount, p.snippet.publishedAt?.slice(0, 10), p.snippet.title); page = j.nextPageToken; n++; } while (page && n < 6);
  const up = await api(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${ch.contentDetails.relatedPlaylists.uploads}`);
  const fg = (up.items || []).filter(i => /full game|highlights/i.test(i.snippet.title));
  console.log('  latest uploads:', (up.items || []).length, '| with highlights in title:', fg.length);
  for (const i of fg.slice(0, 12)) console.log('   ', i.contentDetails.videoPublishedAt?.slice(0, 10), i.snippet.title);
  break;
}
