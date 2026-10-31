/* ---------------- advanced leader boards (from the full player table) ---------------- */
async function renderAdvLeader(c) {
  const body = $('#leadBody');
  body.innerHTML = `<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>`;
  let rows;
  try { [rows] = await Promise.all([leagueTable(), loadStandings().catch(() => null), ensureTeamColors()]); }
  catch (e) { body.innerHTML = `<div class="empty"><b>Leaders didn't load</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`; return; }
  if (leadCats()[S.leadKey] !== c) return;
  const maxGp = Math.max(1, ...rows.map(r => r.gp || 0));
  const enough = r => (r.gp || 0) >= Math.max(1, Math.floor(maxGp * 0.5)) && (r.min || 0) >= 15;
  const fgm = r => (r.fga || 0) * (r.fgp || 0) / 100;
  const calc = {
    ts: r => (r.fga || 0) >= 8 ? 100 * tsPct(r.pts, r.fga, r.fta || 0) : NaN,
    efg: r => (r.fga || 0) >= 8 ? 100 * efgPct(fgm(r), r.tpm || 0, r.fga) : NaN,
    p36: r => (r.min || 0) >= 20 ? r.pts * 36 / r.min : NaN,
    ato: r => (r.ast || 0) >= 3 ? astTo(r.ast, r.tov || 0) : NaN,
    stocks: r => (r.stl || 0) + (r.blk || 0),
    ftr: r => (r.fga || 0) >= 8 ? 100 * (r.fta || 0) / r.fga : NaN,
    tpr: r => (r.fga || 0) >= 8 ? 100 * (r.tpa || 0) / r.fga : NaN,
  }[c.adv];
  const list = rows.filter(enough).map(r => ({ r, v: calc(r) })).filter(x => Number.isFinite(x.v)).sort((a, b) => b.v - a.v).slice(0, 15);
  if (!list.length) { body.innerHTML = `<div class="empty"><b>Not enough games yet</b>Check back after a few more games.</div>`; return; }
  list.forEach(x => rememberPlayer({ id: x.r.id, displayName: x.r.name, shortName: x.r.short, position: { abbreviation: x.r.pos } }, x.r.teamId));
  const fmt = v => v.toFixed(1), top = list[0], max = Math.max(...list.map(x => x.v)) || 1;
  const NOTE = { ts: 'True shooting: points per shooting possession, counting threes and free throws. Min 8 shots a game.', efg: 'Effective field goal %: field goal % with threes worth 1.5 makes. Min 8 shots a game.', p36: 'Points per 36 minutes. Min 20 minutes a game.', ato: 'Assists per turnover. Min 3 assists a game.', stocks: 'Steals plus blocks per game.', ftr: 'Free throw attempts per shot attempt (getting to the line). Min 8 shots a game.', tpr: 'Share of shots taken from three. Min 8 shots a game.' }[c.adv];
  body.innerHTML = `<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${teamColor(top.r.teamId || top.r.abbr)}" data-player="${top.r.id}">
      <span class="rk">No. 1 · ${esc(c.k.toUpperCase())}</span>
      ${face(top.r.id, top.r.name, 'face', 700)}
      <div class="big num">${fmt(top.v)}<small>${esc(c.u)}</small></div>
      <div class="who">${esc(top.r.name)}</div>
      <div class="meta">${esc(top.r.abbr)} · ${esc(top.r.pos)} · ${top.r.gp} GP</div>
    </button>
    <div><div class="lrows">${list.map((x, i) => `
      <button class="lrow enter" style="--i:${i}" data-player="${x.r.id}">
        <span class="rk">${i + 1}</span>${face(x.r.id, x.r.name, 'face', 120)}
        <span class="nm"><b>${esc(x.r.name)}</b><span>${logo(x.r.abbr, 32)}${esc(x.r.abbr)} · ${esc(x.r.pos)} · ${x.r.gp} GP</span></span>
        <span class="bar"><i data-w="${(x.v / max * 100).toFixed(1)}" style="${barVars(x.r.teamId || x.r.abbr)}"></i></span>
        <span class="v">${fmt(x.v)}</span>
      </button>`).join('')}</div>
      <p class="race-note">${esc(NOTE)} Worked out from ESPN's per-game numbers.</p></div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.lrow .bar i', body).forEach(i => i.style.width = i.dataset.w + '%')));
}
