/* ---------------- settings ---------------- */
const PREFS = [
  ['odds', 'Betting odds', 'Moneylines, spreads, totals and line movement on score cards and in games'],
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
        <button class="set-row" data-settheme><span><b>Theme</b><small>${document.documentElement.dataset.theme ? (isDark() ? 'Dark' : 'Light') + ' (chosen by you)' : 'Matches your device'}</small></span><em class="set-val">${isDark() ? 'Dark' : 'Light'}</em></button>
        ${document.documentElement.dataset.theme ? `<button class="set-row" data-themeauto><span><b>Match my device</b><small>Follow your phone or computer's light/dark setting</small></span><em class="set-val">Use</em></button>` : ''}
      </div></section>
      <section><h3 class="set-h">Your data</h3><p class="set-note">Saved only in this browser, separately for ${LGN} and ${IS_W ? 'NBA' : 'WNBA'} mode.</p><div class="set-list">
        <button class="set-row" data-clearpicks><span><b>Reset Pick'em</b><small>Clear your picks, record and streak</small></span><em class="set-val danger">Reset</em></button>
        <button class="set-row" data-clearwatch><span><b>Clear your players</b><small>Remove everyone from the strip on Scores</small></span><em class="set-val danger">Clear</em></button>
      </div></section>
    </div>`;
  };
  draw();
  sheet.body.addEventListener('click', e => {
    const r = e.target.closest('[data-pref]');
    if (r) { const on = r.getAttribute('aria-checked') !== 'true'; setPref(r.dataset.pref, on); r.setAttribute('aria-checked', on); return; }
    if (e.target.closest('[data-settheme]')) { $('#themeBtn').click(); setTimeout(draw, 700); return; }
    if (e.target.closest('[data-themeauto]')) { delete document.documentElement.dataset.theme; lsSet('fc-theme', null); $$('img.lg').forEach(i => { i.src = logoSrc(i.dataset.ab, +i.dataset.s); }); draw(); return; }
    const cp = e.target.closest('[data-clearpicks]');
    if (cp) { if (cp.dataset.armed) { resetPicks(); toast("Pick'em reset"); delete cp.dataset.armed; $('.set-val', cp).textContent = 'Done'; } else { cp.dataset.armed = '1'; $('.set-val', cp).textContent = 'Tap again'; } return; }
    const cw = e.target.closest('[data-clearwatch]');
    if (cw) { if (cw.dataset.armed) { clearWatch(); toast('Your players cleared'); delete cw.dataset.armed; $('.set-val', cw).textContent = 'Done'; } else { cw.dataset.armed = '1'; $('.set-val', cw).textContent = 'Tap again'; } }
  });
}
