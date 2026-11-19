// Builds the data behind "Similar players" and the career timeline on player pages, from the era data (every player's
// season since 1946-47, from Basketball-Reference, built by tools/eras.mjs) plus ESPN ids so photos and links work.
// No Basketball-Reference pages are read here. Runs weekly on GitHub (.github/workflows/careers.yml) and publishes to
// the careers-data branch:
//   vec.json        one row per player-season with enough minutes: how he played that year as numbers measured
//                   against that season's league (so a 1965 season and a 2020 one can be compared), for the
//                   similarity search; plus every player's name, ESPN id and seasons
//   p/<a-z>.json    every player's seasons line by line (team or teams, per-game numbers, shooting, advanced numbers,
//                   awards, titles, playoffs), split by the first letter of the Basketball-Reference id
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; fullcourt-careers/1.0; weekly; +https://github.com/larosa023/fullcourt)';
const RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const OUT = process.argv[2] || 'pub';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA } }); if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (a === 2) throw e; await sleep(4000 * (a + 1)); }
  }
}
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

const idx = await get(`${RAW}/era-data/index.json`);
if (!idx?.players?.length) throw new Error('era index missing');
const IC = Object.fromEntries(idx.cols.map((k, i) => [k, i]));
const first = idx.first, last = idx.last;

