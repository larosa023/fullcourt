/* Chalk: a top-down court that animates a game from ESPN play-by-play.
   Shots land where they were taken (made = filled dot, missed = ×, in team colors) and build a running shot chart;
   the scorebug and a play log stay in step. Finished games replay with play/pause, speed and a scrubber; live games
   follow along and animate new plays as they come in. Free data has shot locations, not player tracking, so it's a
   shot-by-shot animation, not dots for all ten players. Playback pauses while the page is in the background. */

const CK = new Map(); // game id -> { i, playing, speed, follow, f, timer }
const CK_SPEEDS = [1, 10, 30, 60];
const ckReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function ckPlays(d) {
  return (d.plays || []).map(p => {
    const c = p.coordinate, shot = !!p.shootingPlay && c && c.x >= -2 && c.x <= 52 && c.y > -5 && c.y < 95 && !/free throw/i.test(p.type?.text || p.text || '');
    return { id: p.id, text: p.text || p.type?.text || '', team: p.team?.id, per: p.period?.number || 1, clock: p.clock?.displayValue || '', a: +p.awayScore || 0, h: +p.homeScore || 0, made: !!p.scoringPlay, three: p.pointsAttempted === 3 || /three point/i.test(p.text || ''), shot, x: c?.x, y: c?.y, ft: /free throw/i.test(p.type?.text || p.text || ''), t: elapsedAt(p.period?.number || 1, p.clock?.displayValue) };
  });
}
// half-court coordinates (feet from the basket's sideline/baseline) to the full court: away shoots left, home right
function ckXY(s, away) { const u = Math.max(0.5, Math.min(49.5, s.x)) * 10, v = Math.max(0.5, Math.min(46.5, s.y + 4.25)) * 10; return away ? [v, u] : [940 - v, 500 - u]; }
const CK_COURT = () => `<rect x="0" y="0" width="940" height="500" rx="8" fill="var(--court)"/>
  <g transform="matrix(0 1 1 0 0 0)">${COURT.replace(/<rect x="0" y="0" width="500" height="470"[^>]*\/>/, '')}</g>
  <g transform="matrix(0 -1 -1 0 940 500)">${COURT.replace(/<rect x="0" y="0" width="500" height="470"[^>]*\/>/, '')}</g>
  <g fill="none" stroke="var(--court-line)" stroke-width="2"><line x1="470" y1="1" x2="470" y2="499"/><circle cx="470" cy="250" r="60"/><circle cx="470" cy="250" r="20"/></g>`;

function ckMark(s, i, sides, anim) {
  const away = s.team === sides[0].id, [X, Y] = ckXY(s, away), c = away ? 'var(--sideA)' : 'var(--sideB)';
  const tip = `${s.text} · ${perLabel(s.per)} ${s.clock}`;
  return s.made
    ? `<g class="ck-m${anim ? ' pop' : ''}" data-ci="${i}" transform="translate(${X} ${Y})"><title>${esc(tip)}</title><circle r="8" fill="${c}" stroke="var(--court)" stroke-width="1.8"/></g>`
    : `<g class="ck-m miss${anim ? ' pop' : ''}" data-ci="${i}" transform="translate(${X} ${Y})"><title>${esc(tip)}</title><circle r="9" fill="transparent"/><path d="M-5.5 -5.5L5.5 5.5M5.5 -5.5L-5.5 5.5" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/></g>`;
}

