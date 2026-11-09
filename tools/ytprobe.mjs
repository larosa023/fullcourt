// one-off: official school channels and their women's video titles (removed after use)
const K = process.env.YT_KEY, H = { referer: 'https://nbafullcourty.netlify.app/' };
const api = async p => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${p}&key=${K}`, { headers: H }); const j = await r.json(); if (!r.ok) console.log('API', r.status, j.error?.message); return j; };
const handles = ['GamecockAthletics', 'gamecocksonline', 'TexasLonghorns', 'texaslonghorns', 'LSUTigerTV', 'LSU', 'Vols', 'UTVolsAthletics', 'ladyvols', 'VanderbiltAthletics', 'VandyBoys', 'vucommodores', '12thManProductions', 'TexasAMAthletics', 'GeorgiaBulldogs', 'UGAAthletics', 'GatorsVideo', 'FloridaGators', 'ArkRazorbacks', 'arkansasrazorbacks', 'AuburnTigers', 'MizzouAthletics', 'OleMissRebels', 'HailState', 'OU_WBB', 'SoonerSports', 'AlabamaAthletics', 'UKAthletics', 'TCUAthletics', 'DukeWBB', 'NotreDameAthletics', 'UConnHuskies', 'UConnWBB', 'BaylorAthletics', 'BigEastConference', 'theamerican', 'SunBelt'];
for (const h of handles) {
  const c = await api(`channels?part=snippet,contentDetails&forHandle=${h}`); const ch = c.items?.[0]; if (!ch) { console.log(`@${h}: none`); continue; }
  const up = await api(`playlistItems?part=snippet&maxResults=50&playlistId=${ch.contentDetails.relatedPlaylists.uploads}`);
  const w = (up.items || []).map(i => i.snippet.title).filter(t => /women|wbb|w\. basketball|lady vols|lady/i.test(t) && /highlight|condensed|full game|recap/i.test(t));
  console.log(`@${h}: ${ch.id} "${ch.snippet.title}" · ${w.length} women's highlight titles in last 50`);
  for (const t of w.slice(0, 3)) console.log('     ', t);
}
