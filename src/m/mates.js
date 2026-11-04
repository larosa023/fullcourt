/* With / without teammates on a player's profile: his numbers in games each regular teammate missed vs games
   they played together. Uses this season and last; last season only counts when that teammate was on his team. */

const curSeasonYr = () => { const now = new Date(); return IS_W ? now.getFullYear() : now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0); };
// one player's games across this season and last, tagged by season
async function twoSeasons(id) {
  const [a, b] = await Promise.all([gameLog(id).catch(() => []), gameLog(id, curSeasonYr() - 1).catch(() => [])]);
  const have = new Set(a.map(g => String(g.id)));
  return [...a.map(g => ({ ...g, prev: false })), ...b.filter(g => !have.has(String(g.id))).map(g => ({ ...g, prev: true }))];
}
// his played games split by whether the teammate played for the same side
function splitByMate(mine, mateGames) {
  const M = new Map(mateGames.filter(g => g.min > 0).map(g => [String(g.id), g.opp]));
  const shared = g => M.get(String(g.id)) === g.opp;
  const seasons = new Set(mine.filter(shared).map(g => g.prev)); // seasons they were teammates
  const withG = [], without = [];
  for (const g of mine) { if (shared(g)) withG.push(g); else if (seasons.has(g.prev)) without.push(g); }
  return { withG, without, both: seasons.size > 1 };
}
async function mtPool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }));
  return out;
}
const MT_K = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['min', 'MIN']];
const mtAvg = (gs, k) => gs.reduce((s, g) => s + g[k], 0) / gs.length;

async function drawMates(card, id) {
  card.innerHTML = `<div class="card-h"><h4>With / without</h4></div><div class="sk" style="height:200px;border-radius:12px"></div>`;
  let rows, mine;
  try {
    const all = await leagueTable(); const me = all.find(x => String(x.id) === String(id));
    if (!me?.teamId) { card.remove(); return; }
    rows = all.filter(x => String(x.teamId) === String(me.teamId) && String(x.id) !== String(id) && x.gp >= 1)
      .sort((a, b) => (b.min || 0) * (b.gp || 0) - (a.min || 0) * (a.gp || 0)).slice(0, 7);
    mine = (await twoSeasons(id)).filter(g => g.min > 0);
  } catch (e) { card.remove(); return; }
  if (!rows.length || mine.length < 3) { card.remove(); return; }
  const res = await mtPool(rows, 4, async r => ({ r, ...splitByMate(mine, await twoSeasons(r.id)) }));
  if (!card.isConnected) return;
  const list = res.filter(x => x && x.withG.length >= 2);
  if (!list.length) { card.remove(); return; }
  // biggest swing in points first, players who never missed a game at the bottom
  const tier = x => x.without.length >= 2 ? 2 : x.without.length ? 1 : 0;
  list.sort((a, b) => tier(b) - tier(a) || (b.without.length >= 2 ? Math.abs(mtAvg(b.without, 'pts') - mtAvg(b.withG, 'pts')) - Math.abs(mtAvg(a.without, 'pts') - mtAvg(a.withG, 'pts')) : 0));
  const any2 = list.some(x => x.both);
  const cell = (x, k) => {
    if (!x.without.length) return '<td class="na">–</td>';
    const a = mtAvg(x.without, k), d = a - mtAvg(x.withG, k);
    return `<td><b>${a.toFixed(1)}</b><em class="${d >= 0.5 ? 'up' : d <= -0.5 ? 'dn' : ''}">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}</em></td>`;
  };
  card.innerHTML = `<div class="card-h"><h4>With / without</h4><span class="eyebrow">${any2 ? 'This season and last' : 'This season'}</span></div>
    <div class="box-wrap drag-x" data-drag><table class="split-tbl mt-tbl"><thead><tr><th>Without</th><th>GP</th>${MT_K.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    ${list.map(x => `<tr${x.without.length ? '' : ' class="mt-none"'}><td><button class="mt-p" data-player="${x.r.id}">${face(x.r.id, x.r.name, 'mt-f', 40)}<span>${esc(x.r.short || x.r.name)}</span></button></td>
      <td>${x.without.length || '<small>never missed</small>'}</td>${x.without.length ? MT_K.map(([k]) => cell(x, k)).join('') : `<td colspan="${MT_K.length}"></td>`}</tr>`).join('')}
    </tbody></table></div>
    <p class="csp-note">His averages in games each teammate missed. The small number is the change from games they played together${any2 ? '; last season only counts if they were teammates then' : ''}. Small samples swing a lot.</p>`;
  wireDrag(card);
}
