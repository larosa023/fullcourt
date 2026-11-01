/* ---------------- award races: media consensus + Fullcourt's stats model ---------------- */
// One "impact" number per player from per-game box-score stats, docked for missed shots and turnovers.
const impactOf = r => {
  const missFG = (r.fga || 0) * (1 - (r.fgp || 0) / 100), missFT = (r.fta || 0) - (r.ftm || 0);
  return (r.pts || 0) + 1.2 * (r.reb || 0) + 1.5 * (r.ast || 0) + 2 * (r.stl || 0) + 2 * (r.blk || 0) - 1.5 * (r.tov || 0) - 0.6 * missFG - 0.4 * Math.max(0, missFT);
};
const AWARD = {
  mvp: { title: 'MVP', stat: r => [r.pts, 'PPG'], line: r => `${f1(r.pts)} / ${f1(r.reb)} / ${f1(r.ast)}`, lineLab: 'PTS/REB/AST', model: 'points, rebounds, assists, steals, blocks, missed shots and turnovers, weighted by team record' },
  roy: { title: 'Rookie of the Year', stat: r => [r.pts, 'PPG'], line: r => `${f1(r.pts)} / ${f1(r.reb)} / ${f1(r.ast)}`, lineLab: 'PTS/REB/AST', model: 'the same box-score impact as MVP, drafted rookies only' },
  dpoy: { title: 'Defensive Player of the Year', stat: r => [(r.stl || 0) + (r.blk || 0), 'STOCKS'], line: r => `${f1(r.stl)} / ${f1(r.blk)} / ${f1(r.reb)}`, lineLab: 'STL/BLK/REB', model: 'steals, blocks, rebounds and minutes, plus how few points the team allows' },
  smoy: { title: 'Sixth Man of the Year', stat: r => [r.pts, 'PPG'], line: r => `${f1(r.pts)} / ${f1(r.reb)} / ${f1(r.ast)}`, lineLab: 'PTS/REB/AST', model: 'box-score impact for players who come off the bench in most of their games' },
};
const f1 = v => Number.isFinite(+v) ? (+v).toFixed(1) : '–';
const keyOf = s => nameKey(s).replace(/ (jr|sr|ii|iii|iv)$/, '');

