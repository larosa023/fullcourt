/* The season simulator's engine, shared by the page (m/sim.js: "Sim the season") and GitHub (tools/sim.mjs: the
   20,000-season run behind Playoff Odds). Plain JavaScript with no page code in it, so both can run it.

   One simulated season:
   - every team's rating gets a random nudge (how unsure we are of its true level: more early in the season)
   - each game left is played: the expected margin is the two ratings, home court and anyone injured on that date (or,
     for today's games, the betting spread, which already knows who's playing); the result is drawn around it
   - NBA Cup knockout games not scheduled yet are played between teams from the same conference
   - standings are ordered with the NBA's tiebreakers: head-to-head, division leader, division record, conference record
   - the Play-In (NBA) and the playoffs are played out, home court to the better record */

function ncdf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
function nrand() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }

// how much a team's injured players cost it on a given date (points per game)
function injCost(t, d, today) {
  let c = 0;
  for (const p of t.inj || []) {
    if (p.until && d >= p.until) continue;
    if (p.dtd) { if (d <= today) c += p.imp * 0.4; continue; } // day-to-day: maybe out for the next game, then back
    c += p.imp;
  }
  return c;
}

function simPrep(X, today = new Date().toISOString().slice(0, 10)) {
  const T = X.teams, n = T.length, ix = Object.fromEntries(T.map((t, i) => [t.id, i]));
  const G = X.games.filter(g => g[0] in ix && g[1] in ix), m = G.length;
  const gh = new Int16Array(m), ga = new Int16Array(m), mu = new Float64Array(m), mkt = new Uint8Array(m);
  G.forEach((g, k) => {
    const h = ix[g[0]], a = ix[g[1]]; gh[k] = h; ga[k] = a;
    if (g[4] != null) { mu[k] = -g[4]; mkt[k] = 1; } // the betting line: home spread, negative = home favored
    else mu[k] = (T[h].r - injCost(T[h], g[3], today)) - (T[a].r - injCost(T[a], g[3], today)) + (g[2] ? 0 : X.hca);
  });
  // records so far, for the tiebreakers
  const h2h = new Int16Array(n * n), cw = new Int16Array(n), cl = new Int16Array(n), dw = new Int16Array(n), dl = new Int16Array(n);
  for (const [hid, aid, hs, as] of X.played || []) {
    const h = ix[hid], a = ix[aid]; if (h == null || a == null) continue;
    const [wi, li] = hs > as ? [h, a] : [a, h]; h2h[wi * n + li]++;
    if (T[h].conf === T[a].conf) { cw[wi]++; cl[li]++; }
    if (T[h].div != null && T[h].div === T[a].div) { dw[wi]++; dl[li]++; }
  }
  const next = new Int32Array(n).fill(-1);
  for (let k = m - 1; k >= 0; k--) { next[gh[k]] = k; next[ga[k]] = k; }
  return { X, T, n, m, gh, ga, mu, mkt, h2h, cw, cl, dw, dl, next, ix, w0: T.map(t => t.w), sig: T.map(t => t.sig ?? 2), nba: X.confs.length === 2, ndiv: Math.max(-1, ...T.map(t => t.div ?? -1)) + 1 };
}

