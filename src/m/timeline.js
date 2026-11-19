/* ---------------- player page: career timeline ----------------
   His whole career on one line: a season-by-season chart (points, rebounds, assists, Win Shares or PER) over the teams
   he played for, with All-Star seasons, MVPs and titles marked; then the moments, season by season: the draft, moves,
   awards, his biggest games and long runs of missed games.
   Seasons and awards come from the careers data (Basketball-Reference's season pages, built weekly on GitHub by
   tools/careers.mjs); single games and missed games from the game logs (ESPN box scores since 2000-01,
   tools/gamelogs.mjs). */
const TL_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const tlMemo = new Map();
const tlJSON = (path, hours = 6) => {
  const k = path, m = tlMemo.get(k); if (m) return m;
  const p = (async () => {
    const url = `${TL_RAW}/${path}?t=${Math.floor(Date.now() / (hours * 36e5))}`, key = `${location.origin}/__fc-tl/${encodeURIComponent(path)}`;
    try { if (self.caches) { const c = await caches.open('fc-keep-tl-v1'), hit = await c.match(key); if (hit && Date.now() - (+hit.headers.get('x-t') || 0) < hours * 36e5) return await hit.json(); const r = await fetch(url); if (!r.ok) throw new Error(r.status); const t = await r.text(); c.put(key, new Response(t, { headers: { 'content-type': 'application/json', 'x-t': String(Date.now()) } })).catch(() => {}); return JSON.parse(t); } } catch (e) { if (/^\d+$/.test(e.message)) throw e; }
    const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json();
  })();
  p.catch(() => tlMemo.delete(k)); tlMemo.set(k, p); return p;
};
// Basketball-Reference team codes -> ESPN's, for colors (older franchises take their current team's)
const TL_TM = { GSW: 'GS', NYK: 'NY', PHO: 'PHX', BRK: 'BKN', NJN: 'BKN', CHO: 'CHA', CHH: 'CHA', CHA: 'CHA', SAS: 'SA', NOP: 'NO', NOH: 'NO', NOK: 'NO', UTA: 'UTAH', WAS: 'WSH', WSB: 'WSH', SEA: 'OKC', VAN: 'MEM', KCK: 'SAC', KCO: 'SAC', CIN: 'SAC', ROC: 'SAC', SDC: 'LAC', BUF: 'LAC', NOJ: 'UTAH', SDR: 'HOU', MNL: 'LAL', STL: 'ATL', MLH: 'ATL', TRI: 'ATL', SFW: 'GS', PHW: 'GS', SYR: 'PHI', FTW: 'DET', BAL: 'WSH', CHZ: 'WSH', CHP: 'WSH' };
const tlEspn = t => TL_TM[t] || t;
const tlYear = y => `${y - 1}-${String(y).slice(2)}`;
const tlFold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
const tlDate = d => { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const tlSeasonOf = d => { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100; return m >= 8 ? y + 1 : y; };
const TL_AW = { 'MVP': 'MVP', 'ROY': 'Rookie of the Year', 'DPOY': 'Defensive Player of the Year', '6MOY': 'Sixth Man of the Year', 'MIP': 'Most Improved Player', 'CPOY': 'Clutch Player of the Year' };
const TL_TEAM = { NBA1: 'All-NBA 1st team', NBA2: 'All-NBA 2nd team', NBA3: 'All-NBA 3rd team', DEF1: 'All-Defensive 1st team', DEF2: 'All-Defensive 2nd team', AS: 'All-Star' };
const tlOrd = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// his Basketball-Reference id: from the careers data's ESPN map, else by name in the era index
async function tlBr(id, name) {
  const ids = await tlJSON('careers-data/ids.json', 24).catch(() => null);
  if (ids?.espn?.[id]) return ids.espn[id];
  const idx = await tlJSON('era-data/index.json', 24).catch(() => null); if (!idx) return null;
  const c = Object.fromEntries(idx.cols.map((k, i) => [k, i])), f = tlFold(name);
  const hits = idx.players.filter(p => tlFold(p[c.name]) === f).sort((a, b) => b[c.y1] - a[c.y1] || b[c.score] - a[c.score]);
  return hits[0]?.[c.id] || null;
}

async function fillTimeline(car, id) {
  const box = $('.career-in', car), name = car.dataset.name || '';
  let br, L, B;
  try {
    br = await tlBr(id, name);
    if (!br) { box.innerHTML = '<p class="car-none">No career record found for him yet. New players are added each week.</p>'; return; }
    const [P, BB] = await Promise.all([tlJSON(`careers-data/p/${br[0]}.json`, 24), tlJSON(`gamelog-data/bests/${+id % 20}.json`, 6).catch(() => null)]);
    L = P.players?.[br]; B = BB?.players?.[id] || null;
    if (!L?.length) { box.innerHTML = '<p class="car-none">No seasons on record for him yet.</p>'; return; }
  } catch (e) { car._loaded = false; box.innerHTML = '<p class="car-none">The career timeline didn\'t load. Close and reopen to try again.</p>'; return; }
  const C = ['year', 'age', 'team', 'pos', 'g', 'gs', 'mp', 'pts', 'trb', 'ast', 'stl', 'blk', 'tov', 'fgp', 'tpp', 'ftp', 'ts', 'per', 'ws', 'bpm', 'aw', 'ch', 'po'];
  const S = L.map(r => Object.fromEntries(C.map((k, i) => [k, r[i]]))).sort((a, b) => a.year - b.year);
  const aw = s => String(s.aw || '').split(',').filter(Boolean);
  const won = (s, k) => aw(s).includes(`${k}-1`);
  const stars = S.filter(s => aw(s).includes('AS')).length, mvps = S.filter(s => won(s, 'MVP')).length, rings = S.filter(s => s.ch).length;
  const teams = []; for (const s of S) for (const t of String(s.team || '').split('/')) if (t && teams.at(-1) !== t) teams.push(t);
  const uniq = [...new Set(teams)];
  const gp = S.reduce((a, s) => a + (s.g || 0), 0), car3 = k => gp ? (S.reduce((a, s) => a + (s[k] || 0) * (s.g || 0), 0) / gp).toFixed(1) : '–';
  const bestWs = S.filter(s => s.ws != null).sort((a, b) => b.ws - a.ws)[0];
  const c = B?.c || {};
  let stat = lsGet('fc-tl-stat') || 'pts';
  const STATS = [['pts', 'PTS'], ['trb', 'REB'], ['ast', 'AST'], ['ws', 'WS'], ['per', 'PER']];
  if (!STATS.some(x => x[0] === stat)) stat = 'pts';

  // the moments, season by season
  const moments = new Map(); const add = (y, kind, html) => (moments.get(y) || moments.set(y, []).get(y)).push([kind, html]);
  const draft = car.dataset.draft;
  add(S[0].year, 'start', `${draft && !/undrafted/i.test(draft) ? `Drafted ${esc(draft.replace(/^(\d{4}): /, '$1, '))}. ` : draft ? 'Undrafted. ' : ''}First season, at ${S[0].age}, with ${esc(S[0].team.split('/')[0])}`);
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i], at = String(a.team).split('/'), bt = String(b.team).split('/');
    if (bt[0] !== at.at(-1)) add(b.year, 'move', `Joined ${esc(bt[0])}${b.year - a.year > 1 ? ` after ${b.year - a.year - 1} season${b.year - a.year > 2 ? 's' : ''} away from the NBA` : ''}`);
  }
  for (const s of S) {
    const ts = String(s.team).split('/');
    if (ts.length > 1) add(s.year, 'move', `Moved during the season: ${ts.map(esc).join(' → ')}`);
    for (const a of aw(s)) {
      const [k, n] = a.split('-');
      if (TL_AW[k] && n === '1') add(s.year, k === 'MVP' ? 'mvp' : 'award', k === 'MVP' ? 'Most Valuable Player' : esc(TL_AW[k]));
      else if (TL_AW[k] && +n <= 3 && k === 'MVP') add(s.year, 'note', `${tlOrd(+n)} in MVP voting`);
      else if (TL_TEAM[k]) add(s.year, k === 'AS' ? 'as' : 'award', esc(TL_TEAM[k]));
    }
    if (s.ch) add(s.year, 'ring', `Won the title${s.po?.[0] && s.po[1] != null ? ` · ${s.po[1]} points a game in ${s.po[0]} playoff games` : ''}`);
  }
  if (bestWs && S.length > 2) add(bestWs.year, 'note', `Best season by Win Shares: ${bestWs.ws.toFixed(1)}`);
  // biggest games (ESPN box scores, 2000-01 on): career highs
  const game = (g, what) => `<button class="tl-g" data-game="${g[1]}" data-legpid="${id}">${what} ${g[4]} ${esc(g[3])}, ${tlDate(g[2])}</button>`;
  if (B) {
    // box scores start in 2000-01, so for an older career these are his best since then, not his career highs
    const early = S[0].year < 2001;
    const lab = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'threes', blk: 'blocks', stl: 'steals' };
    for (const k of ['pts', 'reb', 'ast', 'tpm']) { const g = B[k]?.[0]; if (g && g[0] >= ({ pts: 20, reb: 10, ast: 8, tpm: 4 }[k])) add(tlSeasonOf(g[2]), 'big', game(g, `${early ? 'Best since 2000-01' : 'Career high'}: <b>${g[0]} ${lab[k]}</b>`)); }
    (B.pts || []).slice(1).forEach(g => { if (g[0] >= 40) add(tlSeasonOf(g[2]), 'big', game(g, `<b>${g[0]} points</b>`)); });
    for (const o of B.out || []) {
      const [y, tm, from, to, n, why, toEnd] = o;
      const r = why && !/coach/i.test(why) ? ` · ${esc(why.toLowerCase().replace(/^./, x => x.toUpperCase()))}` : /coach/i.test(why || '') ? ' · coach\'s decision' : '';
      add(y, 'out', toEnd ? `Out for ${n} straight games to the end of the season, from ${tlDate(from)}${r}` : `Missed ${n} straight games, ${tlDate(from)} to ${tlDate(to)}${r}`);
    }
  }
  const KIND = { start: 'Start', move: 'Move', mvp: 'Honor', award: 'Honor', as: 'Honor', ring: 'Title', big: 'Big game', out: 'Missed', note: '' };

  const draw = () => {
    // chart
    const W = 720, H = 230, padL = 34, padR = 12, top = 26, bot = 52, vals = S.map(s => s[stat]), max = Math.max(1, ...vals.filter(v => v != null)) * 1.12;
    const xs = i => S.length === 1 ? (padL + W - padR) / 2 : padL + i * ((W - padL - padR) / (S.length - 1)), ys = v => top + (H - top - bot) * (1 - v / max);
    const pts = S.map((s, i) => s[stat] != null ? [xs(i), ys(s[stat])] : null);
    const path = pts.reduce((d, p, i) => p ? d + `${d && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}` : d, '');
    const step = S.length > 1 ? (W - padL - padR) / (S.length - 1) : 40;
    // team bands along the bottom
    const bands = S.map((s, i) => { const ts = String(s.team).split('/'), w = Math.max(4, step), x0 = xs(i) - w / 2; return ts.map((t, j) => `<rect x="${(x0 + j * w / ts.length).toFixed(1)}" y="${H - bot + 14}" width="${(w / ts.length - 1).toFixed(1)}" height="10" rx="2" fill="${teamColor(tlEspn(t))}"><title>${tlYear(s.year)}: ${esc(t)}</title></rect>`).join(''); }).join('');
    // team names under the bands, once a run
    let runs = [], cur = null; S.forEach((s, i) => { const t = String(s.team).split('/')[0]; if (!cur || cur.t !== t) { cur = { t, a: i, b: i }; runs.push(cur); } else cur.b = i; });
    const tlabels = runs.map(r => `<text x="${((xs(r.a) + xs(r.b)) / 2).toFixed(1)}" y="${H - bot + 38}" class="tl-tn" text-anchor="middle">${esc(r.t)}</text>`).join('');
    const yrs = S.map((s, i) => (S.length <= 12 || i % Math.ceil(S.length / 12) === 0 || i === S.length - 1) ? `<text x="${xs(i).toFixed(1)}" y="${H - bot + 8}" class="tl-yr" text-anchor="middle">'${String(s.year).slice(2)}</text>` : '').join('');
    const dots = S.map((s, i) => { const p = pts[i]; if (!p) return ''; const a = aw(s), as = a.includes('AS'), mvp = won(s, 'MVP');
      return `<g class="tl-pt"><title>${tlYear(s.year)} · ${esc(s.team)}: ${s[stat]}${stat === 'ws' || stat === 'per' ? '' : ' per game'}${as ? ' · All-Star' : ''}${mvp ? ' · MVP' : ''}${s.ch ? ' · Champion' : ''}</title>
        ${s.ch ? `<circle cx="${p[0]}" cy="${p[1]}" r="9" class="tl-ring"/>` : ''}<circle cx="${p[0]}" cy="${p[1]}" r="${as ? 5 : 3.5}" class="${as ? 'tl-as' : 'tl-d'}"/>
        ${mvp ? `<path transform="translate(${p[0]} ${p[1] - 17}) scale(.9)" d="M0-7l2 4.6 5 .5-3.8 3.3 1.1 4.9L0 2.8-4.3 5.3l1.1-4.9L-7-2.9l5-.5z" class="tl-mvp"/>` : ''}</g>`; }).join('');
    const grid = [0.25, 0.5, 0.75, 1].map(f => { const v = max / 1.12 * f, y = ys(v); return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="tl-grid"/><text x="${padL - 6}" y="${(y + 3).toFixed(1)}" class="tl-yr" text-anchor="end">${v >= 5 ? Math.round(v) : v.toFixed(1)}</text>`; }).join('');
    const ys2 = [...moments.keys()].sort((a, b) => b - a);
    box.innerHTML = `<div class="tl">
      <div class="tl-sum">
        <div><b>${S.length}</b><small>season${S.length === 1 ? '' : 's'}${S.length > 1 ? ` · ${tlYear(S[0].year)} to ${tlYear(S.at(-1).year)}` : ''}</small></div>
        <div><b>${uniq.length}</b><small>team${uniq.length === 1 ? '' : 's'}: ${uniq.map(esc).join(', ')}</small></div>
        <div><b>${car3('pts')}</b><small>career points a game · ${car3('trb')} reb · ${car3('ast')} ast</small></div>
        ${stars ? `<div><b>${stars}</b><small>All-Star season${stars === 1 ? '' : 's'}</small></div>` : ''}
        ${mvps ? `<div><b>${mvps}</b><small>MVP${mvps === 1 ? '' : 's'}</small></div>` : ''}
        ${rings ? `<div><b>${rings}</b><small>title${rings === 1 ? '' : 's'}</small></div>` : ''}
        ${c.p40 || c.td ? `<div><b>${c.p40 || 0}</b><small>40-point games${c.p50 ? ` (${c.p50} of 50+)` : ''}${c.td ? ` · ${c.td} triple-double${c.td === 1 ? '' : 's'}` : ''}<em>since 2000-01</em></small></div>` : ''}
      </div>
      <div class="tl-ctl"><div class="seg sm" data-tlstat><span class="knob"></span>${STATS.map(([k, l]) => `<button data-tlstat="${k}" aria-pressed="${stat === k}">${l}</button>`).join('')}</div>
        <span class="tl-key"><i class="as"></i>All-Star <i class="mvp">★</i>MVP <i class="ring"></i>Title</span></div>
      <div class="tl-chart drag-x" data-drag><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)}, ${STATS.find(x => x[0] === stat)[1]} by season" style="min-width:${Math.max(520, S.length * 30)}px">${grid}<path d="${path}" class="tl-line"/>${dots}${yrs}${bands}${tlabels}</svg></div>
      <ol class="tl-list">${ys2.map(y => { const s = S.find(x => x.year === y);
        return `<li><div class="tl-when"><b>${tlYear(y)}</b>${s ? `<small>${esc(s.team)} · age ${s.age}</small><small>${s.pts ?? '–'} / ${s.trb ?? '–'} / ${s.ast ?? '–'}</small>` : ''}</div>
          <ul>${(() => { const ORDER = ['start', 'move', 'mvp', 'ring', 'award', 'as', 'big', 'out', 'note']; let prev = null; return moments.get(y).slice().sort((p1, p2) => ORDER.indexOf(p1[0]) - ORDER.indexOf(p2[0])).map(([k, h]) => { const lab = KIND[k] || ''; const show = lab && lab !== prev; prev = lab || prev; return `<li class="tl-m ${k}"><span class="tl-k">${show ? lab : ''}</span><span>${h}</span></li>`; }).join(''); })()}</ul></li>`; }).join('')}</ol>
      <p class="tl-note">Seasons and awards from Basketball-Reference, updated weekly; single games and missed games from ESPN box scores, back to the 2000-01 season. Points / rebounds / assists are per game.</p>
    </div>`;
    $$('.seg', box).forEach(placeKnob);
    wireDrag(box);
  };
  box.addEventListener('click', e => { const b = e.target.closest('button[data-tlstat]'); if (!b) return; e.stopPropagation(); stat = b.dataset.tlstat; lsSet('fc-tl-stat', stat === 'pts' ? null : stat); draw(); });
  draw();
}
