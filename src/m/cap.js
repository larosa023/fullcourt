/* Capsheet: NBA contracts and the salary cap.
   Data: contracts.json, built weekly on GitHub from Basketball-Reference contract pages + ESPN rosters
   (tools/cap.mjs, branch cap-data). Kept on the device for 12 hours, then refreshed in the background.
   Shape (reused by Deadline): { updated, seasons[6], cap:{cap,tax,apron1,apron2,...}, match:{...},
   players:[{ br, espn, name, team, espnTeam, dead, twoWay, pos, age, sal[6], opt[6] 'P'|'T'|'', ng[6] 0|1|2, gtd, signed, traded, kicker, tradeIn }] } */

const CAP_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/cap-data/contracts.json';
const CAP_LS = 'fc-capdata';
let capP = null;
function loadCap() {
  if (capP) return capP;
  let cached = null; try { cached = JSON.parse(localStorage.getItem(CAP_LS) || 'null'); } catch (e) {}
  const fresh = () => fetch(`${CAP_URL}?t=${Math.floor(Date.now() / 3600e3)}`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => { try { localStorage.setItem(CAP_LS, JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; });
  if (cached?.d && Date.now() - cached.at < 12 * 3600e3) capP = Promise.resolve(capIndex(cached.d));
  else if (cached?.d) { capP = Promise.resolve(capIndex(cached.d)); fresh().then(d => { capP = Promise.resolve(capIndex(d)); }).catch(() => {}); }
  else capP = fresh().then(capIndex).catch(e => { capP = null; throw e; });
  return capP;
}
// teams: current roster (ESPN's team when he moved after the weekly read), dead money, payroll by season
function capIndex(d) {
  if (d._idx) return d;
  const T = {};
  const team = a => (T[a] ||= { abbr: a, roster: [], twoWay: [], dead: [], pay: [0, 0, 0, 0, 0, 0] });
  for (const p of d.players) {
    p.cur = p.dead ? p.team : (p.espnTeam || p.team);
    const t = team(p.cur);
    if (p.dead) t.dead.push(p); else if (p.twoWay) t.twoWay.push(p); else t.roster.push(p);
    if (!p.twoWay) p.sal.forEach((v, i) => { if (v) t.pay[i] += v; });
    p.left = p.sal.reduce((a, v) => a + (v || 0), 0);
    p.yrs = p.sal.filter(v => v).length;
    p.thru = p.yrs ? d.seasons[p.sal.map(v => !!v).lastIndexOf(true)] : null;
  }
  for (const t of Object.values(T)) t.roster.sort((a, b) => (b.sal[0] || 0) - (a.sal[0] || 0));
  d.teams = T; d._idx = true;
  return d;
}
const capStatus = (pay, c) => pay > c.apron2 ? ['a2', 'Over 2nd apron'] : pay > c.apron1 ? ['a1', 'Over 1st apron'] : pay > c.tax ? ['tax', 'Taxpayer'] : pay > c.cap ? ['over', 'Over the cap'] : ['room', 'Under the cap'];
const money = (v, dp) => v == null ? '–' : !v ? '$0' : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(dp ?? (Math.abs(v) >= 1e7 ? 1 : 2))}M` : `$${Math.round(v / 1e3)}K`;
const moneyFull = v => v == null ? '' : '$' + Math.round(v).toLocaleString('en-US');
const signedMoney = v => (v >= 0 ? '+' : '−') + money(Math.abs(v));
const shortSeason = s => s ? `’${s.slice(2, 4)}–${s.slice(5)}` : '';
const optLabel = { P: 'Player option', T: 'Team option' };
function capCell(p, i) {
  const v = p.sal[i]; if (!v) return '<td class="cp-e"></td>';
  const cls = [p.opt[i] === 'P' ? 'po' : p.opt[i] === 'T' ? 'to' : '', p.ng[i] === 1 ? 'ng' : p.ng[i] === 2 ? 'pg' : ''].filter(Boolean).join(' ');
  const tip = [moneyFull(v), optLabel[p.opt[i]], p.ng[i] === 1 ? 'Not guaranteed' : p.ng[i] === 2 ? 'Partially guaranteed' : ''].filter(Boolean).join(' · ');
  return `<td class="${cls}" title="${esc(tip)}">${money(v)}${p.opt[i] ? `<sup>${p.opt[i] === 'P' ? 'PO' : 'TO'}</sup>` : ''}</td>`;
}
// a bar against the cap lines (cap, tax, first and second apron)
function capBar(pay, c, after) {
  // the scale starts at $100M so the gaps between teams and the cap lines are visible
  const lo = 100e6, max = Math.max(c.apron2 * 1.1, pay * 1.03, (after || 0) * 1.03), pc = v => `${(Math.max(0, v - lo) / (max - lo) * 100).toFixed(2)}%`;
  const [k] = capStatus(after ?? pay, c);
  return `<div class="cp-bar ${k}" role="img" aria-label="Payroll ${money(pay)}${after != null ? `, ${money(after)} after the trade` : ''}">
    <i class="cp-fill" style="width:${pc(after ?? pay)}"></i>${after != null && after !== pay ? `<i class="cp-was" style="left:${pc(pay)}"></i>` : ''}
    ${[['cap', c.cap, 'Cap'], ['tax', c.tax, 'Tax'], ['a1', c.apron1, '1st'], ['a2', c.apron2, '2nd']].map(([n, v, l]) => `<b class="cp-ln ${n}" style="left:${pc(v)}"><em>${l}</em></b>`).join('')}
  </div>`;
}

const CS = { tab: 'teams', team: '', q: '', sort: 's0', dir: -1, exp: '', tm: '', n: 120 };
async function renderCap(opts = {}) {
  const root = $('#capBody'); if (!root) return;
  if (opts.tab) CS.tab = opts.tab;
  if (!root._wired) { root._wired = true; wireCap(root); }
  root.innerHTML = `<div class="seg cp-seg" id="capSeg"><span class="knob"></span>${[['teams', 'Teams'], ['players', 'Players'], ['trade', 'Trade machine']].map(([k, t]) => `<button data-captab="${k}" aria-pressed="${CS.tab === k}">${t}</button>`).join('')}</div><div id="capPane"><div class="sk" style="height:420px;border-radius:16px"></div></div>`;
  requestAnimationFrame(() => placeKnob($('#capSeg')));
  if (IS_W || IS_C) { $('#capPane').innerHTML = `<div class="empty"><b>Capsheet is NBA only for now</b><span>WNBA contracts work under different rules. Switch to the NBA to see cap sheets and the trade machine.</span><button class="btn" data-lg="nba">Switch to NBA</button></div>`; return; }
  let d; try { d = await loadCap(); } catch (e) { $('#capPane').innerHTML = `<div class="empty"><b>Contracts didn't load</b><button class="btn" data-capretry>Try again</button></div>`; return; }
  const pane = $('#capPane'); if (!pane) return;
  if (CS.tab === 'trade') { pane.innerHTML = '<div class="sk" style="height:420px;border-radius:16px"></div>'; lazy('trade').then(m => m.renderTrade(pane, d, { money, capStatus, capBar, shortSeason })).catch(() => { pane.innerHTML = `<div class="empty"><b>The trade machine didn't load</b><button class="btn" data-capretry>Try again</button></div>`; }); return; }
  pane.innerHTML = CS.tab === 'players' ? capPlayers(d) : CS.team ? capTeam(d, CS.team) : capLeague(d);
  wireDrag(pane);
}
const capFoot = d => `<p class="cp-src">Contracts from Basketball-Reference and ESPN, updated ${esc(new Date(d.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} (every Monday). Cap lines are the NBA's ${esc(d.cap.season)} figures. Payroll counts dead money from waived players but not two-way contracts or cap holds.</p>`;
const capLegend = `<div class="cp-legend"><span><i class="po"></i>Player option</span><span><i class="to"></i>Team option</span><span><i class="ng"></i>Not guaranteed</span><span><i class="pg"></i>Partly guaranteed</span></div>`;

