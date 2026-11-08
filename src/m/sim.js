/* Playoff odds and the season simulator (Standings → Odds). sim.json (tools/sim.mjs, sim-data branch, every few hours)
   holds each team's record, a rating (points better than an average team) and every game left. This module plays the rest
   of the season thousands of times in the browser: each game is a coin weighted by the two ratings plus home court, each
   simulated season also nudges every rating a little (we don't know exactly how good anyone is, least of all early),
   then the Play-In and the playoffs are played out. "Sim the season" plays it once and shows what happened. */

const SIM_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/sim-data/sim.json';
const RUNS = 6000;
let simP = null;
function loadSim() {
  if (simP) return simP;
  let c = null; try { c = JSON.parse(localStorage.getItem('fc-sim') || 'null'); } catch (e) {}
  if (c?.d && Date.now() - c.at < 2 * 3600e3) return (simP = Promise.resolve(c.d));
  simP = fetch(`${SIM_URL}?t=${Math.floor(Date.now() / 600e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { try { localStorage.setItem('fc-sim', JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; })
    .catch(e => { simP = null; if (c?.d) return c.d; throw e; });
  return simP;
}

// standard normal: cumulative (Abramowitz & Stegun 7.1.26) and a draw (Box-Muller)
function ncdf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
function nrand() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }

function prep(X) {
  const T = X.teams, ix = Object.fromEntries(T.map((t, i) => [t.id, i])), n = T.length;
  const G = X.games.filter(g => g[0] in ix && g[1] in ix), gh = new Int16Array(G.length), ga = new Int16Array(G.length), gn = new Uint8Array(G.length);
  G.forEach((g, i) => { gh[i] = ix[g[0]]; ga[i] = ix[g[1]]; gn[i] = g[2] ? 1 : 0; });
  const sig = T.map(t => 3.2 * Math.sqrt(12 / (t.w + t.l + 12)));
  return { X, T, n, gh, ga, gn, sig, nba: X.confs.length === 2 };
}

// one season: returns wins, seeds per conference, Play-In and playoff results
function sxSeason(P, keep = false) {
  const { X, T, n, gh, ga, gn, sig } = P, hca = X.hca, sd = X.sd;
  const r = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) { r[i] = T[i].r + sig[i] * nrand(); w[i] = T[i].w; }
  for (let g = 0; g < gh.length; g++) { const h = gh[g], a = ga[g]; if (Math.random() < ncdf((r[h] - r[a] + (gn[g] ? 0 : hca)) / sd)) w[h]++; else w[a]++; }
  for (let i = 0; i < n; i++) for (let k = 0; k < T[i].pad; k++) if (Math.random() < ncdf(r[i] / sd)) w[i]++;
  const tie = Array.from({ length: n }, () => Math.random());
  const order = idx => idx.slice().sort((a, b) => w[b] - w[a] || tie[b] - tie[a]);
  const game = (h, a) => Math.random() < ncdf((r[h] - r[a] + hca) / sd) ? h : a;
  const series = (hi, lo, best) => { const need = (best + 1) / 2, home = best === 7 ? [1, 1, 0, 0, 1, 0, 1] : best === 5 ? [1, 1, 0, 0, 1] : [1, 0, 1]; let a = 0, b = 0, k = 0; while (a < need && b < need) { const h = home[k++]; if (game(h ? hi : lo, h ? lo : hi) === hi) a++; else b++; } return { win: a > b ? hi : lo, lose: a > b ? lo : hi, hi, lo, a, b }; };
  const better = (x, y) => w[x] > w[y] || (w[x] === w[y] && tie[x] > tie[y]) ? [x, y] : [y, x];
  const out = { w, seeds: [], playin: [], rounds: [], champ: -1 };
  if (P.nba) {
    const conf = [0, 1].map(c => order(T.map((t, i) => t.conf === c ? i : -1).filter(i => i >= 0)));
    out.seeds = conf;
    const field = conf.map((s, c) => {
      const g1h = s[6], g1a = s[7], w1 = game(g1h, g1a), l1 = w1 === g1h ? g1a : g1h, w2 = game(s[8], s[9]), w3 = game(l1, w2);
      if (keep) out.playin.push({ c, games: [[g1h, g1a, w1], [s[8], s[9], w2], [l1, w2, w3]] });
      return [s[0], s[1], s[2], s[3], s[4], s[5], w1, w3];
    });
    let cur = field.map(f => [[f[0], f[7]], [f[3], f[4]], [f[2], f[5]], [f[1], f[6]]]);
    const champs = [];
    for (let rd = 0; rd < 3; rd++) {
      const res = cur.map(pairs => pairs.map(([x, y]) => series(x, y, 7)));
      out.rounds.push(res.flat());
      if (rd < 2) cur = res.map(rs => { const nx = []; for (let k = 0; k < rs.length; k += 2) nx.push([rs[k].win, rs[k + 1].win]); return nx; });
      else res.forEach(rs => champs.push(rs[0].win));
      // in a bracket, the better seed keeps home court; seeds are positions in the conference order
      cur = cur.map((pairs, c) => pairs.map(([x, y]) => conf[c].indexOf(x) < conf[c].indexOf(y) ? [x, y] : [y, x]));
    }
    const [hi, lo] = better(champs[0], champs[1]), f = series(hi, lo, 7);
    out.rounds.push([f]); out.champ = f.win;
  } else {
    const s = order(T.map((_, i) => i)); out.seeds = [s];
    let cur = [[s[0], s[7]], [s[3], s[4]], [s[2], s[5]], [s[1], s[6]]];
    for (const best of [3, 7, 7]) {
      const res = cur.map(([x, y]) => series(x, y, best)); out.rounds.push(res);
      if (res.length === 1) { out.champ = res[0].win; break; }
      cur = []; for (let k = 0; k < res.length; k += 2) cur.push(better(res[k].win, res[k + 1].win));
    }
  }
  return out;
}

// many seasons, in slices so the page stays responsive
function runOdds(P, runs = RUNS) {
  const n = P.n, A = { runs, w: new Float64Array(n), seed: Array.from({ length: n }, () => new Uint32Array(16)), top: new Uint32Array(n), direct: new Uint32Array(n), pin: new Uint32Array(n), po: new Uint32Array(n), r2: new Uint32Array(n), cf: new Uint32Array(n), fin: new Uint32Array(n), title: new Uint32Array(n), best: new Uint32Array(n), worst: new Uint32Array(n) };
  return new Promise(res => {
    let done = 0;
    const step = () => {
      const end = Math.min(runs, done + 400);
      for (; done < end; done++) {
        const o = sxSeason(P);
        for (let i = 0; i < n; i++) A.w[i] += o.w[i];
        for (const s of o.seeds) s.forEach((t, k) => { A.seed[t][Math.min(15, k)]++; if (!k) A.top[t]++; if (P.nba) { if (k < 6) A.direct[t]++; else if (k < 10) A.pin[t]++; } });
        const rd = o.rounds; rd[0].forEach(x => { A.po[x.hi]++; A.po[x.lo]++; A.r2[x.win]++; });
        if (rd.length > 2) rd[rd.length - 2].forEach(x => { A.fin[x.win]++; });
        if (P.nba) rd[1].forEach(x => { A.cf[x.win]++; });
        A.title[o.champ]++;
        const all = Array.from({ length: n }, (_, i) => i).sort((a, b) => o.w[b] - o.w[a]); A.best[all[0]]++; A.worst[all[n - 1]]++;
      }
      if (done < runs) setTimeout(step, 0); else res(A);
    };
    step();
  });
}

const oddsCache = {};
async function simOdds(lg) {
  const D = await loadSim(), X = D[lg]; if (!X) throw new Error('no sim data');
  const k = `${lg}:${D.updated}`;
  if (!oddsCache[k]) oddsCache[k] = runOdds(prep(X)).then(A => ({ X, A, updated: D.updated }));
  return oddsCache[k];
}
// projected wins for the Mock Draft's "Projected" order: { abbr: { w, l, conf } }
async function projectedRecords(lg = 'nba') {
  const { X, A } = await simOdds(lg);
  return Object.fromEntries(X.teams.map((t, i) => { const w = A.w[i] / A.runs; return [t.abbr, { w, l: X.total - w, conf: t.conf }]; }));
}

const sxPct = (c, runs) => { const p = c / runs * 100; return p >= 99.95 ? '>99.9' : p < 0.05 ? (c ? '<0.1' : '–') : p >= 10 ? p.toFixed(0) : p.toFixed(1); };
const seasonLabel = (X, lg) => lg === 'nba' ? `${X.season - 1}-${String(X.season).slice(2)}` : String(X.season);
const SM = { conf: 0 };

async function renderOdds(wrap) {
  const lg = LGK === 'wnba' ? 'wnba' : 'nba';
  if (!wrap.querySelector('.sx')) wrap.innerHTML = '<div class="sk" style="height:520px"></div>';
  wrap.classList.remove('tbl-wrap', 'drag-x'); delete wrap.dataset.drag;
  let R; try { R = await simOdds(lg); } catch (e) { wrap.innerHTML = `<div class="empty" style="border:0"><b>Playoff odds didn't load</b>The simulator's data isn't reachable right now.<br><button class="btn" data-retry="standings">Try again</button></div>`; return; }
  if (S.stdConf !== 5) return;
  const { X, A } = R, T = X.teams, runs = A.runs, nba = X.confs.length === 2;
  if (!X.games.length && !T.some(t => t.pad)) { wrap.innerHTML = `<div class="sx"><div class="empty" style="border:0"><b>The ${esc(seasonLabel(X, lg))} season is over</b>Playoff odds and the season simulator come back when the next ${lg.toUpperCase()} season tips off.</div></div>`; return; }
  const played = T.reduce((s, t) => s + t.w + t.l, 0) / T.length;
  const rows = T.map((t, i) => ({ t, i, pw: A.w[i] / runs })).sort((a, b) => A.title[b.i] - A.title[a.i] || b.pw - a.pw);
  const favs = rows.slice(0, 6);
  const heat = (c, max = runs) => { const v = c / max; return `style="--h:${Math.min(1, v).toFixed(3)}"`; };
  const cols = nba ? [['po', 'Playoffs'], ['direct', 'Top 6'], ['pin', 'Play-In'], ['top', '#1 seed'], ['cf', 'Conf. finals'], ['fin', 'Finals'], ['title', 'Title']] : [['po', 'Playoffs'], ['top', '#1 seed'], ['r2', 'Semis'], ['fin', 'Finals'], ['title', 'Title']];
  const table = list => `<div class="tbl-wrap drag-x" data-drag><table class="std sx-tbl"><thead><tr><th>Team</th><th>Now</th><th>Projected</th><th title="Points per game better or worse than an average team">Rating</th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${list.sort((a, b) => b.pw - a.pw || A.title[b.i] - A.title[a.i]).map((x, k) => `<tr data-team="${x.t.id}" class="${nba && k === 5 ? 'cut' : nba && k === 9 ? 'cut-pi' : !nba && k === 7 ? 'cut' : ''}"><td><div class="team-cell"><span class="seed">${k + 1}</span>${logo(x.t.abbr, 56)}<b>${esc(x.t.short || x.t.name)}</b><span class="ab">${esc(x.t.abbr)}</span></div></td>
      <td>${x.t.w}-${x.t.l}</td><td><b>${Math.round(x.pw)}-${X.total - Math.round(x.pw)}</b></td><td class="${x.t.r >= 0 ? 'strk-w' : 'strk-l'}">${x.t.r > 0 ? '+' : ''}${x.t.r.toFixed(1)}</td>
      ${cols.map(([k2]) => `<td class="sx-p" ${heat(A[k2][x.i])}><span>${sxPct(A[k2][x.i], runs)}${/^[<>]?\d/.test(sxPct(A[k2][x.i], runs)) ? '%' : ''}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  const conf = nba ? Math.min(SM.conf, 1) : 0;
  wrap.innerHTML = `<div class="sx">
    <div class="sx-top">
      <div><span class="eyebrow">${esc(seasonLabel(X, lg))} · ${played < 1 ? 'before tip-off' : `about ${Math.round(played)} games in`}</span><h2>Title odds</h2></div>
      <div class="sx-acts"><button class="btn" data-simone>Sim the season</button><button class="btn ghost" data-simagain>Run the odds again</button></div>
    </div>
    <div class="sx-favs">${favs.map(x => `<button class="sx-fav" data-team="${x.t.id}" style="--tc:${teamColor(x.t.id)}">${logo(x.t.abbr, 80)}<b>${sxPct(A.title[x.i], runs)}%</b><span>${esc(x.t.short || x.t.abbr)}</span><i style="width:${(A.title[x.i] / Math.max(1, A.title[favs[0].i]) * 100).toFixed(0)}%"></i></button>`).join('')}</div>
    ${nba ? `<div class="seg sx-conf"><span class="knob"></span>${X.confs.map((c, i) => `<button data-simconf="${i}" aria-pressed="${i === conf}">${c}ern</button>`).join('')}</div>` : ''}
    ${table(rows.filter(x => !nba || x.t.conf === conf))}
    <p class="sx-note">${runs.toLocaleString()} simulated seasons of the ${X.games.length.toLocaleString()} games left${T.some(t => t.pad) ? ' (plus NBA Cup knockout games not scheduled yet, played against an average team)' : ''}, then the ${nba ? 'Play-In and ' : ''}playoffs. Each game is weighted by the two teams' ratings and home court. Ratings are scoring margin per game, this season blended with last season's while the sample is small, and each simulated season nudges them a little since nobody's true level is known. Ties are broken by coin flip, not the league's tiebreakers. Updated ${esc(new Date(R.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.</p>
  </div>`;
  $$('.tbl-wrap', wrap).forEach(dragScroll);
  const sg = $('.sx-conf', wrap); if (sg) requestAnimationFrame(() => placeKnob(sg));
  if (!wrap._sx) {
    wrap._sx = true;
    wrap.addEventListener('click', e => {
      if (S.stdConf !== 5) return;
      const c = e.target.closest('[data-simconf]'); if (c) { SM.conf = +c.dataset.simconf; renderOdds(wrap); return; }
      if (e.target.closest('[data-simagain]')) { const lg2 = LGK === 'wnba' ? 'wnba' : 'nba'; Object.keys(oddsCache).filter(k => k.startsWith(lg2 + ':')).forEach(k => delete oddsCache[k]); wrap.innerHTML = '<div class="sx"><div class="sk" style="height:520px"></div></div>'; renderOdds(wrap); return; }
      if (e.target.closest('[data-simone]')) simOnce();
    });
  }
}

async function simOnce() {
  const lg = LGK === 'wnba' ? 'wnba' : 'nba';
  const sheet = openSheet('Simulated season'); sheet.el.classList.add('sx-sheet');
  let D; try { D = await loadSim(); } catch (e) { sheet.body.innerHTML = '<div class="empty"><b>The simulator didn\'t load</b></div>'; return; }
  const X = D[lg], P = prep(X), draw = () => {
    const o = sxSeason(P, true), T = X.teams, nba = P.nba, tot = X.total, w = i => Math.round(o.w[i]);
    const t = i => T[i], rec = i => `${w(i)}-${tot - w(i)}`, nm = i => esc(t(i).short || t(i).abbr);
    const ch = o.champ, fin = o.rounds[o.rounds.length - 1][0], loser = fin.win === fin.hi ? fin.lo : fin.hi, gw = Math.max(fin.a, fin.b), gl = Math.min(fin.a, fin.b);
    const rdName = nba ? ['First round', 'Conference semifinals', 'Conference finals', 'NBA Finals'] : ['First round', 'Semifinals', 'WNBA Finals'];
    const ser = x => { const lo = x.win === x.hi ? x.lo : x.hi; return `<div class="sx-ser"><span class="w">${logo(t(x.win).abbr, 40)}<b>${nm(x.win)}</b></span><em>${Math.max(x.a, x.b)}-${Math.min(x.a, x.b)}</em><span>${logo(t(lo).abbr, 40)}${nm(lo)}</span></div>`; };
    sheet.body.innerHTML = `
      <div class="sx-champ" style="--tc:${teamColor(t(ch).id)}">${logo(t(ch).abbr, 160, 'lg sx-cl')}<div><span class="eyebrow">${esc(seasonLabel(X, lg))} champions, in this simulation</span><h2>${esc(t(ch).name)}</h2><p>Beat the ${esc(t(loser).short || t(loser).name)} ${gw}-${gl} in the Finals after going ${rec(ch)}.</p></div></div>
      <div class="sx-acts sx-again"><button class="btn" data-simre>Sim it again</button></div>
      <section class="sx-sec"><h3>Final standings</h3><div class="sx-cols">${o.seeds.map((s, c) => `<div><h4>${esc(X.confs[c])}${nba ? 'ern' : ''}</h4><ol class="sx-st">${s.map((i, k) => `<li class="${nba ? (k < 6 ? 'po' : k < 10 ? 'pi' : '') : k < 8 ? 'po' : ''}"><span>${k + 1}</span>${logo(t(i).abbr, 40)}<b>${nm(i)}</b><em>${rec(i)}</em><small>${t(i).w}-${t(i).l} now</small></li>`).join('')}</ol></div>`).join('')}</div></section>
      ${o.playin.length ? `<section class="sx-sec"><h3>Play-In</h3><div class="sx-cols">${o.playin.map(p => `<div><h4>${esc(X.confs[p.c])}ern</h4>${p.games.map(([h, a, wn], k) => `<div class="sx-ser"><span class="${wn === h ? 'w' : ''}">${logo(t(h).abbr, 40)}${wn === h ? `<b>${nm(h)}</b>` : nm(h)}</span><em>${['7 v 8', '9 v 10', 'for 8th'][k]}</em><span class="${wn === a ? 'w' : ''}">${logo(t(a).abbr, 40)}${wn === a ? `<b>${nm(a)}</b>` : nm(a)}</span></div>`).join('')}</div>`).join('')}</div></section>` : ''}
      ${o.rounds.map((rs, k) => `<section class="sx-sec"><h3>${rdName[k]}</h3><div class="sx-grid">${rs.map(ser).join('')}</div></section>`).reverse().join('')}
      <p class="sx-note">One random way the rest of the season could go, using the same ratings as Playoff Odds. Every run is different.</p>`;
  };
  draw();
  sheet.body.addEventListener('click', e => { if (e.target.closest('[data-simre]')) { draw(); sheet.body.scrollTop = 0; } });
}