async function rookieIds() {
  const now = new Date(), yr = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const key = `fc-draft-${LG}-${yr}`;
  const c = lsGet(key); if (c) { try { return new Set(JSON.parse(c)); } catch (e) {} }
  const d = await getJSON(`${API}/draft?season=${yr}`);
  const ids = (d.picks || []).map(p => p.athlete?.alternativeId || p.athlete?.id).filter(Boolean).map(String);
  if (ids.length) lsSet(key, JSON.stringify(ids));
  return new Set(ids);
}
// games started for every player, from each team's stat page (only needed for Sixth Man)
async function startsMap() {
  const k = `fc-starts-${LG}`;
  try { const c = JSON.parse(sessionStorage.getItem(k) || 'null'); if (c && Date.now() - c.t < 3600e3) return new Map(c.m); } catch (e) {}
  const ids = (S.standings?.confs || []).flatMap(c => c.rows).map(r => r.id);
  const m = new Map();
  await Promise.all(ids.map(async id => {
    try {
      const d = await getJSON(`${API}/teams/${id}/athletes/statistics`, { retries: 0, timeout: 12000 });
      for (const cat of d.results || []) for (const l of cat.leaders || []) {
        const st = l.statistics?.[0]?.stats || l.statistics || [];
        const v = n => +(st.find?.(s => s.name === n)?.value ?? NaN);
        const gs = v('gamesStarted'), gp = v('gamesPlayed');
        if (l.athlete?.id && Number.isFinite(gs)) m.set(String(l.athlete.id), [gs, gp]);
      }
    } catch (e) {}
  }));
  try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), m: [...m] })); } catch (e) {}
  return m;
}
let mediaP = null;
const loadMedia = () => IS_W ? Promise.resolve(null) : (mediaP || (mediaP = fetch('/data/awards.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)));
const implied = o => o > 0 ? 100 / (o + 100) : -o / (-o + 100);

// media share per player: sportsbook odds become an implied chance, panel points and staff picks a share of the vote
function mediaShares(sources) {
  const tot = new Map(), ranks = new Map();
  for (const s of sources) {
    const sum = s.list.reduce((a, [, v]) => a + (s.kind === 'odds' ? 0 : v), 0) || 1;
    s.list.forEach(([n, v]) => { const k = keyOf(n); tot.set(k, (tot.get(k) || 0) + (s.kind === 'odds' ? implied(v) : v / sum)); });
  }
  const out = new Map([...tot].map(([k, v]) => [k, v / sources.length]));
  [...out].sort((a, b) => b[1] - a[1]).forEach(([k], i) => ranks.set(k, i + 1));
  return { share: out, rank: ranks, names: new Map(sources.flatMap(s => s.list.map(([n]) => [keyOf(n), n]))) };
}
async function findPlayer(name) {
  try {
    const r = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(name)}&limit=5&type=player&sport=basketball&league=${LG}`, { retries: 0, timeout: 7000 });
    const it = (r.items || []).find(i => i.league === LG);
    if (!it) return null;
    const t = teamByName(it.teamRelationships?.[0]?.displayName);
    return { id: it.id, name: it.displayName, short: it.displayName, teamId: t?.id, abbr: t?.abbr || '', pos: it.position?.abbreviation || '', gp: 0 };
  } catch (e) { return null; }
}

async function awardRace(kind) {
  const [rows, , media] = await Promise.all([leagueTable(), loadStandings().catch(() => null), loadMedia()]);
  const teams = (S.standings?.confs || []).flatMap(c => c.rows);
  const recs = new Map(teams.map(r => [r.id, r]));
  const rk = kind === 'roy' ? await rookieIds() : null;
  const starts = kind === 'smoy' ? await startsMap() : null;
  const oppAvg = teams.length ? teams.reduce((s, t) => s + (parseFloat(t.opp) || 0), 0) / teams.length : 0;
  const recOf = r => { const t = recs.get(r.teamId), w = +t?.w || 0, l = +t?.l || 0; return { t, w, l, pct: w + l ? w / (w + l) : 0.5, g: w + l }; };
  const benchOf = r => { const s = starts?.get(String(r.id)); return s ? { gs: s[0], gp: s[1] || r.gp, bench: s[0] <= (s[1] || r.gp) / 2 } : null; };

  // the stats model
  const scored = rows.filter(r => {
    if (!(r.gp > 0) || !Number.isFinite(r.pts)) return false;
    if (rk && !rk.has(String(r.id))) return false;
    const { g } = recOf(r);
    if (r.gp < Math.max(1, Math.floor(g * (kind === 'roy' ? 0.5 : 0.65)))) return false;
    if (kind === 'dpoy' && (r.min || 0) < 18) return false;
    if (kind === 'smoy') { const b = benchOf(r); if (!b?.bench || (r.min || 0) < 12) return false; }
    return true;
  }).map(r => {
    const { pct, t } = recOf(r);
    let s;
    if (kind === 'mvp') s = impactOf(r) * (0.6 + 0.8 * pct);
    else if (kind === 'dpoy') s = (2.2 * (r.stl || 0) + 2.4 * (r.blk || 0) + 0.45 * (r.reb || 0)) * Math.min(1, (r.min || 0) / 30) + Math.max(-2, Math.min(3, (oppAvg - (parseFloat(t?.opp) || oppAvg)) * 0.25)) + 1.5 * pct;
    else s = impactOf(r);
    return { r, s: Math.max(0.01, s) };
  }).sort((a, b) => b.s - a.s).slice(0, 15);
  const cube = scored.reduce((a, x) => a + x.s ** 3, 0) || 1;
  const model = new Map(scored.map((x, i) => [String(x.r.id), { share: x.s ** 3 / cube, rank: i + 1 }]));

  // the media consensus, and how much the stats count so far (more as the season goes on)
  const srcs = media?.races?.[kind] || [];
  const m = srcs.length ? mediaShares(srcs) : null;
  const avgG = teams.length ? teams.reduce((s, t) => s + (+t.w || 0) + (+t.l || 0), 0) / teams.length : 0;
  const wModel = m ? Math.min(0.7, 0.1 + avgG / 50) : 1;

  // everyone either side likes
  const byKey = new Map(rows.map(r => [keyOf(r.name), r]));
  const cand = new Map(scored.map(x => [String(x.r.id), x.r]));
  if (m) for (const [k] of [...m.rank].filter(([, n]) => n <= 12)) {
    let r = byKey.get(k);
    if (!r) r = await findPlayer(m.names.get(k));
    if (r && !cand.has(String(r.id))) cand.set(String(r.id), r);
  }
  const list = [...cand.values()].map(r => {
    const ms = m?.share.get(keyOf(r.name)) || 0, mr = m?.rank.get(keyOf(r.name)) || null;
    const md = model.get(String(r.id));
    const b = kind === 'smoy' ? benchOf(r) : null;
    let score = (1 - wModel) * ms + wModel * (md?.share || 0);
    if (b && !b.bench && b.gp >= 3) score *= 0.35; // starting most games rules a player out of Sixth Man
    const { w, l } = recOf(r);
    return { r, score, media: ms, mediaRank: mr, modelRank: md?.rank || null, rec: recs.get(r.teamId) ? `${w}-${l}` : '', starting: b && !b.bench && b.gp >= 3, gs: b };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  return { list, wModel, srcs, updated: media?.updated, note: media?.note };
}

async function renderAward(c) {
  const body = $('#leadBody');
  const key = 'award-' + c.award;
  if (!S.leadCache[key]) {
    body.innerHTML = `<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>`;
    try { S.leadCache[key] = await awardRace(c.award); }
    catch (e) { console.error(e); body.innerHTML = `<div class="empty"><b>Couldn't build the race</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`; return; }
  }
  await ensureTeamColors();
  if (leadCats()[S.leadKey] !== c) return;
  const { list, wModel, srcs, updated } = S.leadCache[key];
  const A = AWARD[c.award];
  if (!list.length) { body.innerHTML = `<div class="empty"><b>Too early to call</b>The race fills in once players have a few games in.</div>`; return; }
  list.forEach(x => rememberPlayer({ id: x.r.id, displayName: x.r.name, shortName: x.r.short, position: { abbreviation: x.r.pos } }, x.r.teamId));
  const top = list[0], max = top.score || 1;
  const played = r => r.gp > 0 && Number.isFinite(r.pts);
  const tags = x => [x.mediaRank ? `Media #${x.mediaRank}` : '', x.modelRank ? `Stats #${x.modelRank}` : '', x.starting ? `Starting ${x.gs.gs} of ${x.gs.gp}` : ''].filter(Boolean);
  const big = A.stat(top.r);
  const pctM = Math.round(wModel * 100);
  body.innerHTML = `<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${teamColor(top.r.teamId || top.r.abbr)}" data-player="${top.r.id}">
      <span class="rk">${esc(c.k.toUpperCase())} · No. 1</span>
      ${face(top.r.id, top.r.name, 'face', 700)}
      <div class="big num">${played(top.r) ? f1(big[0]) : '–'}<small>${big[1]}</small></div>
      <div class="who">${esc(top.r.name)}</div>
      <div class="meta">${esc(top.r.abbr)}${played(top.r) ? ` · ${A.line(top.r)} ${A.lineLab}` : ' · No games yet'}${top.rec ? ` · Team ${esc(top.rec)}` : ''}</div>
      ${srcs.length ? `<div class="aw-hero-tags">${tags(top).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </button>
    <div><div class="lrows award">${list.map((x, i) => `
      <button class="lrow enter" style="--i:${i}" data-player="${x.r.id}">
        <span class="rk">${i + 1}</span>${face(x.r.id, x.r.name, 'face', 120)}
        <span class="nm"><b>${esc(x.r.name)}</b><span>${logo(x.r.abbr, 32)}${esc(x.r.abbr)}${x.rec ? ` · ${esc(x.rec)}` : ''} · ${x.r.gp || 0} GP</span>${srcs.length ? `<span class="aw-tags">${[tags(x).filter(t => !/Starting/.test(t)).join(' · '), ...tags(x).filter(t => /Starting/.test(t))].filter(Boolean).map(t => `<i${/Starting/.test(t) ? ' class="warn"' : ''}>${esc(t)}</i>`).join('')}</span>` : ''}</span>
        <span class="bar"><i data-w="${(x.score / max * 100).toFixed(1)}" style="${barVars(x.r.teamId || x.r.abbr)}"></i></span>
        <span class="v sm">${played(x.r) ? `<span>${A.line(x.r).replace(/ \/ /g, '<i class="sl">/</i>')}</span><small>${A.lineLab}</small>` : '<small>No games yet</small>'}</span>
      </button>`).join('')}</div>
      ${srcs.length ? `<p class="race-note">Fullcourt consensus: ${srcs.length} media sources (sportsbook odds, the ESPN panel and staff picks), blended with Fullcourt's stats model, which counts for ${pctM}% now and more as the season goes on. The model uses ${esc(A.model)}. Not an official ranking.</p>
      <details class="aw-src"><summary>Sources${updated ? ` · updated ${esc(fmtDay(updated.replace(/-/g, ''), { month: 'short', day: 'numeric' }))}` : ''}</summary><ul>${srcs.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><span>${esc(s.via)} · ${esc(fmtDay(s.date.replace(/-/g, ''), { month: 'short', day: 'numeric' }))}</span></li>`).join('')}</ul></details>`
      : `<p class="race-note">Fullcourt's own estimate from ${esc(A.model)}. Not an official ranking.</p>`}</div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.lrow .bar i', body).forEach(i => i.style.width = i.dataset.w + '%')));
}