function capLeague(d) {
  const c = d.cap, rows = Object.values(d.teams).sort((a, b) => b.pay[0] - a.pay[0]);
  return `<div class="cp-lines"><span>Cap <b>${money(c.cap, 1)}</b></span><span>Tax <b>${money(c.tax, 1)}</b></span><span>1st apron <b>${money(c.apron1, 1)}</b></span><span>2nd apron <b>${money(c.apron2, 1)}</b></span><span>Minimum <b>${money(c.min, 1)}</b></span></div>
    <div class="cp-league">${rows.map(t => { const [k, l] = capStatus(t.pay[0], c); const tm = S.teams[Object.keys(S.teams).find(id => S.teams[id].abbr === t.abbr)] || {}; const toTax = c.tax - t.pay[0];
      return `<button class="cp-lrow" data-capteam="${t.abbr}">${logo(t.abbr, 64)}<span class="cp-ln-n"><b>${esc(tm.name || t.abbr)}</b><small>${t.roster.length} players · ${toTax >= 0 ? `${money(toTax)} under the tax` : `${money(-toTax)} over the tax`}</small></span><span class="cp-pay">${money(t.pay[0])}</span><span class="cp-chip ${k}">${l}</span>${capBar(t.pay[0], c)}</button>`; }).join('')}</div>
    ${capFoot(d)}`;
}

