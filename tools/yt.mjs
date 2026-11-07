// Full game highlights for Replay: the NBA's YouTube channel posts a "FULL GAME HIGHLIGHTS" video for every game.
// YouTube's public channel feed (no API key) lists the latest uploads; this runs every 30 minutes on GitHub,
// matches those videos to games (date + both team names from the title) and keeps a rolling 60-day list.
// Output: highlights.json { updated, games: { "YYYYMMDD|away|home": { id, title, at } } } on the yt-data branch.
import { writeFileSync } from 'node:fs';
const CHANNELS = { nba: 'UCWJ2lWNubArHWmf3FIHbfcQ' };
const PREV = 'https://raw.githubusercontent.com/larosa023/fullcourt/yt-data/highlights.json';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const nick = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

let prev = { games: {} };
try { const r = await fetch(`${PREV}?t=${Date.now()}`); if (r.ok) prev = await r.json(); } catch (e) {}
const games = { ...(prev.games || {}) };
let found = 0, seen = 0;
for (const [lg, ch] of Object.entries(CHANNELS)) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; fullcourt-highlights/1.0; +https://github.com/larosa023/fullcourt)', 'accept-language': 'en-US,en;q=0.9' } });
  const xml = await res.text();
  console.log(lg, 'feed', res.status, xml.length, (xml.match(/<title>([^<]+)/g) || []).slice(0, 4).join(' / '));
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    seen++;
    const e = m[1], id = e.match(/<yt:videoId>([^<]+)/)?.[1], title = dec(e.match(/<title>([^<]+)/)?.[1] || ''), at = e.match(/<published>([^<]+)/)?.[1];
    if (!id || !/full game highlights/i.test(title)) continue;
    // e.g. "TRAIL BLAZERS at LAKERS | FULL GAME HIGHLIGHTS | November 6, 2026" (sometimes with "Emirates NBA Cup" in it)
    const t = title.match(/([A-Z0-9 .'&]+?)\s+(?:at|vs\.?|@)\s+([A-Z0-9 .'&]+?)\s*\|/i);
    const d = title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
    if (!t || !d) { console.log('skip (no match):', title); continue; }
    const ymd = `${d[3]}${String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, '0')}${d[2].padStart(2, '0')}`;
    const key = `${ymd}|${nick(t[1])}|${nick(t[2])}`;
    if (!games[key]) found++;
    games[key] = { id, title, at, lg };
  }
}
// keep 60 days
const cut = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
for (const k of Object.keys(games)) if (k.slice(0, 8) < cut) delete games[k];
console.log(`feed entries ${seen}, new full-game videos ${found}, total ${Object.keys(games).length}`);
writeFileSync(process.argv[2] || 'highlights.json', JSON.stringify({ updated: new Date().toISOString(), games }));
