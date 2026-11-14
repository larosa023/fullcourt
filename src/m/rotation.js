/* ---------------- game page: Rotation and Assists ----------------
   Rotation: who was on the floor and when, per team, from the play-by-play's substitutions. Lineup changes between
   periods aren't always logged, so each period's starting five is worked out from who gets subbed out (or shows up in
   a play) before ever being subbed in, filled from the lineup that ended the period before.
   Assists: who assisted whom, from each assisted basket's scorer and passer. */
const RT_REG = LGK === 'ncaam' ? 2 : 4, RT_LEN = LGK === 'ncaam' ? 20 : LGK === 'nba' ? 12 : 10, RT_OT = 5;
const rtPerLen = p => (p <= RT_REG ? RT_LEN : RT_OT) * 60;
const rtPerStart = p => (p <= RT_REG ? (p - 1) * RT_LEN : RT_REG * RT_LEN + (p - RT_REG - 1) * RT_OT) * 60;
const rtClock = pl => { const v = pl.clock?.value; if (Number.isFinite(+v) && v !== '') return +v; const m = String(pl.clock?.displayValue || '0').match(/^(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : +String(pl.clock?.displayValue || 0) || 0; };
const rtTime = pl => { const p = +pl.period?.number || 1; return rtPerStart(p) + rtPerLen(p) - rtClock(pl); };
const rtFmt = t => { let p = 1; while (rtPerStart(p + 1) <= t && p < 12) p++; const left = rtPerLen(p) - (t - rtPerStart(p)); const lab = p <= RT_REG ? (RT_REG === 2 ? `H${p}` : `Q${p}`) : `OT${p - RT_REG > 1 ? p - RT_REG : ''}`; return `${lab} ${Math.floor(left / 60)}:${String(Math.round(left % 60)).padStart(2, '0')}`; };

function rtPlayers(d) {
  const teams = {};
  for (const t of d.boxscore?.players || []) {
    const tid = String(t.team?.id), sec = t.statistics?.[0], mi = (sec?.labels || []).indexOf('MIN');
    teams[tid] = (sec?.athletes || []).filter(a => a.athlete?.id).map((a, i) => ({ id: String(a.athlete.id), short: a.athlete.shortName || a.athlete.displayName, name: a.athlete.displayName, starter: !!a.starter, order: i, min: +a.stats?.[mi] || 0 }));
  }
  return teams;
}
// a play's substitution: { in, out } (NBA: "A enters the game for B"; college: "A subbing in/out")
function rtSub(pl) {
  const ty = pl.type?.text || '', tx = pl.text || '', ps = (pl.participants || []).map(x => String(x.athlete?.id || ''));
  if (!/substitution/i.test(ty) && !/subbing (in|out)|enters the game/i.test(tx)) return null;
  if (/enters the game/i.test(tx)) return { in: ps[0], out: ps[1] };
  if (/subbing in/i.test(tx)) return { in: ps[0] };
  if (/subbing out/i.test(tx)) return { out: ps[0] };
  return ps.length === 2 ? { in: ps[0], out: ps[1] } : null;
}
function rtStints(d) {
  const roster = rtPlayers(d), teamOf = {};
  for (const [tid, ps] of Object.entries(roster)) for (const p of ps) teamOf[p.id] = tid;
  const plays = (d.plays || []).filter(pl => pl.period?.number).map(pl => ({ pl, t: rtTime(pl), p: +pl.period.number, sub: rtSub(pl) }));
  if (!plays.length) return null;
  const lastP = Math.max(...plays.map(x => x.p));
  const done = d.header?.competitions?.[0]?.status?.type?.completed;
  const endT = done ? rtPerStart(lastP) + rtPerLen(lastP) : Math.max(...plays.map(x => x.t));
  const stints = {}; // player → [[from, to]]
  const out = {};
  for (const tid of Object.keys(roster)) {
    let prevEnd = roster[tid].filter(p => p.starter).map(p => p.id);
    for (let per = 1; per <= lastP; per++) {
      const ev = plays.filter(x => x.p === per);
      const first = new Map();
      for (const x of ev) {
        if (x.sub) { for (const [k, v] of [['out', x.sub.out], ['in', x.sub.in]]) if (v && teamOf[v] === tid && !first.has(v)) first.set(v, k); }
        else for (const q of x.pl.participants || []) { const v = String(q.athlete?.id || ''); if (teamOf[v] === tid && !first.has(v)) first.set(v, 'act'); }
      }
      let start = per === 1 && prevEnd.length === 5 ? [...prevEnd] : [...first].filter(([, k]) => k !== 'in').map(([v]) => v);
      if (start.length < 5) for (const v of prevEnd) { if (start.length >= 5) break; if (!start.includes(v) && first.get(v) !== 'in') start.push(v); }
      start = start.slice(0, 5);
      const pStart = rtPerStart(per), pEnd = per === lastP ? endT : pStart + rtPerLen(per);
      const on = new Map(start.map(v => [v, pStart]));
      const close = (v, t) => { if (!on.has(v)) return; const s = on.get(v); if (t > s) (stints[v] = stints[v] || []).push([s, t]); on.delete(v); };
      for (const x of ev) {
        if (x.sub) {
          if (x.sub.out && teamOf[x.sub.out] === tid) close(x.sub.out, x.t);
          if (x.sub.in && teamOf[x.sub.in] === tid && !on.has(x.sub.in)) on.set(x.sub.in, x.t);
        } else for (const q of x.pl.participants || []) { const v = String(q.athlete?.id || ''); if (teamOf[v] === tid && !on.has(v)) on.set(v, Math.max(pStart, x.t - 1)); }
      }
      prevEnd = [...on.keys()];
      for (const v of prevEnd) close(v, pEnd);
    }
    out[tid] = roster[tid];
  }
  // join back-to-back stretches (on the floor across a period break, or a sub out and straight back in)
  for (const v of Object.keys(stints)) stints[v] = stints[v].sort((a, b) => a[0] - b[0]).reduce((acc, st) => { const l = acc.at(-1); if (l && st[0] - l[1] <= 1) l[1] = Math.max(l[1], st[1]); else acc.push([...st]); return acc; }, []);
  return { roster: out, stints, endT, lastP, total: Math.max(endT, rtPerStart(Math.max(lastP, RT_REG)) + rtPerLen(Math.max(lastP, RT_REG))) };
}

// five-man units: every stretch where the same five were on the floor together, with the score over that stretch.
// → { [teamId]: [{ ids: [5 ids], secs, pf, pa }] } (biggest minutes first)
function rtLineups(d, R = rtStints(d)) {
  if (!R) return null;
  const comp = d.header?.competitions?.[0]?.competitors || [], homeId = String(comp.find(c => c.homeAway === 'home')?.team?.id || '');
  const sc = (d.plays || []).filter(pl => pl.period?.number && pl.homeScore != null).map(pl => [rtTime(pl), +pl.homeScore || 0, +pl.awayScore || 0]).sort((a, b) => a[0] - b[0]);
  // the score once everything at time t has happened (free throws after a sub count to the unit that took the floor)
  const at = t => { let lo = 0, hi = sc.length - 1, r = [0, 0, 0]; while (lo <= hi) { const m = (lo + hi) >> 1; if (sc[m][0] <= t) { r = sc[m]; lo = m + 1; } else hi = m - 1; } return r; };
  const out = {};
  for (const [tid, ps] of Object.entries(R.roster)) {
    const mine = ps.filter(p => R.stints[p.id]?.length), home = tid === homeId;
    const cuts = [...new Set(mine.flatMap(p => R.stints[p.id].flat()))].sort((a, b) => a - b), units = new Map();
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1]; if (b - a < 1) continue;
      const on = mine.filter(p => R.stints[p.id].some(([x, y]) => x <= a && y >= b)).map(p => p.id);
      if (on.length !== 5) continue;
      const k = on.sort().join('-'), s0 = at(a), s1 = at(b), u = units.get(k) || { ids: on, secs: 0, pf: 0, pa: 0 };
      u.secs += b - a; u.pf += (home ? s1[1] - s0[1] : s1[2] - s0[2]); u.pa += (home ? s1[2] - s0[2] : s1[1] - s0[1]);
      units.set(k, u);
    }
    out[tid] = [...units.values()].sort((x, y) => y.secs - x.secs);
  }
  return out;
}
const rtMS = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// a lineup table: the five as short names, time together, points for and against, plus/minus
function lineupTable(units, nameOf, { max = 8, games = 0 } = {}) {
  if (!units?.length) return '<p class="lu-none">Not enough play-by-play to piece lineups together yet.</p>';
  const top = units.slice(0, max), most = Math.max(...top.map(u => u.secs));
  return `<div class="lu-t" role="table">
    <div class="lu-r lu-hd" role="row"><span role="columnheader">Lineup</span><span role="columnheader">Min</span>${games ? '<span role="columnheader">GP</span>' : ''}<span role="columnheader" title="Points scored and allowed while these five were on the floor">Pts</span><span role="columnheader" title="Plus/minus together">+/−</span></div>
    ${top.map(u => { const pm = u.pf - u.pa; return `<div class="lu-r" role="row"><span class="lu-n" role="cell">${u.ids.map(id => `<button data-player="${esc(id)}">${esc(nameOf(id))}</button>`).join('<i>·</i>')}</span>
      <span class="lu-m" role="cell"><b>${rtMS(u.secs)}</b><s style="width:${(u.secs / most * 100).toFixed(1)}%"></s></span>${games ? `<span role="cell">${u.games}</span>` : ''}<span class="lu-p" role="cell">${u.pf}–${u.pa}</span><span class="lu-pm ${pm > 0 ? 'up' : pm < 0 ? 'dn' : ''}" role="cell">${pm > 0 ? '+' : ''}${pm}</span></div>`; }).join('')}
  </div>`;
}

