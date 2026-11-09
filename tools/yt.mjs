// Full game highlights for Replay, matched to games from YouTube playlists.
//   NBA: the NBA channel's "Nightly Full Game Highlights" playlist (titles carry both teams and the date).
//   Women's college: the conferences' own women's basketball playlists (full game replays, condensed games, extended
//   highlights, highlights). Their titles name both teams but no date, so each video is matched to ESPN's women's
//   games from the few days before it went up.
// Reads the YouTube Data API when the YT_KEY secret works (and finds each season's new playlists by name); otherwise
// YouTube's public playlist feeds (the latest 15 videos each), which YouTube sometimes breaks.
// Output: highlights.json { updated, games: { "YYYYMMDD|away|home": NBA video }, wnba: { eventId: { fgh: video } }, ncaaw / ncaam: { eventId: { full|cond|ext|hl: video } } }
import { writeFileSync } from 'node:fs';
const PREV = 'https://raw.githubusercontent.com/larosa023/fullcourt/yt-data/highlights.json';
const KEY = process.env.YT_KEY || '';
// the key only accepts calls from the site's address
const REFERER = 'https://nbafullcourty.netlify.app/';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; fullcourt-highlights/1.0; +https://github.com/larosa023/fullcourt)', 'accept-language': 'en-US,en;q=0.9' };
const ESPN_C = lg => `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg === 'wnba' ? 'wnba' : lg === 'ncaam' ? 'mens-college-basketball' : 'womens-college-basketball'}`;
const MEN = /(?<!wo)men.s basketball/i, WOMEN = /women.s basketball/i; // "women's basketball" contains "men's basketball"
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const nick = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// season label like "2026-27" (a season starts in the fall)
const now = new Date();
const sy = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const SEASON = `${sy}-${String((sy + 1) % 100).padStart(2, '0')}`;
// the WNBA's season is one calendar year (May to October); its playlists are named "2026 …"
const WYEAR = String(now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

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
  // WNBA: "Las Vegas Aces vs. Phoenix Mercury | FULL GAME HIGHLIGHTS | September 24, 2026" (regular season, playoffs, Finals)
  { lg: 'wnba', src: 'WNBA', ch: 'UCO9a_ryN_l7DIDS-VIt-zmw', pl: 'PLSPy3Xok-53RkJ8DpqGA6FQSOIY5HepSB', find: /^\d{4} (wnba )?(season|full game) highlights$/i },
  { lg: 'wnba', src: 'WNBA', ch: 'UCO9a_ryN_l7DIDS-VIt-zmw', pl: 'PLIHqPSYoErfw', find: /^\d{4} wnba playoffs(?!.*(press|player))/i },
  { lg: 'wnba', src: 'WNBA', ch: 'UCO9a_ryN_l7DIDS-VIt-zmw', pl: 'PLD2CSiF5zblA', find: /^\d{4} wnba finals(?!.*(press|player))/i },
  // women's college beyond the conference playlists: channels whose latest uploads are read and picked out by title
  { lg: 'ncaaw', src: 'Big Ten', ch: 'UCpPY0eWJiNWxth5b2vz5Rwg', uploads: true, need: /\| (extended )?highlights \| big ten women/i },
  { lg: 'ncaaw', src: 'FOX', ch: 'UCBsHu3el3JpEzy85g5_s0iQ', uploads: true, need: /highlights \| women.s college basketball/i },
  { lg: 'ncaaw', src: 'American', ch: 'UCL0lloeftexqjO8DXVMkOkA', uploads: true, need: /^wbb game highlights/i },
  { lg: 'ncaaw', src: 'Sun Belt', ch: 'UCwRkms-Zb61HtMDIjmKofmw', uploads: true, need: /highlights \|.*women.s basketball/i },
  // ESPN posts men's and women's games alike: matched against both schedules, skipped when it could be either
  { lg: 'college', src: 'ESPN', ch: 'UCiWLfSweyRNmLpgEHekhoAg', uploads: true, need: /\| (full game highlights|full highlights?|highlights) \| espn (college basketball|cbb)/i },
  // official school channels for SEC and other teams the conference channels miss; their titles only name the opponent
  ...[['LSU', 'UCmAewehDFJLJXzsLXrYA6aQ', '99'], ['Florida', 'UC97IlakvONh8RBUODRuk4mA', '57'], ['Mississippi State', 'UCeDDInREzm0nJNnCNFSmVwA', '344'], ['Ole Miss', 'UCp47rvbbB-HzCH96MU6yplQ', '145'],
    ['Oklahoma', 'UC-CQSza3tFofjQJpKoJuvOA', '201'], ['Alabama', 'UCUQis-AjFEA1AgRbnTbuBqA', '333'], ['Kentucky', 'UCA0m2HDyoTvx2vXoYSdsJsA', '96'], ['UConn', 'UCCpTipFQZJNTTpIFx-j-aSg', '41']]
    .map(([src, ch, school]) => ({ lg: 'ncaaw', src, ch, school, uploads: true, kind: 'hl', need: /(?=.*(women|wbb|w\. basketball))(?=.*(highlight|condensed|full game|\d+,\s.*\d+\s*$))/i })),
  // men's college: the same channels' men's playlists
  { lg: 'ncaam', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: 'PLPGY7v2Rzaao', kind: 'full', find: /(?<!wo)men.s basketball full game replay/i },
  { lg: 'ncaam', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: '', kind: 'cond', find: /(?<!wo)men.s basketball condensed games?/i },
  { lg: 'ncaam', src: 'ACC', ch: 'UC0hy7TcR1gGD8nQBqrF2FaA', pl: 'PLHObPASiOemY', kind: 'hl', find: /(?<!wo)men.s basketball game highlights/i },
  { lg: 'ncaam', src: 'Big 12', ch: 'UCLnfOCTbfqMy_3ah8OmTHEQ', pl: 'PLDM7iB7plWs0', kind: 'ext', find: /(?<!wo)men.s basketball extended highlights/i },
  { lg: 'ncaam', src: 'Big 12', ch: 'UCLnfOCTbfqMy_3ah8OmTHEQ', pl: 'PLEEb-V9VcW4Q', kind: 'hl', find: /big 12 men.s basketball highlights/i },
  { lg: 'ncaam', src: 'Big East', ch: 'UCAcXdiimhsuivSn2PxtsRFw', pl: 'PLP_mXYOqM4h8', kind: 'hl', find: /big east men.s basketball highlights/i },
  { lg: 'ncaam', src: 'Big Ten', ch: 'UC4LeRw7pIZ_kseS4Krn_DQA', pl: '', find: /(?<!wo)men.s basketball.*highlights|highlights.*(?<!wo)men.s basketball/i },
  { lg: 'ncaam', src: 'SEC', ch: 'UC60q_WUDde_NK-ze3frvtiA', pl: '', find: /(?<!wo)men.s basketball.*(game highlights|condensed|full game)/i },
];

