// one-off diagnostics for the highlights job (removed after use)
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' };
const data = async u => { const r = await fetch(u, { headers: UA }); const t = await r.text(); const m = t.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };
const txt = o => o?.simpleText || o?.content || (o?.runs || []).map(r => r.text).join('') || '';
function walk(o, f) { if (!o || typeof o !== 'object') return; f(o); for (const k in o) walk(o[k], f); }
const CH = { ACC: 'UC0hy7TcR1gGD8nQBqrF2FaA', Big12: 'UCLnfOCTbfqMy_3ah8OmTHEQ', BTN: 'UC4LeRw7pIZ_kseS4Krn_DQA', bigten: 'UC65mN_qyou1zTXyGP72h-vg', SEC: 'UC60q_WUDde_NK-ze3frvtiA', BigEast: 'UCAcXdiimhsuivSn2PxtsRFw', FOXcbb: 'UCof87GfHWnB9ycCDuzCPclQ', NBA: 'UCWJ2lWNubArHWmf3FIHbfcQ' };
for (const [n, id] of Object.entries(CH)) {
  const P = await data(`https://www.youtube.com/channel/${id}/playlists`);
  const pls = new Map();
  walk(P, o => {
    if (o.lockupViewModel?.contentId?.startsWith?.('PL')) pls.set(o.lockupViewModel.contentId, txt(o.lockupViewModel.metadata?.lockupMetadataViewModel?.title));
    if (o.gridPlaylistRenderer) pls.set(o.gridPlaylistRenderer.playlistId, txt(o.gridPlaylistRenderer.title));
  });
  console.log(`== ${n} playlists ${pls.size}:`, [...pls].filter(([, t]) => /women|wbb|w\.?bb|full game|highlight/i.test(t)).map(([p, t]) => `\n   ${p} ${t}`).join('') || [...pls].slice(0, 8).map(([p, t]) => `\n   (other) ${p} ${t}`).join(''));
  const V = await data(`https://www.youtube.com/channel/${id}/videos`);
  const vids = [];
  walk(V, o => { const v = o.videoRenderer || o.richItemRenderer?.content?.videoRenderer; if (o.videoRenderer) vids.push(`${txt(o.videoRenderer.publishedTimeText)} | ${txt(o.videoRenderer.lengthText)} | ${txt(o.videoRenderer.title)}`); });
  console.log(`   latest videos ${vids.length}:\n     ` + vids.slice(0, 12).join('\n     '));
}
