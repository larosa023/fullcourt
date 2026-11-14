// Alerts for "your players" and tracked bets, on top of the team alerts in alerts.mjs. These need each game's box
// score, so the checker reads a game's full feed only while one of its players or legs is live (or the minute it ends).
// The bet rules follow the site's own (src/m/bets.js gradeLeg, legAlert, milestoneAlert), so the phone hears the same
// thing the open site would have shown.

const STAT = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', tov: 'TO', tpa: '3PA', fga: 'FGA', fgm: 'FGM', fta: 'FTA', ftm: 'FTM', oreb: 'OREB', dreb: 'DREB', fg2: '2PM', fg2a: '2PA', pf: 'PF', fpts: 'FPTS' };
const KINDS = new Set(['prop', 'dd', 'td', 'ml', 'spread', 'total', 'ttotal']);
const str = (v, n = 60) => String(v ?? '').slice(0, n);
const id = v => (/^\d{1,12}$/.test(String(v ?? '')) ? String(v) : '');
const num = v => (Number.isFinite(+v) ? +v : null);

/* ---------- what the page sends ---------- */
export function cleanPlayers(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(p => ({ id: id(p?.id), name: str(p?.name), short: str(p?.short || p?.name, 30), team: id(p?.team), lg: p?.lg === 'wnba' ? 'wnba' : 'nba' })).filter(p => p.id && p.team);
}
export function cleanBets(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(b => ({
    id: str(b?.id, 40), lg: b?.lg === 'wnba' ? 'wnba' : 'nba',
    legs: (Array.isArray(b?.legs) ? b.legs : []).slice(0, 15).map(l => ({ k: KINDS.has(l?.k) ? l.k : '', pid: id(l?.pid), name: str(l?.name), stats: (Array.isArray(l?.stats) ? l.stats : []).filter(k => STAT[k]).slice(0, 4), line: num(l?.line), side: l?.side === 'u' ? 'u' : 'o', gid: id(l?.gid), teamId: id(l?.teamId), abbr: str(l?.abbr, 6), game: str(l?.game, 20) })),
  })).filter(b => b.id && b.legs.length && b.legs.every(l => l.k));
}

/* ---------- reading a game's full feed ---------- */
export function sumGame(d) {
  const c = d?.header?.competitions?.[0]; if (!c) return null;
  const t = c.status?.type || {}, side = ha => { const x = (c.competitors || []).find(y => y.homeAway === ha) || {}; return { id: String(x.team?.id || ''), abbr: x.team?.abbreviation || '?', name: x.team?.shortDisplayName || x.team?.name || '', score: +x.score || 0 }; };
  return { state: t.state || 'pre', period: c.status?.period || 0, clock: c.status?.displayClock || '', home: side('home'), away: side('away') };
}
export function boxOf(d, pid) {
  for (const T of d?.boxscore?.players || []) {
    const st = T.statistics?.[0]; if (!st) continue;
    const a = (st.athletes || []).find(x => String(x.athlete?.id) === String(pid)); if (!a) continue;
    if (!a.stats?.length) return { dnp: true };
    const lab = st.labels || st.names || [], v = k => a.stats[lab.indexOf(k)], n = k => +(v(k) ?? 0) || 0, ma = (k, i) => +(String(v(k) || '0-0').split('-')[i]) || 0;
    const b = { pts: n('PTS'), reb: n('REB'), ast: n('AST'), stl: n('STL'), blk: n('BLK'), tov: n('TO'), tpm: ma('3PT', 0), tpa: ma('3PT', 1), fgm: ma('FG', 0), fga: ma('FG', 1), ftm: ma('FT', 0), fta: ma('FT', 1), min: n('MIN'), oreb: n('OREB'), dreb: n('DREB'), pf: n('PF') };
    b.fg2 = b.fgm - b.tpm; b.fg2a = b.fga - b.tpa; b.fpts = b.pts + 1.2 * b.reb + 1.5 * b.ast + 3 * (b.stl + b.blk) - b.tov;
    return b;
  }
  return null;
}
const out = (d, pid) => (d?.injuries || []).some(t => (t.injuries || []).some(i => String(i.athlete?.id) === String(pid) && /^out/i.test(i.status || i.type?.description || '')));
const secs = clock => { const m = /^(\d+):(\d+)/.exec(clock || ''); return m ? +m[1] * 60 + +m[2] : parseFloat(clock) || 0; };
const perLabel = p => (p <= 4 ? ['1st', '2nd', '3rd', '4th'][p - 1] || '' : p === 5 ? 'OT' : `${p - 4}OT`);