function drawChalk(pane, d, sides, gid, live) {
  const P = ckPlays(d);
  let st = CK.get(gid);
  if (!st) { st = { i: live ? P.length : 0, playing: !live, speed: 30, follow: !!live, f: 'all', timer: null }; CK.set(gid, st); }
  clearTimeout(st.timer);
  if (!P.length) { pane.innerHTML = `<div class="empty" style="border:0"><b>No plays yet</b>The court comes alive at tip-off.</div>`; return; }
  const was = st.shown ?? st.i;
  if (st.follow && live) st.i = P.length; else st.i = Math.min(st.i, P.length);
  const pers = [...new Set(P.map(p => p.per))];
  const btn = (k, t) => `<button data-ckf="${k}" aria-pressed="${st.f === k}">${esc(t)}</button>`;
  pane.innerHTML = `<div class="ck">
    <div class="ck-bug"><span class="ck-t a"><i style="background:var(--sideA)"></i>${esc(sides[0].abbr)}<b data-cka>0</b></span><span class="ck-clk"><b data-ckc>Q1 12:00</b><small data-ckl>${live ? (st.follow ? '<em class="ck-live">Live</em>' : '<button class="link-btn" data-cklive>Back to live</button>') : 'Replay'}</small></span><span class="ck-t h"><b data-ckh>0</b>${esc(sides[1].abbr)}<i style="background:var(--sideB)"></i></span></div>
    <svg class="ck-court" viewBox="0 0 940 500" role="img" aria-label="Court: shots so far"><g>${CK_COURT()}</g><g class="ck-marks"></g><g class="ck-last"></g></svg>
    <div class="ck-ctl">
      <button class="ck-b" data-ckrs aria-label="Back to the start" title="Back to the start"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 6v12l-9-6z"/></svg></button>
      <button class="ck-b ck-pp" data-ckpp aria-label="${st.playing ? 'Pause' : 'Play'}">${st.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>'}</button>
      <input class="ck-scrub" type="range" min="0" max="${P.length}" value="${st.i}" data-ckscrub aria-label="Move through the game">
      <div class="ck-sp" role="group" aria-label="Speed">${CK_SPEEDS.map(s => `<button data-cksp="${s}" aria-pressed="${st.speed === s}">${s}×</button>`).join('')}</div>
    </div>
    <div class="ck-row">
      <div class="ck-pers">${pers.map(n => `<button class="chip sm" data-ckper="${n}">${esc(perLabel(n))}</button>`).join('')}</div>
      <div class="seg ck-f"><span class="knob"></span>${btn('all', 'Both')}${btn(sides[0].id, sides[0].abbr)}${btn(sides[1].id, sides[1].abbr)}</div>
    </div>
    <div class="ck-stats" data-ckstats></div>
    <ol class="ck-log" data-cklog aria-label="Play by play, newest first"></ol>
    <p class="odds-note">${esc(sides[0].abbr)} shoots at the left basket, ${esc(sides[1].abbr)} at the right, all game. Free throws show in the log, not on the court. ${live ? 'Live: new plays animate in as they happen.' : ''}</p>
  </div>`;
  const root = $('.ck', pane);
  requestAnimationFrame(() => placeKnob($('.ck-f', root)));

  const marks = $('.ck-marks', root), last = $('.ck-last', root), log = $('[data-cklog]', root), scrub = $('[data-ckscrub]', root);
  const vis = s => st.f === 'all' || s.team === st.f;
  const logRow = (p, i) => `<li data-ckseek="${i + 1}" class="${p.made && !p.ft ? 'mk' : ''}${p.team === sides[0].id ? ' a' : p.team === sides[1].id ? ' h' : ''}"><span>${esc(perLabel(p.per))} ${esc(p.clock)}</span><b>${esc(p.text)}</b><em>${p.a}–${p.h}</em></li>`;
  const stats = () => {
    const sh = P.slice(0, st.i).filter(p => p.shot);
    const line = tid => { const s = sh.filter(p => p.team === tid), m = s.filter(p => p.made).length, t3 = s.filter(p => p.three), m3 = t3.filter(p => p.made).length; return `<span><i style="background:var(--side${tid === sides[0].id ? 'A' : 'B'})"></i><b>${esc(tid === sides[0].id ? sides[0].abbr : sides[1].abbr)}</b> FG ${m}/${s.length}${s.length ? ` (${Math.round(m / s.length * 100)}%)` : ''} · 3PT ${m3}/${t3.length}</span>`; };
    $('[data-ckstats]', root).innerHTML = line(sides[0].id) + line(sides[1].id);
  };
  const bug = () => {
    const p = P[st.i - 1] || { a: 0, h: 0, per: 1, clock: RULES.halves ? '20:00' : '12:00' };
    $('[data-cka]', root).textContent = p.a; $('[data-ckh]', root).textContent = p.h; $('[data-ckc]', root).textContent = `${perLabel(p.per)} ${p.clock}`;
    scrub.value = st.i;
    const sp = P[st.i - 1];
    last.innerHTML = sp?.shot && vis(sp) ? (() => { const [X, Y] = ckXY(sp, sp.team === sides[0].id); return `<circle class="ck-ring" cx="${X}" cy="${Y}" r="16"/>`; })() : '';
  };
  // full redraw up to st.i (after a seek or filter change); anim = which markers pop in
  const full = (animFrom = Infinity) => {
    marks.innerHTML = P.slice(0, st.i).map((p, i) => (p.shot && vis(p) ? ckMark(p, i, sides, i >= animFrom && !ckReduced()) : '')).join('');
    log.innerHTML = P.slice(Math.max(0, st.i - 60), st.i).map((p, k) => logRow(p, Math.max(0, st.i - 60) + k)).reverse().join('');
    bug(); stats();
  };
  // one step forward (playback): add the marker and the log row instead of redrawing
  const step = () => {
    const p = P[st.i]; st.i++;
    if (p.shot && vis(p)) marks.insertAdjacentHTML('beforeend', ckMark(p, st.i - 1, sides, !ckReduced()));
    log.insertAdjacentHTML('afterbegin', logRow(p, st.i - 1)); if (log.children.length > 60) log.lastElementChild.remove();
    bug(); if (p.shot) stats();
  };
  const setPlay = on => { st.playing = on; const b = $('[data-ckpp]', root); b.setAttribute('aria-label', on ? 'Pause' : 'Play'); b.innerHTML = on ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>'; if (on) tick(); else clearTimeout(st.timer); };
  // the clock: time between plays follows the game clock at the chosen speed (long gaps like timeouts are capped)
  const tick = () => {
    clearTimeout(st.timer);
    if (!root.isConnected) return;
    if (document.hidden) { st.timer = setTimeout(tick, 1000); return; } // paused in the background
    if (st.i >= P.length) { if (!live) setPlay(false); st.shown = st.i; return; }
    const prev = P[st.i - 1], next = P[st.i];
    const dt = prev ? Math.max(0, next.t - prev.t) : 0;
    const wait = st.catchUp ? 260 : Math.max(90, Math.min(1500, dt * 1000 / st.speed));
    st.timer = setTimeout(() => { if (!root.isConnected) return; step(); st.shown = st.i; if (st.i >= P.length) st.catchUp = false; tick(); }, wait);
  };

  // live: new plays since the last refresh animate in one by one; otherwise draw what's shown so far
  if (live && st.follow && was < P.length && was > 0 && P.length - was <= 25) { st.i = was; full(); st.catchUp = true; st.playing = true; tick(); }
  else { full(); st.shown = st.i; if (st.playing && st.i < P.length) tick(); }

  root.onclick = e => {
    const pp = e.target.closest('[data-ckpp]'); if (pp) { if (st.i >= P.length) { st.i = 0; full(); } st.follow = false; setPlay(!st.playing); return; }
    if (e.target.closest('[data-ckrs]')) { st.follow = false; st.i = 0; full(); setPlay(true); return; }
    if (e.target.closest('[data-cklive]')) { st.follow = true; st.i = P.length; full(); setPlay(false); $('[data-ckl]', root).innerHTML = '<em class="ck-live">Live</em>'; return; }
    const sp = e.target.closest('[data-cksp]'); if (sp) { st.speed = +sp.dataset.cksp; $$('[data-cksp]', root).forEach(b => b.setAttribute('aria-pressed', b === sp)); if (st.playing) tick(); return; }
    const f = e.target.closest('[data-ckf]'); if (f) { st.f = f.dataset.ckf; $$('[data-ckf]', root).forEach(b => b.setAttribute('aria-pressed', b === f)); placeKnob($('.ck-f', root)); full(); return; }
    const pr = e.target.closest('[data-ckper]'); if (pr) { const n = +pr.dataset.ckper; st.follow = false; st.i = P.findIndex(p => p.per === n); if (st.i < 0) st.i = 0; full(); setPlay(true); if (live) $('[data-ckl]', root).innerHTML = '<button class="link-btn" data-cklive>Back to live</button>'; return; }
    const sk = e.target.closest('[data-ckseek]'); if (sk) { st.follow = false; st.i = +sk.dataset.ckseek; full(); setPlay(false); if (live) $('[data-ckl]', root).innerHTML = '<button class="link-btn" data-cklive>Back to live</button>'; }
  };
  scrub.oninput = () => { st.follow = false; st.i = +scrub.value; clearTimeout(st.timer); st.playing = false; full(); setPlay(false); if (live && st.i < P.length) $('[data-ckl]', root).innerHTML = '<button class="link-btn" data-cklive>Back to live</button>'; };
}
