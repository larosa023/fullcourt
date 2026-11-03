/* NBA Cup: group tables (with the official tiebreakers), wild cards, and the knockout bracket.
   Group games are the regular-season games ESPN tags "NBA Cup - Group Play"; knockout games are tagged by round. */

const CUP = {
  year: 2026, final: 'Hinkle Fieldhouse, Indianapolis',
  groupDays: ['20261030', '20261106', '20261113', '20261120', '20261124', '20261125', '20261127'],
  koDays: ['20261204', '20261205', '20261208', '20261209', '20261211'],
};
const CUP_CONFS = ['East', 'West'];
const cupMem = {};
const slim = g => ({ id: g.id, date: g.date, state: g.state, period: g.period, note: g.note || '', detail: g.detail, clock: g.clock,
  home: { id: g.home.id, abbr: g.home.abbr, score: g.home.score, winner: g.home.winner }, away: { id: g.away.id, abbr: g.away.abbr, score: g.away.score, winner: g.away.winner } });
// a finished night never changes, so it's kept for good; today's and future nights are re-checked every minute
async function cupDay(d) {
  const key = 'fc-cup-' + d, mem = cupMem[d];
  if (mem && (mem.done || Date.now() - mem.t < 60e3)) return mem.games;
  if (!mem) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v?.done) { cupMem[d] = v; return v.games; } } catch (e) {} }
  const games = (await scoreboardOn(d)).filter(g => /NBA Cup/i.test(g.note || '')).map(slim);
  const done = games.length > 0 && games.every(g => g.state === 'post');
  cupMem[d] = { games, done, t: Date.now() };
  if (done) try { localStorage.setItem(key, JSON.stringify({ games, done })); } catch (e) {}
  return games;
}
let prevRec = null;
const loadPrev = () => prevRec || (prevRec = getJSON(`${API2}/standings?season=${CUP.year}`).then(d => {
  const m = {}; for (const ch of d.children || []) for (const en of ch.standings?.entries || []) { const s = n => en.stats.find(x => x.name === n)?.value; m[en.team.abbreviation] = s('winPercent') ?? 0; }
  return m;
}).catch(() => ({})));

/* ---------- group tables ---------- */
function groupTable(name, teams, games, prev) {
  const rows = teams.map(ab => ({ ab, w: 0, l: 0, pd: 0, pts: 0, gp: 0, live: false }));
  const R = Object.fromEntries(rows.map(r => [r.ab, r]));
  const mine = games.filter(g => /Group Play/i.test(g.note) && R[g.home.abbr] && R[g.away.abbr]);
  for (const g of mine) {
    if (g.state === 'in') { R[g.home.abbr].live = R[g.away.abbr].live = true; continue; }
    if (g.state !== 'post') continue;
    const hs = +g.home.score || 0, as = +g.away.score || 0, hw = hs > as, ot = g.period > 4;
    const H = R[g.home.abbr], A = R[g.away.abbr];
    H.gp++; A.gp++; H.pts += hs; A.pts += as;
    if (!ot) { H.pd += hs - as; A.pd += as - hs; } // 2026 rule: an overtime game counts as 0 in point differential
    (hw ? H : A).w++; (hw ? A : H).l++;
  }
  const h2hWins = (ab, set) => mine.filter(g => g.state === 'post' && set.has(g.home.abbr) && set.has(g.away.abbr) && (g.home.abbr === ab || g.away.abbr === ab))
    .filter(g => (+g.home.score > +g.away.score ? g.home.abbr : g.away.abbr) === ab).length;
  // tiebreakers: head-to-head among the tied teams, point differential, points scored, last season's record
  const out = [];
  const byW = [...rows].sort((a, b) => b.w - a.w || a.l - b.l);
  for (let i = 0; i < byW.length;) {
    let j = i; while (j < byW.length && byW[j].w === byW[i].w && byW[j].l === byW[i].l) j++;
    const tied = byW.slice(i, j), set = new Set(tied.map(t => t.ab));
    tied.forEach(t => { t.h2h = tied.length > 1 ? h2hWins(t.ab, set) : 0; });
    tied.sort((a, b) => b.h2h - a.h2h || b.pd - a.pd || b.pts - a.pts || (prev[b.ab] ?? 0) - (prev[a.ab] ?? 0) || a.ab.localeCompare(b.ab));
    out.push(...tied); i = j;
  }
  return { name, rows: out, left: 10 - mine.filter(g => g.state === 'post').length, games: mine };
}
const rankTeams = (list, prev) => [...list].sort((a, b) => b.w - a.w || a.l - b.l || b.pd - a.pd || b.pts - a.pts || (prev[b.ab] ?? 0) - (prev[a.ab] ?? 0));

