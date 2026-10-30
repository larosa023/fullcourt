/* ---------------- mini scoreboard (floating window, Chrome / Edge) ---------------- */
// the stand-alone small window used by other browsers (this same page with ?mini=1)
function startMiniPage() {
  document.title = 'Fullcourt mini';
  document.body.classList.add('pip');
  document.body.insertAdjacentHTML('beforeend', `<div class="pip-root"><header class="pip-h"><b>FULL<i>COURT</i></b><span id="pipSt"></span></header><div class="pip-list" id="pipList"><div class="sk" style="height:58px"></div><div class="sk" style="height:58px"></div></div></div>`);
  document.addEventListener('click', e => {
    const g = e.target.closest('.pip-root [data-game]'); if (!g) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const o = window.opener;
    if (o && !o.closed) { try { o.postMessage({ fcGame: g.dataset.game }, location.origin); o.focus(); return; } catch (err) {} }
    window.open(`${location.pathname}?game=${encodeURIComponent(g.dataset.game)}`, '_blank');
  }, true);
  const tick = async () => {
    S.today = etToday();
    let games = [];
    try { games = await scoreboardOn(S.today); } catch (e) {}
    renderMini2(games, document);
    setTimeout(tick, games.some(g => g.state === 'in') ? 15000 : 60000);
  };
  tick();
}
// a game tapped in the small window opens here
window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.fcGame) openGame(String(e.data.fcGame)); });
const canPip = 'documentPictureInPicture' in window;
S.pip = null;
async function openMini() {
  if (S.pip && !S.pip.closed) { S.pip.focus(); return; }
  const games = S.date === S.today ? S.games : [];
  const H = Math.min(560, 92 + Math.max(3, games.length || 6) * 58);
  let w = null, onTop = false;
  // Chrome / Edge: a floating window that stays above other apps
  if (canPip) { try { w = await documentPictureInPicture.requestWindow({ width: 300, height: H }); onTop = true; } catch (e) { w = null; } }
  // anywhere else (or if that's blocked): a small regular window
  if (!w) {
    // reuse the window if it's already open; plain size features (no "popup" flag) keep Firefox-based browsers from adding a blank tab
    if (S.miniWin && !S.miniWin.closed) { try { S.miniWin.focus(); } catch (e) {} return; }
    const pop = window.open(`${location.pathname}?mini=1`, '_blank', `width=300,height=${H},left=${Math.max(0, (screen.availWidth || 1200) - 340)},top=80,menubar=no,toolbar=no,location=no,status=no`);
    if (!pop) { toast('Allow pop-ups for this site to open the mini scoreboard'); return; }
    S.miniWin = pop;
    try { pop.focus(); } catch (e) {}
    return;
  }
  S.pip = w; S.pipOnTop = onTop;
  const doc = w.document;
  doc.documentElement.lang = 'en';
  for (const a of ['data-theme', 'data-league']) { const v = document.documentElement.getAttribute(a); if (v) doc.documentElement.setAttribute(a, v); }
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(n => { const c = n.cloneNode(true); if (n.href) c.href = n.href; doc.head.append(c); });
  doc.title = 'Fullcourt';
  doc.body.className = 'pip';
  doc.body.innerHTML = `<header class="pip-h"><b>FULL<i>COURT</i></b><span id="pipSt"></span></header><div class="pip-list" id="pipList"></div>`;
  doc.body.addEventListener('click', e => {
    const g = e.target.closest('[data-game]'); if (!g) return;
    try { window.focus(); } catch (err) {}
    openGame(g.dataset.game);
  });
  w.addEventListener('pagehide', () => { S.pip = null; clearTimeout(S.pipTimer); });
  pipTick();
}
async function pipTick() {
  clearTimeout(S.pipTimer);
  if (!S.pip || S.pip.closed) { S.pip = null; return; }
  let games = S.games;
  if (S.date !== S.today || Date.now() - S.lastUpdate > 20000) { try { games = await scoreboardOn(S.today); } catch (e) { games = S.date === S.today ? S.games : []; } }
  renderMini2(games);
  const live = games.some(g => g.state === 'in');
  S.pipTimer = setTimeout(pipTick, live ? 15000 : 60000);
}
function renderMini2(games, doc = S.pip?.document) {
  if (!doc) return;
  const list = [...games].sort((a, b) => (isFavGame(b) - isFavGame(a)) || ((a.state === 'in' ? 0 : a.state === 'pre' ? 1 : 2) - (b.state === 'in' ? 0 : b.state === 'pre' ? 1 : 2)) || (new Date(a.date) - new Date(b.date)));
  const live = games.filter(g => g.state === 'in').length;
  doc.getElementById('pipSt').innerHTML = live ? `<span class="dot on"></span>${live} live` : esc(fmtDay(S.today, { weekday: 'short', month: 'short', day: 'numeric' }));
  doc.getElementById('pipList').innerHTML = list.length ? list.map(g => {
    const row = s => `<span class="pp-t${g.state === 'post' && !s.winner ? ' lose' : ''}">${logo(s.abbr, 40)}<b>${esc(s.abbr)}</b><span>${g.state === 'pre' ? '' : esc(s.score)}</span></span>`;
    return `<button class="pp-g${g.state === 'in' ? ' live' : ''}${isFavGame(g) ? ' fav' : ''}" data-game="${g.id}">${row(g.away)}${row(g.home)}<span class="pp-s">${g.state === 'pre' ? esc(fmtTime(g.date).replace(' ET', '')) : esc(statusText(g))}${g.state === 'in' ? toPill(S.sit[g.id], id => id === g.home.id ? g.home.abbr : g.away.abbr) : ''}</span></button>`;
  }).join('') : `<p class="pip-none">No games today</p>`;
}



