// Full game highlights for Replay, matched to games from YouTube playlists.
//   NBA: the NBA channel's "Nightly Full Game Highlights" playlist (titles carry both teams and the date).
//   Women's college: the conferences' own women's basketball playlists (full game replays, condensed games, extended
//   highlights, highlights). Their titles name both teams but no date, so each video is matched to ESPN's women's
//   games from the few days before it went up.
// Reads the YouTube Data API when the YT_KEY secret works (and finds each season's new playlists by name); otherwise
// YouTube's public playlist feeds (the latest 15 videos each), which YouTube sometimes breaks.
// Output: highlights.json { updated, games: { "YYYYMMDD|away|home": NBA video }, ncaaw: { eventId: { full|cond|ext|hl: video } } }
import { writeFileSync } from 'node:fs';
const PREV = 'https://raw.githubusercontent.com/larosa023/fullcourt/yt-data/highlights.json';
const KEY = process.env.YT_KEY || '';
// the key only accepts calls from the site's address
const REFERER = 'https://nbafullcourty.netlify.app/';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; fullcourt-highlights/1.0; +https://github.com/larosa023/fullcourt)', 'accept-language': 'en-US,en;q=0.9' };
const ESPN_W = 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const nick = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// season label like "2026-27" (a season starts in the fall)
const now = new Date();
const sy = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const SEASON = `${sy}-${String((sy + 1) % 100).padStart(2, '0')}`;

// pl: this season's playlist (used when the API can't look it up by name); find: how to recognise next season's
const SOURCES = [
  { lg: 'nba', src: 'NBA', ch: 'UCWJ2lWNubArHWmf3FIHbfcQ', pl: 'PLftRqjkDhxkg', find: /nightly full game highlights/i },
  { lg: 'ncaaw', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: 'PLHsKxgk85uD4', kind: 'full', find: /women.s basketball full game replay/i },
  { lg: 'ncaaw', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: 'PLaYoADPg1goY', kind: 'cond', find: /women.s basketball condensed games?/i },
  { lg: 'ncaaw', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: 'PLd1lJof_DUHc', kind: 'hl', find: /women.s basketball game highlights/i },
  { lg: 'ncaaw', src: 'Big 12', ch: 'UCLnfOCTbfqMy_3ah8OmTHEQ', pl: 'PLUAjn2v4uYSI', kind: 'ext', find: /women.s basketball extended highlights/i },
  { lg: 'ncaaw', src: 'Big 12', ch: 'UCLnfOCTbfqMy_3ah8OmTHEQ', pl: 'PLWAq972xEEGU', kind: 'hl', find: /big 12 women.s basketball highlights/i },
  { lg: 'ncaaw', src: 'Big East', ch: 'UCAcXdiimhsuivSn2PxtsRFw', pl: 'PLbBaGW5exmkU', kind: 'hl', find: /big east women.s basketball highlights/i },
  // no playlist yet this season; picked up by name once one appears (needs the API)
  { lg: 'ncaaw', src: 'Big Ten', ch: 'UC4LeRw7pIZ_kseS4Krn_DQA', pl: '', find: /women.s basketball.*highlights|highlights.*women.s basketball/i },
  { lg: 'ncaaw', src: 'SEC', ch: 'UC60q_WUDde_NK-ze3frvtiA', pl: '', find: /women.s basketball.*(game highlights|condensed|full game)/i },
];

