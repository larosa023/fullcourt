// one-off: WNBA playlist titles (removed after use)
const K = process.env.YT_KEY, H = { referer: 'https://nbafullcourty.netlify.app/' };
const api = async p => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${p}&key=${K}`, { headers: H }); return r.json(); };
for (const [n, pl] of [['season', 'PLSPy3Xok-53RkJ8DpqGA6FQSOIY5HepSB'], ['playoffs', 'PLIHqPSYoErfw'], ['finals', 'PLD2CSiF5zblA'], ['2025 full', 'PLSPy3Xok-53SwFTmgu2kKIxpIfnaMVwt6']]) {
  const j = await api(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${pl}`);
  const it = j.items || [];
  console.log(`== ${n}: ${j.pageInfo?.totalResults} total`);
  for (const i of [...it.slice(0, 8), ...it.slice(-3)]) console.log('   ', i.contentDetails?.videoPublishedAt?.slice(0, 10), '|', i.snippet.title);
}