function drawRotation(pane, d, sides) {
  const R = rtStints(d);
  if (!R || !Object.keys(R.stints).length) { pane.innerHTML = '<div class="empty" style="border:0"><b>No rotation yet</b>It shows up once the play-by-play has substitutions.</div>'; return; }
  const T = R.total, pc = t => (t / T * 100).toFixed(2);
  const lines = []; for (let p = 2; p <= Math.max(R.lastP, RT_REG); p++) lines.push(rtPerStart(p));
  const labs = []; for (let p = 1; p <= Math.max(R.lastP, RT_REG); p++) labs.push([p, rtPerStart(p), rtPerLen(p)]);
  const lab = p => p <= RT_REG ? (RT_REG === 2 ? `${p === 1 ? '1st' : '2nd'} half` : `Q${p}`) : `OT${p - RT_REG > 1 ? p - RT_REG : ''}`;
  const team = s => {
    const tid = String(s.id), ps = (R.roster[tid] || []).filter(p => R.stints[p.id]?.length);
    if (!ps.length) return '';
    const firstIn = p => R.stints[p.id][0][0];
    ps.sort((a, b) => (b.starter - a.starter) || (a.starter ? a.order - b.order : firstIn(a) - firstIn(b)));
    return `<div class="rot-team" style="${barVars(tid)}">
      <div class="rot-h">${logo(s.abbr, 40)}<b>${esc(s.name || s.abbr)}</b></div>
      <div class="rot-grid">
        <div class="rot-row rot-axis"><span></span><span class="rot-track">${labs.map(([p, st, ln]) => `<em style="left:${pc(st)}%;width:${pc(ln)}%">${lab(p)}</em>`).join('')}</span><span class="rot-m">MIN</span></div>
        ${ps.map(p => `<button class="rot-row" data-player="${esc(p.id)}" title="${esc(p.name)}">
          <span class="rot-n">${p.starter ? '<i></i>' : ''}${esc(p.short)}</span>
          <span class="rot-track">${lines.map(t => `<s style="left:${pc(t)}%"></s>`).join('')}${R.stints[p.id].map(([a, b]) => `<u style="left:${pc(a)}%;width:${pc(b - a)}%" title="${esc(rtFmt(a))} to ${esc(rtFmt(b))}"></u>`).join('')}</span>
          <span class="rot-m">${p.min || Math.round(R.stints[p.id].reduce((x, [a, b]) => x + b - a, 0) / 60)}</span></button>`).join('')}
      </div></div>`;
  };
  // the units each team used most, under the bars
  const LU = rtLineups(d, R), nameOf = id => { for (const ps of Object.values(R.roster)) { const p = ps.find(x => x.id === id); if (p) return (p.short || p.name || '').replace(/^\w+\. /, ''); } return '?'; };
  const luTeam = s => LU?.[String(s.id)]?.length ? `<div class="lu-team" style="${barVars(String(s.id))}"><div class="rot-h">${logo(s.abbr, 40)}<b>${esc(s.abbr)} lineups</b></div>${lineupTable(LU[String(s.id)], nameOf, { max: 6 })}</div>` : '';
  pane.innerHTML = `<div class="rot">${sides.map(team).join('')}</div>
    <p class="rot-note">Bars show when each player was on the floor, from the play-by-play's substitutions. Starters are marked with a dot.</p>
    ${LU ? `<div class="lu-wrap">${sides.map(luTeam).join('')}</div><p class="rot-note">Each team's most-used five-man units: how long they played together and the score while they were out there.</p>` : ''}`;
}

