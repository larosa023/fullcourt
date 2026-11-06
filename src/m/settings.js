/* ---------------- settings ---------------- */
const PREFS = [
  ['odds', 'Betting odds', 'Moneylines, spreads, totals and line movement on score cards and in games'],
  ['bets', 'My bets', 'Bets you track from Ask, on the Scores page'],
  ['watch', 'Your players', 'The strip of starred players at the top of Scores'],
  ['perf', 'Top scorers', 'The scorers and players-to-watch strip under the games'],
  ['picks', "Pick'em", 'Pick the winner of each game and track your record'],
  ['out', "Who's out", 'Injury report for the day on the Scores page'],
  ['ticker', 'Score ticker', 'The scrolling scores under the header on a computer'],
];
const readPrefs = () => { try { return JSON.parse(localStorage.getItem('fc-prefs') || '{}') || {}; } catch (e) { return {}; } };
function setPref(k, on) {
  const p = readPrefs();
  if (on) delete p[k]; else p[k] = false;
  lsSet('fc-prefs', Object.keys(p).length ? JSON.stringify(p) : null);
  document.documentElement.classList.toggle('no-' + k, !on);
}
function openSettings() {
  const sheet = openSheet('Settings');
  const draw = () => {
    const p = readPrefs();
    sheet.body.innerHTML = `<div class="set">
      <section><h3 class="set-h">Show on the site</h3><div class="set-list">
        ${PREFS.map(([k, t, d]) => { const on = p[k] !== false; return `<button class="set-row" role="switch" aria-checked="${on}" data-pref="${k}"><span><b>${esc(t)}</b><small>${esc(d)}</small></span><i class="sw"><i></i></i></button>`; }).join('')}
      </div></section>
      <section><h3 class="set-h">Appearance</h3><div class="set-list">
        <button class="set-row" data-settheme><span><b>Theme</b><small>Colors for the whole site</small></span><em class="set-val">${esc((THEMES.find(t => t[0] === themeId()) || THEMES[0])[1])}</em></button>
      </div></section>
      ${IS_APP ? `<section><h3 class="set-h">Windows app</h3><div class="set-list">
        <button class="set-row" data-appcheck><span><b>Check for updates</b><small class="set-appv">Fullcourt for Windows</small></span><em class="set-val">Check</em></button>
        <a class="set-row" href="https://github.com/larosa023/fullcourt/releases" target="_blank" rel="noopener"><span><b>Release notes</b><small>Every version on GitHub</small></span><em class="set-val">Open</em></a>
      </div><p class="set-note">The app also checks by itself each time it opens and every 6 hours.</p></section>` : ''}
      <section><h3 class="set-h">Your data</h3><p class="set-note">Saved only in this browser, separately for each league (NBA, WNBA and college).</p><div class="set-list">
        <button class="set-row" data-clearpicks><span><b>Reset Pick'em</b><small>Clear your picks, record and streak</small></span><em class="set-val danger">Reset</em></button>
        <button class="set-row" data-clearwatch><span><b>Clear your players</b><small>Remove everyone from the strip on Scores</small></span><em class="set-val danger">Clear</em></button>
      </div></section>
    </div>`;
  };
  draw();
  const showVer = () => { const el = $('.set-appv', sheet.body); if (el) window.__TAURI__.app.getVersion().then(v => { el.textContent = `You're on version ${v}`; }).catch(() => {}); };
  if (IS_APP) showVer();
  sheet.body.addEventListener('click', async e => {
    const ac = e.target.closest('[data-appcheck]');
    if (ac) {
      const val = $('.set-val', ac), go = $('#appUpd [data-appupd]');
      // an update was found: this row runs it (the banner at the bottom shows the download progress)
      if (ac.dataset.ready && go) { go.click(); val.textContent = 'Updating…'; return; }
      if (ac.dataset.busy) return; ac.dataset.busy = '1'; val.textContent = 'Checking…'; val.classList.remove('danger');
      const r = await appUpdateCheck(true); delete ac.dataset.busy;
      if (r?.st === 'newer') { ac.dataset.ready = '1'; $('b', ac).textContent = `Fullcourt ${r.v} is out`; val.textContent = 'Update now'; }
      else if (r?.st === 'current') val.textContent = 'Up to date';
      else { val.textContent = "Couldn't check"; val.classList.add('danger'); toast("Couldn't reach GitHub. Try again in a minute"); }
      return;
    }
    const r = e.target.closest('[data-pref]');
    if (r) { const on = r.getAttribute('aria-checked') !== 'true'; setPref(r.dataset.pref, on); r.setAttribute('aria-checked', on); return; }
    const st = e.target.closest('[data-settheme]');
    if (st) { openThemeMenu(st); const t = setInterval(() => { if (!$('.theme-menu')) { clearInterval(t); if (sheet.alive) draw(); } }, 300); return; }
    const cp = e.target.closest('[data-clearpicks]');
    if (cp) { if (cp.dataset.armed) { resetPicks(); toast("Pick'em reset"); delete cp.dataset.armed; $('.set-val', cp).textContent = 'Done'; } else { cp.dataset.armed = '1'; $('.set-val', cp).textContent = 'Tap again'; } return; }
    const cw = e.target.closest('[data-clearwatch]');
    if (cw) { if (cw.dataset.armed) { clearWatch(); toast('Your players cleared'); delete cw.dataset.armed; $('.set-val', cw).textContent = 'Done'; } else { cw.dataset.armed = '1'; $('.set-val', cw).textContent = 'Tap again'; } }
  });
}
