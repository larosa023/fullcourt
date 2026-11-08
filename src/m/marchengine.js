/* March Madness engine, shared by GitHub (tools/march.mjs: the 10,000-season run behind Bracketology) and the page
   (m/march.js: "Sim the tournament"). Plain JavaScript, no page code.

   One simulated season:
   - every team's rating gets a random nudge (we don't know anyone's true level, least of all in November)
   - the rest of the regular season is played (home court counts); games against non-Division I schools are near-certain wins
   - each conference tournament is played (seeded by conference record, top seeds get byes); the winner takes the
     automatic bid
   - the committee's pick: the best at-large teams (68 minus the automatic bids) by a resume score, mostly wins above what a bubble team would
     have managed against the same schedule (WAB), plus a little for how good the team is (like the NET)
   - all 68 are seeded on an S-curve, the First Four is played (last four at-large teams, lowest four automatic bids),
     then the tournament. In the women's, the top 16 seeds host the first two rounds. */

function ncdf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
function nrand() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
const POS = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]; // seed order down a region's bracket

function mPrep(X) {
  const T = X.teams, n = T.length, m = X.games.length, hca = X.hca, sd = X.sd, rb = X.bubble;
  const gh = new Int16Array(m), ga = new Int16Array(m), mu = new Float64Array(m), pbh = new Float64Array(m), pba = new Float64Array(m), cg = new Uint8Array(m);
  X.games.forEach(([h, a, nt], k) => {
    const hc = nt ? 0 : hca; gh[k] = h; ga[k] = a; mu[k] = T[h].r - T[a].r + hc;
    pbh[k] = ncdf((rb - T[a].r + hc) / sd); pba[k] = ncdf((rb - T[h].r - hc) / sd); cg[k] = T[h].conf === T[a].conf ? 1 : 0;
  });
  const confs = X.confs.map(c => c.teams);
  return { X, T, n, m, gh, ga, mu, pbh, pba, cg, confs, nd: X.nd || [], sig: T.map(t => t.sig), women: !!X.women };
}

// a conference tournament: seeds by conference record, single elimination, byes to the top seeds, a point to the better seed
function confTourney(P, idx, cw, cl, r, e, size) {
  const coin = idx.map(() => Math.random());
  const s = idx.map((t, k) => [t, (cw[t] + 0.5) / (cw[t] + cl[t] + 1), coin[k]]).sort((a, b) => b[1] - a[1] || b[2] - a[2]).map(x => x[0]).slice(0, size || idx.length);
  if (s.length < 2) return s[0];
  let field = s.slice(), p2 = 1; while (p2 < field.length) p2 *= 2;
  // bracket order for p2 slots; slots past the field are byes
  let order = [1]; while (order.length < p2) { const L = order.length * 2 + 1; order = order.flatMap(x => [x, L - x]); }
  let cur = order.map(k => field[k - 1] ?? -1);
  while (cur.length > 1) {
    const nx = [];
    for (let k = 0; k < cur.length; k += 2) {
      const a = cur[k], b = cur[k + 1];
      if (a < 0) { nx.push(b); continue; } if (b < 0) { nx.push(a); continue; }
      const sa = s.indexOf(a), sb = s.indexOf(b), edge = sa < sb ? 1 : -1;
      nx.push(Math.random() < ncdf((r[a] + e[a] - r[b] - e[b] + edge) / P.X.sd) ? a : b);
    }
    cur = nx;
  }
  return cur[0];
}

// the field and the bracket from a ranked list (best first) and the automatic bids
function mBracket(ranked, auto, size = 68) {
  const autos = new Set(auto.filter(x => x >= 0));
  const at = ranked.filter(t => !autos.has(t)).slice(0, size - autos.size);
  const field = new Set([...autos, ...at]), list = ranked.filter(t => field.has(t));
  const lastAt = list.filter(t => !autos.has(t)).slice(-4), lowAuto = list.filter(t => autos.has(t)).slice(-4);
  const pairs = [[lastAt[0], lastAt[1]], [lastAt[2], lastAt[3]], [lowAuto[0], lowAuto[1]], [lowAuto[2], lowAuto[3]]].filter(p => p[0] != null && p[1] != null);
  const inPair = new Map(); pairs.forEach((p, i) => { inPair.set(p[0], i); inPair.set(p[1], i); });
  const slots = [], used = new Set();
  for (const t of list) { if (inPair.has(t)) { const i = inPair.get(t); if (used.has(i)) continue; used.add(i); slots.push({ ff: i }); } else slots.push({ t }); }
  // S-curve: seed line by slot, regions snake 0-1-2-3 / 3-2-1-0
  const regions = [0, 1, 2, 3].map(() => ({}));
  slots.slice(0, 64).forEach((s, i) => { const line = Math.floor(i / 4) + 1, k = i % 4, reg = line % 2 ? k : 3 - k; regions[reg][line] = s; });
  return { regions, pairs, field: list, autos: [...autos] };
}