/* ---------------- Assists ---------------- */
let astSide = 0;
function drawAssists(pane, d, sides) {
  const roster = rtPlayers(d), teamOf = {}, who = {};
  for (const [tid, ps] of Object.entries(roster)) for (const p of ps) { teamOf[p.id] = tid; who[p.id] = p; }
  const pairs = {}; // tid → Map("a>s" → { a, s, n, pts })
  for (const pl of d.plays || []) {
    if (!pl.scoringPlay || !/assist/i.test(pl.text || '')) continue;
    const ps = (pl.participants || []).map(x => String(x.athlete?.id || ''));
    const [sc, as] = ps; if (!sc || !as || teamOf[sc] !== teamOf[as]) continue;
    const tid = teamOf[sc], k = `${as}>${sc}`, M = pairs[tid] = pairs[tid] || new Map();
    const e = M.get(k) || { a: as, s: sc, n: 0, pts: 0 }; e.n++; e.pts += +pl.scoreValue || 0; M.set(k, e);
  }
  if (!Object.keys(pairs).length) { pane.innerHTML = '<div class="empty" style="border:0"><b>No assists yet</b>They show up once the play-by-play has assisted baskets.</div>'; return; }
  const s = sides[astSide] || sides[0], tid = String(s.id), M = [...(pairs[tid] || new Map()).values()];
  const total = M.reduce((x, e) => x + e.n, 0);
  // players around a circle: passers first, by assists
  const given = {}, got = {}; for (const e of M) { given[e.a] = (given[e.a] || 0) + e.n; got[e.s] = (got[e.s] || 0) + e.n; }
  const ids = [...new Set([...M.map(e => e.a), ...M.map(e => e.s)])].sort((a, b) => (given[b] || 0) - (given[a] || 0) || (got[b] || 0) - (got[a] || 0));
  const W = 360, C = W / 2, Rr = 118, pos = {};
  ids.forEach((v, i) => { const ang = -Math.PI / 2 + i / ids.length * Math.PI * 2; pos[v] = [C + Rr * Math.cos(ang), C + Rr * Math.sin(ang), ang]; });
  const maxN = Math.max(1, ...M.map(e => e.n)), maxG = Math.max(1, ...Object.values(given));
  const edge = e => {
    const [x1, y1] = pos[e.a], [x2, y2] = pos[e.s];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, cx = mx + (C - mx) * 0.35, cy = my + (C - my) * 0.35; // bow toward the middle
    const w = 1.5 + e.n / maxN * 6;
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" stroke-width="${w.toFixed(1)}" marker-end="url(#ast-arr)"><title>${esc(who[e.a]?.short || '')} → ${esc(who[e.s]?.short || '')}: ${plural(e.n, 'assist')}, ${e.pts} pts</title></path>`;
  };
  const node = v => {
    const [x, y, ang] = pos[v], r = 7 + (given[v] || 0) / maxG * 9;
    const lx = C + (Rr + r + 10) * Math.cos(ang), ly = C + (Rr + r + 10) * Math.sin(ang);
    const anchor = Math.cos(ang) > 0.3 ? 'start' : Math.cos(ang) < -0.3 ? 'end' : 'middle';
    return `<g class="ast-node" data-player="${esc(v)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">${esc(who[v]?.short || '')}${given[v] ? ` · ${given[v]}` : ''}</text></g>`;
  };
  const top = [...M].sort((a, b) => b.n - a.n || b.pts - a.pts).slice(0, 6);
  pane.innerHTML = `<div class="ast">
    <div class="seg" style="margin-bottom:10px"><span class="knob"></span>${sides.map((x, i) => `<button data-astside="${i}" aria-pressed="${i === astSide}">${logo(x.abbr, 32)}${esc(x.abbr)}</button>`).join('')}</div>
    ${M.length ? `<div class="ast-wrap">
      <svg class="ast-svg" viewBox="-40 -10 ${W + 80} ${W + 20}" role="img" aria-label="Assist map for ${esc(s.name || s.abbr)}" style="${barVars(tid)}">
        <defs><marker id="ast-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
        <g class="ast-edges">${M.map(edge).join('')}</g>${ids.map(node).join('')}
      </svg>
      <div class="ast-list"><p class="ast-sum"><b>${total}</b> assisted baskets</p>
        ${top.map(e => `<div class="ast-pair"><span><button data-player="${esc(e.a)}">${esc(who[e.a]?.short || '')}</button> → <button data-player="${esc(e.s)}">${esc(who[e.s]?.short || '')}</button></span><b>${e.n}</b><small>${e.pts} pts</small></div>`).join('')}
      </div></div>
      <p class="rot-note">Arrows go from the passer to the scorer; thicker means more assists. Bigger dots made more assists.</p>` : `<div class="empty" style="border:0"><b>No assists for ${esc(s.abbr)} yet</b></div>`}
  </div>`;
  const seg = $('.seg', pane); if (seg) requestAnimationFrame(() => placeKnob(seg));
  pane.onclick = e => { const b = e.target.closest('[data-astside]'); if (b) { astSide = +b.dataset.astside; drawAssists(pane, d, sides); } };
}

/* ---------------- team page: lineups and minutes over the last 5 or 10 games ----------------
   Each game's full feed is read once and boiled down to this team's minutes and five-man units; only that small
   summary is kept, so flipping between 5 and 10 games (or reopening the team) doesn't fetch or hold the feeds again. */
const LU_GAMES = new Map();
async function luGame(gid, tid) {
  const k = gid + '|' + tid; if (LU_GAMES.has(k)) return LU_GAMES.get(k);
  const d = await getJSON(`${API}/summary?event=${gid}`, { timeout: 15000 });
  const R = rtStints(d), L = R ? rtLineups(d, R) : null, ps = (R?.roster || rtPlayers(d))[tid] || [];
  const v = { mins: Object.fromEntries(ps.filter(p => p.min > 0).map(p => [p.id, p.min])), names: Object.fromEntries(ps.map(p => [p.id, p.short || p.name])), units: (L?.[tid] || []).map(({ ids, secs, pf, pa }) => ({ ids, secs, pf, pa })) };
  LU_GAMES.set(k, v); if (LU_GAMES.size > 80) LU_GAMES.delete(LU_GAMES.keys().next().value);
  return v;
}
async function fillLineups(box, tid, evs, sheet) {
  const done = evs.filter(e => e.state === 'post');
  if (!done.length) { box.hidden = true; return; }
  let n = lsGet('fc-lu-n') === '10' ? 10 : 5, drawN = 0;
  const head = () => `<div class="card-h"><h4>Lineups &amp; minutes</h4>${done.length > 5 ? `<div class="seg lu-seg" data-luseg><span class="knob"></span>${[5, 10].map(k => `<button data-lun="${k}" aria-pressed="${n === k}">Last ${k}</button>`).join('')}</div>` : `<span class="eyebrow">Last ${plural(done.length, 'game')}</span>`}</div>`;
  const draw = async () => {
    const my = ++drawN, list = done.slice(-n);
    box.innerHTML = head() + '<div class="sk" style="height:220px;border-radius:12px"></div>'; placeKnob($('[data-luseg]', box));
    const got = new Array(list.length); let i = 0;
    await Promise.all([0, 1, 2].map(async () => { while (i < list.length) { const j = i++; try { got[j] = await luGame(list[j].id, tid); } catch (e) { got[j] = null; } } }));
    if (my !== drawN || !sheet.alive) return;
    const G = list.map((e, j) => ({ e, v: got[j] })).filter(x => x.v);
    if (!G.length) { box.innerHTML = head() + '<p class="lu-none">These games didn\'t load. Try again in a minute.</p>'; placeKnob($('[data-luseg]', box)); return; }
    const names = Object.assign({}, ...G.map(x => x.v.names)), nameOf = id => (names[id] || '?').replace(/^\w+\. /, '');
    // minutes: everyone who played, most minutes first; trend = last 3 games against the ones before
    const ids = [...new Set(G.flatMap(x => Object.keys(x.v.mins)))];
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const rows = ids.map(id => {
      const m = G.map(x => x.v.mins[id] || 0), played = m.filter(v => v > 0);
      // games he sat out don't count as 0 minutes (an injury isn't a role change)
      const late = m.slice(-3).filter(v => v > 0), early = m.slice(0, -3).filter(v => v > 0), d = G.length >= 5 && early.length && late.length ? avg(late) - avg(early) : 0;
      return { id, m, avg: avg(played), tot: m.reduce((s, v) => s + v, 0), gp: played.length, d };
    }).sort((a, b) => b.tot - a.tot);
    const cell = v => `<td class="lu-c" style="--h:${Math.min(1, v / 40).toFixed(2)}">${v || '<i>–</i>'}</td>`;
    const tag = r => Math.abs(r.d) >= 5 ? `<em class="lu-tr ${r.d > 0 ? 'up' : 'dn'}" title="Minutes a game over his last 3, against the ${G.length - 3} before (games he played)">${r.d > 0 ? '▲' : '▼'} ${Math.abs(r.d).toFixed(0)} min</em>` : '';
    const minutes = `<div class="lu-mw drag-x" data-drag><table class="lu-mt"><thead><tr><th class="lu-pn">Player</th>${G.map(x => `<th title="${esc(fmtShortDate(x.e.date))}"><button data-game="${esc(x.e.id)}">${x.e.home ? '' : '@'}${esc(x.e.op.abbreviation)}</button></th>`).join('')}<th>Avg</th><th class="lu-trh">Role</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th class="lu-pn"><button data-player="${esc(r.id)}">${esc(nameOf(r.id))}</button></th>${r.m.map(cell).join('')}<td class="lu-avg">${r.avg.toFixed(1)}</td><td class="lu-trc">${tag(r)}</td></tr>`).join('')}</tbody></table></div>`;
    // lineups across the games
    const U = new Map();
    for (const x of G) for (const u of x.v.units) { const k = [...u.ids].sort().join('-'), a = U.get(k) || { ids: u.ids, secs: 0, pf: 0, pa: 0, games: 0 }; a.secs += u.secs; a.pf += u.pf; a.pa += u.pa; a.games++; U.set(k, a); }
    const units = [...U.values()].sort((a, b) => b.secs - a.secs);
    const shifts = rows.filter(r => Math.abs(r.d) >= 5);
    box.innerHTML = `${head()}
      <p class="lu-sub">${shifts.length ? `Role changes: ${shifts.slice(0, 3).map(r => `<b>${esc(nameOf(r.id))}</b> ${r.d > 0 ? 'up' : 'down'} ${Math.abs(r.d).toFixed(0)} min a game`).join(', ')} over the last 3.` : 'No big minutes swings over the last 3 games.'}</p>
      <h5 class="lu-h">Minutes by game</h5>${minutes}
      <h5 class="lu-h">Most-used lineups</h5>${lineupTable(units, nameOf, { max: 8, games: true })}
      <p class="rot-note">From each game's play-by-play. Plus/minus is the score while those five were on the floor together.</p>`;
    placeKnob($('[data-luseg]', box)); wireDrag(box);
  };
  box.addEventListener('click', e => { const b = e.target.closest('[data-lun]'); if (!b) return; e.stopPropagation(); const k = +b.dataset.lun; if (k === n) return; n = k; lsSet('fc-lu-n', k === 10 ? '10' : null); draw(); });
  await draw();
}