// ---- ESPN ids: the era data's own, the History, nickname and draft data, then the game logs by name and seasons ----
const espn = {};
for (const p of idx.players) if (p[IC.espn]) espn[p[IC.id]] = String(p[IC.espn]);
{
  const [hn, nk, dh, gl] = await Promise.all([
    get(`${RAW}/hist-data/history.json`).catch(() => null), get(`${RAW}/nick-data/nicknames.json`).catch(() => null),
    get(`${RAW}/drafthist-data/draft-history.json`).catch(() => null), get(`${RAW}/gamelog-data/players.json`).catch(() => null)]);
  for (const [id, e] of Object.entries(hn?.espn || {})) if (e && !espn[id]) espn[id] = String(e);
  for (const [id, L] of Object.entries(hn?.legends || {})) if (L?.espn && !espn[id]) espn[id] = String(L.espn);
  for (const [id, p] of Object.entries(nk?.players || {})) if (p?.espn && !espn[id]) espn[id] = String(p.espn);
  for (const ps of Object.values(dh?.years || {})) for (const p of ps) if (p.br && p.pid && !espn[p.br]) espn[p.br] = String(p.pid);
  // the game logs (2000-01 on) carry ESPN's id for everyone who played: same name, overlapping seasons, only one candidate
  if (gl?.players?.length) {
    const byName = new Map(); for (const [id, n, y0, y1] of gl.players) { const k = fold(n); (byName.get(k) || byName.set(k, []).get(k)).push({ id: String(id), y0, y1 }); }
    for (const p of idx.players) {
      const br = p[IC.id]; if (espn[br] || p[IC.y1] < 2001) continue;
      const c = (byName.get(fold(p[IC.name])) || []).filter(x => x.y0 <= p[IC.y1] + 1 && x.y1 >= p[IC.y0] - 1);
      if (c.length === 1) espn[br] = c[0].id;
    }
  }
  console.log('ESPN ids', Object.keys(espn).length);
}
// still none, and played since 1990: ESPN's general search, NBA results with the same name only
{
  const left = idx.players.filter(p => !espn[p[IC.id]] && p[IC.y1] >= 1990 && !process.env.NO_SEARCH);
  let hits = 0;
  for (const p of left) {
    const r = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(p[IC.name])}&limit=5`).catch(() => null);
    const cs = (r?.results || []).flatMap(b => b.contents || []).filter(c => fold(c.displayName) === fold(p[IC.name]) && /~l:46~a:\d+/.test(c.uid || ''));
    if (cs.length === 1) { espn[p[IC.id]] = cs[0].uid.match(/~a:(\d+)/)[1]; hits++; }
    await sleep(220);
  }
  console.log('search found', hits, 'of', left.length);
}

// ---- every season ----
// how he played, each number as standard deviations from that season's qualified players (weights live in the page)
const FEAT = ['pts', 'trb', 'ast', 'stl36', 'blk36', 'tov36', 'ts', 'tpar', 'ftr', 'usg', 'bpm', 'ws48', 'mp'];
const POS = { PG: 1, G: 1.5, SG: 2, GF: 2.5, SF: 3, F: 3.5, PF: 4, FC: 4.5, C: 5 };
const posOf = s => { const t = String(s || '').split(/[-,/ ]/)[0].toUpperCase(); return POS[t] ?? 3; };
const vecRows = [], lines = {}; // lines[id] = seasons
const nameIx = new Map(), names = [];
const ni = id => { if (!nameIx.has(id)) { const p = idx.players.find(x => x[IC.id] === id); nameIx.set(id, names.length); names.push([id, p?.[IC.name] || id, espn[id] || '', p?.[IC.y0] || null, p?.[IC.y1] || null]); } return nameIx.get(id); };
for (const p of idx.players) ni(p[IC.id]);
for (let y = first; y <= last; y++) {
  const S = await get(`${RAW}/era-data/seasons/${y}.json`).catch(() => null); if (!S?.reg) { console.log(y, 'missing'); continue; }
  const ix = Object.fromEntries(S.cols.map((k, i) => [k, i])), v = (r, k) => r[ix[k]];
  // the champion, from the Finals series
  const fin = (S.po || []).find(s => s[0] === 'Finals'), champ = fin ? (fin[3] > fin[4] ? fin[1] : fin[2]) : '';
  const post = new Map((S.post || []).map(r => [r[0], r]));
  const cur = y === idx.cur, minG = cur ? 5 : 20;
  const feats = [];
  for (const r of S.reg) {
    const id = v(r, 'id'), g = v(r, 'g') || 0, mp = v(r, 'mp') || 0, pr = post.get(id);
    const per36 = k => mp > 0 && v(r, k) != null ? v(r, k) / mp * 36 : null;
    const fga = v(r, 'fga'), tpa = v(r, 'tpa'), fta = v(r, 'fta');
    (lines[id] ||= []).push([y, v(r, 'age'), v(r, 'tm'), v(r, 'pos'), g, v(r, 'gs'), mp, v(r, 'pts'), v(r, 'trb'), v(r, 'ast'), v(r, 'stl'), v(r, 'blk'), v(r, 'tov'),
      v(r, 'fgp'), v(r, 'tpp'), v(r, 'ftp'), v(r, 'ts'), v(r, 'per'), v(r, 'ws'), v(r, 'bpm'), v(r, 'aw') || '',
      pr && champ && String(pr[ix.tm] || '').split('/').includes(champ) ? 1 : 0,
      pr ? [pr[ix.g], pr[ix.pts], pr[ix.trb], pr[ix.ast]] : null]);
    if (g < minG || mp < 12) continue;
    feats.push({ id, r, f: { pts: v(r, 'pts'), trb: v(r, 'trb'), ast: v(r, 'ast'), stl36: per36('stl'), blk36: per36('blk'), tov36: per36('tov'), ts: v(r, 'ts'),
      tpar: fga > 0 && tpa != null && y >= 1980 ? tpa / fga : null, ftr: fga > 0 && fta != null ? fta / fga : null, usg: v(r, 'usg'), bpm: v(r, 'bpm'), ws48: v(r, 'ws48'), mp } });
  }
  // this season's average and spread for each number, then each player's distance from it
  const st = {}; for (const k of FEAT) { const xs = feats.map(x => x.f[k]).filter(x => x != null && Number.isFinite(x)); if (xs.length < 20) { st[k] = null; continue; } const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1; st[k] = [m, sd]; }
  for (const { id, r, f } of feats) {
    const z = FEAT.map(k => st[k] && f[k] != null && Number.isFinite(f[k]) ? Math.max(-60, Math.min(60, Math.round((f[k] - st[k][0]) / st[k][1] * 10))) : null);
    vecRows.push([ni(id), y, v(r, 'age'), posOf(v(r, 'pos')), v(r, 'tm'), ...z]);
  }
  console.log(y, S.reg.length, 'seasons,', feats.length, 'compared');
}
mkdirSync(`${OUT}/p`, { recursive: true });
const updated = new Date().toISOString();
writeFileSync(`${OUT}/vec.json`, JSON.stringify({ updated, first, last, cur: idx.cur, ncols: ['id', 'name', 'espn', 'y0', 'y1'], names, cols: ['player', 'year', 'age', 'position', 'team', ...FEAT], scale: 10, rows: vecRows }));
const LC = ['year', 'age', 'team', 'pos', 'g', 'gs', 'mp', 'pts', 'trb', 'ast', 'stl', 'blk', 'tov', 'fgp', 'tpp', 'ftp', 'ts', 'per', 'ws', 'bpm', 'awards', 'champion', 'playoffs g/pts/trb/ast'];
const byL = {}; for (const [id, L] of Object.entries(lines)) (byL[id[0]] ||= {})[id] = L;
for (const [l, ps] of Object.entries(byL)) writeFileSync(`${OUT}/p/${l}.json`, JSON.stringify({ updated, cols: LC, players: ps }));
console.log('wrote', vecRows.length, 'compared seasons,', Object.keys(lines).length, 'players');
