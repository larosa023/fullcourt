// one-off: channel ids and title formats for women's highlight sources (removed after use)
const K = process.env.YT_KEY, H = { referer: 'https://nbafullcourty.netlify.app/' };
const api = async p => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${p}&key=${K}`, { headers: H }); const j = await r.json(); if (!r.ok) console.log('API', r.status, j.error?.message); return j; };
// channels from the last probe, by name
const want = /^(Big Ten Women's Basketball|Women's Sports on FOX|ESPN|LSU Tiger TV|UCLA Athletics|Michigan Athletics|MarylandAthletics|USCAthletics|UK Sports Video)$/;
const seen = new Map();
const Q = ["Texas Longhorns women's basketball highlights", "Vanderbilt women's basketball highlights", "Ole Miss women's basketball highlights", "Oklahoma women's basketball highlights", "South Carolina Gamecocks women's basketball highlights", "Tennessee Lady Vols basketball highlights", "Alabama women's basketball highlights", "LSU women's basketball highlights", "Kentucky women's basketball highlights", "Big Ten Women's Basketball highlights", "Women's Sports on FOX college basketball highlights", "ESPN full game highlights women's college basketball", "Notre Dame women's basketball highlights", "TCU women's basketball highlights", "Duke women's basketball highlights"];
for (const q of Q) {
  const j = await api(`search?part=snippet&type=video&maxResults=10&order=date&publishedAfter=2026-11-03T00:00:00Z&q=${encodeURIComponent(q)}`);
  console.log(`== ${q}`);
  for (const i of j.items || []) { const ch = i.snippet.channelTitle; console.log(`   ${i.snippet.publishedAt.slice(0, 10)} | ${ch} [${i.snippet.channelId}] | ${i.snippet.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&')}`); }
}
