/* ---------------- team page: leaders, recent form, roster moves ---------------- */
const TL_CATS = [
  ['avgPoints', 'Points', 'PPG'], ['avgRebounds', 'Rebounds', 'RPG'], ['avgAssists', 'Assists', 'APG'], ['avgSteals', 'Steals', 'SPG'],
  ['avgBlocks', 'Blocks', 'BPG'], ['avgThreePointFieldGoalsMade', '3-pointers', '3PM'], ['fieldGoalPct', 'FG%', 'FG%'], ['avgMinutes', 'Minutes', 'MPG'],
];
const FORM_CATS = [['margin', 'Margin'], ['my', 'Points scored'], ['their', 'Points allowed']];
async function fillTeamExtras(id, evs, box) {
  const [st, moves] = await Promise.all([getJSON(`${API}/teams/${id}/athletes/statistics`).catch(() => null), loadMoves().catch(() => null)]);
  if (!box.isConnected) return;
  // players with every per-game stat by name
  const players = (st?.results?.[0]?.leaders || []).map(l => {
    const v = {}; (l.statistics || []).forEach(c => (c.stats || []).forEach(x => { if (!(x.name in v)) v[x.name] = x.value; }));
    if (l.athlete) rememberPlayer(l.athlete, id);
    return { id: l.athlete?.id, name: l.athlete?.displayName, short: l.athlete?.shortName, pos: l.athlete?.position?.abbreviation || '', gp: v.gamesPlayed, v };
  }).filter(p => p.id);
  const games = evs.filter(e => e.state === 'post' && e.my !== '' && e.their !== '').slice(-10).map(e => ({ ...e, my: +e.my, their: +e.their, margin: +e.my - +e.their }));
  const mine = (moves || []).filter(t => t.team?.id === id).slice(0, 6);
  let cat = 'avgPoints', fcat = 'margin';
  const tc = barVars(id);
  const leadersHTML = () => {
    const c = TL_CATS.find(x => x[0] === cat);
    const minGp = Math.max(1, Math.floor(Math.max(0, ...players.map(p => p.gp || 0)) * 0.4));
    const list = players.filter(p => Number.isFinite(p.v[cat]) && (p.gp || 0) >= minGp).sort((a, b) => b.v[cat] - a.v[cat]).slice(0, 5);
    const max = Math.max(...list.map(p => p.v[cat]), 0.01);
    const fmt = x => cat === 'fieldGoalPct' ? x.toFixed(1) + '%' : x.toFixed(1);
    return `<div class="card tx-lead"><div class="card-h"><h4>Team leaders</h4><span class="eyebrow">Per game</span></div>
      <div class="tx-chips hs drag-x" data-drag>${TL_CATS.map(([k, l]) => `<button class="chip sm" data-tlcat="${k}" aria-pressed="${k === cat}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="tx-rows">${list.map((p, i) => `<button class="tx-r" data-player="${esc(p.id)}"><span class="rk">${i + 1}</span>${face(p.id, p.name, 'face', 120)}<span class="nm"><b>${esc(p.name)}</b><small>${esc(p.pos)}${p.gp ? ` · ${p.gp} GP` : ''}</small></span><span class="bar"><i style="width:${(p.v[cat] / max * 100).toFixed(1)}%;${tc}"></i></span><span class="v">${fmt(p.v[cat])}<small>${c[2]}</small></span></button>`).join('')}</div>` : '<p class="tx-none">No stats yet this season.</p>'}
    </div>`;
  };
  const formHTML = () => {
    if (games.length < 2) return '';
    const vals = games.map(g => g[fcat]);
    const w = games.filter(g => g.margin > 0).length;
    const isM = fcat === 'margin';
    const max = Math.max(1, ...vals.map(Math.abs));
    return `<div class="card tx-form"><div class="card-h"><h4>Last ${games.length} games</h4><span class="eyebrow">${w}-${games.length - w}</span></div>
      <div class="tx-chips">${FORM_CATS.map(([k, l]) => `<button class="chip sm" data-fcat="${k}" aria-pressed="${k === fcat}">${l}</button>`).join('')}</div>
      <div class="fm-plot${isM ? ' m' : ''}" style="--n:${games.length}">
        ${games.map(g => { const v = g[fcat], h = Math.abs(v) / max * (isM ? 50 : 100); return `<button class="fm-col" data-game="${esc(g.id)}" title="${esc(`${fmtShortDate(g.date)} ${g.home ? 'vs' : '@'} ${g.op.abbreviation} · ${g.margin > 0 ? 'W' : 'L'} ${g.my}-${g.their}`)}">
          <span class="fm-bar ${g.margin > 0 ? 'w' : 'l'}${isM && v < 0 ? ' neg' : ''}" style="--h:${h.toFixed(1)}%"><b>${isM && v > 0 ? '+' : ''}${v}</b></span>
          <span class="fm-x">${esc(g.home ? '' : '@')}${esc(g.op.abbreviation)}</span></button>`; }).join('')}
      </div></div>`;
  };
  const movesHTML = () => mine.length ? `<div class="card tx-moves"><div class="card-h"><h4>Recent moves</h4><button class="link-btn" data-allmoves>All league moves</button></div>${mine.map(t => moveRow(t, false)).join('')}</div>` : '';
  const draw = () => { box.innerHTML = leadersHTML() + formHTML() + movesHTML(); wireDrag(box); };
  box.addEventListener('click', e => {
    const a = e.target.closest('[data-tlcat]'); if (a) { cat = a.dataset.tlcat; const x = $('.tx-chips', box).scrollLeft; draw(); $('.tx-chips', box).scrollLeft = x; return; }
    const f = e.target.closest('[data-fcat]'); if (f) { fcat = f.dataset.fcat; draw(); return; }
    if (e.target.closest('[data-allmoves]')) { closeAll(); S.teamsMode = 'moves'; go('teams'); $$('#teamsSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tmode === 'moves')); placeKnob($('#teamsSeg')); }
  });
  draw();
}
