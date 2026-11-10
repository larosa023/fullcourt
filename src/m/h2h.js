/* ---------------- team game logs and head-to-head ----------------
   A team's finished games for a season, from ESPN's team schedule (regular season and postseason). Used by the game
   page's Head to head card and by Ask's team questions ("Knicks in back-to-backs", "Knicks without Brunson"). */
const TL = new Map(); // `${teamId}|${season}` → promise of games (newest first), kept 20 minutes
const TL_FRESH = 20 * 60e3;
const tlEt = iso => dfmt('en-CA', { timeZone: 'America/New_York' }, new Date(iso)).replace(/-/g, '');
function tlParse(d, teamId, fallbackSeason) {
  const out = [];
  for (const e of d?.events || []) {
    const c = e.competitions?.[0]; if (!c?.status?.type?.completed) continue;
    if (/pre/i.test(e.seasonType?.name || '') || /all-?star/i.test(e.name || '')) continue;
    const me = c.competitors?.find(x => String(x.team?.id) === String(teamId)), op = c.competitors?.find(x => String(x.team?.id) !== String(teamId));
    if (!me || !op) continue;
    const sc = x => +(x.score?.value ?? x.score?.displayValue ?? x.score) || 0;
    const pf = sc(me), pa = sc(op);
    if (!pf && !pa) continue;
    out.push({
      id: String(e.id), d: e.date, ymd: tlEt(e.date), season: String(e.season?.year || d.season?.year || fallbackSeason || ''),
      type: +e.seasonType?.type === 3 || /post/i.test(e.seasonType?.name || '') ? 'post' : 'reg',
      home: me.homeAway === 'home', neutral: !!c.neutralSite, oid: String(op.team?.id || ''), o: op.team?.abbreviation || '',
      pf, pa, r: pf > pa ? 'W' : 'L', confGame: !!c.conferenceCompetition, note: c.notes?.[0]?.headline || '',
    });
  }
  return out;
}
// the current season's year as ESPN counts it (2027 = 2026-27; the WNBA's is the calendar year)
let tlCur = null;
async function tlSeasonNow(teamId) {
  if (tlCur) return tlCur;
  const d = await getJSON(`${API}/teams/${teamId}/schedule?seasontype=2`);
  tlCur = String(d.requestedSeason?.year || d.season?.year || '');
  TL.set(`${teamId}|${tlCur}|2`, { t: Date.now(), p: Promise.resolve(tlParse(d, teamId, tlCur)) });
  return tlCur;
}
function tlType(teamId, season, type) {
  const k = `${teamId}|${season}|${type}`, m = TL.get(k);
  if (m && Date.now() - m.t < TL_FRESH) return m.p;
  const p = getJSON(`${API}/teams/${teamId}/schedule?season=${season}&seasontype=${type}`).then(d => tlParse(d, teamId, season)).catch(() => { TL.delete(k); return null; }); // null: didn't load (so it isn't remembered as an empty season)
  TL.set(k, { t: Date.now(), p });
  return p;
}
// Finished seasons never change, so each one is kept on this device once it's been downloaded (a compact copy,
// the 40 most recently used team-seasons). Only the current season is fetched again.
const TL_VER = 1, TL_KEEP = 40;
const tlKey = (t, y) => lsKey(`fc-tl${TL_VER}:${t}:${y}`);
function tlTrim() {
  try {
    const ks = Object.keys(localStorage).filter(k => k.includes(`fc-tl${TL_VER}:`));
    if (ks.length <= TL_KEEP) return;
    ks.map(k => { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (e) {} return [k, t]; })
      .sort((a, b) => a[1] - b[1]).slice(0, ks.length - TL_KEEP).forEach(([k]) => localStorage.removeItem(k));
  } catch (e) {}
}
function tlKept(teamId, y) {
  try {
    const c = JSON.parse(lsGet(tlKey(teamId, y)) || 'null'); if (!Array.isArray(c?.g)) return null;
    if (Date.now() - c.t > 864e5) lsSet(tlKey(teamId, y), JSON.stringify({ t: Date.now(), g: c.g })); // still in use: keep it off the trim list
    return c.g.map(([id, d, post, home, neutral, oid, o, pf, pa, conf, note]) => ({ id, d, ymd: tlEt(d), season: String(y), type: post ? 'post' : 'reg', home: !!home, neutral: !!neutral, oid, o, pf, pa, r: pf > pa ? 'W' : 'L', confGame: !!conf, note: note || '' }));
  } catch (e) { return null; }
}
function tlKeep(teamId, y, games) {
  try { localStorage.setItem(tlKey(teamId, y), JSON.stringify({ t: Date.now(), g: games.map(g => [g.id, g.d, +(g.type === 'post'), +g.home, +g.neutral, g.oid, g.o, g.pf, g.pa, +g.confGame, g.note || 0]) })); tlTrim(); } catch (e) {}
}
// one season, regular season and postseason together, newest first
async function tLog(teamId, season) {
  const cur = await tlSeasonNow(teamId), y = season || cur;
  const past = +y < +cur;
  if (past) { const kept = tlKept(teamId, y); if (kept) return kept; }
  const [reg, post] = await Promise.all([tlType(teamId, y, 2), tlType(teamId, y, 3)]);
  const seen = new Set();
  const games = [...(post || []), ...(reg || [])].filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.d.localeCompare(a.d));
  if (past && reg && post && games.length) tlKeep(teamId, y, games);
  return games;
}
// several seasons back from the current one
async function tLogs(teamId, n = 3) {
  const cur = await tlSeasonNow(teamId);
  const logs = await Promise.all(Array.from({ length: n }, (_, i) => tLog(teamId, String(+cur - i))));
  return { cur, games: logs.flat().sort((a, b) => b.d.localeCompare(a.d)) };
}
// back-to-backs: the team also played the day before
function tlMarkB2B(games) {
  const days = new Set(games.map(g => g.ymd));
  const prevDay = ymd => { const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6) - 1)); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
  for (const g of games) g.b2b = days.has(prevDay(g.ymd));
  return games;
}

