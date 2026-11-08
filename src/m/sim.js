/* Playoff odds and the season simulator (Standings → Odds). sim.json (tools/sim.mjs, sim-data branch, every 3 hours)
   holds every team's rating and how it was built (ESPN's BPI, Fullcourt's opponent-adjusted margin, injuries), the games
   left, and the odds from 20,000 simulated seasons, plus a daily history. This module shows them, opens a sheet per
   team (seed range, odds over time, the next game's swing, why the number is what it is), and plays one season on
   the page with the same engine (m/simengine.js) for "Sim the season". */

const SIM_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/sim-data/sim.json';
let simP = null;
function loadSim() {
  if (simP) return simP;
  let c = null; try { c = JSON.parse(localStorage.getItem('fc-sim2') || 'null'); } catch (e) {}
  if (c?.d && Date.now() - c.at < 90 * 60e3) return (simP = Promise.resolve(c.d));
  simP = fetch(`${SIM_URL}?t=${Math.floor(Date.now() / 600e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { try { localStorage.setItem('fc-sim2', JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; })
    .catch(e => { simP = null; if (c?.d) return c.d; throw e; });
  return simP;
}
const sxLg = () => LGK === 'wnba' ? 'wnba' : 'nba';
// the odds: from GitHub's 20,000-season run; if the file doesn't have them yet, run 3,000 seasons here
async function simData(lg) {
  const D = await loadSim(), X = D[lg]; if (!X) throw new Error('no sim data');
  if (!X.odds && (X.games.length || X.teams.some(t => t.pad))) {
    const E = await lazy('simengine'), runs = 3000, P = E.simPrep(X), A = E.simRun(P, runs), p = c => c / runs * 100;
    X.odds = { runs, local: true, teams: Object.fromEntries(X.teams.map((t, i) => [t.abbr, { w: A.w[i] / runs, lo: null, hi: null, po: p(A.po[i]), t6: p(A.direct[i]), pin: p(A.pin[i]), top: p(A.top[i]), div: p(A.div[i]), r2: p(A.r2[i]), cf: p(A.cf[i]), fin: p(A.fin[i]), title: p(A.title[i]), seeds: Array.from(A.seed[i], p) }])) };
  }
  return { D, X };
}
// projected records for the Mock Draft's "Projected" order: { abbr: { w, l, conf } }
async function projectedRecords(lg = 'nba') {
  const { X } = await simData(lg);
  return Object.fromEntries(X.teams.map(t => { const w = X.odds?.teams[t.abbr]?.w ?? t.w; return [t.abbr, { w, l: X.total - w, conf: t.conf }]; }));
}

// a one-line summary for the team page: projected record and playoff / title chances, opening the team's odds page
async function teamOddsStrip(abbr) {
  const { X } = await simData(sxLg()); const t = X.teams.find(x => x.abbr === abbr), o = X.odds?.teams?.[abbr]; if (!t || !o) return '';
  return `<button class="sx-strip" data-sxopen="${esc(abbr)}"><span><em>Projected</em><b>${Math.round(o.w)}-${X.total - Math.round(o.w)}</b></span><span><em>Playoffs</em><b>${fp(o.po)}</b></span><span><em>${X.confs.length === 2 ? 'Top 6' : '#1 seed'}</em><b>${fp(X.confs.length === 2 ? o.t6 : o.top)}</b></span><span><em>Title</em><b>${fp(o.title)}</b></span><i aria-hidden="true">›</i></button>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-sxopen]'); if (b) openTeamOdds(b.dataset.sxopen); });
const fp = p => p == null ? '–' : p >= 99.95 ? '>99.9%' : p <= 0 ? '–' : p < 0.05 ? '<0.1%' : (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
const sgn = (x, d = 1) => x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;
const seasonLabel = (X, lg) => lg === 'nba' ? `${X.season - 1}-${String(X.season).slice(2)}` : String(X.season);
const shortDate = d => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const SM = { conf: 0 };

async function renderOdds(wrap) {
  const lg = sxLg();
  if (!wrap.querySelector('.sx')) wrap.innerHTML = '<div class="sk" style="height:520px"></div>';
  wrap.classList.remove('tbl-wrap', 'drag-x'); delete wrap.dataset.drag;
  let R; try { R = await simData(lg); } catch (e) { wrap.innerHTML = `<div class="empty" style="border:0"><b>Playoff odds didn't load</b>The simulator's data isn't reachable right now.<br><button class="btn" data-retry="standings">Try again</button></div>`; return; }
  if (S.stdConf !== 5) return;
  const { D, X } = R, T = X.teams, O = X.odds?.teams, nba = X.confs.length === 2;
  if (!O) { wrap.innerHTML = `<div class="sx"><div class="empty" style="border:0"><b>The ${esc(seasonLabel(X, lg))} season is over</b>Playoff odds and the season simulator come back when the next ${lg.toUpperCase()} season tips off.</div></div>`; return; }
  const played = T.reduce((s, t) => s + t.w + t.l, 0) / T.length;
  const rankR = Object.fromEntries(T.slice().sort((a, b) => b.r - a.r).map((t, i) => [t.abbr, i + 1]));
  const favs = T.slice().sort((a, b) => O[b.abbr].title - O[a.abbr].title).slice(0, 6), top = O[favs[0].abbr].title || 1;
  const cols = nba ? [['po', 'Playoffs'], ['t6', 'Top 6'], ['pin', 'Play-In'], ['top', '#1 seed'], ['cf', 'Conf. finals'], ['fin', 'Finals'], ['title', 'Title']] : [['po', 'Playoffs'], ['top', '#1 seed'], ['r2', 'Semis'], ['fin', 'Finals'], ['title', 'Title']];
  const conf = nba ? Math.min(SM.conf, 1) : 0;
  const list = T.filter(t => !nba || t.conf === conf).sort((a, b) => O[b.abbr].w - O[a.abbr].w || O[b.abbr].title - O[a.abbr].title);
  const nSeeds = nba ? 15 : T.length;
  const seedBar = o => { const s = o.seeds || [], mx = Math.max(1, ...s); return `<span class="sx-seeds" title="${esc(s.map((p, i) => p >= 0.5 ? `#${i + 1}: ${fp(p)}` : '').filter(Boolean).join(' · '))}">${Array.from({ length: nSeeds }, (_, i) => `<i class="${nba ? (i < 6 ? 'po' : i < 10 ? 'pi' : '') : i < 8 ? 'po' : ''}" style="height:${Math.max(2, (s[i] || 0) / mx * 22).toFixed(1)}px;opacity:${(s[i] || 0) < 0.5 ? .25 : 1}"></i>`).join('')}</span>`; };
  wrap.innerHTML = `<div class="sx">
    <div class="sx-top">
      <div><span class="eyebrow">${esc(seasonLabel(X, lg))} · ${played < 1 ? 'before tip-off' : `about ${Math.round(played)} games in`}</span><h2>Title odds</h2></div>
      <div class="sx-acts"><button class="btn" data-simone>Sim the season</button></div>
    </div>
    <div class="sx-favs">${favs.map(t => `<button class="sx-fav" data-sxteam="${esc(t.abbr)}" style="--tc:${teamColor(t.id)}">${logo(t.abbr, 80)}<b>${fp(O[t.abbr].title)}</b><span>${esc(t.short || t.abbr)}</span><i style="width:${(O[t.abbr].title / top * 100).toFixed(0)}%"></i></button>`).join('')}</div>
    ${nba ? `<div class="seg sx-conf"><span class="knob"></span>${X.confs.map((c, i) => `<button data-simconf="${i}" aria-pressed="${i === conf}">${c}ern</button>`).join('')}</div>` : ''}
    <div class="tbl-wrap drag-x" data-drag><table class="std sx-tbl"><thead><tr><th>Team</th><th>Now</th><th>Projected</th><th title="Points per game better or worse than an average team">Rating</th><th>Seed range</th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${list.map((t, k) => { const o = O[t.abbr], hurt = (t.inj || []).filter(p => !p.dtd && p.imp >= 1.5); return `<tr data-sxteam="${esc(t.abbr)}" class="${nba && k === 5 ? 'cut' : nba && k === 9 ? 'cut-pi' : !nba && k === 7 ? 'cut' : ''}"><td><div class="team-cell"><span class="seed">${k + 1}</span>${logo(t.abbr, 56)}<b>${esc(t.short || t.name)}</b><span class="ab">${esc(t.abbr)}</span>${hurt.length ? `<span class="sx-hurt" title="${esc(hurt.map(p => p.n).join(', '))} out">+${hurt.length} out</span>` : ''}</div></td>
      <td>${t.w}-${t.l}</td><td class="sx-proj"><b>${Math.round(o.w)}-${X.total - Math.round(o.w)}</b>${o.lo != null ? `<small>${o.lo}–${o.hi} W</small>` : ''}</td><td class="${t.r >= 0 ? 'strk-w' : 'strk-l'}">${sgn(t.r)}<small class="sx-rk">#${rankR[t.abbr]}</small></td><td>${seedBar(o)}</td>
      ${cols.map(([c]) => `<td class="sx-p" style="--h:${Math.min(1, (o[c] || 0) / 100).toFixed(3)}"><span>${fp(o[c])}</span></td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>
    <p class="sx-note">${X.odds.local ? `${X.odds.runs.toLocaleString()} simulated seasons, run on this device.` : `${X.odds.runs.toLocaleString()} simulated seasons, updated ${esc(new Date(X.odds.at || D.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.`} Ratings blend ESPN's Basketball Power Index with Fullcourt's opponent-adjusted scoring margin (recent games count more), credit teams for games their regulars missed, and take injured players out until their expected return. Today's games use the betting line. Standings use the NBA's tiebreakers, then the ${nba ? 'Play-In and ' : ''}playoffs are played out. Tap a team for its seed range, odds over time and what's behind its number.</p>
  </div>`;
  $$('.tbl-wrap', wrap).forEach(dragScroll);
  const sg = $('.sx-conf', wrap); if (sg) requestAnimationFrame(() => placeKnob(sg));
  if (!wrap._sx) {
    wrap._sx = true;
    wrap.addEventListener('click', e => {
      if (S.stdConf !== 5) return;
      const c = e.target.closest('[data-simconf]'); if (c) { SM.conf = +c.dataset.simconf; renderOdds(wrap); return; }
      const t = e.target.closest('[data-sxteam]'); if (t) { e.stopPropagation(); openTeamOdds(t.dataset.sxteam); return; }
      if (e.target.closest('[data-simone]')) simOnce();
    }, true);
  }
}

// a small line chart of playoff and title odds by day
function oddsChart(X, abbr, tc) {
  const pts = Object.entries(X.hist || {}).map(([d, v]) => [d, v[abbr]]).filter(x => x[1]);
  if (pts.length < 2) return `<p class="sx-note">The chart fills in day by day: one point per day from here on.</p>`;
  const W = 640, H = 170, L = 34, B = 22, n = pts.length, x = i => L + i / (n - 1) * (W - L - 8), y = p => 8 + (1 - p / 100) * (H - B - 8);
  const line = k => pts.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v[k]).toFixed(1)}`).join('');
  const ticks = [0, 25, 50, 75, 100].map(p => `<line x1="${L}" x2="${W - 8}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('');
  const lab = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text x="${x(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(shortDate(pts[i][0]))}</text>`).join('');
  return `<svg class="sx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Playoff and title odds over time"><g class="gr">${ticks}</g><g class="ax">${lab}</g>
    <path d="${line(0)}" fill="none" stroke="${tc}" stroke-width="2.5" stroke-linejoin="round"/><path d="${line(1)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/></svg>
    <div class="sx-key"><span><i style="background:${tc}"></i>Playoffs</span><span><i class="dash"></i>Title</span></div>`;
}

async function openTeamOdds(abbr) {
  const lg = sxLg();
  let R; try { R = await simData(lg); } catch (e) { return; }
  const { X } = R, T = X.teams, t = T.find(x => x.abbr === abbr), o = X.odds?.teams?.[abbr]; if (!t || !o) return;
  const sheet = openSheet(t.name); sheet.el.classList.add('sx-sheet');
  const nba = X.confs.length === 2, tc = teamColor(t.id), byA = Object.fromEntries(T.map(x => [x.abbr, x]));
  const rk = T.slice().sort((a, b) => b.r - a.r).findIndex(x => x.abbr === abbr) + 1;
  const sosRk = T.slice().sort((a, b) => b.sos - a.sos).findIndex(x => x.abbr === abbr) + 1;
  const seeds = o.seeds || [], mx = Math.max(1, ...seeds), best = seeds.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0])[0];
  const pr = t.parts || {}, nx = o.next, opp = nx ? byA[nx.opp] : null;
  const injOut = (t.inj || []).filter(p => p.imp >= 0.5);
  sheet.body.innerHTML = `
    <div class="sx-th" style="--tc:${tc}">${logo(t.abbr, 160, 'lg sx-cl')}<div><span class="eyebrow">${esc(seasonLabel(X, lg))} · ${t.w}-${t.l} now</span><h2>Projected ${Math.round(o.w)}-${X.total - Math.round(o.w)}</h2>
      <p>${o.lo != null ? `${o.lo} to ${o.hi} wins in 8 of every 10 simulated seasons. ` : ''}Most likely ${nba ? 'seed' : 'finish'}: ${best ? `#${best[1] + 1} (${fp(best[0])})` : '–'}.</p></div></div>
    <div class="sx-chips">${[['Playoffs', o.po], nba ? ['Top 6', o.t6] : null, nba ? ['Play-In', o.pin] : null, nba ? ['Division', o.div] : null, ['#1 seed', o.top], nba ? ['Conf. finals', o.cf] : ['Semis', o.r2], ['Finals', o.fin], ['Title', o.title]].filter(Boolean).map(([k, p]) => `<div><b>${fp(p)}</b><span>${k}</span></div>`).join('')}</div>
    <section class="sx-sec"><h3>Where they finish</h3><div class="sx-dist">${seeds.slice(0, nba ? 15 : T.length).map((p, i) => `<div class="${nba ? (i < 6 ? 'po' : i < 10 ? 'pi' : '') : i < 8 ? 'po' : ''}"><em>${p >= 0.5 ? fp(p) : ''}</em><i style="height:${Math.max(2, p / mx * 100).toFixed(1)}%"></i><span>${i + 1}</span></div>`).join('')}</div>
      <p class="sx-note">${nba ? 'Seed in the conference. Green: straight into the playoffs (1-6). Gray: the Play-In (7-10).' : 'Finish in the league. Green: the playoffs (top 8).'}</p></section>
    ${nx && opp ? `<section class="sx-sec"><h3>Next game</h3><div class="sx-next">
      <div class="sx-ng">${logo(opp.abbr, 64)}<span><b>${nx.home ? 'vs' : 'at'} ${esc(opp.short || opp.name)}</b><small>${esc(shortDate(nx.d))}${nx.line != null ? ` · line: ${esc(t.abbr)} ${sgn(nx.home ? nx.line : -nx.line, 1).replace('−', '-')}` : ''}</small></span><em>${fp(nx.p)}<small>to win</small></em></div>
      <div class="sx-sw"><div><span>With a win</span><b>${fp(nx.win.po)}</b><small>playoffs · title ${fp(nx.win.title)}</small></div><div><span>With a loss</span><b>${fp(nx.loss.po)}</b><small>playoffs · title ${fp(nx.loss.title)}</small></div></div>
    </div></section>` : ''}
    <section class="sx-sec"><h3>Odds over time</h3>${oddsChart(X, abbr, tc)}</section>
    <section class="sx-sec"><h3>Why this number</h3><div class="sx-why">
      <div><span>ESPN Basketball Power Index</span><b>${sgn(pr.bpi)}</b></div>
      <div><span>Fullcourt's adjusted margin<small>${sgn(pr.raw)} per game so far, with the opponents and home court taken out, recent games counting more${t.w + t.l < 20 ? `, and pulled toward last season (${sgn(pr.last)})` : ''}</small></span><b>${sgn(pr.adj)}</b></div>
      <div><span>Credit for missing regulars<small>The team's results came without some of its players; they're expected back</small></span><b>${sgn(pr.miss)}</b></div>
      <div class="tot"><span>Rating<small>${Math.round((pr.wb ?? .5) * 100)}% BPI, ${100 - Math.round((pr.wb ?? .5) * 100)}% Fullcourt's margin with the credit, centered on an average team</small></span><b>${sgn(t.r)} <small>#${rk} of ${T.length}</small></b></div>
      <div><span>Schedule left<small>Average opponent rating in the games still to play</small></span><b>${sgn(t.sos)} <small>${sosRk === 1 ? 'hardest' : sosRk === T.length ? 'easiest' : `${ordinal(sosRk)} hardest`}</small></b></div>
    </div>
    ${injOut.length ? `<h4 class="sx-h4">Injured, taken out of the games they'll miss</h4><ul class="sx-inj">${injOut.map(p => `<li><b>${esc(p.n)}</b><span>${p.dtd ? 'day-to-day (next game only, partly)' : p.until ? `out until about ${esc(shortDate(p.until))}` : 'out for the season'}</span><em>${sgn(-p.imp)} pts</em></li>`).join('')}</ul>` : ''}
    ${t.espn ? `<p class="sx-note">For comparison, ESPN's own projection: ${t.espn.w.toFixed(0)} wins, playoffs ${fp(t.espn.po)}, title ${fp(t.espn.title)}.</p>` : ''}
    </section>
    <div class="sx-acts sx-again"><button class="btn ghost" data-team="${t.id}">Team page</button></div>`;
}
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

async function simOnce() {
  const lg = sxLg();
  const sheet = openSheet('Simulated season'); sheet.el.classList.add('sx-sheet');
  let X, E; try { [{ X }, E] = await Promise.all([simData(lg), lazy('simengine')]); } catch (e) { sheet.body.innerHTML = '<div class="empty"><b>The simulator didn\'t load</b></div>'; return; }
  const P = E.simPrep(X), draw = () => {
    const o = E.simSeason(P, true), T = X.teams, nba = P.nba, tot = X.total, w = i => o.w[i];
    const t = i => T[i], rec = i => `${w(i)}-${tot - w(i)}`, nm = i => esc(t(i).short || t(i).abbr);
    const ch = o.champ, fin = o.rounds[o.rounds.length - 1][0], loser = fin.win === fin.hi ? fin.lo : fin.hi, gw = Math.max(fin.a, fin.b), gl = Math.min(fin.a, fin.b);
    const rdName = nba ? ['First round', 'Conference semifinals', 'Conference finals', 'NBA Finals'] : ['First round', 'Semifinals', 'WNBA Finals'];
    const ser = x => { const lo = x.win === x.hi ? x.lo : x.hi; return `<div class="sx-ser"><span class="w">${logo(t(x.win).abbr, 40)}<b>${nm(x.win)}</b></span><em>${Math.max(x.a, x.b)}-${Math.min(x.a, x.b)}</em><span>${logo(t(lo).abbr, 40)}${nm(lo)}</span></div>`; };
    sheet.body.innerHTML = `
      <div class="sx-champ" style="--tc:${teamColor(t(ch).id)}">${logo(t(ch).abbr, 160, 'lg sx-cl')}<div><span class="eyebrow">${esc(seasonLabel(X, lg))} champions, in this simulation</span><h2>${esc(t(ch).name)}</h2><p>Beat the ${esc(t(loser).short || t(loser).name)} ${gw}-${gl} in the Finals after going ${rec(ch)}.</p></div></div>
      <div class="sx-acts sx-again"><button class="btn" data-simre>Sim it again</button></div>
      <section class="sx-sec"><h3>Final standings</h3><div class="sx-cols">${o.seeds.map((s, c) => `<div><h4>${esc(X.confs[c])}${nba ? 'ern' : ''}</h4><ol class="sx-st">${s.map((i, k) => `<li class="${nba ? (k < 6 ? 'po' : k < 10 ? 'pi' : '') : k < 8 ? 'po' : ''}"><span>${k + 1}</span>${logo(t(i).abbr, 40)}<b>${nm(i)}${o.lead.has(i) && nba ? '<sup title="Division winner">d</sup>' : ''}</b><em>${rec(i)}</em><small>${t(i).w}-${t(i).l} now</small></li>`).join('')}</ol></div>`).join('')}</div></section>
      ${o.playin.length ? `<section class="sx-sec"><h3>Play-In</h3><div class="sx-cols">${o.playin.map(p => `<div><h4>${esc(X.confs[p.c])}ern</h4>${p.games.map(([h, a, wn], k) => `<div class="sx-ser"><span class="${wn === h ? 'w' : ''}">${logo(t(h).abbr, 40)}${wn === h ? `<b>${nm(h)}</b>` : nm(h)}</span><em>${['7 v 8', '9 v 10', 'for 8th'][k]}</em><span class="${wn === a ? 'w' : ''}">${logo(t(a).abbr, 40)}${wn === a ? `<b>${nm(a)}</b>` : nm(a)}</span></div>`).join('')}</div>`).join('')}</div></section>` : ''}
      ${o.rounds.map((rs, k) => `<section class="sx-sec"><h3>${rdName[k]}</h3><div class="sx-grid">${rs.map(ser).join('')}</div></section>`).reverse().join('')}
      <p class="sx-note">One random way the rest of the season could go, with the same ratings, injuries and tiebreakers as Playoff Odds. Every run is different.</p>`;
  };
  draw();
  sheet.body.addEventListener('click', e => { if (e.target.closest('[data-simre]')) { draw(); sheet.body.scrollTop = 0; } });
}
