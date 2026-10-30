/* ---------------- team rankings ---------------- */
const RANK_COLS = [
  ['ppg', 'PPG', 1], ['opp', 'Opp PPG', -1], ['diff', 'Diff', 1], ['fgp', 'FG%', 1], ['tpp', '3P%', 1], ['tpm', '3PM', 1], ['ftp', 'FT%', 1],
  ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TOV', -1], ['ofgp', 'Opp FG%', -1], ['otpp', 'Opp 3P%', -1],
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
    };
  }).filter(r => r.id);
  for (const [k, , dir] of RANK_COLS) {
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
  const col = RANK_COLS.find(c => c[0] === S.rankSort) || RANK_COLS[2];
  const n = rows.length, top = Math.max(3, Math.round(n / 6));
  const list = rows.slice().sort((a, b) => (a['rk_' + col[0]] || 99) - (b['rk_' + col[0]] || 99));
  const fmt = (k, v) => !Number.isFinite(v) ? '–' : k === 'diff' ? (v > 0 ? '+' : '') + v.toFixed(1) : v.toFixed(1);
  body.innerHTML = `<p class="rank-note">Per game this season. Rank shown under each number, top ${top} in green, bottom ${top} in red. Click a column to sort.</p>
  <div class="tbl-wrap drag-x rank-wrap" data-drag><table class="std rank-t">
    <thead><tr><th class="tm">Team</th>${RANK_COLS.map(([k, l, dir]) => `<th class="${k === col[0] ? 'on' : ''}"><button data-rsort="${k}" title="${dir < 0 ? 'Lower is better' : 'Higher is better'}">${esc(l)}</button></th>`).join('')}</tr></thead>
    <tbody>${list.map((r, i) => `<tr data-team="${r.id}"${r.id === favId ? ' class="fav"' : ''}>
      <td class="tm"><span class="tm-in"><span class="rk-n">${i + 1}</span>${logo(r.abbr, 40)}<b>${esc(r.short)}</b></span></td>
      ${RANK_COLS.map(([k]) => { const rk = r['rk_' + k]; const c = rk <= top ? 'g' : rk > n - top ? 'b' : ''; return `<td class="${c}${k === col[0] ? ' on' : ''}"><b>${fmt(k, r[k])}</b><small>${rk ? ordinal(rk) : ''}</small></td>`; }).join('')}
    </tr>`).join('')}</tbody></table></div>`;
  wireDrag(body);
}