/* ---------------- game page: Head to head ---------------- */
S.h2hHTML = S.h2hHTML || {};
async function fillH2H(el) {
  const [aId, hId, gameId] = el.dataset.h2h.split('|');
  const key = el.dataset.h2h;
  try {
    const { cur, games } = await tLogs(hId, IS_C ? 5 : 4);
    const meet = games.filter(g => g.oid === String(aId) && g.id !== String(gameId));
    if (!meet.length) { S.h2hHTML[key] = ''; el.remove(); return; }
    const A = S.teams[aId] || {}, H = S.teams[hId] || {};
    const wins = meet.filter(g => g.r === 'W').length, losses = meet.length - wins; // from the home team's side
    const thisS = meet.filter(g => g.season === cur && g.type === 'reg');
    const tsW = thisS.filter(g => g.r === 'W').length;
    const lead = wins === losses ? `Even at ${wins}-${losses}` : `${esc((wins > losses ? H : A).abbr || '')} lead ${Math.max(wins, losses)}-${Math.min(wins, losses)}`;
    const span = IS_C ? 'last 5 seasons' : 'last 4 seasons';
    const avg = k => (meet.reduce((s, g) => s + g[k], 0) / meet.length).toFixed(1);
    const day = g => dfmt('en-US', { timeZone: UTZ, month: 'short', day: 'numeric', year: 'numeric' }, new Date(g.d));
    const row = g => {
      const hWon = g.r === 'W';
      const away = g.home ? A : H, home = g.home ? H : A, as = g.home ? g.pa : g.pf, hs = g.home ? g.pf : g.pa;
      const aWin = g.home ? !hWon : hWon;
      return `<button class="h2h-row" data-game="${esc(g.id)}"><span class="h2h-d">${esc(day(g))}${g.type === 'post' ? `<em>${IS_C ? 'NCAA Tournament' : 'Playoffs'}</em>` : ''}</span>
        <span class="h2h-s"><span class="${aWin ? 'w' : ''}">${logo(away.abbr, 32)}${esc(away.abbr || '')} ${as}</span><i>@</i><span class="${aWin ? '' : 'w'}">${logo(home.abbr, 32)}${esc(home.abbr || '')} ${hs}</span></span></button>`;
    };
    const html = `<div class="card-h"><h4>Head to head</h4><span class="eyebrow">${esc(span)}</span></div>
      <div class="h2h-sum"><b>${lead}</b><span>${plural(meet.length, 'meeting')} · ${esc(H.abbr || '')} ${avg('pf')}, ${esc(A.abbr || '')} ${avg('pa')} per game${thisS.length ? ` · this season ${esc(H.abbr || '')} ${tsW}-${thisS.length - tsW}` : ''}</span></div>
      <div class="h2h-list">${meet.slice(0, 8).map(row).join('')}</div>`;
    S.h2hHTML[key] = html;
    if (el.isConnected) { el.innerHTML = html; el.hidden = false; }
  } catch (e) { el.remove(); }
}
