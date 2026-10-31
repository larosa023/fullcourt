/* ---------------- league-wide roster moves (Teams page, "Moves" tab) ---------------- */
async function renderMoves() {
  const body = $('#teamsBody');
  body.innerHTML = '<div class="sk" style="height:420px"></div>';
  let list;
  try { list = await loadMoves(); } catch (e) { body.innerHTML = `<div class="empty"><b>Moves didn't load</b>The feed may be busy.<br><button class="btn" data-retry="teams">Try again</button></div>`; return; }
  if (S.teamsMode !== 'moves') return;
  let kind = S.moveKind || 'all', team = S.moveTeam || 'all', n = 40;
  const teams = [...new Map(list.filter(t => t.team).map(t => [t.team.id, t.team])).values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  const counts = k => list.filter(t => (k === 'all' || moveKind(t.description) === k) && (team === 'all' || t.team?.id === team)).length;
  const draw = () => {
    const shown = list.filter(t => (kind === 'all' || moveKind(t.description) === kind) && (team === 'all' || t.team?.id === team));
    body.innerHTML = `<p class="rank-note">Signings, waivers and trades from around the league, newest first. Tap a type or a team to narrow it down.</p>
      <div class="mvs-f hs drag-x" data-drag>${[['all', 'All moves'], ['sign', 'Signings'], ['trade', 'Trades'], ['waive', 'Waived / assigned'], ['other', 'Other']].map(([k, l]) => `<button class="chip sm" data-mvkind="${k}" aria-pressed="${k === kind}">${l}<em>${counts(k)}</em></button>`).join('')}</div>
      <div class="mvs-f hs drag-x" data-drag><button class="chip sm" data-mvteam="all" aria-pressed="${team === 'all'}">All teams</button>${teams.map(t => `<button class="chip sm" data-mvteam="${t.id}" aria-pressed="${t.id === team}">${logo(t.abbreviation, 32)}${esc(t.abbreviation)}</button>`).join('')}</div>
      <div class="card mvs-list">${shown.length ? shown.slice(0, n).map(t => moveRow(t)).join('') : '<p class="tx-none">No moves match.</p>'}</div>
      ${shown.length > n ? `<div class="btn-row" style="justify-content:center"><button class="btn ghost" data-mvmore>Show more</button></div>` : ''}`;
    wireDrag(body);
  };
  body.onclick = e => {
    const k = e.target.closest('[data-mvkind]'); if (k) { kind = S.moveKind = k.dataset.mvkind; n = 40; keepScroll(draw); return; }
    const t = e.target.closest('[data-mvteam]'); if (t) { team = S.moveTeam = t.dataset.mvteam; n = 40; keepScroll(draw); return; }
    if (e.target.closest('[data-mvmore]')) { n += 60; draw(); }
  };
  const keepScroll = f => { const xs = $$('.mvs-f', body).map(x => x.scrollLeft); f(); $$('.mvs-f', body).forEach((x, i) => { x.scrollLeft = xs[i] || 0; }); };
  draw();
}