/* ---------- render ---------- */
const tName = ab => Object.values(S.teams).find(t => t.abbr === ab)?.short || ab;
let cupBusy = false;
async function renderCup(wrap) {
  if (cupBusy) return; cupBusy = true;
  try {
    const [days, prev] = await Promise.all([Promise.all([...CUP.groupDays, ...CUP.koDays].map(d => cupDay(d).catch(() => []))), loadPrev()]);
    if (S.view !== 'standings' || S.stdConf !== 4) return;
    const games = days.flat();
    const groups = Object.entries(CUP_GROUPS).map(([n, t]) => groupTable(n, t, games, prev));
    const today = S.today;
    const groupDone = groups.every(g => g.left === 0);
    // seeds per conference: three group winners by record, then the wild card (best second-place team)
    const seeds = {};
    for (const c of CUP_CONFS) {
      const gs = groups.filter(g => g.name.startsWith(c));
      const winners = rankTeams(gs.map(g => g.rows[0]), prev), wc = rankTeams(gs.map(g => g.rows[1]), prev)[0];
      seeds[c] = [...winners, wc];
    }
    const wcSet = new Set(CUP_CONFS.map(c => seeds[c][3].ab));
    const nextNight = CUP.groupDays.find(d => d >= today);
    const head = `<div class="cup-head"><div><b>NBA Cup ${CUP.year}</b><span>${groupDone ? 'Group play is done' : `Group play · ${groups.reduce((n, g) => n + (10 - g.left), 0)} of 60 games played${nextNight ? ` · next Cup night ${fmtDay(nextNight, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}`} · Quarterfinals Dec 4–5 · Semifinals Dec 8–9 · Final Dec 11 in Indianapolis</span></div></div>`;
    const tbl = g => `<div class="cup-g"><div class="cup-gh"><h3>${esc(g.name)}</h3><span>${g.left ? `${g.left} game${g.left === 1 ? '' : 's'} left` : 'Final'}</span></div>
      <table class="std cup-t"><thead><tr><th>Team</th><th>W-L</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${g.rows.map((r, i) => {
        const z = i === 0 ? 'po' : wcSet.has(r.ab) ? 'pi' : '';
        const t = Object.values(S.teams).find(x => x.abbr === r.ab);
        return `<tr${t ? ` data-team="${t.id}"` : ''}${t?.id === favId ? ' class="fav-row"' : ''}><td><div class="team-cell"><i class="zone ${z}"></i><span class="seed">${i + 1}</span>${logo(r.ab, 56)}<b>${esc(tName(r.ab))}</b><span class="ab">${esc(r.ab)}</span>${r.live ? '<i class="dot on" title="Playing a Cup game now"></i>' : ''}</div></td>
          <td>${r.w}-${r.l}</td><td class="${r.pd > 0 ? 'strk-w' : r.pd < 0 ? 'strk-l' : ''}">${r.pd > 0 ? '+' : ''}${r.pd}</td><td>${r.pts}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    const confHTML = c => `<div class="cup-conf"><h2 class="h-display">${c}</h2><div class="cup-gs">${groups.filter(g => g.name.startsWith(c)).map(tbl).join('')}</div></div>`;
    // knockout games, if they exist yet; otherwise "if group play ended today"
    const ko = games.filter(g => !/Group Play/i.test(g.note));
    // ESPN lists placeholder knockout games (TBD vs TBD) early: only use a game once the team(s) we're looking for are in it
    const find = (re, a, b) => (a || b) ? ko.find(g => re.test(g.note) && (!a || [g.home.abbr, g.away.abbr].includes(a)) && (!b || [g.home.abbr, g.away.abbr].includes(b))) : null;
    const winnerOf = g => g && g.state === 'post' ? (+g.home.score > +g.away.score ? g.home.abbr : g.away.abbr) : null;
    const side = (ab, seed, g) => {
      const sc = g && g.state !== 'pre' ? (g.home.abbr === ab ? g.home.score : g.away.score) : '';
      const lost = g && g.state === 'post' && winnerOf(g) !== ab;
      return ab ? `<div class="cup-s${lost ? ' l' : ''}"><small>${seed || ''}</small>${logo(ab, 40)}<span>${esc(tName(ab))}</span><b>${esc(sc ?? '')}</b></div>` : `<div class="cup-s tbd"><small></small><i class="cup-ph"></i><span>TBD</span><b></b></div>`;
    };
    const match = (a, sa, b, sb, g, label) => {
      const st = g ? (g.state === 'post' ? 'Final' : g.state === 'in' ? `<i class="dot on"></i>${esc(g.detail || 'Live')}` : esc(fmtLocal(g.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(g.date, true))) : esc(label);
      return `<${g ? `button data-game="${g.id}"` : 'div'} class="cup-m${g?.state === 'in' ? ' live' : ''}"><span class="cup-ms">${st}</span>${side(a, sa, g)}${side(b, sb, g)}</${g ? 'button' : 'div'}>`;
    };
    const proj = !groupDone;
    const conf = c => {
      const s = seeds[c].map(r => r.ab);
      const q1 = find(/Quarter/i, s[0], s[3]) || (proj ? null : find(/Quarter/i, s[0])), q2 = find(/Quarter/i, s[1], s[2]) || (proj ? null : find(/Quarter/i, s[1]));
      const w1 = winnerOf(q1), w2 = winnerOf(q2), sf = find(/Semi/i, w1, w2) || (w1 ? find(/Semi/i, w1) : null);
      return { s, q1, q2, w1, w2, sf, champ: winnerOf(sf) };
    };
    const E = conf('East'), W = conf('West');
    const fin = find(/Championship|Final(?!s)/i, E.champ, W.champ);
    const qLabel = proj ? 'If group play ended today' : 'Dec 4–5';
    const colHTML = (c, X) => `<div class="cup-col"><h4>${c} quarterfinals</h4>${match(X.s[0], 1, X.s[3], 'WC', X.q1, qLabel)}${match(X.s[1], 2, X.s[2], 3, X.q2, qLabel)}</div>
      <div class="cup-col"><h4>${c} semifinal</h4>${match(X.w1, '', X.w2, '', X.sf, 'Dec 8–9')}</div>`;
    const bracket = `<div class="cup-bk"><div class="cup-bh"><h2 class="h-display">Knockout rounds</h2><span>${proj ? 'Projected from the current group tables. The higher seed hosts the quarterfinals and semifinals.' : 'The higher seed hosts the quarterfinals and semifinals.'}</span></div>
      <div class="cup-tree drag-x" data-drag>${colHTML('East', E)}<div class="cup-col cup-fin"><h4>Championship · Dec 11</h4>${match(E.champ, 'E', W.champ, 'W', fin, 'Indianapolis')}<p>${esc(CUP.final)}</p></div>${colHTML('West', W)}</div></div>`;
    const legend = `<div class="legend cup-leg"><span><i class="zone po"></i>Leads the group</span><span><i class="zone pi"></i>Wild card (best second-place team in the conference)</span></div>
      <details class="cup-rules"><summary>How ties are broken</summary><p>Teams with the same record in a group are separated by: head-to-head result, then point differential in Cup group games, then total points scored, then last season's record, then a random drawing. New this year, a game that goes to overtime counts as 0 in point differential for both teams. Wild cards use the same order without head-to-head. Group games count in the regular-season standings; the championship game does not.</p></details>`;
    wrap.classList.remove('tbl-wrap', 'drag-x'); wrap.removeAttribute('data-drag');
    wrap.innerHTML = `<div class="cup">${head}<div class="cup-confs">${CUP_CONFS.map(confHTML).join('')}</div>${legend}${bracket}</div>`;
    dragScroll($('.cup-tree', wrap));
  } finally { cupBusy = false; }
}
// keep it fresh while it's open on a Cup night
setInterval(() => { if (!document.hidden && S.view === 'standings' && S.stdConf === 4) { const w = $('#stdWrap'); if (w) renderCup(w); } }, 60e3);
