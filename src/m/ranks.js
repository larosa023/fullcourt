/* ---------------- team rankings ---------------- */
const RANK_COLS = [
  ['ppg', 'PPG', 1], ['opp', 'Opp PPG', -1], ['diff', 'Diff', 1], ['fgp', 'FG%', 1], ['tpp', '3P%', 1], ['tpm', '3PM', 1], ['ftp', 'FT%', 1],
  ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TOV', -1], ['ofgp', 'Opp FG%', -1], ['otpp', 'Opp 3P%', -1],
];
const ADV_RANK_COLS = [
  ['ortg', 'Off rtg', 1], ['drtg', 'Def rtg', -1], ['net', 'Net rtg', 1], ['pace', 'Pace', 0], ['ts', 'TS%', 1], ['efg', 'eFG%', 1],
  ['tovp', 'TOV%', -1], ['orbp', 'ORB%', 1], ['ftr', 'FT rate', 1], ['oefg', 'Opp eFG%', -1], ['otovp', 'Opp TOV%', 1],
];
S.rankSort = 'diff';
async function loadRankings() {
  if (S.ranks && Date.now() - S.ranks.t < 10 * 60e3) return S.ranks.rows;
  const d = await getJSON(`${WEB}/statistics/byteam?region=us&lang=en&contentorigin=espn&limit=40${SEASON_QS}`, { timeout: 20000 });
  const own = {}, opp = {};
  const names = {}; (d.categories || []).forEach(c => { if (c.names) names[c.name] = c.names; });
  const rows = (d.teams || []).map(t => {
    const v = (name, key, split = '0') => { const c = t.categories.find(x => x.name === name && String(x.splitId ?? '0') === split); const i = names[name]?.indexOf(key); return c && i >= 0 ? Number(c.values[i]) : NaN; };
    regTeam(t.team);
    return {
      id: t.team.id, abbr: t.team.abbreviation, name: t.team.displayName, short: t.team.shortDisplayName || t.team.name,
      gp: v('general', 'gamesPlayed'),
      ppg: v('offensive', 'avgPoints'), opp: v('offensive', 'avgPoints', '900'), diff: v('differential', 'avgPointsDifferential'),
      fgp: v('offensive', 'fieldGoalPct'), tpp: v('offensive', 'threePointFieldGoalPct'), tpm: v('offensive', 'avgThreePointFieldGoalsMade'), ftp: v('offensive', 'freeThrowPct'),
      reb: v('general', 'avgRebounds'), ast: v('offensive', 'avgAssists'), stl: v('defensive', 'avgSteals'), blk: v('defensive', 'avgBlocks'), tov: v('offensive', 'avgTurnovers'),
      ofgp: v('offensive', 'fieldGoalPct', '900'), otpp: v('offensive', 'threePointFieldGoalPct', '900'),
      ...(() => { // four factors and per-100 ratings from the per-game numbers
        const side = sp => ({ pts: v('offensive', 'avgPoints', sp), fga: v('offensive', 'avgFieldGoalsAttempted', sp), fgm: v('offensive', 'avgFieldGoalsMade', sp), tpm: v('offensive', 'avgThreePointFieldGoalsMade', sp), fta: v('offensive', 'avgFreeThrowsAttempted', sp), orb: v('offensive', 'avgOffensiveRebounds', sp), drb: v('defensive', 'avgDefensiveRebounds', sp), tov: v('offensive', 'avgTurnovers', sp) });
        const o = side('0'), x = side('900');
        const poss = t => t.fga - t.orb + t.tov + 0.44 * t.fta, P = (poss(o) + poss(x)) / 2;
        const tovp = t => 100 * t.tov / (t.fga + 0.44 * t.fta + t.tov);
        return { ortg: 100 * o.pts / P, drtg: 100 * x.pts / P, net: 100 * (o.pts - x.pts) / P, pace: P, ts: 100 * tsPct(o.pts, o.fga, o.fta), efg: 100 * efgPct(o.fgm, o.tpm, o.fga), tovp: tovp(o), orbp: 100 * o.orb / (o.orb + x.drb), ftr: 100 * o.fta / o.fga, oefg: 100 * efgPct(x.fgm, x.tpm, x.fga), otovp: tovp(x) };
      })(),
    };
  }).filter(r => r.id);
  for (const [k, , dir] of [...RANK_COLS, ...ADV_RANK_COLS.map(([a, b, c]) => [a, b, c || 1])]) {
    const sorted = rows.filter(r => Number.isFinite(r[k])).sort((a, b) => dir * (b[k] - a[k]));
    sorted.forEach((r, i) => { r['rk_' + k] = i + 1; });
  }
  S.ranks = { t: Date.now(), rows };
  return rows;
}
async function renderRankings() {
  const body = $('#teamsBody');
  body.innerHTML = `<div class="sk" style="height:520px"></div>`;
  let rows;
  try { rows = await loadRankings(); } catch (e) { body.innerHTML = `<div class="empty"><b>Rankings didn't load</b>The stats feed may be busy.<br><button class="btn" data-retry="teams">Try again</button></div>`; return; }
  if (S.teamsMode !== 'ranks') return;
  drawRankings(rows);
}
function drawRankings(rows) {
  const body = $('#teamsBody');
  const COLS = advOn ? ADV_RANK_COLS : RANK_COLS;
  const col = COLS.find(c => c[0] === S.rankSort) || COLS[advOn ? 2 : 2];
  const n = rows.length, top = Math.max(3, Math.round(n / 6));
  const list = rows.slice().sort((a, b) => (a['rk_' + col[0]] || 99) - (b['rk_' + col[0]] || 99));
  const fmt = (k, v) => !Number.isFinite(v) ? '–' : k === 'diff' || k === 'net' ? (v > 0 ? '+' : '') + v.toFixed(1) : v.toFixed(1);
  body.innerHTML = `<div class="rank-top"><p class="rank-note">${advOn ? 'Advanced: ratings are points per 100 possessions, pace is possessions per game, plus the four factors.' : 'Per game this season.'} Rank shown under each number, top ${top} in green, bottom ${top} in red. Click a column to sort.</p>${advBtn()}</div>
  <div class="tbl-wrap drag-x rank-wrap" data-drag><table class="std rank-t">
    <thead><tr><th class="tm">Team</th>${COLS.map(([k, l, dir]) => `<th class="${k === col[0] ? 'on' : ''}"><button data-rsort="${k}" title="${dir < 0 ? 'Lower is better' : dir > 0 ? 'Higher is better' : 'Possessions per game'}">${esc(l)}</button></th>`).join('')}</tr></thead>
    <tbody>${list.map((r, i) => `<tr data-team="${r.id}"${r.id === favId ? ' class="fav"' : ''}>
      <td class="tm"><span class="tm-in"><span class="rk-n">${i + 1}</span>${logo(r.abbr, 40)}<b>${esc(r.short)}</b></span></td>
      ${COLS.map(([k]) => { const rk = r['rk_' + k]; const c = rk <= top ? 'g' : rk > n - top ? 'b' : ''; return `<td class="${c}${k === col[0] ? ' on' : ''}"><b>${fmt(k, r[k])}</b><small>${rk ? ordinal(rk) : ''}</small></td>`; }).join('')}
    </tr>`).join('')}</tbody></table></div>`;
  wireDrag(body);
}


document.addEventListener('fcadv', () => { if (S.view === 'teams' && S.teamsMode === 'ranks' && S.ranks) drawRankings(S.ranks.rows); });
