// one-off diagnostics for the highlights job (removed after use)
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; fullcourt-highlights/1.0; +https://github.com/larosa023/fullcourt)', 'accept-language': 'en-US,en;q=0.9' };
const txt = o => o?.simpleText || o?.content || (o?.runs || []).map(r => r.text).join('') || '';
function walk(o, f) { if (!o || typeof o !== 'object') return; f(o); for (const k in o) walk(o[k], f); }
const PL = { NBA_full: 'PLftRqjkDhxkg', ACC_hl: 'PLd1lJof_DUHc', ACC_full: 'PLHsKxgk85uD4', ACC_cond: 'PLaYoADPg1goY', B12_ext: 'PLUAjn2v4uYSI', B12_hl: 'PLWAq972xEEGU', BTN_w: 'PL2RRF9GtC9s32jHtkN74wyLXRtTR5Ash8', BE_w: 'PLbBaGW5exmkU' };
for (const [n, id] of Object.entries(PL)) {
  const f = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`, { headers: UA });
  const r = await fetch(`https://www.youtube.com/playlist?list=${id}`, { headers: UA }); const t = await r.text();
  const m = t.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); let D = null; try { D = JSON.parse(m[1]); } catch (e) {}
  const v = [];
  walk(D, o => { const p = o.playlistVideoRenderer; if (p) v.push(`${p.videoId} | ${txt(p.lengthText)} | ${txt(p.title)} | ${(p.videoInfo?.runs || []).map(x => x.text).join('')}`); });
  console.log(`== ${n} ${id}: feed ${f.status} page ${r.status} ${t.length}B consent=${/consent\.youtube/.test(t)} videos ${v.length}\n   ` + v.slice(0, 7).join('\n   ') + (v.length > 7 ? `\n   … last: ${v.at(-1)}` : ''));
}
