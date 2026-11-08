/* Bracketology (college Rankings → Bracketology): the projected NCAA Tournament field and bracket, every team's odds
   of making it and of each round, the bubble, and a sheet per team. march.json is built twice a day on GitHub
   (tools/march.mjs, march-data branch) from 10,000 simulated seasons; "Sim the tournament" plays the projected bracket
   once on the page with the same engine (m/marchengine.js). */

const MARCH_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/march-data/march.json';
let marchP = null;
function loadMarch() {
  if (marchP) return marchP;
  let c = null; try { c = JSON.parse(localStorage.getItem('fc-march') || 'null'); } catch (e) {}
  if (c?.d && Date.now() - c.at < 2 * 3600e3) return (marchP = Promise.resolve(c.d));
  marchP = fetch(`${MARCH_URL}?t=${Math.floor(Date.now() / 1800e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { try { localStorage.setItem('fc-march', JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; })
    .catch(e => { marchP = null; if (c?.d) return c.d; throw e; });
  return marchP;
}
const MM = { view: 'bracket', conf: 'all', q: '' };
const mmKey = () => LGK === 'ncaaw' ? 'ncaaw' : 'ncaam';
const mp = p => p == null ? '–' : p >= 99.95 ? '>99.9%' : p <= 0 ? '–' : p < 0.05 ? '<0.1%' : (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
const mmSg = x => x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
const mmDate = d => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const REGION = { ncaam: ['East', 'South', 'Midwest', 'West'], ncaaw: ['Regional 1', 'Regional 2', 'Regional 3', 'Regional 4'] };
const mmColor = t => t?.color ? `#${t.color}` : 'var(--accent)';
const mmSeason = X => `${X.season - 1}-${String(X.season).slice(2)}`;

async function renderMarch(wrap, ctrl) {
  const key = mmKey();
  if (!wrap.querySelector('.mm')) wrap.innerHTML = ctrl + '<div class="sk" style="height:520px;border-radius:16px"></div>';
  let D; try { D = await loadMarch(); } catch (e) { wrap.innerHTML = ctrl + '<div class="empty"><b>Bracketology didn\'t load</b>The data isn\'t reachable right now.<br><button class="btn" data-retry="standings">Try again</button></div>'; return; }
  const X = D[key];
  if (!X) { wrap.innerHTML = ctrl + '<div class="empty"><b>No projections yet</b></div>'; return; }
  if (!X.runs) { wrap.innerHTML = ctrl + `<div class="mm"><div class="empty"><b>${X.sel && new Date() >= new Date(X.sel) ? 'The field is set' : 'Projections start with the season'}</b>${X.sel && new Date() >= new Date(X.sel) ? 'Selection Sunday has passed: the real bracket is under Bracket, with live scores.' : 'Bracketology fills in once games tip off in November.'}</div></div>`; return; }
  const T = X.teams, byId = Object.fromEntries(T.map(t => [t.id, t])), confName = i => X.confs[i]?.name || '';
  const views = [['bracket', 'Projected bracket'], ['odds', 'Odds'], ['bubble', 'Bubble']];
  const head = `<div class="mm-top"><div><span class="eyebrow">${esc(mmSeason(X))} · Selection Sunday ${X.sel ? esc(mmDate(X.sel)) : 'in March'}</span><h2>${key === 'ncaaw' ? 'Women\'s' : 'Men\'s'} Bracketology</h2></div><div class="mm-acts"><button class="btn" data-mmsim>Sim the tournament</button></div></div>
    <div class="cs-ctrl"><div class="seg" id="mmSeg"><span class="knob"></span>${views.map(([k, l]) => `<button data-mmview="${k}" aria-pressed="${MM.view === k}">${l}</button>`).join('')}</div>
    ${MM.view === 'odds' ? `<select class="cs-sel" data-mmconf aria-label="Conference"><option value="all">All conferences</option>${X.confs.map((c, i) => `<option value="${i}"${String(MM.conf) === String(i) ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><input class="cs-q" type="search" placeholder="Find a school" value="${esc(MM.q)}" data-mmq aria-label="Find a school">` : ''}</div>`;
  const team = (id, cls = '') => { const t = byId[id]; return t ? `<button class="mm-t ${cls}" data-mmteam="${t.id}">${logo(t.id, 40)}<b>${esc(t.short)}</b><small>${t.w}-${t.l}</small></button>` : ''; };
  let body = '';
  if (MM.view === 'bracket') {
    const B = X.bracket, auto = new Set(B.autos), last4 = new Set(B.last4);
    const slot = (s, seed) => {
      if (!s) return '';
      if (s.ff != null) { const [a, b] = B.pairs[s.ff]; return `<div class="mm-slot ff"><span class="mm-sd">${seed}</span><div class="mm-ffp">${team(a)}${team(b)}</div><em class="mm-tag">First Four</em></div>`; }
      const t = byId[s.t]; return `<div class="mm-slot"><span class="mm-sd">${seed}</span>${team(s.t)}<em class="mm-mk" title="Chance to make the tournament">${auto.has(s.t) ? '<i class="mm-aq" title="Projected conference champion">AQ</i>' : ''}${mp(t?.o?.make)}</em></div>`;
    };
    const POS2 = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    body = `<div class="mm-regions">${B.regions.map((R, i) => `<section class="mm-reg"><h3>${esc(REGION[key][i])}<span>${R[1]?.t ? esc(byId[R[1].t]?.short || '') : ''} the top seed</span></h3>
      ${[0, 2, 4, 6, 8, 10, 12, 14].map(k => `<div class="mm-game">${slot(R[POS2[k]], POS2[k])}${slot(R[POS2[k + 1]], POS2[k + 1])}</div>`).join('')}</section>`).join('')}</div>
      <p class="mm-note">Final Four: ${esc(REGION[key][0])} vs ${esc(REGION[key][3])}, ${esc(REGION[key][1])} vs ${esc(REGION[key][2])}. AQ = projected conference champion (automatic bid). The percentage is each team's chance to make the field. Seeds follow the committee's S-curve; it doesn't move teams for geography or to keep conference rivals apart.</p>`;
  } else if (MM.view === 'odds') {
    const q = MM.q.trim().toLowerCase();
    const list = T.filter(t => t.o && (MM.conf === 'all' || String(t.conf) === String(MM.conf)) && (!q || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q)))
      .sort((a, b) => b.o.title - a.o.title || b.o.make - a.o.make || b.r - a.r).slice(0, MM.conf === 'all' && !q ? 120 : 400);
    const cols = [['make', 'Make it'], ['auto', 'Conf. title'], ['r32', '2nd round'], ['s16', 'Sweet 16'], ['e8', 'Elite 8'], ['f4', 'Final Four'], ['fin', 'Title game'], ['title', 'Champion']];
    const seeds = t => { const s = t.o.seeds || [], mx = Math.max(1, ...s); return `<span class="mm-seeds">${s.map((p, i) => `<i style="height:${Math.max(2, p / mx * 20).toFixed(1)}px;opacity:${p < 0.5 ? .25 : 1}" title="${i + 1} seed: ${mp(p)}"></i>`).join('')}</span>`; };
    body = `<div class="tbl-wrap drag-x" data-drag><table class="std mm-tbl"><thead><tr><th>Team</th><th>Now</th><th>Projected</th><th title="Points per game better than an average Division I team">Rating</th><th>Avg seed</th><th>Seed range</th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${list.map(t => `<tr data-mmteam="${t.id}"><td><div class="team-cell"><span class="seed">${t.rk}</span>${logo(t.id, 56)}<b>${esc(t.short)}</b><span class="ab">${esc(t.abbr)}</span><span class="mm-cf">${esc(X.confs[t.conf]?.abbr || '')}</span></div></td>
        <td>${t.w}-${t.l}</td><td><b>${Math.round(t.o.w)}-${Math.round(t.o.l)}</b></td><td class="${t.r >= 0 ? 'strk-w' : 'strk-l'}">${mmSg(t.r)}</td><td>${t.o.seed ? t.o.seed.toFixed(1) : '–'}</td><td>${seeds(t)}</td>
        ${cols.map(([c]) => `<td class="sx-p" style="--h:${Math.min(1, (t.o[c] || 0) / 100).toFixed(3)}"><span>${mp(t.o[c])}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="mm-note">Rank = Fullcourt's rating rank. Projected = the average record over the simulated seasons, through the conference tournament. ${MM.conf === 'all' && !q ? 'Showing the 120 likeliest champions; pick a conference or search to see any team.' : ''}</p>`;
  } else {
    const B = X.bracket, row = (id, k) => { const t = byId[id]; return t ? `<li data-mmteam="${t.id}"><span class="mm-n">${k}</span>${logo(t.id, 40)}<b>${esc(t.short)}</b><small>${esc(confName(t.conf))} · ${t.w}-${t.l}</small><em>${mp(t.o.make)}</em></li>` : ''; };
    const confs = X.confs.map((c, i) => ({ c, i, top: T.filter(t => t.conf === i && t.o).sort((a, b) => b.o.auto - a.o.auto).slice(0, 3) })).filter(x => x.top.length);
    body = `<div class="mm-bub">
      <section><h3>Last four in</h3><ol class="mm-list in">${B.last4.map((id, k) => row(id, k + 1)).join('')}</ol></section>
      <section><h3>First four out</h3><ol class="mm-list out">${B.out4.map((id, k) => row(id, k + 1)).join('')}</ol></section>
      <section><h3>Next four out</h3><ol class="mm-list out">${B.next4.map((id, k) => row(id, k + 1)).join('')}</ol></section>
    </div>
    <section class="mm-sec"><h3>Conference favorites <span>chance to win the conference tournament (the automatic bid)</span></h3><div class="mm-confs">${confs.map(({ c, top }) => `<div class="mm-conf"><h4>${esc(c.name)}</h4>${top.map(t => `<button data-mmteam="${t.id}">${logo(t.id, 40)}<b>${esc(t.short)}</b><em>${mp(t.o.auto)}</em></button>`).join('')}</div>`).join('')}</div></section>
    <p class="mm-note">The bubble is ordered by the average resume score in the simulations (wins above what a bubble team would manage against the same schedule, plus team strength). The percentage is the chance to make the field.</p>`;
  }
  wrap.innerHTML = `${ctrl}<div class="mm">${head}${body}
    <p class="mm-note">${X.runs.toLocaleString()} simulated seasons, updated ${esc(new Date(X.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}: the rest of the regular season, every conference tournament, Selection Sunday (68 teams: the conference champions plus the best at-large resumes) and the tournament. Ratings come from this season's results with the opponent and home court taken out, pulled toward last season while the sample is small${key === 'ncaam' ? ', blended with ESPN\'s Basketball Power Index' : ''}. Tap any team for its odds.</p></div>`;
  $$('.seg', wrap).forEach(s => requestAnimationFrame(() => placeKnob(s)));
  $$('.tbl-wrap', wrap).forEach(dragScroll);
  if (!wrap._mm) {
    wrap._mm = true;
    wrap.addEventListener('click', e => {
      if (!wrap.querySelector('.mm')) return;
      const v = e.target.closest('[data-mmview]'); if (v) { MM.view = v.dataset.mmview; renderMarch(wrap, ctrlOf(wrap)); return; }
      const t = e.target.closest('[data-mmteam]'); if (t) { e.stopPropagation(); openMarchTeam(t.dataset.mmteam); return; }
      if (e.target.closest('[data-mmsim]')) simTourney();
    }, true);
    wrap.addEventListener('change', e => { if (e.target.matches('[data-mmconf]')) { MM.conf = e.target.value; renderMarch(wrap, ctrlOf(wrap)); } });
    wrap.addEventListener('input', e => { if (!e.target.matches('[data-mmq]')) return; MM.q = e.target.value; clearTimeout(wrap._mq); wrap._mq = setTimeout(async () => { const pos = e.target.selectionStart; await renderMarch(wrap, ctrlOf(wrap)); const q = $('[data-mmq]', wrap); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) {} } }, 250); });
  }
  wrap._ctrl = ctrl;
}
const ctrlOf = wrap => wrap._ctrl || '';

function mmChart(X, id, tc) {
  const pts = Object.entries(X.hist || {}).map(([d, v]) => [d, v[id]]).filter(x => x[1]);
  if (pts.length < 2) return '<p class="mm-note">The chart fills in day by day: one point per day from here on.</p>';
  const W = 640, H = 160, L = 34, B = 22, n = pts.length, x = i => L + i / (n - 1) * (W - L - 8), y = p => 8 + (1 - p / 100) * (H - B - 8);
  const line = k => pts.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v[k] || 0).toFixed(1)}`).join('');
  return `<svg class="sx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Odds over time"><g class="gr">${[0, 25, 50, 75, 100].map(p => `<line x1="${L}" x2="${W - 8}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('')}</g>
    <g class="ax">${[0, n - 1].map(i => `<text x="${x(i)}" y="${H - 4}" text-anchor="${i ? 'end' : 'start'}">${esc(mmDate(pts[i][0]))}</text>`).join('')}</g>
    <path d="${line(0)}" fill="none" stroke="${tc}" stroke-width="2.5"/><path d="${line(1)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4"/></svg>
    <div class="sx-key"><span><i style="background:${tc}"></i>Make the field</span><span><i class="dash"></i>Win it all</span></div>`;
}

async function openMarchTeam(id) {
  const key = mmKey(); let D; try { D = await loadMarch(); } catch (e) { return; }
  const X = D[key], t = X?.teams.find(x => x.id === id); if (!t?.o) return;
  const o = t.o, tc = mmColor(t), mx = Math.max(1, ...o.seeds), cf = X.confs[t.conf];
  const sheet = openSheet(t.name); sheet.el.classList.add('sx-sheet');
  const best = o.seeds.map((p, i) => [p, i + 1]).sort((a, b) => b[0] - a[0])[0];
  sheet.body.innerHTML = `
    <div class="sx-th" style="--tc:${tc}">${logo(t.id, 160, 'lg sx-cl')}<div><span class="eyebrow">${esc(cf?.name || '')} · ${t.w}-${t.l} now</span><h2>${mp(o.make)} to make the field</h2>
      <p>${o.make >= 1 ? `Average seed when in: ${o.seed?.toFixed(1)}. Most likely: ${best[0] >= 0.5 ? `a ${best[1]} seed (${mp(best[0])})` : '–'}. ` : ''}Projected ${Math.round(o.w)}-${Math.round(o.l)}.</p></div></div>
    <div class="sx-chips">${[['Conf. title', o.auto], ['First Four', o.ff], ['2nd round', o.r32], ['Sweet 16', o.s16], ['Elite 8', o.e8], ['Final Four', o.f4], ['Title game', o.fin], ['Champion', o.title]].map(([k, p]) => `<div><b>${mp(p)}</b><span>${k}</span></div>`).join('')}</div>
    ${o.make >= 0.5 ? `<section class="sx-sec"><h3>Seed, if they make it</h3><div class="sx-dist mm-dist">${o.seeds.map((p, i) => `<div class="${i < 4 ? 'po' : ''}"><em>${p >= 0.5 ? mp(p) : ''}</em><i style="height:${Math.max(2, p / mx * 100).toFixed(1)}%"></i><span>${i + 1}</span></div>`).join('')}</div><p class="sx-note">Share of all simulated seasons that ended with this seed${key === 'ncaaw' ? '. Top-4 seeds (green) host the first two rounds' : ''}.</p></section>` : ''}
    <section class="sx-sec"><h3>Odds over time</h3>${mmChart(X, id, tc)}</section>
    <section class="sx-sec"><h3>Why this number</h3><div class="sx-why">
      ${t.bpi != null ? `<div><span>ESPN Basketball Power Index</span><b>${mmSg(t.bpi)}</b></div>` : ''}
      <div><span>Fullcourt's adjusted margin<small>This season's games against Division I teams, with the opponent and home court taken out, pulled toward last season while the sample is small</small></span><b>${mmSg(t.own)}</b></div>
      <div><span>Last season<small>The same measure over all of last season</small></span><b>${mmSg(t.last)}</b></div>
      <div class="tot"><span>Rating<small>Points per game better than an average Division I team, on a neutral floor</small></span><b>${mmSg(t.r)} <small>#${t.rk} of ${X.teams.length}</small></b></div>
    </div>
    ${t.espn?.seed != null ? `<p class="sx-note">For comparison, ESPN's projection: a ${Math.round(t.espn.seed)} seed, Final Four ${mp(t.espn.f4)}, title ${mp(t.espn.title)}.</p>` : ''}</section>
    <div class="sx-acts sx-again"><button class="btn ghost" data-team="${t.id}">Team page</button></div>`;
}

async function simTourney() {
  const key = mmKey();
  const sheet = openSheet('Simulated tournament'); sheet.el.classList.add('sx-sheet');
  let D, E; try { [D, E] = await Promise.all([loadMarch(), lazy('marchengine')]); } catch (e) { sheet.body.innerHTML = '<div class="empty"><b>The simulator didn\'t load</b></div>'; return; }
  const X = D[key], T = X.teams, ix = Object.fromEntries(T.map((t, i) => [t.id, i])), Bx = X.bracket;
  const B = { regions: Bx.regions.map(R => Object.fromEntries(Object.entries(R).map(([s, v]) => [s, v.ff != null ? { ff: v.ff } : { t: ix[v.t] }]))), pairs: Bx.pairs.map(p => p.map(id => ix[id])) };
  const nrand = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
  const draw = () => {
    const e = T.map(t => (t.sig || 2) * 0.8 * nrand()), R = E.mTourney(B, i => T[i].r + e[i], X.sd || 11, key === 'ncaaw', true), G = R.games;
    const t = i => T[i], nm = i => esc(t(i).short), ch = R.champ, fin = G.find(g => g.rd === 6), lo = fin.w === fin.a ? fin.b : fin.a;
    const gl = g => { const l = g.w === g.a ? g.b : g.a, sw = R.seedOf.get(g.w), sl = R.seedOf.get(l); return `<div class="sx-ser${sw != null && sl != null && sw > sl + 3 ? ' mm-upset' : ''}"><span class="w">${logo(t(g.w).id, 40)}${sw != null ? `<i class="mm-s">${sw}</i>` : ''}<b>${nm(g.w)}</b></span><em>def.</em><span>${logo(t(l).id, 40)}${sl != null ? `<i class="mm-s">${sl}</i>` : ''}${nm(l)}</span></div>`; };
    const RD = ['First Four', 'First round', 'Second round', 'Sweet 16', 'Elite Eight', 'Final Four', 'Championship'];
    const upsets = G.filter(g => g.rd >= 1 && R.seedOf.get(g.w) - R.seedOf.get(g.w === g.a ? g.b : g.a) >= 4).length;
    sheet.body.innerHTML = `
      <div class="sx-champ" style="--tc:${mmColor(t(ch))}">${logo(t(ch).id, 160, 'lg sx-cl')}<div><span class="eyebrow">Champions, in this simulation · ${R.seedOf.get(ch)} seed</span><h2>${esc(t(ch).name)}</h2><p>Beat ${esc(t(lo).short)} in the title game. ${upsets} upset${upsets === 1 ? '' : 's'} by a team seeded 4 or more lines lower.</p></div></div>
      <div class="sx-acts sx-again"><button class="btn" data-mmre>Sim it again</button></div>
      ${[6, 5, 4, 3, 2, 1, 0].map(rd => { const gs = G.filter(g => g.rd === rd); return gs.length ? `<section class="sx-sec"><h3>${RD[rd]}</h3><div class="sx-grid">${gs.map(gl).join('')}</div></section>` : ''; }).join('')}
      <p class="sx-note">One random run of the projected bracket, with every team's rating nudged a little each time. Every run is different.</p>`;
  };
  draw();
  sheet.body.addEventListener('click', e => { if (e.target.closest('[data-mmre]')) { draw(); sheet.body.scrollTop = 0; } });
}
