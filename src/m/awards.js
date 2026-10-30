/* ---------------- award races (estimates) ---------------- */
// One "impact" number per player from per-game box-score stats, docked for missed shots and turnovers.
// MVP also weighs team record; both need a fair share of the team's games played.
const impactOf = r => {
  const missFG = (r.fga || 0) * (1 - (r.fgp || 0) / 100), missFT = (r.fta || 0) - (r.ftm || 0);
  return (r.pts || 0) + 1.2 * (r.reb || 0) + 1.5 * (r.ast || 0) + 2 * (r.stl || 0) + 2 * (r.blk || 0) - 1.5 * (r.tov || 0) - 0.6 * missFG - 0.4 * Math.max(0, missFT);
};
async function rookieIds() {
  const now = new Date(), yr = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const key = `fc-draft-${LG}-${yr}`;
  const c = lsGet(key); if (c) { try { return new Set(JSON.parse(c)); } catch (e) {} }
  const d = await getJSON(`${API}/draft?season=${yr}`);
  const ids = (d.picks || []).map(p => p.athlete?.alternativeId || p.athlete?.id).filter(Boolean).map(String);
  if (ids.length) lsSet(key, JSON.stringify(ids));
  return new Set(ids);
}
async function awardRace(kind) {
  const [rows] = await Promise.all([leagueTable(), loadStandings().catch(() => null)]);
  const recs = new Map((S.standings?.confs || []).flatMap(c => c.rows).map(r => [r.id, r]));
  const rk = kind === 'roy' ? await rookieIds() : null;
  return rows.filter(r => {
    if (!(r.gp > 0) || !Number.isFinite(r.pts)) return false;
    if (rk && !rk.has(String(r.id))) return false;
    const t = recs.get(r.teamId), tg = t ? (+t.w || 0) + (+t.l || 0) : 0;
    return r.gp >= Math.max(1, Math.floor(tg * (kind === 'roy' ? 0.5 : 0.65)));
  }).map(r => {
    const t = recs.get(r.teamId), w = +t?.w || 0, l = +t?.l || 0, pct = w + l ? w / (w + l) : 0.5;
    const imp = impactOf(r);
    return { r, rec: t ? `${w}-${l}` : '', score: kind === 'mvp' ? imp * (0.6 + 0.8 * pct) : imp };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}
async function renderAward(c) {
  const body = $('#leadBody');
  const key = 'award-' + c.award;
  if (!S.leadCache[key]) {
    body.innerHTML = `<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>`;
    try { S.leadCache[key] = await awardRace(c.award); }
    catch (e) { body.innerHTML = `<div class="empty"><b>Couldn't build the race</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`; return; }
  }
  await ensureTeamColors();
  if (LEADER_CATS[S.leadKey] !== c) return;
  const list = S.leadCache[key];
  if (!list.length) { body.innerHTML = `<div class="empty"><b>Too early to call</b>The race fills in once players have a few games in.</div>`; return; }
  list.forEach(x => rememberPlayer({ id: x.r.id, displayName: x.r.name, shortName: x.r.short, position: { abbreviation: x.r.pos } }, x.r.teamId));
  const top = list[0], max = top.score || 1;
  const line = r => `${r.pts.toFixed(1)} / ${r.reb.toFixed(1)} / ${r.ast.toFixed(1)}`;
  body.innerHTML = `<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${teamColor(top.r.teamId || top.r.abbr)}" data-player="${top.r.id}">
      <span class="rk">${esc(c.k.toUpperCase())} · No. 1</span>
      ${face(top.r.id, top.r.name, 'face', 700)}
      <div class="big num">${top.r.pts.toFixed(1)}<small>PPG</small></div>
      <div class="who">${esc(top.r.name)}</div>
      <div class="meta">${esc(top.r.abbr)} · ${line(top.r)} PTS/REB/AST${top.rec ? ` · Team ${esc(top.rec)}` : ''}</div>
    </button>
    <div><div class="lrows award">${list.map((x, i) => `
      <button class="lrow enter" style="--i:${i}" data-player="${x.r.id}">
        <span class="rk">${i + 1}</span>${face(x.r.id, x.r.name, 'face', 120)}
        <span class="nm"><b>${esc(x.r.name)}</b><span>${logo(x.r.abbr, 32)}${esc(x.r.abbr)}${x.rec ? ` · ${esc(x.rec)}` : ''} · ${x.r.gp} GP</span></span>
        <span class="bar"><i data-w="${(x.score / max * 100).toFixed(1)}" style="${barVars(x.r.teamId || x.r.abbr)}"></i></span>
        <span class="v sm">${line(x.r)}</span>
      </button>`).join('')}</div>
      <p class="race-note">Fullcourt's own estimate from points, rebounds, assists, steals, blocks, missed shots and turnovers per game${c.award === 'mvp' ? ', weighted by team record' : ' (drafted rookies only)'}. Not an official ranking.</p></div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.lrow .bar i', body).forEach(i => i.style.width = i.dataset.w + '%')));
}