// one leg -> { st: pending|live|won|lost|push|void, now }   (the same rules as the site's gradeLeg)
export function gradeLeg(l, d) {
  const g = sumGame(d); if (!g) return { st: 'pending' };
  const fin = g.state === 'post';
  if ((l.k === 'prop' || l.k === 'dd' || l.k === 'td') && l.pid) { const b0 = boxOf(d, l.pid); if (out(d, l.pid) && (!b0 || b0.dnp)) return { st: 'void', g }; }
  if (g.state === 'pre') return { st: 'pending', g };
  const over = l.side !== 'u', fromLine = (val, line) => (over && val > line ? 'won' : !over && val > line ? 'lost' : !fin ? 'live' : val === line ? 'push' : over ? 'lost' : 'won');
  if (l.k === 'prop' || l.k === 'dd' || l.k === 'td') {
    const b = boxOf(d, l.pid); if (!b || b.dnp) return { st: fin ? 'void' : 'live', g, now: 0 };
    if (l.k !== 'prop') { const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => b[k] >= 10).length, yes = tens >= (l.k === 'dd' ? 2 : 3); return { st: over ? (yes ? 'won' : fin ? 'lost' : 'live') : (yes ? 'lost' : fin ? 'won' : 'live'), g, now: tens }; }
    const val = Math.round(l.stats.reduce((s, k) => s + (b[k] || 0), 0) * 10) / 10;
    return { st: fromLine(val, l.line), g, now: val };
  }
  const mine = l.teamId && (g.home.id === l.teamId ? g.home : g.away.id === l.teamId ? g.away : null); if (!mine) return { st: 'pending', g };
  const opp = mine === g.home ? g.away : g.home;
  if (l.k === 'ml') { const diff = mine.score - opp.score; return { st: fin ? (diff > 0 ? 'won' : 'lost') : 'live', g, now: diff }; }
  if (l.k === 'spread') { const m = mine.score + l.line - opp.score; return { st: fin ? (m > 0 ? 'won' : m < 0 ? 'lost' : 'push') : 'live', g, now: m }; }
  if (l.k === 'total' || l.k === 'ttotal') { const val = l.k === 'total' ? g.home.score + g.away.score : mine.score; return { st: fromLine(val, l.line), g, now: val }; }
  return { st: 'pending', g };
}
export const legName = l => {
  const side = l.side === 'u' ? 'U' : 'O', last = (l.name || '').split(' ').slice(-1)[0];
  if (l.k === 'prop') return `${last} ${side} ${l.line} ${l.stats.map(k => STAT[k]).join('+')}`;
  if (l.k === 'dd' || l.k === 'td') return `${last} ${l.side === 'u' ? 'no ' : ''}${l.k === 'dd' ? 'double' : 'triple'}-double`;
  if (l.k === 'spread') return `${l.abbr} ${l.line > 0 ? '+' + l.line : l.line === 0 ? 'PK' : l.line}`;
  if (l.k === 'ml') return `${l.abbr} ML`;
  if (l.k === 'total') return `${l.game || l.abbr} ${side} ${l.line}`;
  if (l.k === 'ttotal') return `${l.abbr} TT ${side} ${l.line}`;
  return '';
};