let apiOK = !!KEY;
async function api(path) {
  if (!apiOK) return null;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`, { headers: { referer: REFERER } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('API', r.status, j.error?.message || '', '→ the YT_KEY key needs the YouTube Data API v3 allowed, and no website restriction (it runs on GitHub, not on a site)'); apiOK = false; return null; }
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
  if (s.uploads) return (await uploads(s.ch, s.src)).filter(v => s.need.test(v.title));
  let pl = s.pl;
  if (apiOK) {
    const pls = await seasonPlaylists(s.ch);
    const hit = pls.find(p => s.find.test(p.title) && (s.lg === 'wnba' ? p.title.startsWith(WYEAR) : p.title.includes(SEASON)));
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
  out.push(...await feed(`playlist_id=${pl}`, `${s.src} playlist ${pl}`));
  if (out.length) return out;
  // the playlist feed doesn't work for every playlist, so fall back on the channel's latest uploads, picked out by title
  // (the conferences put "Women's Basketball" or "Men's Basketball" in every video title)
  const up = await uploads(s.ch, s.src);
  return up.filter(v => s.lg === 'nba' || s.lg === 'wnba' ? /full game highlights/i.test(v.title) : (s.lg === 'ncaam' ? MEN.test(v.title) && !WOMEN.test(v.title) : WOMEN.test(v.title)) && !!KIND(v.title));
}
async function feed(q, label) {
  const out = [];
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?${q}`, { headers: UA });
    const t = r.ok ? await r.text() : '';
    for (const m of t.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) out.push({ id: m[1].match(/<yt:videoId>([^<]+)/)?.[1], title: dec(m[1].match(/<title>([^<]+)/)?.[1] || ''), at: m[1].match(/<published>([^<]+)/)?.[1] });
    console.log(`  feed ${label}: ${r.status}, ${out.length} videos`);
  } catch (e) { console.log(`  feed ${label}: ${e.message}`); }
  return out;
}
const upCache = new Map();
function uploads(ch, src) {
  if (!upCache.has(ch)) upCache.set(ch, (async () => {
    if (apiOK) {
      const j = await api(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=UU${ch.slice(2)}`);
      if (j?.items) return j.items.map(it => ({ id: it.contentDetails?.videoId, title: it.snippet?.title || '', at: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt }));
    }
    const v = await feed(`playlist_id=UU${ch.slice(2)}`, `${src} uploads`);
    return v.length ? v : feed(`channel_id=${ch}`, `${src} channel`);
  })());
  return upCache.get(ch);
}
// video lengths in seconds (API only): shorts are skipped and long "highlights" count as extended
const durCache = new Map();
async function durations(ids) {
  const need = [...new Set(ids)].filter(id => id && !durCache.has(id));
  for (let i = 0; apiOK && i < need.length; i += 50) {
    const j = await api(`videos?part=contentDetails&id=${need.slice(i, i + 50).join(',')}`);
    for (const it of j?.items || []) { const m = String(it.contentDetails?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); durCache.set(it.id, m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0); }
  }
  return durCache;
}

/* ---------- NBA: "LAKERS at PISTONS | FULL GAME HIGHLIGHTS | November 8, 2026" ---------- */
function nbaVideo(v, games) {
  if (!/full game highlights/i.test(v.title)) return false;
  const ext = /^\s*extended\s*:/i.test(v.title);
  const t = v.title.replace(/^\s*extended\s*:\s*/i, '').match(/([A-Z0-9 .'&]+?)\s+(?:at|vs\.?|@)\s+([A-Z0-9 .'&]+?)\s*\|/i);
  const d = v.title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})[,.]\s*(\d{4})/i);
  if (!t || !d) { console.log('  skip (no match):', v.title); return false; }
  const ymd = `${d[3]}${String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, '0')}${d[2].padStart(2, '0')}`;
  const key = `${ymd}|${nick(t[1])}|${nick(t[2])}`;
  const g = games[key] || {};
  const isNew = !g.id && !ext || ext && !g.ext;
  if (ext) games[key] = { ...g, ext: v.id, extTitle: v.title, lg: 'nba', at: g.at || v.at };
  else games[key] = { ...g, id: v.id, title: v.title, at: v.at, lg: 'nba' };
  return isNew;
}

/* ---------- WNBA: full team names and the game's date are in the title; matched to that day's ESPN games ---------- */
async function wnbaVideo(v, out, misses) {
  if (!/full game highlights/i.test(v.title)) return false;
  const nm = names(v.title.split(/\s+\|\s+/)[0]);
  const d = v.title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})[,.]\s*(\d{4})/i);
  if (!nm || !d) { misses.push(v.title); return false; }
  const ymd = `${d[3]}${String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, '0')}${d[2].padStart(2, '0')}`;
  for (const day of [ymd, etYmd(Date.parse(`${d[3]}-${ymd.slice(4, 6)}-${ymd.slice(6)}T12:00:00Z`) + 864e5)]) {
    const hit = (await wGames(day, 'wnba')).find(g => g.teams.length === 2 && Math.min(fit(nm[0], g.teams[0]), fit(nm[1], g.teams[1])) + Math.min(fit(nm[0], g.teams[1]), fit(nm[1], g.teams[0])) > 0);
    if (hit) { const e = out[hit.id] = out[hit.id] || { d: hit.ymd }; const isNew = !e.fgh; e.fgh = { id: v.id, title: v.title, src: 'WNBA', at: v.at }; return isNew; }
  }
  misses.push(v.title); return false;
}

/* ---------- women's college: "No. 10 Iowa vs. No. 2 UConn Highlights | 2026-27 BIG EAST Women's Basketball" ---------- */
const KIND = t => /full game replay|\bfull game\b(?!\s*highlight)/i.test(t) ? 'full' : /condensed/i.test(t) ? 'cond' : /extended|full (game )?highlights?/i.test(t) ? 'ext' : /highlights?/i.test(t) ? 'hl' : '';
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function names(title) {
  let t = title.split(/\s+\|\s+/)[0].replace(/^.*[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?\s*/u, '').replace(/^[^:|]*highlights?\s*:\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '');
  t = t.replace(/\s*(full game replay|full game|condensed game|condensed|extended highlights|game highlights|highlights)\s*$/i, '');
  const parts = t.split(/\s+(?:vs\.?|at|@)\s+/i);
  if (parts.length !== 2) return null;
  return parts.map(p => p.replace(/^\s*(#\s*\d+|no\.?\s*\d+)\s+/i, '').trim());
}
// how well a name from a video title fits an ESPN team (0 = not at all)
// names the conferences use that ESPN writes differently
const ALIAS = { 'usc upstate': 'south carolina upstate' };
function fit(name, team) {
  const n0 = norm(name); if (!n0) return 0;
  const n = ALIAS[n0] || n0;
  const dir = { e: 'eastern', w: 'western', n: 'northern', s: 'southern', c: 'central', se: 'southeastern', sw: 'southwestern', ne: 'northeastern', nw: 'northwestern' };
  // state abbreviations the conferences use: "Southern Ill.", "Central Conn. St."
  const ST = { ill: 'illinois', conn: 'connecticut', ky: 'kentucky', tenn: 'tennessee', miss: 'mississippi', mich: 'michigan', wash: 'washington', fla: 'florida', ala: 'alabama', ark: 'arkansas', ind: 'indiana', minn: 'minnesota', wis: 'wisconsin', mo: 'missouri', okla: 'oklahoma', neb: 'nebraska', colo: 'colorado', ariz: 'arizona', ore: 'oregon', ga: 'georgia', tex: 'texas', va: 'virginia' };
  const n2 = n.replace(/^(se|sw|ne|nw|e|w|n|s|c) /, (m, d) => dir[d] + ' ').replace(/\b(ill|conn|ky|tenn|miss|mich|wash|fla|ala|ark|ind|minn|wis|mo|okla|neb|colo|ariz|ore|ga|tex|va)\b/g, w => ST[w]);
  const alts = new Set([n, n2, n.replace(/\bst\b/g, 'state'), n2.replace(/\bst\b/g, 'state'), n.replace(/^st\b/, 'saint'), n.replace(/\bsaint\b/g, 'st')]);
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
async function wGames(ymd, lg = 'ncaaw') {
  const ck = `${lg}${ymd}`;
  if (!sbCache.has(ck)) sbCache.set(ck, fetch(`${ESPN_C(lg)}/scoreboard?dates=${ymd}${lg === 'wnba' ? '' : '&groups=50&limit=500'}`).then(r => r.json()).then(j => (j.events || []).map(e => ({ id: e.id, ymd, state: e.status?.type?.state, teams: (e.competitions?.[0]?.competitors || []).map(c => c.team || {}) }))).catch(() => []));
  return sbCache.get(ck);
}
// the ESPN game a college video is of: both teams named, played in the few days before it went up
async function collegeGame(v, nm, lg) {
  const pub = new Date(v.at);
  let best = null, tie = false;
  for (let back = 0; back <= 4; back++) {
    const day = etYmd(pub.getTime() - back * 864e5);
    for (const g of await wGames(day, lg)) {
      if (g.state === 'pre' || g.teams.length !== 2) continue;
      const a = Math.min(fit(nm[0], g.teams[0]), fit(nm[1], g.teams[1])), b = Math.min(fit(nm[0], g.teams[1]), fit(nm[1], g.teams[0]));
      const sc = Math.max(a, b); if (!sc) continue;
      const score = sc * 10 - back; // closer to the upload wins ties
      if (!best || score > best.score) { best = { g, score }; tie = false; } else if (score === best.score && g.id !== best.g.id) tie = true;
    }
    if (best && best.score >= 30 - back) break;
  }
  return tie ? 'tie' : best?.g || null;
}
// a school channel's video ("HIGHLIGHTS: Women's Basketball vs. North Alabama"): that school's latest game before it went up,
// preferring one whose opponent the title names
const mentions = (title, team) => { const t = ` ${norm(title)} `; return [team.location, team.shortDisplayName, team.displayName, (team.abbreviation || '').length >= 3 ? team.abbreviation : ''].filter(Boolean).some(x => t.includes(` ${norm(x)} `)); };
async function schoolGame(v, school, lg) {
  const pub = new Date(v.at);
  const found = [];
  for (let back = 0; back <= 3; back++) for (const g of await wGames(etYmd(pub.getTime() - back * 864e5), lg)) {
    if (g.state !== 'post' || !g.teams.some(t => String(t.id) === String(school))) continue;
    const opp = g.teams.find(t => String(t.id) !== String(school));
    found.push({ g, named: opp && mentions(v.title, opp) });
  }
  const named = found.filter(x => x.named);
  return named.length === 1 ? named[0].g : !named.length && found.length === 1 ? found[0].g : null;
}
function store(out, g, kind, v, src) {
  const e = out[g.id] = out[g.id] || { d: g.ymd };
  if (e[kind]) return false; // the first source wins (conference channels are listed before school channels)
  e[kind] = { id: v.id, title: v.title, src, at: v.at };
  return true;
}
// kind from the title, then the video's length when known (a 13-minute "Highlights" is an extended cut)
function kindOf(v, plKind) {
  let k = KIND(v.title) || plKind;
  const d = durCache.get(v.id);
  if (d) { if (k === 'hl' && d >= 420) k = 'ext'; if ((k === 'hl' || k === 'ext') && d >= 2400) k = 'full'; }
  return k;
}
async function ncaawVideo(v, out, src, misses, plKind = '', lg = 'ncaaw', s = {}) {
  if (!v.at) return false;
  const d = durCache.get(v.id); if (s.uploads && d != null && d > 0 && d < 60) return false; // shorts
  const kind = kindOf(v, plKind);
  if (!kind) { misses.push(`(no kind) ${v.title}`); return false; }
  if (s.school) {
    const g = await schoolGame(v, s.school, lg);
    if (!g) { misses.push(`(school game not found) ${src}: ${v.title}`); return false; }
    return store(out, g, kind, v, src);
  }
  const nm = names(v.title);
  if (!nm) { misses.push(`(no teams) ${v.title}`); return false; }
  const g = await collegeGame(v, nm, lg);
  if (!g || g === 'tie') { misses.push(`${g === 'tie' ? '(two games fit) ' : ''}${v.title}`); return false; }
  return store(out, g, kind, v, src);
}
// ESPN: men's or women's? whichever schedule has the game; neither if both do (unless the title says)
async function eitherVideo(v, col, src, misses) {
  const nm = names(v.title); if (!nm || !v.at) { misses.push(`(no teams) ${v.title}`); return false; }
  const w = await collegeGame(v, nm, 'ncaaw'), m = await collegeGame(v, nm, 'ncaam');
  const W = w && w !== 'tie' ? w : null, M = m && m !== 'tie' ? m : null;
  const pick = WOMEN.test(v.title) ? (W && ['ncaaw', W]) : MEN.test(v.title) ? (M && ['ncaam', M]) : W && !M ? ['ncaaw', W] : M && !W ? ['ncaam', M] : null;
  if (!pick) { misses.push(`${W && M ? '(men\'s or women\'s?) ' : ''}${v.title}`); return false; }
  return store(col[pick[0]], pick[1], kindOf(v, 'hl'), v, src);
}

export { names, fit, ncaawVideo, nbaVideo, wnbaVideo, eitherVideo, KIND, durCache };
if (!process.env.YT_TEST) await main();
async function main() {
  let prev = { games: {}, ncaaw: {}, ncaam: {}, wnba: {} };
  try { const r = await fetch(`${PREV}?t=${Date.now()}`); if (r.ok) prev = await r.json(); } catch (e) {}
  const games = { ...(prev.games || {}) }, col = { ncaaw: { ...(prev.ncaaw || {}) }, ncaam: { ...(prev.ncaam || {}) }, wnba: { ...(prev.wnba || {}) } };
  const stats = {};
  const misses = [];
  const done = new Set();
  for (const s of SOURCES) {
    const vids = await videos(s);
    if (s.lg !== 'nba' && s.lg !== 'wnba') await durations(vids.filter(v => !done.has(v.id)).map(v => v.id));
    const k = `${s.lg} ${s.src}`; stats[k] = stats[k] || { seen: 0, added: 0 };
    for (const v of vids) {
      if (!v.id || done.has(v.id)) continue; // several sources can share a channel's uploads
      done.add(v.id);
      stats[k].seen++;
      if (s.lg === 'nba' ? nbaVideo(v, games) : s.lg === 'wnba' ? await wnbaVideo(v, col.wnba, misses) : s.lg === 'college' ? await eitherVideo(v, col, s.src, misses) : await ncaawVideo(v, col[s.lg], s.src, misses, s.kind, s.lg, s)) stats[k].added++;
    }
  }
  // keep 60 days
  const cut = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  for (const k of Object.keys(games)) if (k.slice(0, 8) < cut) delete games[k];
  for (const L of Object.values(col)) for (const k of Object.keys(L)) if ((L[k].d || '') < cut) delete L[k];
  console.log(`source: ${apiOK ? 'YouTube API' : 'public feeds'} · season ${SEASON}`);
  for (const [k, v] of Object.entries(stats)) console.log(`${k}: ${v.seen} videos, ${v.added} new`);
  if (misses.length) console.log(`not matched (${misses.length}):\n  ` + [...new Set(misses)].slice(0, 40).join('\n  '));
  console.log(`total: NBA ${Object.keys(games).length} games, WNBA ${Object.keys(col.wnba).length}, women's college ${Object.keys(col.ncaaw).length}, men's college ${Object.keys(col.ncaam).length}`);
  writeFileSync(process.argv[2] || 'highlights.json', JSON.stringify({ updated: new Date().toISOString(), api: apiOK, games, wnba: col.wnba, ncaaw: col.ncaaw, ncaam: col.ncaam }));
}
