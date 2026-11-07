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
/* export / import: everything you've saved, minus caches the site rebuilds by itself */
const DATA_SKIP = /^fc-(gl\d*:|bk-|pbp-|cids|starts-|cup-|al-|app-skip|bd-signals|legms)/;
function exportData() {
  const data = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('fc-') && !DATA_SKIP.test(k)) data[k] = localStorage.getItem(k); } } catch (e) {}
  return JSON.stringify({ fullcourt: 1, exported: new Date().toISOString(), from: IS_APP ? 'windows app' : location.host, data }, null, 1);
}
function importData(text) {
  let j; try { j = JSON.parse(String(text).trim()); } catch (e) { return { err: "That isn't a Fullcourt export" }; }
  if (!j || j.fullcourt !== 1 || typeof j.data !== 'object') return { err: "That isn't a Fullcourt export" };
  let n = 0; for (const [k, v] of Object.entries(j.data)) if (k.startsWith('fc-') && !DATA_SKIP.test(k) && typeof v === 'string') { lsSet(k, v); n++; }
  return { n, when: j.exported };
}
const dataFileName = () => `fullcourt-data-${new Date().toISOString().slice(0, 10)}.json`;
async function saveDataFile() {
  const text = exportData(), name = dataFileName();
  if (IS_APP && window.__TAURI__.core?.invoke) { try { const where = await window.__TAURI__.core.invoke('save_export', { name, text }); return `Saved to ${where}`; } catch (e) {} }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return `Saved ${name}`;
}
function openImport(sheet) {
  const box = document.createElement('div'); box.className = 'set-imp';
  box.innerHTML = `<p>Choose a Fullcourt export file, or paste the copied text.</p>
    <label class="btn sm set-file">Choose file<input type="file" accept=".json,application/json,text/plain" hidden></label>
    <textarea rows="4" placeholder="…or paste here" aria-label="Paste your Fullcourt data"></textarea>
    <div class="set-imp-a"><button class="btn sm" data-doimp>Import</button><button class="link-btn" data-noimp>Cancel</button></div>`;
  $('[data-dimport]', sheet.body).closest('section').append(box); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const run = text => { const r = importData(text); if (r.err) { toast(r.err); return; } toast(`Imported ${r.n} saved items. Reloading…`); setTimeout(() => location.reload(), 900); };
  $('input', box).onchange = e => { const f = e.target.files?.[0]; if (f) f.text().then(run); };
  box.addEventListener('click', e => { if (e.target.closest('[data-noimp]')) box.remove(); else if (e.target.closest('[data-doimp]')) { const t = $('textarea', box).value; if (t.trim()) run(t); else toast('Paste the copied text or choose a file first'); } });
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
        <button class="set-row" role="switch" aria-checked="${lsGet('fc-app-tray') !== '0'}" data-apptray><span><b>Keep running in the tray</b><small>Closing the window keeps Fullcourt by the clock so bet alerts keep coming. Right-click the tray icon to quit</small></span><i class="sw"><i></i></i></button>
        <button class="set-row" data-openmini><span><b>Mini scoreboard</b><small>A small always-on-top window with today's games and your tracked bets</small></span><em class="set-val">Open</em></button>
        <button class="set-row" data-appcheck><span><b>Check for updates</b><small class="set-appv">Fullcourt for Windows</small></span><em class="set-val">Check</em></button>
        <a class="set-row" href="https://github.com/larosa023/fullcourt/releases" target="_blank" rel="noopener"><span><b>Release notes</b><small>Every version on GitHub</small></span><em class="set-val">Open</em></a>
      </div><p class="set-note">The app also checks by itself when it opens, every 10 minutes while it runs (even in the tray), and when you come back to it.</p></section>` : ''}
      <section><h3 class="set-h">Isle</h3><div class="set-list">
        <button class="set-row" role="switch" aria-checked="${isleOn()}" data-isle><span><b>Connect to Isle</b><small>Isle is a Dynamic Island for Windows. It shows your team's live games and the ones you send with the Show on Isle button in a game, at the top of your screen</small></span><i class="sw"><i></i></i></button>
        <a class="set-row" href="https://github.com/larosa023/Isle/releases/latest" target="_blank" rel="noopener"><span><b>Get Isle</b><small>Free, for Windows 10 and 11</small></span><em class="set-val">Open</em></a>
      </div><p class="set-note">${IS_APP ? 'Talks only to Isle on this PC.' : 'Talks only to Isle on this PC. Your browser may ask to allow access to apps on your device the first time.'}</p></section>
      <section><h3 class="set-h">Your data</h3><p class="set-note">Saved only in this ${IS_APP ? 'app' : 'browser'}, separately for each league (NBA, WNBA and college). Export it to move it between browsers, devices and the Windows app.</p><div class="set-list">
        <button class="set-row" data-dexport><span><b>Export my data</b><small>Tracked bets, stars, favorites, your players, Pick'em and settings, as a file</small></span><em class="set-val">Save</em></button>
        <button class="set-row" data-dcopy><span><b>Copy my data</b><small>The same, as text you can paste into another browser or the Windows app</small></span><em class="set-val">Copy</em></button>
        <button class="set-row" data-dimport><span><b>Import data</b><small>From a Fullcourt export file or copied text. Replaces what's here for anything it includes</small></span><em class="set-val">Import</em></button>
        <button class="set-row" data-clearpicks><span><b>Reset Pick'em</b><small>Clear your picks, record and streak</small></span><em class="set-val danger">Reset</em></button>
        <button class="set-row" data-clearwatch><span><b>Clear your players</b><small>Remove everyone from the strip on Scores</small></span><em class="set-val danger">Clear</em></button>
      </div></section>
    </div>`;
  };
  draw();
  const showVer = () => { const el = $('.set-appv', sheet.body); if (el) window.__TAURI__.app.getVersion().then(v => { el.textContent = `You're on version ${v}`; }).catch(() => {}); };
  if (IS_APP) showVer();
  sheet.body.addEventListener('click', async e => {
    const tr = e.target.closest('[data-apptray]');
    if (tr) { const on = tr.getAttribute('aria-checked') !== 'true'; tr.setAttribute('aria-checked', on); lsSet('fc-app-tray', on ? null : '0'); appCall('set_close_to_tray', { on }).catch(() => {}); return; }
    const il = e.target.closest('[data-isle]');
    if (il) {
      const on = il.getAttribute('aria-checked') !== 'true'; il.setAttribute('aria-checked', on); lsSet('fc-isle', on ? '1' : '0');
      if (on) { const r = await isleSync(true); toast(r ? 'Connected to Isle' : "Couldn't reach Isle. It'll connect when Isle is running"); }
      return;
    }
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
    if (e.target.closest('[data-dexport]')) { toast(await saveDataFile()); return; }
    if (e.target.closest('[data-dcopy]')) { try { await navigator.clipboard.writeText(exportData()); toast('Copied. Paste it under Import data in the other browser or the app'); } catch (x) { toast("Couldn't copy here. Use Export my data instead"); } return; }
    if (e.target.closest('[data-dimport]')) { if (!$('.set-imp', sheet.body)) openImport(sheet); return; }
    const cp = e.target.closest('[data-clearpicks]');
    if (cp) { if (cp.dataset.armed) { resetPicks(); toast("Pick'em reset"); delete cp.dataset.armed; $('.set-val', cp).textContent = 'Done'; } else { cp.dataset.armed = '1'; $('.set-val', cp).textContent = 'Tap again'; } return; }
    const cw = e.target.closest('[data-clearwatch]');
    if (cw) { if (cw.dataset.armed) { clearWatch(); toast('Your players cleared'); delete cw.dataset.armed; $('.set-val', cw).textContent = 'Done'; } else { cw.dataset.armed = '1'; $('.set-val', cw).textContent = 'Tap again'; } }
  });
}