function capTeam(d, abbr) {
  const t = d.teams[abbr], c = d.cap; if (!t) return '<div class="empty"><b>No contracts for that team</b></div>';
  const tm = Object.values(S.teams).find(x => x.abbr === abbr) || {};
  const [k, l] = capStatus(t.pay[0], c), pay = t.pay[0];
  const tile = (lab, v, line) => `<div class="cp-tile"><span>${lab}</span><b class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? money(v) : money(-v)}</b><small>${v >= 0 ? 'under' : 'over'} the ${line}</small></div>`;
  const row = p => `<tr data-capp="${esc(p.br)}"><td><button class="cp-p">${p.espn ? face(p.espn, p.name, 'cp-f', 80) : '<span class="cp-f"></span>'}<span><b>${esc(p.name)}</b><small>${esc([p.pos, p.age ? `age ${p.age}` : '', p.thru ? `through ${shortSeason(p.thru)}` : ''].filter(Boolean).join(' · '))}</small></span></button></td>${d.seasons.map((_, i) => capCell(p, i)).join('')}<td class="cp-g">${money(p.gtd)}</td></tr>`;
  const teams = Object.keys(d.teams).sort();
  return `<div class="cp-thead"><button class="link-btn" data-capteam="">← All teams</button><select class="cp-sel" data-capsel aria-label="Team">${teams.map(a => `<option value="${a}"${a === abbr ? ' selected' : ''}>${esc((Object.values(S.teams).find(x => x.abbr === a) || {}).name || a)}</option>`).join('')}</select></div>
    <div class="cp-hero">${logo(abbr, 120)}<div><h2>${esc(tm.name || abbr)}</h2><p><span class="cp-chip ${k}">${l}</span> ${money(pay)} in ${esc(c.season)} · ${t.roster.length} standard contracts${t.twoWay.length ? ` + ${t.twoWay.length} two-way` : ''}</p></div></div>
    ${capBar(pay, c)}
    <div class="cp-tiles">${tile('Cap', c.cap - pay, 'cap')}${tile('Tax', c.tax - pay, 'tax line')}${tile('1st apron', c.apron1 - pay, '1st apron')}${tile('2nd apron', c.apron2 - pay, '2nd apron')}</div>
    ${capLegend}
    <div class="box-wrap drag-x" data-drag><table class="cp-tbl"><thead><tr><th>Player</th>${d.seasons.map(s => `<th>${esc(s)}</th>`).join('')}<th>Guaranteed</th></tr></thead>
      <tbody>${t.roster.map(row).join('')}
      ${t.dead.length ? `<tr class="cp-sub"><td colspan="${d.seasons.length + 2}">Dead money (waived, still paid)</td></tr>${t.dead.map(row).join('')}` : ''}</tbody>
      <tfoot><tr><td>Team total</td>${t.pay.map(v => `<td>${v ? money(v) : '–'}</td>`).join('')}<td></td></tr></tfoot></table></div>
    ${t.twoWay.length ? `<p class="cp-tw"><b>Two-way:</b> ${t.twoWay.map(p => `<button class="link-btn" data-capp="${esc(p.br)}">${esc(p.name)}</button>`).join(', ')}. Two-way contracts don't count against the cap.</p>` : ''}
    ${capFoot(d)}`;
}

const CP_SORT = { name: p => p.name, team: p => p.cur, s0: p => p.sal[0] || 0, left: p => p.left, yrs: p => p.yrs };
function capPlayers(d) {
  const q = norm(CS.q), seasons = d.seasons;
  let L = d.players.filter(p => !p.dead && !p.twoWay && (!CS.tm || p.cur === CS.tm) && (!q || norm(p.name).includes(q)));
  if (CS.exp) L = L.filter(p => p.thru === CS.exp);
  const f = CP_SORT[CS.sort] || CP_SORT.s0;
  L.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * CS.dir; });
  const th = (k, l) => `<th><button class="cp-sort${CS.sort === k ? ' on' : ''}" data-capsort="${k}">${l}${CS.sort === k ? (CS.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  const teams = Object.keys(d.teams).sort();
  return `<div class="cp-ctrl">
      <input class="cp-q" type="search" data-capq placeholder="Find a player" value="${esc(CS.q)}" autocomplete="off" spellcheck="false" aria-label="Find a player">
      <select class="cp-sel" data-captm aria-label="Team"><option value="">All teams</option>${teams.map(a => `<option value="${a}"${a === CS.tm ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <select class="cp-sel" data-capexp aria-label="Contract ends"><option value="">Any contract end</option>${seasons.map(s => `<option value="${s}"${s === CS.exp ? ' selected' : ''}>Expires after ${esc(s)}</option>`).join('')}</select>
    </div>
    <p class="cp-count">${L.length} contract${L.length === 1 ? '' : 's'}${CS.exp ? ` ending after ${esc(CS.exp)} (free agents in ${+CS.exp.slice(0, 4) + 1})` : ''}</p>
    <div class="box-wrap drag-x" data-drag><table class="cp-tbl cp-ptbl"><thead><tr>${th('name', 'Player')}${th('team', 'Team')}${th('s0', esc(seasons[0]))}${th('left', 'Total left')}${th('yrs', 'Years')}<th>Through</th><th>Options</th></tr></thead>
    <tbody>${L.slice(0, CS.n).map(p => `<tr data-capp="${esc(p.br)}"><td><button class="cp-p">${p.espn ? face(p.espn, p.name, 'cp-f', 80) : '<span class="cp-f"></span>'}<span><b>${esc(p.name)}</b><small>${esc(p.pos || '')}</small></span></button></td><td>${logo(p.cur, 40)} ${esc(p.cur)}</td>${capCell(p, 0)}<td>${money(p.left)}</td><td>${p.yrs}</td><td>${esc(shortSeason(p.thru))}</td><td class="cp-opts">${p.opt.map((o, i) => o ? `<span class="${o === 'P' ? 'po' : 'to'}">${o}O ${esc(shortSeason(seasons[i]))}</span>` : '').join('')}${p.ng.some(x => x) ? '<span class="ng">Non-gtd</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
    ${L.length > CS.n ? `<button class="btn cp-more" data-capmore>Show ${Math.min(120, L.length - CS.n)} more</button>` : ''}
    ${capLegend}${capFoot(d)}`;
}
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

function capContractSheet(d, p) {
  const sheet = openSheet('Contract'); sheet.el.classList.add('cp-sheet');
  const max = Math.max(...p.sal.map(v => v || 0), 1);
  sheet.body.innerHTML = `<div class="cp-ph">${p.espn ? face(p.espn, p.name, 'cp-phf', 260) : ''}<div><span class="eyebrow">${esc(p.cur)}${p.pos ? ` · ${esc(p.pos)}` : ''}${p.age ? ` · age ${p.age}` : ''}</span><h2>${esc(p.name)}</h2>
      <p>${p.twoWay ? 'Two-way contract (doesn\'t count against the cap)' : p.dead ? `Waived: ${esc(p.cur)} still pays this money` : `${money(p.left)} over ${p.yrs} season${p.yrs === 1 ? '' : 's'}${p.thru ? `, through ${esc(p.thru)}` : ''}`}</p></div></div>
    ${p.sal.some(v => v) ? `<div class="cp-years">${d.seasons.map((s, i) => p.sal[i] ? `<div class="cp-yr"><span>${esc(s)}</span><i class="${p.opt[i] === 'P' ? 'po' : p.opt[i] === 'T' ? 'to' : ''}${p.ng[i] ? ' ng' : ''}" style="width:${(p.sal[i] / max * 100).toFixed(1)}%"></i><b>${moneyFull(p.sal[i])}</b><small>${[optLabel[p.opt[i]], p.ng[i] === 1 ? 'Not guaranteed' : p.ng[i] === 2 ? 'Partially guaranteed' : ''].filter(Boolean).join(' · ')}</small></div>` : '').join('')}</div>` : ''}
    <dl class="cp-dl">
      ${p.gtd ? `<dt>Guaranteed</dt><dd>${moneyFull(p.gtd)}${p.left > p.gtd ? ` of ${moneyFull(p.left)}` : ''}</dd>` : ''}
      ${p.signed ? `<dt>Signed</dt><dd>${esc(p.signed)}</dd>` : ''}
      ${p.traded ? `<dt>Acquired</dt><dd>Traded from ${esc(p.traded.from)}, ${esc(p.traded.on)}</dd>` : ''}
      ${p.kicker ? `<dt>Trade kicker</dt><dd>${p.kicker}%${p.tradeIn ? ` (counts as ${moneyFull(p.tradeIn)} for a team trading for him)` : ''}</dd>` : ''}
      ${p.espnTeam ? `<dt>Note</dt><dd>Now with ${esc(p.espnTeam)} (moved since the last weekly contract update)</dd>` : ''}
    </dl>
    ${p.note ? `<details class="cp-notes"><summary>Contract notes</summary><p>${esc(p.note)}</p></details>` : ''}
    <div class="cp-acts">${p.espn ? `<button class="btn" data-player="${esc(p.espn)}">Player page</button>` : ''}<button class="btn ghost" data-capteamgo="${esc(p.cur)}">${esc(p.cur)} cap sheet</button></div>`;
}

function wireCap(root) {
  root.addEventListener('click', async e => {
    const tb = e.target.closest('[data-captab]'); if (tb) { CS.tab = tb.dataset.captab; renderCap(); return; }
    if (e.target.closest('[data-capretry]')) { capP = null; renderCap(); return; }
    const t = e.target.closest('[data-capteam]'); if (t) { CS.team = t.dataset.capteam; renderCap(); window.scrollTo({ top: 0 }); return; }
    const so = e.target.closest('[data-capsort]'); if (so) { const k = so.dataset.capsort; CS.dir = CS.sort === k ? -CS.dir : (k === 'name' || k === 'team' ? 1 : -1); CS.sort = k; renderCap(); return; }
    if (e.target.closest('[data-capmore]')) { CS.n += 120; renderCap(); return; }
    const pr = e.target.closest('[data-capp]'); if (pr && !e.target.closest('[data-player]')) { const d = await loadCap(); const p = d.players.find(x => x.br === pr.dataset.capp); if (p) capContractSheet(d, p); }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-capsel]')) { CS.team = e.target.value; renderCap(); }
    if (e.target.matches('[data-captm]')) { CS.tm = e.target.value; CS.n = 120; renderCap(); }
    if (e.target.matches('[data-capexp]')) { CS.exp = e.target.value; CS.n = 120; renderCap(); }
  });
  let qt; root.addEventListener('input', e => { if (!e.target.matches('[data-capq]')) return; clearTimeout(qt); qt = setTimeout(() => { CS.q = e.target.value; CS.n = 120; const pos = e.target.selectionStart; renderCap().then(() => { const i = $('[data-capq]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }); }, 200); });
}
// the contract sheet's "cap sheet" button works from anywhere (player pages too)
document.addEventListener('click', e => { const g = e.target.closest('[data-capteamgo]'); if (!g) return; CS.tab = 'teams'; CS.team = g.dataset.capteamgo; closeAll(); go('cap'); });

/* Contract card on NBA player pages */
async function drawContract(card, espnId) {
  let d; try { d = await loadCap(); } catch (e) { card.remove(); return; }
  const p = d.players.find(x => x.espn === String(espnId) && !x.dead) || null;
  if (!p || !card.isConnected) { card.remove(); return; }
  const yrs = d.seasons.map((s, i) => p.sal[i] ? `<div class="cp-mini"><span>${esc(shortSeason(s))}</span><b class="${p.opt[i] === 'P' ? 'po' : p.opt[i] === 'T' ? 'to' : ''}${p.ng[i] ? ' ng' : ''}">${money(p.sal[i])}</b><small>${p.opt[i] ? (p.opt[i] === 'P' ? 'Player opt.' : 'Team opt.') : p.ng[i] ? 'Non-gtd' : ''}</small></div>` : '').join('');
  card.innerHTML = `<div class="card-h"><h4>Contract</h4><span class="eyebrow">${p.twoWay ? 'Two-way' : `${money(p.left)} · through ${esc(shortSeason(p.thru))}`}</span></div>
    ${yrs ? `<div class="cp-minis">${yrs}</div>` : '<p class="cp-src">Two-way contract: doesn\'t count against the cap.</p>'}
    ${p.signed ? `<p class="cp-src">Signed ${esc(p.signed)}.</p>` : ''}
    <button class="link-btn" data-capcontract="${esc(p.br)}">Full contract →</button>`;
  card.onclick = e => { if (e.target.closest('[data-capcontract]')) capContractSheet(d, p); };
}
