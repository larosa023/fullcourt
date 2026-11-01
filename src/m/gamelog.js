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
    const A = advOn;
    const head = A ? ['Date', 'Opp', 'Result', 'MIN', 'PTS', 'TS%', 'eFG%', 'FGA', '3PA', 'FTA', 'AST/TO'] : ['Date', 'Opp', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3PT', 'FT'];
    const cells = g => A ? [g.min, `<b>${g.pts}</b>`, advPct(tsPct(g.pts, g.fg[1], g.ft[1])), advPct(efgPct(g.fg[0], g.tp[0], g.fg[1])), g.fg[1], g.tp[1], g.ft[1], advNum(astTo(g.ast, g.tov))] : [g.min, `<b>${g.pts}</b>`, g.reb, g.ast, g.stl, g.blk, g.tov, sp(g.fg), sp(g.tp), sp(g.ft)];
    const sum = k => rows.reduce((s, g) => s + (Array.isArray(g[k]) ? 0 : g[k]), 0), sumA = (k, i) => rows.reduce((s, g) => s + g[k][i], 0);
    const foot = A ? [avg('min'), `<b>${avg('pts')}</b>`, advPct(tsPct(sum('pts'), sumA('fg', 1), sumA('ft', 1))), advPct(efgPct(sumA('fg', 0), sumA('tp', 0), sumA('fg', 1))), rows.length ? (sumA('fg', 1) / rows.length).toFixed(1) : '–', rows.length ? (sumA('tp', 1) / rows.length).toFixed(1) : '–', rows.length ? (sumA('ft', 1) / rows.length).toFixed(1) : '–', advNum(astTo(sum('ast'), sum('tov')))] : [avg('min'), `<b>${avg('pts')}</b>`, avg('reb'), avg('ast'), avg('stl'), avg('blk'), avg('tov'), '', '', ''];
    // totals row: every column summed; shooting as made-attempted with the percentage under it
    const shot = k => { const m = sumA(k, 0), a = sumA(k, 1); return `${m}-${a}<small>${a ? (m / a * 100).toFixed(1) + '%' : '–'}</small>`; };
    const mins = rows.reduce((s, g) => s + (+g.min || 0), 0);
    const w = rows.filter(g => g.res === 'W').length, l = rows.filter(g => g.res === 'L').length;
    const wl = `${w}-${l}`;
    const tot = A ? [mins, `<b>${sum('pts')}</b>`, '', '', sumA('fg', 1), sumA('tp', 1), sumA('ft', 1), `${sum('ast')}/${sum('tov')}`]
      : [mins, `<b>${sum('pts')}</b>`, sum('reb'), sum('ast'), sum('stl'), sum('blk'), sum('tov'), shot('fg'), shot('tp'), shot('ft')];
    if (!A) foot.splice(7, 3, ...['fg', 'tp', 'ft'].map(k => { const a = sumA(k, 1); return a ? (sumA(k, 0) / a * 100).toFixed(1) + '%' : '–'; }));
    box.innerHTML = `<div class="car-top"><span class="eyebrow">${A ? 'TS% true shooting · eFG% effective FG' : 'Tap a game to open it'}</span>${advBtn()}</div><div class="tx-chips">${FILTERS.map(([k, l]) => `<button class="chip sm" data-logf="${k}" aria-pressed="${k === f}">${l}<em>${log.filter(test[k]).length}</em></button>`).join('')}</div>
      ${rows.length ? `<div class="box-wrap drag-x" data-drag><table class="split-tbl car-tbl log-tbl">
        <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${shown.map(g => `<tr data-game="${esc(g.id)}"><td><b>${esc(g.date ? fmtShortDate(g.date) : '')}</b></td><td><span class="car-tm">${esc(g.atVs === '@' ? '@' : 'vs')} ${g.opp ? logo(g.opp, 32) : ''}${esc(g.opp)}</span></td><td><span class="${g.res === 'W' ? 'strk-w' : g.res === 'L' ? 'strk-l' : ''}">${esc(g.res)}</span> ${esc(g.score)}</td>${cells(g).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><td><b>${A ? 'Season' : 'Average'}</b></td><td></td><td>${rows.length} G</td>${foot.map(x => `<td>${x}</td>`).join('')}</tr>
          <tr class="log-tot"><td><b>Totals</b></td><td></td><td>${wl}</td>${tot.map(x => `<td>${x}</td>`).join('')}</tr></tfoot>
      </table></div>
      ${rows.length > LIMIT ? `<button class="btn ghost car-more" data-logmore>${all ? 'Show fewer games' : `Show all ${rows.length} games`}</button>` : ''}` : '<p class="car-none">No games match.</p>'}`;
    wireDrag(box);
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-logf]'); if (b) { f = b.dataset.logf; all = false; const x = $('.tx-chips', box).scrollLeft; draw(); $('.tx-chips', box).scrollLeft = x; return; }
    if (e.target.closest('[data-logmore]')) { all = !all; draw(); if (!all) card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
  });
  const onAdv = () => { if (!card.isConnected) { document.removeEventListener('fcadv', onAdv); return; } draw(); };
  document.addEventListener('fcadv', onAdv);
  draw();
}