// the tournament: First Four, then six rounds. r(i) = a team's rating this time. Returns how far each team got
// (0 = lost in the First Four, 1 = Round of 64, ... 7 = champion) and, if asked, every game.
function mTourney(B, r, sd, women, keep) {
  const far = new Map(), games = keep ? [] : null;
  const seedOf = new Map();
  const play = (a, b, rd, sa, sb) => {
    let edge = 0;
    if (women && rd <= 2) { if (sa <= 4 && sb > 4) edge = 3; else if (sb <= 4 && sa > 4) edge = -3; } // top-16 seeds host rounds 1-2
    const w = Math.random() < ncdf((r(a) - r(b) + edge) / sd) ? a : b;
    if (games) games.push({ rd, a, b, sa, sb, w });
    return w;
  };
  const ffWin = B.pairs.map(([a, b], i) => { far.set(a, 0); far.set(b, 0); return play(a, b, 0, null, null); });
  const regionChamps = B.regions.map((R, reg) => {
    let cur = POS.map(sd2 => { const s = R[sd2]; const t = s ? (s.ff != null ? ffWin[s.ff] : s.t) : -1; if (t >= 0) seedOf.set(t, sd2); return t; });
    cur.forEach(t => { if (t >= 0) far.set(t, 1); });
    for (let rd = 1; rd <= 4; rd++) {
      const nx = [];
      for (let k = 0; k < cur.length; k += 2) {
        const a = cur[k], b = cur[k + 1];
        const w = a < 0 ? b : b < 0 ? a : play(a, b, rd, seedOf.get(a), seedOf.get(b));
        far.set(w, rd + 1); nx.push(w);
        if (games) games[games.length - 1].reg = reg;
      }
      cur = nx;
    }
    return cur[0];
  });
  const f1 = play(regionChamps[0], regionChamps[3], 5, seedOf.get(regionChamps[0]), seedOf.get(regionChamps[3])); far.set(f1, 6);
  const f2 = play(regionChamps[1], regionChamps[2], 5, seedOf.get(regionChamps[1]), seedOf.get(regionChamps[2])); far.set(f2, 6);
  const ch = play(f1, f2, 6, seedOf.get(f1), seedOf.get(f2)); far.set(ch, 7);
  return { far, champ: ch, games, seedOf, ffWin };
}

function mSeason(P, keep = false) {
  const { X, T, n, m, gh, ga, mu, pbh, pba, cg, sig } = P, sd = X.sd;
  const e = new Float64Array(n), r = new Float64Array(n);
  for (let i = 0; i < n; i++) { e[i] = sig[i] * nrand(); r[i] = T[i].r; }
  const w = Int16Array.from(T, t => t.w), l = Int16Array.from(T, t => t.l), cw = Int16Array.from(T, t => t.cw), cl = Int16Array.from(T, t => t.cl), wab = Float64Array.from(T, t => t.wab);
  for (let k = 0; k < m; k++) {
    const h = gh[k], a = ga[k], hw = Math.random() < ncdf((mu[k] + e[h] - e[a]) / sd);
    if (hw) { w[h]++; l[a]++; wab[h] += 1 - pbh[k]; wab[a] -= pba[k]; if (cg[k]) { cw[h]++; cl[a]++; } }
    else { w[a]++; l[h]++; wab[a] += 1 - pba[k]; wab[h] -= pbh[k]; if (cg[k]) { cw[a]++; cl[h]++; } }
  }
  for (const [t] of P.nd) { if (Math.random() < 0.96) w[t]++; else { l[t]++; wab[t] -= 1; } }
  // conference tournaments (their games count toward the resume)
  const auto = X.confs.map((c, ci) => c.teams.length ? confTourney(P, c.teams, cw, cl, r, e, c.size) : -1);
  // the committee: wins above bubble, plus how good the team looks (with some noise: they see results, not true strength)
  const score = new Float64Array(n);
  for (let i = 0; i < n; i++) score[i] = wab[i] + 0.28 * (r[i] + e[i] + 1.2 * nrand());
  const ranked = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[b] - score[a]);
  const B = mBracket(ranked, auto);
  const R = mTourney(B, i => r[i] + e[i], sd, P.women, keep);
  return { w, l, cw, cl, wab, score, auto, B, R, e };
}

function mRun(P, runs) {
  const n = P.n;
  const A = { runs, make: new Uint32Array(n), auto: new Uint32Array(n), ff: new Uint32Array(n), seed: Array.from({ length: n }, () => new Uint32Array(17)), seedSum: new Float64Array(n), w: new Float64Array(n), l: new Float64Array(n), wab: new Float64Array(n), score: new Float64Array(n),
    reach: Array.from({ length: 8 }, () => new Uint32Array(n)) };
  for (let k = 0; k < runs; k++) {
    const o = mSeason(P);
    for (let i = 0; i < n; i++) { A.w[i] += o.w[i]; A.l[i] += o.l[i]; A.wab[i] += o.wab[i]; A.score[i] += o.score[i]; }
    for (const t of o.auto) if (t >= 0) A.auto[t]++;
    for (const [t, f] of o.R.far) { A.make[t]++; for (let x = 1; x <= f; x++) A.reach[x][t]++; if (o.R.seedOf.has(t)) { const s = o.R.seedOf.get(t); A.seed[t][s]++; A.seedSum[t] += s; } }
    for (const [a, b] of o.B.pairs) { A.ff[a]++; A.ff[b]++; const loser = o.R.far.get(a) === 0 ? a : b; const sd2 = o.B.regions.flatMap(R => Object.entries(R)).find(([, s]) => s.ff != null && o.B.pairs[s.ff].includes(a))?.[0]; if (sd2) { A.seed[loser][+sd2]++; A.seedSum[loser] += +sd2; } }
  }
  return A;
}
