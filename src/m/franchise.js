/* ---------------- team page: franchise history ----------------
   Every season since the franchise began (under every name it has had) on one chart, coloured by how the playoffs went,
   with its titles, Finals and playoff runs; its greatest players (Win Shares with the team) and the best by decade; every
   season in a list; and the team's records since 2000-01 (highest and lowest scores, biggest wins, longest streaks, best
   single games). Seasons from the careers data (Basketball-Reference, weekly, tools/careers.mjs); records from the game
   logs (ESPN box scores, daily, tools/gamelogs.mjs). */
const FH_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const fhMemo = new Map();
const fhJSON = (path, hours) => {
  if (fhMemo.has(path)) return fhMemo.get(path);
  const p = (async () => {
    const url = `${FH_RAW}/${path}?t=${Math.floor(Date.now() / (hours * 36e5))}`, key = `${location.origin}/__fc-fh/${encodeURIComponent(path)}`;
    try { if (self.caches) { const c = await caches.open('fc-keep-fh-v1'), hit = await c.match(key); if (hit && Date.now() - (+hit.headers.get('x-t') || 0) < hours * 36e5) return await hit.json(); const r = await fetch(url); if (!r.ok) throw new Error(r.status); const t = await r.text(); c.put(key, new Response(t, { headers: { 'content-type': 'application/json', 'x-t': String(Date.now()) } })).catch(() => {}); return JSON.parse(t); } } catch (e) { if (/^\d+$/.test(e.message)) throw e; }
    const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json();
  })();
  p.catch(() => fhMemo.delete(path)); fhMemo.set(path, p); return p;
};
const fhYear = y => `${y - 1}-${String(y).slice(2)}`;
const fhDate = d => { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const fhResult = (s, cur) => { const po = s[6]; if (!po) return s[0] >= cur ? ['now', 'Season in progress'] : ['out', 'Missed the playoffs']; if (po[0] === 'Finals') return po[1] ? ['champ', 'Won the title'] : ['finals', 'Lost in the Finals']; return ['po', `Lost in the ${po[0].replace(/^(Eastern|Western) (Conference|Division) /, '$1 ')}`]; };

async function fillFranchise(box, abbr, teamId) {
  let F, T, N;
  try {
    const [fr, tm] = await Promise.all([fhJSON('careers-data/franchises.json', 24), fhJSON('gamelog-data/teams.json', 6).catch(() => null)]);
    F = fr.teams?.[abbr]; N = fr.names || {}; T = tm?.teams?.[teamId] || null;
    if (!F?.seasons?.length) { box.hidden = true; return; }
  } catch (e) { box.hidden = true; return; }
  const S = F.seasons, cur = S.at(-1)[0], done = S.filter(s => s[0] < cur || s[6]);
  const W = done.reduce((a, s) => a + s[3], 0), Lo = done.reduce((a, s) => a + s[4], 0);
  const titles = S.filter(s => s[6]?.[0] === 'Finals' && s[6][1]).map(s => s[0]), finals = S.filter(s => s[6]?.[0] === 'Finals').length, po = S.filter(s => s[6]).length;
  // the names it has played under, in order
  const names = []; for (const s of S) { const l = names.at(-1); if (!l || l.n !== s[2]) names.push({ n: s[2], a: s[0], b: s[0] }); else l.b = s[0]; }
  const who = i => N[i] || [null, '?', ''];
  const pBtn = (i, cls = 'fh-pn') => { const n = who(i); return n[2] ? `<button class="${cls}" data-player="${n[2]}">${esc(n[1])}</button>` : `<span class="${cls}">${esc(n[1])}</span>`; };
  // best players by decade: the Win Shares of each season's top three, added up across the decade
  const decades = new Map(); for (const s of S) { const d = Math.floor((s[0] - 1) / 10) * 10; const m = decades.get(d) || decades.set(d, new Map()).get(d); for (const t of s[7]) m.set(t[0], (m.get(t[0]) || 0) + (t[1] || 0)); }
  let showAll = false;
  const draw = () => {
    // chart: one bar a season, its height the win percentage, its colour how the playoffs went
    const n = S.length, Wd = Math.max(600, n * 9), H = 170, pl = 28, pb = 24, bw = (Wd - pl - 6) / n;
    const bars = S.map((s, i) => { const g = s[3] + s[4], pct = g ? s[3] / g : 0, h = (H - pb - 14) * pct, x = pl + i * bw, [k, txt] = fhResult(s, cur);
      return `<g class="fh-b ${k}"><title>${fhYear(s[0])} ${esc(s[2])}: ${s[3]}-${s[4]} · ${txt}</title><rect x="${(x + 0.5).toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${Math.max(1.5, bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>${k === 'champ' ? `<path transform="translate(${(x + bw / 2).toFixed(1)} ${(H - pb - h - 7).toFixed(1)}) scale(.6)" d="M0-7l2 4.6 5 .5-3.8 3.3 1.1 4.9L0 2.8-4.3 5.3l1.1-4.9L-7-2.9l5-.5z" class="fh-star"/>` : ''}</g>`; }).join('');
    const y50 = H - pb - (H - pb - 14) * 0.5;
    const ticks = S.map((s, i) => s[0] % 10 === 0 ? `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" class="fh-tk" text-anchor="middle">${s[0]}</text>` : '').join('');
    const moves = names.slice(1).map(nm => { const i = S.findIndex(s => s[0] === nm.a), x = pl + i * bw; return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="6" y2="${H - pb}" class="fh-mv"/><text x="${(x + 3).toFixed(1)}" y="12" class="fh-mvt">${esc(nm.n.split(' ').slice(-1)[0])}</text>`; }).join('');
    const greats = F.greats.slice(0, 10).map((g, i) => { const n = who(g[0]);
      return `<li><span class="fh-rk">${i + 1}</span>${face(n[2], n[1], 'fh-f', 60)}<span class="fh-gt">${pBtn(g[0])}<small>${fhYear(g[3])} to ${fhYear(g[4])} · ${g[2]} season${g[2] === 1 ? '' : 's'}${g[6] != null ? ` · ${g[6]} pts` : ''}${g[5] ? ` · ${g[5]}× All-Star` : ''}</small></span><span class="fh-ws"><b>${g[1].toFixed(1)}</b><small>WS</small></span></li>`; }).join('');
    const dec = [...decades].sort((a, b) => b[0] - a[0]).map(([d, m]) => `<div class="fh-dec"><b>${d}s</b>${[...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => pBtn(i)).join('<i>·</i>')}</div>`).join('');
    const rows = S.slice().reverse().slice(0, showAll ? S.length : 12).map(s => { const [k, txt] = fhResult(s, cur), t = s[7][0];
      return `<tr class="${k}"><td>${fhYear(s[0])}${s[2] !== S.at(-1)[2] ? `<small>${esc(s[2])}</small>` : ''}</td><td class="num">${s[3]}-${s[4]}</td><td class="fh-res">${txt}</td><td>${t ? `${pBtn(t[0])} <small>${t[2] ?? '–'} pts · ${t[1]} WS</small>` : ''}</td></tr>`; }).join('');
    // records since 2000-01
    const gm = (x, val) => x ? `<button class="fh-rg" data-game="${x[1]}"><b>${val}</b><span>${x[4]} ${esc(x[3])} · ${fhDate(x[2])}${x[7] ? ` · ${x[7] > 1 ? x[7] : ''}OT` : ''}${x[8] === 3 ? ' · playoffs' : ''}</span><small>${x[5]}-${x[6]}</small></button>` : '';
    const pg = (x, lab) => x ? `<button class="fh-rg" data-game="${x[3]}" data-legpid="${x[1]}"><b>${x[0]} ${lab}</b><span>${esc(x[2])}</span><small>${x[6]} ${esc(x[5])} · ${fhDate(x[4])}</small></button>` : '';
    const rec = T ? [
      ['Most points', gm(T.hi[0], T.hi[0]?.[0])], ['Fewest points', gm(T.lo[0], T.lo[0]?.[0])], ['Most allowed', gm(T.al[0], T.al[0]?.[0])],
      ['Biggest win', gm(T.bw[0], T.bw[0] ? `+${T.bw[0][0]}` : '')], ['Worst loss', gm(T.bl[0], T.bl[0] ? `−${T.bl[0][0]}` : '')],
      ['Longest winning run', T.run?.w ? `<div class="fh-rg"><b>${T.run.w[0]} wins</b><span>${fhDate(T.run.w[1])} to ${fhDate(T.run.w[2])}</span><small>Regular season</small></div>` : ''],
      ['Longest losing run', T.run?.l ? `<div class="fh-rg"><b>${T.run.l[0]} losses</b><span>${fhDate(T.run.l[1])} to ${fhDate(T.run.l[2])}</span><small>Regular season</small></div>` : ''],
      ['Most points by a player', pg(T.pg.pts[0], 'pts')], ['Most rebounds', pg(T.pg.reb[0], 'reb')], ['Most assists', pg(T.pg.ast[0], 'ast')], ['Most threes', pg(T.pg.tpm[0], '3PM')],
      ['Most 40-point games', T.p40?.[0] ? `<div class="fh-rg"><b>${T.p40[0][2]}</b><span>${esc(T.p40[0][1])}</span><small>${T.p40.slice(1).map(x => `${esc(x[1])} ${x[2]}`).join(' · ')}</small></div>` : ''],
      ['Most triple-doubles', T.td?.[0] ? `<div class="fh-rg"><b>${T.td[0][2]}</b><span>${esc(T.td[0][1])}</span><small>${T.td.slice(1).map(x => `${esc(x[1])} ${x[2]}`).join(' · ')}</small></div>` : ''],
    ].filter(x => x[1]) : [];
    box.innerHTML = `<div class="card-h"><h4>Franchise history</h4><span class="eyebrow">Since ${fhYear(S[0][0])}</span></div>
      <div class="fh">
        <div class="fh-sum">
          <div><b>${W.toLocaleString()}-${Lo.toLocaleString()}</b><small>all-time record · ${W + Lo ? (W / (W + Lo) * 100).toFixed(1) : '–'}%</small></div>
          <div class="${titles.length ? 'gold' : ''}"><b>${titles.length}</b><small>title${titles.length === 1 ? '' : 's'}${titles.length ? `: ${titles.join(', ')}` : ''}</small></div>
          <div><b>${finals}</b><small>Finals</small></div>
          <div><b>${po}</b><small>playoff seasons of ${done.length}</small></div>
        </div>
        ${names.length > 1 ? `<p class="fh-names">${names.map(nm => `<span><b>${esc(nm.n)}</b> ${fhYear(nm.a)}${nm.b > nm.a ? ` to ${nm.b >= cur ? 'now' : fhYear(nm.b)}` : ''}</span>`).join('')}</p>` : ''}
        <div class="fh-chart drag-x" data-drag><svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Win percentage by season" style="min-width:${Math.max(560, n * 8)}px"><line x1="${pl}" x2="${Wd - 6}" y1="${y50.toFixed(1)}" y2="${y50.toFixed(1)}" class="fh-50"/><text x="${pl - 4}" y="${(y50 + 3).toFixed(1)}" class="fh-tk" text-anchor="end">.500</text>${moves}${bars}${ticks}</svg></div>
        <div class="fh-key"><span><i class="champ"></i>Title</span><span><i class="finals"></i>Finals</span><span><i class="po"></i>Playoffs</span><span><i class="out"></i>Missed</span></div>
        <div class="fh-cols">
          <div><h5>Franchise greats</h5><ol class="fh-gl">${greats}</ol><p class="fh-note">Win Shares with this team (a season split between teams counts in part).</p></div>
          <div><h5>Best by decade</h5><div class="fh-decs">${dec}</div></div>
        </div>
        ${rec.length ? `<h5>Team records since 2000-01</h5><div class="fh-recs">${rec.map(([l, h]) => `<div class="fh-rec"><span class="fh-rl">${l}</span>${h}</div>`).join('')}</div>` : ''}
        <h5>Every season</h5>
        <div class="fh-tw"><table class="fh-t"><thead><tr><th>Season</th><th>W-L</th><th>Result</th><th>Best player</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${S.length > 12 ? `<button class="btn ghost sm fh-more" data-fhall>${showAll ? 'Show fewer' : `Show all ${S.length} seasons`}</button>` : ''}
        <p class="fh-note">Seasons, playoffs and Win Shares from Basketball-Reference (updated weekly); records from ESPN box scores (daily). Tap a player for his page or a game for its box score.</p>
      </div>`;
    wireDrag(box);
    const ch = $('.fh-chart', box); if (ch) ch.scrollLeft = ch.scrollWidth;
  };
  box.addEventListener('click', e => { if (e.target.closest('[data-fhall]')) { e.stopPropagation(); showAll = !showAll; draw(); } });
  box.hidden = false;
  draw();
}
