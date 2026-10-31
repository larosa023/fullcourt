/* ---------------- player: every game this season ---------------- */
async function fillLog(card, id) {
  const box = $('.career-in', card);
  let log;
  try { log = await gameLog(id); } catch (e) { card._loaded = false; box.innerHTML = '<p class="car-none">The game log didn\'t load. Close and reopen to try again.</p>'; return; }
  if (!log.length) { box.innerHTML = '<p class="car-none">No games yet this season.</p>'; return; }
  const sub = $('.career-h small', card); if (sub) sub.textContent = `${plural(log.length, 'game')} this season`;
  const FILTERS = [['all', 'All'], ['W', 'Wins'], ['L', 'Losses'], ['home', 'Home'], ['away', 'Away'], ['20', '20+ points'], ['dd', 'Double-doubles']];
  const test = { all: () => true, W: g => g.res === 'W', L: g => g.res === 'L', home: g => g.atVs !== '@', away: g => g.atVs === '@', 20: g => g.pts >= 20, dd: g => [g.pts, g.reb, g.ast, g.stl, g.blk].filter(v => v >= 10).length >= 2 };
  let f = 'all', all = false;
  const LIMIT = 10;
  const sp = x => `${x[0]}-${x[1]}`;
  const draw = () => {
    const rows = log.filter(test[f]);
    const shown = all ? rows : rows.slice(0, LIMIT);
    const avg = k => rows.length ? (rows.reduce((s, g) => s + g[k], 0) / rows.length).toFixed(1) : '–';
    box.innerHTML = `<div class="tx-chips">${FILTERS.map(([k, l]) => `<button class="chip sm" data-logf="${k}" aria-pressed="${k === f}">${l}<em>${log.filter(test[k]).length}</em></button>`).join('')}</div>
      ${rows.length ? `<div class="box-wrap drag-x" data-drag><table class="split-tbl car-tbl log-tbl">
        <thead><tr><th>Date</th><th>Opp</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3PT</th><th>FT</th></tr></thead>
        <tbody>${shown.map(g => `<tr data-game="${esc(g.id)}"><td><b>${esc(g.date ? fmtShortDate(g.date) : '')}</b></td><td><span class="car-tm">${esc(g.atVs === '@' ? '@' : 'vs')} ${g.opp ? logo(g.opp, 32) : ''}${esc(g.opp)}</span></td><td><span class="${g.res === 'W' ? 'strk-w' : g.res === 'L' ? 'strk-l' : ''}">${esc(g.res)}</span> ${esc(g.score)}</td><td>${g.min}</td><td><b>${g.pts}</b></td><td>${g.reb}</td><td>${g.ast}</td><td>${g.stl}</td><td>${g.blk}</td><td>${g.tov}</td><td>${sp(g.fg)}</td><td>${sp(g.tp)}</td><td>${sp(g.ft)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Average</b></td><td></td><td>${rows.length} G</td><td>${avg('min')}</td><td><b>${avg('pts')}</b></td><td>${avg('reb')}</td><td>${avg('ast')}</td><td>${avg('stl')}</td><td>${avg('blk')}</td><td>${avg('tov')}</td><td></td><td></td><td></td></tr></tfoot>
      </table></div>
      ${rows.length > LIMIT ? `<button class="btn ghost car-more" data-logmore>${all ? 'Show fewer games' : `Show all ${rows.length} games`}</button>` : ''}` : '<p class="car-none">No games match.</p>'}`;
    wireDrag(box);
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-logf]'); if (b) { f = b.dataset.logf; all = false; const x = $('.tx-chips', box).scrollLeft; draw(); $('.tx-chips', box).scrollLeft = x; return; }
    if (e.target.closest('[data-logmore]')) { all = !all; draw(); if (!all) card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
  });
  draw();
}
