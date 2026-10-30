/* ---------------- multi-game view ---------------- */
function mvOrder(games) {
  const rank = g => (isFavGame(g) ? 0 : 10) + (g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2);
  return [...games].sort((a, b) => rank(a) - rank(b) || new Date(a.date) - new Date(b.date));
}
function boxTop(d, teamId) {
  const T = (d.boxscore?.players || []).find(t => t.team?.id === teamId);
  const st = T?.statistics?.[0]; if (!st) return [];
  const lab = st.labels || st.names || [];
  const ix = k => lab.indexOf(k);
  return (st.athletes || []).filter(a => a.stats?.length).map(a => ({
    id: a.athlete.id, name: a.athlete.shortName || a.athlete.displayName,
    pts: +a.stats[ix('PTS')] || 0, reb: a.stats[ix('REB')], ast: a.stats[ix('AST')], fg: (a.stats[ix('FG')] || '').replace('-', '/'),
  })).sort((a, b) => b.pts - a.pts).slice(0, 3);
}
function mvPanel(d) {
  const comp = d.header?.competitions?.[0]; if (!comp) return '<div class="empty">Game details unavailable</div>';
  const st = comp.status?.type || {};
  const g = { state: st.state, desc: st.description, period: comp.status?.period, clock: comp.status?.displayClock, date: comp.date };
  const sides = ['away', 'home'].map(ha => { const c = comp.competitors.find(x => x.homeAway === ha); regTeam(c.team); return { id: c.team.id, abbr: c.team.abbreviation, short: c.team.name || c.team.shortDisplayName, score: c.score ?? '', winner: c.winner, lines: (c.linescores || []).map(l => l.displayValue ?? l.value) }; });
  const live = g.state === 'in', pre = g.state === 'pre', post = g.state === 'post';
  const sit = live ? situation(d) : null;
  const head = `<button class="mv-head" data-game="${d.header.id}" title="Open full game">
    ${sides.map((s, i) => `<span class="mv-team${post && !s.winner ? ' lose' : ''}">${logo(s.abbr, 72)}<b>${esc(s.abbr)}</b>${pre ? '' : `<span class="score">${esc(s.score)}</span>`}</span>${i === 0 ? `<span class="mv-mid"><span class="status${live ? ' live' : ''}">${live ? '<span class="dot on"></span>' : ''}${esc(pre ? fmtTime(g.date) : statusText(g))}</span>${toPill(sit, tid => sides.find(x => x.id === tid)?.abbr || '')}</span>` : ''}`).join('')}
  </button>${sit ? `<div class="mv-sit">${sides.map(s => `<span>${esc(s.abbr)} ${sitHTML(sit.teams[s.id], false)}</span>`).join('')}</div>` : ''}`;
  if (pre) {
    const odds = gameOdds(d, d.header.id);
    const tv = [...new Set((d.broadcasts || []).map(b => b.media?.shortName || b.station || '').filter(Boolean))].join(' · ');
    const L = (d.leaders || []).map(t => { const c = t.leaders?.find(x => /point/i.test(x.name)) || t.leaders?.[0]; const p = c?.leaders?.[0]; return p?.athlete ? `<div class="mv-row">${face(p.athlete.id, p.athlete.displayName, 'mini-face', 80)}<span>${esc(p.athlete.shortName || p.athlete.displayName)}</span><b>${esc(p.displayValue)}</b><small>${esc(c.abbreviation || 'PPG')}</small></div>` : ''; }).join('');
    return head + `<div class="mv-body">
      <div class="mv-facts"><span>${esc(fmtET(g.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>${d.gameInfo?.venue?.fullName ? `<span>${esc(d.gameInfo.venue.fullName)}</span>` : ''}${tv ? `<span>${esc(tv)}</span>` : ''}</div>
      ${odds ? `<div class="mv-odds">${['away', 'home'].map((k, i) => `<span>${esc(sides[i].abbr)} ${mlChip(odds, k)}</span>`).join('')}${odds.details ? `<span>Spread <b>${esc(odds.details)}</b></span>` : ''}${odds.ou != null ? `<span>O/U <b>${esc(odds.ou)}</b></span>` : ''}</div>` : ''}
      ${L ? `<div class="mv-sec"><div class="eyebrow">Season scoring leaders</div>${L}</div>` : ''}
    </div>`;
  }
  const n = Math.max(sides[0].lines.length, 4);
  const ls = `<table class="mv-ls"><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${perLabel(i + 1)}</th>`).join('')}</tr></thead><tbody>${sides.map(s => `<tr><td>${esc(s.abbr)}</td>${Array.from({ length: n }, (_, i) => `<td>${esc(s.lines[i] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const wp = d.winprobability?.at(-1)?.homeWinPercentage;
  const wpBar = live && wp != null ? `<div class="mv-wp" title="Win probability"><span style="width:${((1 - wp) * 100).toFixed(1)}%;background:var(--sideA)"></span><span style="background:var(--sideB)"></span></div><div class="mv-wpl"><span>${esc(sides[0].abbr)} ${Math.round((1 - wp) * 100)}%</span><span>Win probability</span><span>${esc(sides[1].abbr)} ${Math.round(wp * 100)}%</span></div>` : '';
  const tops = sides.map(s => `<div class="mv-sec"><div class="eyebrow">${esc(s.short)}</div>${boxTop(d, s.id).map(p => `<button class="mv-row" data-player="${p.id}">${face(p.id, p.name, 'mini-face', 80)}<span>${esc(p.name)}</span><b>${p.pts}</b><small>${esc(p.reb ?? '')}r ${esc(p.ast ?? '')}a · ${esc(p.fg)}</small></button>`).join('') || '<div class="mv-none">No stats yet</div>'}</div>`).join('');
  const plays = (d.plays || []).slice(-4).reverse().map(p => `<div class="mv-play"><span>${perLabel(p.period?.number || 1)} ${esc(p.clock?.displayValue || '')}</span><span>${esc(p.text || '')}</span><b>${p.awayScore}-${p.homeScore}</b></div>`).join('');
  return head + `<div class="mv-body">${ls}${wpBar}<div class="mv-tops">${tops}</div>${plays ? `<div class="mv-sec"><div class="eyebrow">Latest plays</div>${plays}</div>` : ''}</div>`;
}
function openMulti() {
  if (!S.games.length) { toast('No games on this date'); return; }
  const sheet = openSheet('Multi-view');
  setFull(sheet.el, true);
  sheet.el.classList.add('mv');
  const games = mvOrder(S.games);
  const valid = id => games.some(g => g.id === id);
  let sel = (S.mvSel || []).filter(valid);
  if (!sel.length) sel = games.slice(0, Math.min(4, games.length)).map(g => g.id);
  const data = {}, timers = {};
  const setTitleCount = () => setTitle(sheet, `Multi-view · ${sel.length} game${sel.length === 1 ? '' : 's'}`);
  const chips = () => games.map(g => `<button class="chip mv-chip${g.state === 'in' ? ' live' : ''}" data-mvsel="${g.id}" aria-pressed="${sel.includes(g.id)}">${g.state === 'in' ? '<i class="dot on"></i>' : ''}${esc(g.away.abbr)} @ ${esc(g.home.abbr)}<small>${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</small></button>`).join('');
  const layout = () => {
    S.mvSel = sel; setTitleCount();
    sheet.body.innerHTML = `<div class="mv-bar"><div class="hs-wrap"><div class="hs mv-chips drag-x" data-drag>${chips()}</div></div><span class="eyebrow">Pick up to 4</span></div>
      <div class="mv-grid n${sel.length}">${sel.map(id => `<section class="mv-p" id="mvp-${id}">${data[id] ? mvPanel(data[id]) : '<div class="sk" style="height:340px"></div>'}</section>`).join('')}</div>`;
    wireDrag(sheet.body);
  };
  const load = async id => {
    clearTimeout(timers[id]);
    if (!sheet.alive || !sel.includes(id)) return;
    try {
      const d = await getJSON(`${API}/summary?event=${id}`);
      if (!sheet.alive || !sel.includes(id)) return;
      data[id] = d;
      const box = $(`#mvp-${id}`, sheet.body);
      if (box) box.innerHTML = mvPanel(d);
      const state = d.header?.competitions?.[0]?.status?.type?.state;
      const tip = new Date(d.header?.competitions?.[0]?.date) - Date.now();
      const next = state === 'in' ? 15000 : state === 'pre' && tip < 30 * 60e3 ? 30000 : 0;
      if (next) { timers[id] = setTimeout(() => load(id), next); sheet.timers.push(timers[id]); }
    } catch (e) {
      timers[id] = setTimeout(() => load(id), 20000); sheet.timers.push(timers[id]);
    }
  };
  sheet.body.onclick = e => {
    const c = e.target.closest('[data-mvsel]'); if (!c) return;
    const id = c.dataset.mvsel;
    if (sel.includes(id)) { if (sel.length === 1) return; sel = sel.filter(x => x !== id); clearTimeout(timers[id]); }
    else { if (sel.length >= 4) { toast('Up to 4 games at once. Remove one first.'); return; } sel = [...sel, id]; }
    layout();
    sel.forEach(x => { if (!data[x]) load(x); });
  };
  layout();
  sel.forEach(load);
}

