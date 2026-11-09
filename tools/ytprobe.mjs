// one-off: what YouTube search finds for women's Top 25 games without a video (removed after use)
const K = process.env.YT_KEY, H = { referer: 'https://nbafullcourty.netlify.app/' };
const api = async p => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${p}&key=${K}`, { headers: H }); const j = await r.json(); if (!r.ok) console.log('API', r.status, j.error?.message); return j; };
const Q = [['Northern Colorado vs Texas', '2026-11-08'], ['Texas Southern vs LSU', '2026-11-06'], ['Eastern Illinois vs Iowa', '2026-11-06'], ['UC Irvine vs UCLA', '2026-11-06'], ['Wright State vs Michigan', '2026-11-08'], ['Utah State vs USC', '2026-11-09'], ['George Mason vs Maryland', '2026-11-08'], ['Northern Kentucky vs Kentucky', '2026-11-05']];
for (const [q, d] of Q) {
  const j = await api(`search?part=snippet&type=video&maxResults=8&order=relevance&publishedAfter=${d}T00:00:00Z&q=${encodeURIComponent(q + " women's basketball highlights")}`);
  const ids = (j.items || []).map(i => i.id.videoId).join(',');
  const v = ids ? await api(`videos?part=contentDetails&id=${ids}`) : { items: [] };
  const dur = Object.fromEntries((v.items || []).map(x => [x.id, x.contentDetails.duration]));
  console.log(`== ${q} (${d})`);
  for (const i of j.items || []) console.log(`   ${i.snippet.publishedAt.slice(0, 16)} | ${dur[i.id.videoId] || ''} | ${i.snippet.channelTitle} | ${i.snippet.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&')}`);
}
