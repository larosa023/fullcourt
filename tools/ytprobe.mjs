// one-off diagnostics for the highlights job (removed after use)
const K = process.env.YT_KEY || '';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' };
console.log('key present:', !!K, 'length', K.length);
let REF = '';
for (const ref of ['', 'https://nbafullcourty.netlify.app/', 'https://fullcourt-46z.pages.dev/', 'https://larosa023.github.io/', 'https://larosa023.github.io/fullcourt/', 'http://localhost/', 'https://tauri.localhost/']) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UCWJ2lWNubArHWmf3FIHbfcQ&key=${K}`, { headers: ref ? { referer: ref } : {} });
  const j = await r.json().catch(() => ({}));
  console.log('API referer', JSON.stringify(ref), r.status, j.error?.message || j.items?.[0]?.snippet?.title);
  if (r.ok && !REF) REF = ref || 'none';
}
const api = async path => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${K}`, { headers: REF && REF !== 'none' ? { referer: REF } : {} }); return r.ok ? r.json() : null; };
const handles = ['NBA', 'ACCDigitalNetwork', 'theACC', 'Big12Conference', 'BigTenNetwork', 'B1GPlus', 'FOXCollegeHoops', 'FOXSports', 'SEC', 'SECNetwork', 'secsports', 'BIGEASTConference', 'BigEast', 'NCAAMarchMadness', 'NCAA', 'ESPN', 'espnwbb', 'ESPNCollegeBasketball'];
for (const h of handles) {
  let id = '', name = '';
  try { const r = await fetch(`https://www.youtube.com/@${h}`, { headers: UA }); const t = await r.text(); id = t.match(/"externalId":"(UC[\w-]{22})"/)?.[1] || t.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1] || t.match(/channel_id=(UC[\w-]{22})/)?.[1] || ''; name = t.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || ''; console.log(`@${h}`, r.status, id, name); } catch (e) { console.log(`@${h}`, 'ERR', e.message); }
  if (!id) continue;
  if (REF) {
    let page = '', n = 0;
    do {
      const j = await api(`playlists?part=snippet,contentDetails&channelId=${id}&maxResults=50${page ? `&pageToken=${page}` : ''}`); if (!j) { console.log('  playlists API failed'); break; }
      for (const p of j.items || []) { const t = p.snippet.title; if (/women|wbb|full game|highlight|condensed/i.test(t)) console.log('  PL', p.id, p.contentDetails.itemCount, p.snippet.publishedAt?.slice(0, 10), t); }
      page = j.nextPageToken; n++;
    } while (page && n < 6);
    const u = await api(`playlistItems?part=snippet&maxResults=8&playlistId=UU${id.slice(2)}`);
    for (const it of u?.items || []) console.log('  upload', it.snippet.publishedAt?.slice(0, 16), it.snippet.title);
  } else {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA }); const t = await r.text();
    console.log('  feed', r.status, (t.match(/<title>([^<]+)/g) || []).slice(1, 9).join(' / '));
  }
}