/* ---------- the alerts ---------- */
// Both take: sums (game id -> full feed, only the games read this minute), seen (the sent-alerts record for this
// subscriber, a Set of keys), last (this subscriber's last leg results: key -> 'live' etc.), and quiet (game ids seen
// for the first time this minute: their milestones are recorded without being announced).
const line3 = b => `${b.pts} pts · ${b.reb} reb · ${b.ast} ast`;
export function playerAlerts(sub, games, sums, seen, quiet, finals) {
  const msgs = [];
  for (const p of sub.players || []) {
    const g = games.find(x => x.lg === p.lg && (x.a.id === p.team || x.h.id === p.team)); if (!g || !sums[g.id]) continue;
    const b = boxOf(sums[g.id], p.id); if (!b || b.dnp) continue;
    const mine = g.a.id === p.team ? g.a : g.h, opp = mine === g.a ? g.h : g.a, base = { tag: `fc-p-${p.id}-${g.id}`, game: g.id, lg: g.lg };
    const where = g.state === 'in' ? ` · ${perLabel(g.period)} ${g.clock}` : '';
    const send = (key, m) => { key = `p:${p.id}:${g.id}:${key}`; if (seen.has(key)) return; seen.add(key); if (!quiet.has(g.id)) msgs.push({ ...base, ...m }); };
    if (g.state === 'in' || finals.has(g.id)) {
      const top = [50, 40, 30].find(t => b.pts >= t);
      if (top) { for (const t of [30, 40, 50].filter(t => t < top)) seen.add(`p:${p.id}:${g.id}:${t}`); send(String(top), { title: `${p.short} has ${b.pts}`, body: `${line3(b)} · ${mine.abbr} ${mine.score}-${opp.score} ${opp.abbr}${where}` }); }
      if (['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => b[k] >= 10).length >= 3) send('td', { title: `${p.short}: triple-double`, body: `${line3(b)} · ${mine.abbr} ${mine.score}-${opp.score} ${opp.abbr}${where}` });
    }
    if (finals.has(g.id)) send('final', { title: `${p.short}: ${b.pts} pts`, body: `${line3(b)} · ${b.fgm}-${b.fga} FG · ${b.tpm}-${b.tpa} 3PT\n${mine.score > opp.score ? 'Win' : 'Loss'} ${mine.score}-${opp.score} ${mine === g.a ? '@' : 'vs'} ${opp.abbr}`, ttl: 3600 });
  }
  return msgs;
}

const SCORING = new Set(['pts', 'fg2', 'fga', 'fg2a', 'tpa']);
export function betAlerts(sub, sums, seen, last, quiet) {
  const msgs = [];
  for (const b of sub.bets || []) {
    if (!b.legs.some(l => sums[l.gid])) continue;
    const res = b.legs.map(l => (sums[l.gid] ? gradeLeg(l, sums[l.gid]) : { st: 'pending' }));
    res.forEach((r, i) => {
      const l = b.legs[i], key = `b:${b.id}:${i}`, prev = last[key]; last[key] = r.st;
      const base = { tag: `fc-b-${b.id}-${i}`, game: l.gid, lg: b.lg };
      if (prev === undefined || quiet.has(l.gid)) { // first look at this leg: note it, say nothing
        for (const k of ['close', 'late', 'room']) if (legMilestone(l, r, k)) seen.add(`${key}:${k}`);
        return;
      }
      if ((r.st === 'won' || r.st === 'lost') && (prev === 'live' || prev === 'pending')) {
        const won = r.st === 'won', left = res.filter((x, j) => j !== i && !['won', 'push', 'void'].includes(x.st)).length;
        msgs.push({ ...base, title: won ? 'Leg hit' : 'Leg missed', body: `${won ? '✓' : '✗'} ${legName(l)} ${won ? 'hit' : 'missed'}${b.legs.length > 1 ? won ? left ? ` · ${left} to go` : ' · parlay cashed' : ' · parlay down' : ''}`, ttl: 3600 });
        return;
      }
      for (const k of ['close', 'late', 'room']) {
        const text = legMilestone(l, r, k); if (!text || seen.has(`${key}:${k}`)) continue;
        seen.add(`${key}:${k}`); msgs.push({ ...base, title: k === 'room' ? 'Under in danger' : 'Leg is close', body: text }); break;
      }
    });
  }
  return msgs;
}
// a live player prop getting close (the site's milestoneAlert): one bucket away, late and still short, or an under nearly used up
function legMilestone(l, r, kind) {
  if (l.k !== 'prop' || r.st !== 'live' || r.now == null || !r.g || r.g.state !== 'in') return '';
  const over = l.side !== 'u', need = Math.floor(l.line) + 1 - r.now, room = Math.floor(l.line) - r.now;
  const close = l.stats.some(k => SCORING.has(k)) || l.stats.length > 1 ? 3 : 1, late = r.g.period >= 4 && secs(r.g.clock) <= 300;
  const who = (l.name || 'Your player').split(' ').slice(-1)[0], what = l.stats.map(k => STAT[k]).join('+'), when = `${perLabel(r.g.period)} ${r.g.clock}`;
  if (kind === 'close' && over && need > 0 && need <= close) return `${who} needs ${need} more ${what} (${r.now} of ${Math.floor(l.line) + 1}) · ${when}`;
  if (kind === 'late' && over && need > close && late) return `${who} needs ${need} more ${what} · ${r.g.clock} left in the ${perLabel(r.g.period)}`;
  if (kind === 'room' && !over && room >= 0 && room < close) return `${who} is at ${r.now} ${what} · only ${room} to spare on the under (${l.line})`;
  return '';
}

// which games' full feeds this minute needs: live ones (and ones ending right now) that a subscriber's players or legs are in
export function gamesToRead(subs, games, finals) {
  const want = new Set();
  for (const g of games) {
    if (g.state !== 'in' && !finals.has(g.id)) continue;
    for (const s of subs) {
      if (s.want?.players !== false && (s.players || []).some(p => p.lg === g.lg && (p.team === g.a.id || p.team === g.h.id))) want.add(g.id);
      if (s.want?.bets !== false && (s.bets || []).some(b => b.legs.some(l => l.gid === g.id))) want.add(g.id);
    }
  }
  return want;
}

/* ---------- injury news for tracked bets ---------- */
// The league injury feed (one call per league) → player id → how likely he is to sit tonight. ESPN files most
// game-time calls under "Day-To-Day" and says questionable / doubtful / ruled out in the comment, so both are read.
// lvl: 1 questionable, 2 doubtful, 3 out, 4 left tonight's game and won't return
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function injuryLevel(i, gameDay, now = Date.now()) {
  const st = String(i?.status || ''), c = String(i?.shortComment || ''), age = now - Date.parse(i?.date || 0);
  const tonight = new RegExp(`\\b(tonight|${gameDay})\\b`, 'i').test(c);
  if (/will not return|won't return|ruled out for the (rest|remainder)/i.test(c) && tonight && age < 8 * 3600e3) return 4;
  if (/^(out|suspension)$/i.test(st)) return /\b(will|expected to|set to|plans to) play\b|\bavailable\b/i.test(c) && tonight ? 0 : 3;
  if (!tonight || age > 36 * 3600e3) return 0;
  if (/ruled out|will not play|won't play|\bis out\b|\bout for\b|will sit|sit out/i.test(c)) return 3;
  if (/doubtful/i.test(c)) return 2;
  if (/questionable|game-time decision|\bGTD\b/i.test(c)) return 1;
  return 0;
}
export function injuryMap(feed) {
  const m = new Map();
  for (const t of feed?.injuries || []) for (const i of t.injuries || []) {
    const a = i.athlete || {}, pid = String(a.id || String(a.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || String(a.headshot?.href || '').match(/\/(\d+)\.png/)?.[1] || '');
    if (pid) m.set(pid, i);
  }
  return m;
}
const LVL = { 1: 'questionable', 2: 'doubtful', 3: 'ruled out', 4: 'out for the rest of the game' };
// one alert per leg per step up (questionable → doubtful → out), only for games that haven't finished
export function injuryAlerts(sub, games, inj, seen, now = Date.now()) {
  const msgs = [];
  for (const b of sub.bets || []) b.legs.forEach((l, i) => {
    if (!l.pid || !['prop', 'dd', 'td'].includes(l.k)) return;
    const g = games.find(x => x.id === l.gid); if (!g || g.state === 'post') return;
    const feed = inj[b.lg]; if (!feed) return;
    const day = DAYS[new Date(Date.parse(g.start || now) - 5 * 3600e3).getUTCDay()];
    let lvl = injuryLevel(feed.get(String(l.pid)), day, now);
    if (g.state === 'in' && lvl < 4) return; // once it's started only "won't return" is news
    if (!lvl) return;
    const key = `i:${b.id}:${i}`;
    if ([...Array(5).keys()].some(k => k >= lvl && seen.has(`${key}:${k}`))) return;
    for (let k = 1; k <= lvl; k++) seen.add(`${key}:${k}`);
    const who = l.name || 'Your player', parlay = b.legs.length > 1, c = String(feed.get(String(l.pid))?.shortComment || '');
    const head = lvl === 4 ? `${who} won't return` : lvl === 3 ? `${who} is out tonight` : `${who} is ${LVL[lvl]}`;
    const tail = lvl >= 3 ? (parlay ? 'Most books void that leg and pay the rest at shorter odds; check your book.' : 'Most books void a prop when the player doesn\'t play; check your book.') : 'Keep an eye on it before tip-off.';
    msgs.push({ tag: `fc-i-${b.id}-${i}`, game: l.gid, lg: b.lg, title: lvl === 4 ? 'Player left the game' : 'Injury news on your bet', body: `${head} · ${legName(l)}\n${c ? c.slice(0, 140) + ' ' : ''}${lvl === 4 ? '' : tail}`.trim(), ttl: 3 * 3600 });
  });
  return msgs;
}
// leagues whose injury feed is worth reading this minute: a subscriber has a player leg in a game that hasn't finished
export function injuryLeagues(subs, games) {
  const lgs = new Set();
  for (const s of subs) if (s.want?.bets !== false) for (const b of s.bets || []) for (const l of b.legs) if (l.pid && games.some(g => g.id === l.gid && g.state !== 'post')) lgs.add(b.lg);
  return lgs;
}
