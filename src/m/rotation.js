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
  pane.innerHTML = `<div class="rot">${sides.map(team).join('')}</div>
    <p class="rot-note">Bars show when each player was on the floor, from the play-by-play's substitutions. Starters are marked with a dot.</p>`;
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
