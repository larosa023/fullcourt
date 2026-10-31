/* ---------------- career stats: season by season ---------------- */
async function fillCareer(card, id) {
  const box = $('.career-in', card);
  let reg, post;
  try { [reg, post] = await Promise.all([getJSON(`${WEB}/athletes/${id}/stats`), getJSON(`${WEB}/athletes/${id}/stats?seasontype=3`).catch(() => null)]); }
  catch (e) { card._loaded = false; box.innerHTML = '<p class="car-none">Career stats didn\'t load. Close and reopen to try again.</p>'; return; }
  const sets = [['reg', 'Regular season', parseCareer(reg)], ['post', 'Playoffs', parseCareer(post)]].filter(([, , d]) => d?.rows.length);
  if (!sets.length) { box.innerHTML = '<p class="car-none">No career stats yet.</p>'; return; }
  let mode = sets[0][0], showAll = false;
  const LIMIT = 8;
  const draw = () => {
    const d = sets.find(x => x[0] === mode)[2];
    const rows = d.rows.slice().reverse();
    const shown = showAll ? rows : rows.slice(0, LIMIT);
    const sub = $('.career-h small', card);
    if (sub) sub.textContent = `${plural(sets[0][2].rows.length, 'season')}${sets[1] ? ` · ${plural(sets[1][2].rows.length, 'playoff run')}` : ''}`;
    box.innerHTML = `
      ${sets.length > 1 ? `<div class="seg car-seg"><span class="knob"></span>${sets.map(([k, l]) => `<button data-carmode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>` : ''}
      <div class="box-wrap drag-x" data-drag><table class="split-tbl car-tbl">
        <thead><tr><th>Season</th><th>Team</th>${d.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map(r => `<tr><td><b>${esc(r.season)}</b></td><td><span class="car-tm">${r.abbr ? logo(r.abbr, 32) : ''}${esc(r.abbr || '—')}</span></td>${r.v.map(x => `<td>${esc(x ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody>
        ${d.career ? `<tfoot><tr><td><b>Career</b></td><td></td>${d.career.map(x => `<td><b>${esc(x ?? '–')}</b></td>`).join('')}</tr></tfoot>` : ''}
      </table></div>
      ${rows.length > LIMIT ? `<button class="btn ghost car-more" data-carmore>${showAll ? 'Show fewer seasons' : `Show all ${rows.length} seasons`}</button>` : ''}`;
    wireDrag(box);
    const seg = $('.car-seg', box); if (seg) requestAnimationFrame(() => placeKnob(seg));
  };
  box.addEventListener('click', e => {
    const m = e.target.closest('[data-carmode]'); if (m) { mode = m.dataset.carmode; showAll = false; draw(); return; }
    if (e.target.closest('[data-carmore]')) {
      showAll = !showAll; draw();
      if (!showAll) card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  });
  draw();
}
// one season per row, newest last; team abbreviations from the feed's team list
function parseCareer(d) {
  const cat = d?.categories?.find(c => c.name === 'averages');
  if (!cat?.statistics?.length) return null;
  const lab = cat.labels || [];
  const want = ['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%', 'TO'].filter(c => lab.includes(c));
  const teams = {}; Object.values(d.teams || {}).forEach(t => { if (t?.id) teams[t.id] = t.abbreviation; });
  const pick = arr => want.map(c => arr?.[lab.indexOf(c)]);
  return {
    cols: want,
    rows: cat.statistics.map(s => ({ season: s.season?.displayName || s.season?.year || '', abbr: teams[s.teamId] || '', v: pick(s.stats) })),
    career: cat.totals ? pick(cat.totals) : null,
  };
}