function simSeason(P, keep = false) {
  const { X, T, n, m, gh, ga, mu, mkt, sig } = P, sd = X.sd, hca = X.hca;
  const e = new Float64Array(n); for (let i = 0; i < n; i++) e[i] = sig[i] * nrand();
  const w = Int16Array.from(P.w0), h2h = P.h2h.slice(), cw = P.cw.slice(), cl = P.cl.slice(), dw = P.dw.slice(), dl = P.dl.slice();
  const nextWon = new Int8Array(n).fill(-1);
  const rec = (wi, li) => {
    w[wi]++; h2h[wi * n + li]++;
    if (T[wi].conf === T[li].conf) { cw[wi]++; cl[li]++; }
    if (T[wi].div != null && T[wi].div === T[li].div) { dw[wi]++; dl[li]++; }
  };
  for (let k = 0; k < m; k++) {
    const h = gh[k], a = ga[k], hw = Math.random() < ncdf((mu[k] + (mkt[k] ? 0.3 : 1) * (e[h] - e[a])) / sd);
    const wi = hw ? h : a, li = hw ? a : h; rec(wi, li);
    if (P.next[wi] === k) nextWon[wi] = 1;
    if (P.next[li] === k) nextWon[li] = 0;
  }
  // games not on the schedule yet (NBA Cup knockout rounds): same-conference matchups on a neutral floor
  const pool = {}; T.forEach((t, i) => { for (let k = 0; k < (t.pad || 0); k++) (pool[t.conf] = pool[t.conf] || []).push(i); });
  for (const L of Object.values(pool)) {
    for (let k = L.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [L[k], L[j]] = [L[j], L[k]]; }
    for (let k = 0; k + 1 < L.length; k += 2) {
      let x = L[k], y = L[k + 1];
      if (x === y) { if (Math.random() < ncdf((T[x].r + e[x]) / sd)) w[x]++; continue; }
      const xw = Math.random() < ncdf((T[x].r + e[x] - T[y].r - e[y]) / sd); rec(xw ? x : y, xw ? y : x);
    }
    if (L.length % 2) { const x = L[L.length - 1]; if (Math.random() < ncdf((T[x].r + e[x]) / sd)) w[x]++; }
  }
  // ---- standings, with the tiebreakers ----
  const coin = Float64Array.from({ length: n }, () => Math.random());
  const pct = (a, b) => a + b ? a / (a + b) : 0.5;
  const crit = {
    h2h: g => g.map(x => { let a = 0, b = 0; for (const y of g) if (y !== x) { a += h2h[x * n + y]; b += h2h[y * n + x]; } return pct(a, b); }),
    lead: (g, lead) => lead ? g.map(x => lead.has(x) ? 1 : 0) : null,
    div: g => g.every(x => T[x].div != null && T[x].div === T[g[0]].div) ? g.map(x => pct(dw[x], dl[x])) : null,
    conf: g => g.map(x => pct(cw[x], cl[x])),
  };
  const resolve = (g, lead) => {
    if (g.length < 2) return g;
    const order = g.length === 2 ? ['h2h', 'lead', 'div', 'conf'] : ['lead', 'h2h', 'div', 'conf'];
    for (const c of order) {
      const v = crit[c](g, lead); if (!v || v.every(x => x === v[0])) continue;
      const lv = [...new Set(v)].sort((a, b) => b - a);
      return lv.flatMap(x => resolve(g.filter((_, i) => v[i] === x), lead)); // each group still tied starts over
    }
    return g.slice().sort((a, b) => coin[b] - coin[a]);
  };
  const rank = (idx, lead) => {
    const s = idx.slice().sort((a, b) => w[b] - w[a]), out = [];
    for (let i = 0; i < s.length;) { let j = i; while (j < s.length && w[s[j]] === w[s[i]]) j++; out.push(...resolve(s.slice(i, j), lead)); i = j; }
    return out;
  };
  const lead = new Set();
  for (let d = 0; d < P.ndiv; d++) { const mem = T.map((t, i) => t.div === d ? i : -1).filter(i => i >= 0); if (mem.length) lead.add(rank(mem, null)[0]); }
  const leagueOrder = rank(T.map((_, i) => i), P.ndiv ? lead : null), pos = new Int16Array(n); leagueOrder.forEach((t, k) => { pos[t] = k; });
  const game = (h, a) => Math.random() < ncdf((T[h].r + e[h] - T[a].r - e[a] + hca) / sd) ? h : a;
  const series = (hi, lo, best) => { const need = (best + 1) / 2, home = best === 7 ? [1, 1, 0, 0, 1, 0, 1] : best === 5 ? [1, 1, 0, 0, 1] : [1, 0, 1]; let a = 0, b = 0, k = 0; while (a < need && b < need) { const hh = home[k++]; if (game(hh ? hi : lo, hh ? lo : hi) === hi) a++; else b++; } return { win: a > b ? hi : lo, hi, lo, a, b }; };
  const better = (x, y) => pos[x] < pos[y] ? [x, y] : [y, x]; // home court: the better record (tiebreakers included)
  const out = { w, seeds: [], playin: [], rounds: [], champ: -1, lead, nextWon };
  if (P.nba) {
    const conf = [0, 1].map(c => rank(T.map((t, i) => t.conf === c ? i : -1).filter(i => i >= 0), lead));
    out.seeds = conf;
    const field = conf.map((s, c) => {
      const w1 = game(s[6], s[7]), l1 = w1 === s[6] ? s[7] : s[6], w2 = game(s[8], s[9]), w3 = game(l1, w2);
      if (keep) out.playin.push({ c, games: [[s[6], s[7], w1], [s[8], s[9], w2], [l1, w2, w3]] });
      return [s[0], s[1], s[2], s[3], s[4], s[5], w1, w3];
    });
    let cur = field.map(f => [[f[0], f[7]], [f[3], f[4]], [f[2], f[5]], [f[1], f[6]]]);
    const champs = [];
    for (let rd = 0; rd < 3; rd++) {
      const res = cur.map(pairs => pairs.map(([x, y]) => series(...better(x, y), 7)));
      out.rounds.push(res.flat());
      if (rd < 2) cur = res.map(rs => { const nx = []; for (let k = 0; k < rs.length; k += 2) nx.push([rs[k].win, rs[k + 1].win]); return nx; });
      else res.forEach(rs => champs.push(rs[0].win));
    }
    const f = series(...better(champs[0], champs[1]), 7);
    out.rounds.push([f]); out.champ = f.win;
  } else {
    const s = leagueOrder; out.seeds = [s];
    let cur = [[s[0], s[7]], [s[3], s[4]], [s[2], s[5]], [s[1], s[6]]];
    for (const best of [3, 7, 7]) {
      const res = cur.map(([x, y]) => series(...better(x, y), best)); out.rounds.push(res);
      if (res.length === 1) { out.champ = res[0].win; break; }
      cur = []; for (let k = 0; k < res.length; k += 2) cur.push([res[k].win, res[k + 1].win]);
    }
  }
  return out;
}