let apiOK = !!KEY;
async function api(path) {
  if (!apiOK) return null;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`, { headers: { referer: REFERER } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('API', r.status, j.error?.message || ''); apiOK = false; return null; }
  return j;
}

// a channel's playlists for this season, by name (API only)
const plCache = new Map();
async function seasonPlaylists(ch) {
  if (plCache.has(ch)) return plCache.get(ch);
  const out = [];
  let page = '';
  for (let n = 0; n < 4 && apiOK; n++) {
    const j = await api(`playlists?part=snippet&channelId=${ch}&maxResults=50${page ? `&pageToken=${page}` : ''}`); if (!j) break;
    for (const p of j.items || []) out.push({ id: p.id, title: p.snippet?.title || '' });
    page = j.nextPageToken; if (!page) break;
  }
  plCache.set(ch, out);
  return out;
}

async function videos(s) {
  let pl = s.pl;
  if (apiOK) {
    const pls = await seasonPlaylists(s.ch);
    const hit = pls.find(p => s.find.test(p.title) && (s.lg === 'nba' ? p.title.includes(SEASON) : p.title.includes(SEASON)));
    if (hit) pl = hit.id;
  }
  if (!pl) return [];
  const out = [];
  if (apiOK) {
    let page = '';
    for (let n = 0; n < 2; n++) {
      const j = await api(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${pl}${page ? `&pageToken=${page}` : ''}`); if (!j) break;
      for (const it of j.items || []) out.push({ id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId, title: it.snippet?.title || '', at: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt });
      page = j.nextPageToken; if (!page) break;
    }
    if (out.length) return out;
  }
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${pl}`, { headers: UA });
  const t = r.ok ? await r.text() : '';
  for (const m of t.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) out.push({ id: m[1].match(/<yt:videoId>([^<]+)/)?.[1], title: dec(m[1].match(/<title>([^<]+)/)?.[1] || ''), at: m[1].match(/<published>([^<]+)/)?.[1] });
  console.log(`  feed ${s.src} ${pl}: ${r.status}, ${out.length} videos`);
  return out;
}

/* ---------- NBA: "LAKERS at PISTONS | FULL GAME HIGHLIGHTS | November 8, 2026" ---------- */
function nbaVideo(v, games) {
  if (!/full game highlights/i.test(v.title)) return false;
  const ext = /^\s*extended\s*:/i.test(v.title);
  const t = v.title.replace(/^\s*extended\s*:\s*/i, '').match(/([A-Z0-9 .'&]+?)\s+(?:at|vs\.?|@)\s+([A-Z0-9 .'&]+?)\s*\|/i);
  const d = v.title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!t || !d) { console.log('  skip (no match):', v.title); return false; }
  const ymd = `${d[3]}${String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, '0')}${d[2].padStart(2, '0')}`;
  const key = `${ymd}|${nick(t[1])}|${nick(t[2])}`;
  const g = games[key] || {};
  const isNew = !g.id && !ext || ext && !g.ext;
  if (ext) games[key] = { ...g, ext: v.id, extTitle: v.title, lg: 'nba', at: g.at || v.at };
  else games[key] = { ...g, id: v.id, title: v.title, at: v.at, lg: 'nba' };
  return isNew;
}

/* ---------- women's college: "No. 10 Iowa vs. No. 2 UConn Highlights | 2026-27 BIG EAST Women's Basketball" ---------- */
const KIND = t => /full game replay|full game/i.test(t) ? 'full' : /condensed/i.test(t) ? 'cond' : /extended/i.test(t) ? 'ext' : /highlights/i.test(t) ? 'hl' : '';
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function names(title) {
  let t = title.split(/\s+\|\s+/)[0];
  t = t.replace(/\s*(full game replay|full game|condensed game|condensed|extended highlights|game highlights|highlights)\s*$/i, '');
  const parts = t.split(/\s+(?:vs\.?|at|@)\s+/i);
  if (parts.length !== 2) return null;
  return parts.map(p => p.replace(/^\s*(#\s*\d+|no\.?\s*\d+)\s+/i, '').trim());
}
// how well a name from a video title fits an ESPN team (0 = not at all)
function fit(name, team) {
  const n = norm(name); if (!n) return 0;
  const alts = new Set([n, n.replace(/\bst\b/g, 'state'), n.replace(/^st\b/, 'saint'), n.replace(/\bsaint\b/g, 'st')]);
  const vs = [team.location, team.shortDisplayName, team.abbreviation, team.displayName, `${team.location} ${team.name}`].map(norm).filter(Boolean);
  // initials: "UT Rio Grande Valley" → utrgv, "Long Island University" → liu
  const ini = String(team.location || '').split(/[\s-]+/).filter(Boolean).map(w => /^[A-Z&]{2,3}$/.test(w) ? w : w[0]).join('').toLowerCase().replace(/[^a-z]/g, '');
  let best = ini.length >= 3 && n.replace(/ /g, '') === ini ? 2 : 0;
  for (const a of alts) for (const v of vs) {
    if (a === v) best = Math.max(best, 3);
    else if (a.length >= 4 && (v.startsWith(a + ' ') || a.startsWith(v + ' '))) best = Math.max(best, 1);
  }
  return best;
}
const etYmd = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const sbCache = new Map();
async function wGames(ymd) {
  if (!sbCache.has(ymd)) sbCache.set(ymd, fetch(`${ESPN_W}/scoreboard?dates=${ymd}&groups=50&limit=500`).then(r => r.json()).then(j => (j.events || []).map(e => ({ id: e.id, ymd, state: e.status?.type?.state, teams: (e.competitions?.[0]?.competitors || []).map(c => c.team || {}) }))).catch(() => []));
  return sbCache.get(ymd);
}
async function ncaawVideo(v, out, src, misses, plKind = '') {
  const kind = KIND(v.title) || plKind; const nm = names(v.title);
  if (!kind || !nm || !v.at) { misses.push(`(no teams) ${v.title}`); return false; }
  const pub = new Date(v.at);
  let best = null, tie = false;
  for (let back = 0; back <= 4; back++) {
    const day = etYmd(pub.getTime() - back * 864e5);
    for (const g of await wGames(day)) {
      if (g.state === 'pre' || g.teams.length !== 2) continue;
      const a = Math.min(fit(nm[0], g.teams[0]), fit(nm[1], g.teams[1])), b = Math.min(fit(nm[0], g.teams[1]), fit(nm[1], g.teams[0]));
      const s = Math.max(a, b); if (!s) continue;
      const score = s * 10 - back; // closer to the upload wins ties
      if (!best || score > best.score) { best = { g, score }; tie = false; } else if (score === best.score && g.id !== best.g.id) tie = true;
    }
    if (best && best.score >= 30 - back) break;
  }
  if (!best || tie) { misses.push(`${tie ? '(two games fit) ' : ''}${v.title}`); return false; }
  const e = out[best.g.id] = out[best.g.id] || { d: best.g.ymd };
  const isNew = !e[kind];
  e[kind] = { id: v.id, title: v.title, src, at: v.at };
  return isNew;
}

export { names, fit, ncaawVideo, nbaVideo, KIND };
if (!process.env.YT_TEST) await main();
async function main() {
  let prev = { games: {}, ncaaw: {} };
  try { const r = await fetch(`${PREV}?t=${Date.now()}`); if (r.ok) prev = await r.json(); } catch (e) {}
  const games = { ...(prev.games || {}) }, ncaaw = { ...(prev.ncaaw || {}) };
  const stats = {};
  const misses = [];
  for (const s of SOURCES) {
    const vids = await videos(s);
    const k = `${s.lg} ${s.src}`; stats[k] = stats[k] || { seen: 0, added: 0 };
    for (const v of vids) {
      if (!v.id) continue;
      stats[k].seen++;
      if (s.lg === 'nba' ? nbaVideo(v, games) : await ncaawVideo(v, ncaaw, s.src, misses, s.kind)) stats[k].added++;
    }
  }
  // keep 60 days
  const cut = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  for (const k of Object.keys(games)) if (k.slice(0, 8) < cut) delete games[k];
  for (const k of Object.keys(ncaaw)) if ((ncaaw[k].d || '') < cut) delete ncaaw[k];
  console.log(`source: ${apiOK ? 'YouTube API' : 'public feeds'} · season ${SEASON}`);
  for (const [k, v] of Object.entries(stats)) console.log(`${k}: ${v.seen} videos, ${v.added} new`);
  if (misses.length) console.log(`not matched (${misses.length}):\n  ` + [...new Set(misses)].slice(0, 40).join('\n  '));
  console.log(`total: NBA ${Object.keys(games).length} games, women's college ${Object.keys(ncaaw).length} games`);
  writeFileSync(process.argv[2] || 'highlights.json', JSON.stringify({ updated: new Date().toISOString(), api: apiOK, games, ncaaw }));
}
