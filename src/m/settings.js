/* ---------------- settings ---------------- */
const PREFS = [
  ['odds', 'Betting odds', 'Moneylines, spreads, totals and line movement on score cards and in games'],
  ['ticker', 'Score ticker', 'The scrolling scores under the header on a computer'],
];
// the Scores page's sections, in the order you choose (Settings > Scores page); games can't be hidden
const HOME_ROWS = { bets: ['My bets', 'Bets you track from Ask'], watch: ['Your players', 'The strip of players you starred'], games: ['Games', 'The day\'s games'], perf: ['Top performers', 'The day\'s leaders in the stat you pick, under the games'],
  race: ['Conference race', 'The standings beside the games'], picks: ["Pick'em", 'Pick the winner of each game and track your record'], out: ["Who's out", 'The day\'s injury report'] };
const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>', DN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
function homeSection(p) {
  const o = homeOrder();
  const list = (keys, col) => keys.map((k, i) => { const [t, d] = HOME_ROWS[k], on = p[k] !== false; return `<div class="set-row hm-row${on ? '' : ' off'}"><span><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="hm-ctl"><button class="hm-mv" data-hmove="${col}:${k}:-1" aria-label="Move ${esc(t)} up"${i ? '' : ' disabled'}>${UP}</button><button class="hm-mv" data-hmove="${col}:${k}:1" aria-label="Move ${esc(t)} down"${i < keys.length - 1 ? '' : ' disabled'}>${DN}</button>${k === 'games' ? '<i class="sw hm-fix" title="Always shown"><i></i></i>' : `<button class="hm-sw" role="switch" aria-checked="${on}" data-pref="${k}" aria-label="Show ${esc(t)}"><i class="sw"><i></i></i></button>`}</span></div>`; }).join('');
  return `<section><h3 class="set-h">Scores page</h3><p class="set-note hm-sub">Main column</p><div class="set-list">${list(o.main, 'main')}</div><p class="set-note hm-sub">Beside the games${'' }</p><div class="set-list">${list(o.side, 'side')}</div><p class="set-note">Move sections up or down and switch off the ones you don't want. On phones the side panels come after the games.</p></section>`;
}
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
// Data status: the health check that runs every 6 hours on GitHub (tools/health.mjs) — data files, background jobs,
// ESPN's feeds and the three websites.
let healthP = null;
async function drawHealth(sheet) {
  const box = () => $('#setHealth', sheet.body);
  healthP = healthP || fetch(`https://raw.githubusercontent.com/larosa023/fullcourt/health-data/health.json?t=${Math.floor(Date.now() / 600e3)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  const H = await healthP; if (!H) healthP = null;
  const b = box(); if (!b) return;
  if (!H) { b.innerHTML = '<h3 class="set-h">Data status</h3><p class="set-note">The status check isn\'t reachable right now.</p>'; return; }
  const mins = (Date.now() - Date.parse(H.updated)) / 60e3, when = mins < 90 ? `${Math.max(1, Math.round(mins))} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  const G = [['data', 'Data files'], ['espn', 'ESPN feeds'], ['jobs', 'Background jobs'], ['sites', 'Websites']];
  const bad = G.flatMap(([k]) => (H[k] || []).filter(x => !x.ok));
  b.innerHTML = `<h3 class="set-h">Data status</h3><div class="set-list">
    <div class="set-row hl-sum ${bad.length ? 'warn' : 'good'}"><span><b>${bad.length ? `${bad.length} thing${bad.length === 1 ? '' : 's'} need${bad.length === 1 ? 's' : ''} attention` : 'Everything is working'}</b><small>Checked ${esc(when)} · every 6 hours</small></span><i class="hl-dot"></i></div>
    ${G.map(([k, t]) => { const L = H[k] || [], n = L.filter(x => x.ok).length; return L.length ? `<details class="hl-grp"><summary class="set-row"><span><b>${t}</b><small>${n === L.length ? `All ${L.length} OK` : `${L.length - n} of ${L.length} with a problem`}</small></span><i class="hl-dot ${n === L.length ? 'good' : 'warn'}"></i></summary>
      <ul class="hl-list">${L.slice().sort((a, c) => a.ok - c.ok).map(x => `<li class="${x.ok ? '' : 'bad'}"><i class="hl-dot ${x.ok ? 'good' : 'warn'}"></i><span><b>${esc(x.name)}</b><small>${esc(x.note || '')}</small></span></li>`).join('')}</ul></details>` : ''; }).join('')}
  </div><p class="set-note">A check on GitHub looks at Fullcourt's data files, background jobs, the ESPN feeds the site reads and the three websites. When something breaks, it opens an issue on GitHub (which emails the owner) and closes it once things are fixed.</p>`;
}
// Game alerts: the team's alerts are switched on with the bell on its page; here are the extras and a test
function alertsSection() {
  const p = pushPrefs(), team = alertsOn && favId ? S.teams[favId]?.short || 'your team' : '', on = pushOn(), can = canPush();
  const home = matchMedia('(display-mode: standalone)').matches || navigator.standalone, ios = /iPhone|iPad/.test(navigator.userAgent) && !home;
  const note = IS_APP ? 'In the Windows app, alerts come while Fullcourt is running. It keeps running in the tray by the clock.'
    : ios ? 'On iPhone and iPad, alerts work from the Home Screen app: tap Share, then Add to Home Screen, and turn alerts on there (iOS 16.4 or later).'
    : can ? `Alerts reach this device even when Fullcourt is closed${on ? '' : ', once one is switched on'}.` : 'This browser can only show alerts while Fullcourt is open.';
  return `<section><h3 class="set-h">Game alerts</h3><div class="set-list">
    <div class="set-row hm-row"><span><b>Your team</b><small>${team ? `On for the ${esc(team)}: tip-off, overtime, close finishes${on ? ' and the final' : ''}` : 'Off. Pick your team with ☆ on its page, then tap the bell next to it'}</small></span></div>
    ${can ? `<button class="set-row" role="switch" aria-checked="${on && p.want.players}" data-pushx="players"><span><b>Your players</b><small>A 30, 40 or 50-point game, a triple-double, and each one's final line${p.players.length ? ` (${p.players.length} starred)` : '. Star players with ☆ on their pages'}</small></span><i class="sw"><i></i></i></button>
    <button class="set-row" role="switch" aria-checked="${on && p.want.bets}" data-pushx="bets"><span><b>Tracked bets</b><small>A leg that hits or misses, one that's close or an under in danger, and when a parlay cashes</small></span><i class="sw"><i></i></i></button>
    <button class="set-row" role="switch" aria-checked="${p.any}" data-pushany><span><b>Any close finish</b><small>Every game within 5 points in the last 5 minutes, and every overtime, whoever is playing</small></span><i class="sw"><i></i></i></button>` : ''}
    ${on ? '<button class="set-row" data-pushtest><span><b>Send a test alert</b><small>Check that alerts reach this device</small></span><em class="set-val">Send</em></button>' : ''}
  </div><p class="set-note">${note}</p></section>`;
}
function openSettings() {
  const sheet = openSheet('Settings');
  const draw = () => {
    const p = readPrefs();
    sheet.body.innerHTML = `<div class="set">
      ${homeSection(p)}
      <section><h3 class="set-h">Show on the site</h3><div class="set-list">
        ${PREFS.map(([k, t, d]) => { const on = p[k] !== false; return `<button class="set-row" role="switch" aria-checked="${on}" data-pref="${k}"><span><b>${esc(t)}</b><small>${esc(d)}</small></span><i class="sw"><i></i></i></button>`; }).join('')}
      </div></section>
      <section><h3 class="set-h">Appearance</h3><div class="set-list">
        <button class="set-row" data-settheme><span><b>Theme</b><small>Colors for the whole site</small></span><em class="set-val">${esc((THEMES.find(t => t[0] === themeId()) || THEMES[0])[1])}</em></button>
      </div></section>
      ${alertsSection()}
      ${IS_APP ? `<section><h3 class="set-h">Windows app</h3><div class="set-list">
        <button class="set-row" role="switch" aria-checked="${lsGet('fc-app-tray') !== '0'}" data-apptray><span><b>Keep running in the tray</b><small>Closing the window keeps Fullcourt by the clock so bet alerts keep coming. Right-click the tray icon to quit</small></span><i class="sw"><i></i></i></button>
        <button class="set-row" data-openmini><span><b>Mini scoreboard</b><small>A small always-on-top window with today's games and your tracked bets</small></span><em class="set-val">Open</em></button>
        <button class="set-row" data-appcheck><span><b>Check for updates</b><small class="set-appv">Fullcourt for Windows</small></span><em class="set-val">Check</em></button>
        <a class="set-row" href="https://github.com/larosa023/fullcourt/releases" target="_blank" rel="noopener"><span><b>Release notes</b><small>Every version on GitHub</small></span><em class="set-val">Open</em></a>
      </div><p class="set-note">${window.FC_LIVE ? 'Running the newest Fullcourt straight from the web: new features and fixes arrive on their own (when you open the app, or the next time it\'s minimized or in the tray), with no update needed. ' : window.FC_BASE ? 'Running the copy built into the app (it couldn\'t reach the newest one when it opened). ' : ''}App updates are only for the Windows side (the window, tray and mini scoreboard). The app checks for those by itself when it opens, every 10 minutes while it runs (even in the tray), and when you come back to it.</p></section>` : ''}
      <section><h3 class="set-h">Isle</h3><div class="set-list">
        <button class="set-row" role="switch" aria-checked="${isleOn()}" data-isle><span><b>Connect to Isle</b><small>Isle is a Dynamic Island for Windows. It shows your team's live games and the ones you send with the Show on Isle button in a game, at the top of your screen</small></span><i class="sw"><i></i></i></button>
        <a class="set-row" href="https://github.com/larosa023/Isle/releases/latest" target="_blank" rel="noopener"><span><b>Get Isle</b><small>Free, for Windows 10 and 11</small></span><em class="set-val">Open</em></a>
      </div><p class="set-note">${IS_APP ? 'Talks only to Isle on this PC.' : 'Talks only to Isle on this PC. Your browser may ask to allow access to apps on your device the first time.'}</p></section>
      <section id="setHealth"><h3 class="set-h">Data status</h3><div class="sk" style="height:58px;border-radius:14px"></div></section>
      <section><h3 class="set-h">Your data</h3><p class="set-note">Saved only in this ${IS_APP ? 'app' : 'browser'}, separately for each league (NBA, WNBA and college). Export it to move it between browsers, devices and the Windows app.</p><div class="set-list">
        <button class="set-row" data-dexport><span><b>Export my data</b><small>Tracked bets, stars, favorites, your players, Pick'em and settings, as a file</small></span><em class="set-val">Save</em></button>
        <button class="set-row" data-dcopy><span><b>Copy my data</b><small>The same, as text you can paste into another browser or the Windows app</small></span><em class="set-val">Copy</em></button>
        <button class="set-row" data-dimport><span><b>Import data</b><small>From a Fullcourt export file or copied text. Replaces what's here for anything it includes</small></span><em class="set-val">Import</em></button>
        <button class="set-row" data-clearpicks><span><b>Reset Pick'em</b><small>Clear your picks, record and streak</small></span><em class="set-val danger">Reset</em></button>
        <button class="set-row" data-clearwatch><span><b>Clear your players</b><small>Remove everyone from the strip on Scores</small></span><em class="set-val danger">Clear</em></button>
      </div></section>
    </div>`;
    drawHealth(sheet);
  };
  draw();
  const showVer = () => { const el = $('.set-appv', sheet.body); if (el) window.__TAURI__.app.getVersion().then(v => { el.textContent = `You're on version ${v}`; }).catch(() => {}); };
  if (IS_APP) showVer();
  sheet.body.addEventListener('click', async e => {
    const tr = e.target.closest('[data-apptray]');
    if (tr) { const on = tr.getAttribute('aria-checked') !== 'true'; tr.setAttribute('aria-checked', on); lsSet('fc-app-tray', on ? null : '0'); appCall('set_close_to_tray', { on }).catch(() => {}); return; }
    const px = e.target.closest('[data-pushx]');
    if (px) {
      const what = px.dataset.pushx, on = px.getAttribute('aria-checked') !== 'true';
      if (on && Notification.permission !== 'granted') { let perm = Notification.permission; if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (x) {} } if (perm !== 'granted') { toast('Alerts are blocked for this site in your browser settings'); return; } }
      if (on && !pushOn()) lsSet(`fc-push-${what === 'players' ? 'bets' : 'players'}`, '0'); // first sign-up from here: just the one asked for
      lsSet(`fc-push-${what}`, on ? null : '0');
      const p2 = pushPrefs(); lsSet('fc-push-extra', on || ((p2.want.players || p2.want.bets) && pushOn()) ? '1' : null);
      const ok = await pushSync().catch(() => false);
      if (on && !ok) { lsSet(`fc-push-${what}`, '0'); toast("Couldn't switch alerts on. Try again in a minute"); }
      else toast(on ? (what === 'players' ? 'You\'ll hear about big games from your players' : 'You\'ll get alerts for your tracked bets') : (what === 'players' ? 'Player alerts off' : 'Bet alerts off'));
      draw(); return;
    }
    const pa = e.target.closest('[data-pushany]');
    if (pa) {
      const on = pa.getAttribute('aria-checked') !== 'true';
      if (on && Notification.permission !== 'granted') { let perm = Notification.permission; if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (x) {} } if (perm !== 'granted') { toast('Alerts are blocked for this site in your browser settings'); return; } }
      lsSet('fc-push-any', on ? '1' : null); pa.setAttribute('aria-checked', on);
      const ok = await pushSync().catch(() => false);
      if (on && !ok) { lsSet('fc-push-any', null); pa.setAttribute('aria-checked', false); toast("Couldn't switch alerts on. Try again in a minute"); }
      else toast(on ? 'You\'ll get a heads-up for every close finish' : 'Close-finish alerts off');
      draw(); return;
    }
    const pt = e.target.closest('[data-pushtest]');
    if (pt) {
      const val = $('.set-val', pt); val.textContent = 'Sending…';
      try {
        const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
        const r = sub ? await (await pushPost('test', { endpoint: sub.endpoint })).json() : { error: 'This device isn\'t signed up. Turn alerts off and on again.' };
        val.textContent = r.ok ? 'Sent' : 'Send'; if (!r.ok) toast(r.error || "Couldn't send it");
      } catch (x) { val.textContent = 'Send'; toast("Couldn't reach the alert service"); }
      return;
    }
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
    const hm = e.target.closest('[data-hmove]');
    if (hm) { const [col, k, d] = hm.dataset.hmove.split(':'), o = homeOrder(), l = o[col], i = l.indexOf(k), j = i + +d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; lsSet('fc-home', JSON.stringify(o)); applyHome(); draw(); return; }
    const r = e.target.closest('[data-pref]');
    if (r) { const on = r.getAttribute('aria-checked') !== 'true'; setPref(r.dataset.pref, on); r.setAttribute('aria-checked', on); r.closest('.hm-row')?.classList.toggle('off', !on); return; }
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