// many seasons: totals for Playoff Odds
function simRun(P, runs) {
  const n = P.n, T = P.T, nba = P.nba, maxW = (P.X.total || 82) + 1;
  const A = { runs, w: new Float64Array(n), hist: Array.from({ length: n }, () => new Uint32Array(maxW)), seed: Array.from({ length: n }, () => new Uint32Array(16)),
    top: new Uint32Array(n), direct: new Uint32Array(n), pin: new Uint32Array(n), po: new Uint32Array(n), r2: new Uint32Array(n), cf: new Uint32Array(n), fin: new Uint32Array(n), title: new Uint32Array(n), div: new Uint32Array(n),
    nx: Array.from({ length: n }, () => ({ w: 0, l: 0, wpo: 0, lpo: 0, wt6: 0, lt6: 0, wti: 0, lti: 0 })) };
  for (let r = 0; r < runs; r++) {
    const o = simSeason(P);
    const made = new Uint8Array(n), top6 = new Uint8Array(n);
    for (let i = 0; i < n; i++) { A.w[i] += o.w[i]; A.hist[i][Math.min(maxW - 1, o.w[i])]++; }
    for (const s of o.seeds) s.forEach((t, k) => { A.seed[t][Math.min(15, k)]++; if (!k) A.top[t]++; if (nba) { if (k < 6) { A.direct[t]++; top6[t] = 1; } else if (k < 10) A.pin[t]++; } else if (k < 8) top6[t] = 1; });
    for (const t of o.lead) A.div[t]++;
    const rd = o.rounds; rd[0].forEach(x => { A.po[x.hi]++; A.po[x.lo]++; made[x.hi] = made[x.lo] = 1; A.r2[x.win]++; });
    if (nba) rd[1].forEach(x => { A.cf[x.win]++; });
    rd[rd.length - 2].forEach(x => { A.fin[x.win]++; });
    A.title[o.champ]++;
    for (let i = 0; i < n; i++) {
      const v = o.nextWon[i]; if (v < 0) continue; const c = A.nx[i];
      if (v) { c.w++; c.wpo += made[i]; c.wt6 += top6[i]; c.wti += o.champ === i; } else { c.l++; c.lpo += made[i]; c.lt6 += top6[i]; c.lti += o.champ === i; }
    }
  }
  return A;
}
