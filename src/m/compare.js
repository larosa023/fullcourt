/* ---------------- player comparison ---------------- */
S.cmp = (() => { try { const v = JSON.parse(lsGet(lsKey('fc-cmp')) || 'null'); return Array.isArray(v) && v.length === 2 ? v : [null, null]; } catch (e) { return [null, null]; } })();
S.cmpSplit = 'season';
S.cmpCache = {};
const CMP_STATS = [
  ['PTS', 'Points'], ['REB', 'Rebounds'], ['AST', 'Assists'], ['STL', 'Steals'], ['BLK', 'Blocks'],
  ['FG%', 'Field goal %'], ['3P%', '3-point %'], ['FT%', 'Free throw %'], ['MIN', 'Minutes'], ['TO', 'Turnovers', true], ['GP', 'Games played'],
];
async function cmpData(id) {
  if (S.cmpCache[id]) return S.cmpCache[id];
  const [ov, bio] = await Promise.all([
    getJSON(`${WEB}/athletes/${id}/overview`).catch(() => null),
    getJSON(`${WEB}/athletes/${id}`).catch(() => null),
  ]);
  const a = bio?.athlete || {};
  if (a.team) regTeam(a.team);
  const st = ov?.statistics;
  const split = re => st?.splits?.find(s => re.test(s.displayName));
  const pack = sp => sp ? Object.fromEntries((st.labels || []).map((l, i) => [l, sp.stats[i]])) : null;
  return (S.cmpCache[id] = {
    id, name: a.displayName || S.players[id]?.name || 'Player', first: a.firstName, last: a.lastName,
    teamId: a.team?.id || S.players[id]?.teamId, pos: a.position?.abbreviation || '', jersey: a.jersey || '',
    age: a.age, ht: a.displayHeight, exp: a.displayExperience,
    season: pack(split(/regular/i)), career: pack(split(/career/i)),
  });
}
async function ensureCmpDefaults() {
  if (S.cmp[0] && S.cmp[1]) return;
  const key = 'offensive.avgPoints';
  if (!S.leadCache[key]) S.leadCache[key] = await getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=15&sort=${key}:desc${SEASON_QS}`);
  const ids = (S.leadCache[key].athletes || []).map(a => a.athlete.id);
  if (!S.cmp[0]) S.cmp[0] = ids.find(x => x !== S.cmp[1]);
  if (!S.cmp[1]) S.cmp[1] = ids.find(x => x !== S.cmp[0]);
}
async function renderCompare() {
  const body = $('#cmpBody');
  body.innerHTML = `<div class="cmp-grid"><div class="sk" style="height:260px;border-radius:20px"></div><div class="sk" style="height:260px;border-radius:20px"></div></div><div class="sk" style="height:420px;margin-top:16px"></div>`;
  try { await ensureCmpDefaults(); } catch (e) {}
  if (!S.cmp[0] || !S.cmp[1]) { body.innerHTML = `<div class="empty"><b>Pick two players</b>Search for a player in each box above.</div>`; return; }
  lsSet(lsKey('fc-cmp'), JSON.stringify(S.cmp));
  const [A, B] = await Promise.all(S.cmp.map(cmpData));
  if (S.view !== 'compare') return;
  ['0', '1'].forEach((k, i) => { const inp = $(`#cmpIn${k}`); if (document.activeElement !== inp) inp.value = [A, B][i].name; });
  const sa = A[S.cmpSplit], sb = B[S.cmpSplit];
  const card = (P, side) => {
    const t = S.teams[P.teamId] || {};
    return `<button class="cmp-card enter" style="--tc:${teamColor(P.teamId || t.abbr)}" data-player="${P.id}">
      <span class="jn">${esc(P.jersey)}</span>${face(P.id, P.name, 'face', 700)}
      <span class="txt"><b class="h-display">${esc(P.first || P.name.split(' ')[0])}<br>${esc(P.last || P.name.split(' ').slice(1).join(' '))}</b>
      <small>${t.abbr ? logo(t.abbr, 40) : ''}${esc(t.short || '')}${P.pos ? ' · ' + esc(P.pos) : ''}</small>
      <small>${[P.age ? `${P.age} yrs` : '', P.ht, P.exp].filter(Boolean).map(esc).join(' · ')}</small></span>
      <span class="cmp-side">${side}</span></button>`;
  };
  let winsA = 0, winsB = 0;
  const rows = CMP_STATS.map(([k, label, lowerBetter]) => {
    const va = sa?.[k], vb = sb?.[k];
    const na = parseFloat(va), nb = parseFloat(vb);
    const ok = Number.isFinite(na) && Number.isFinite(nb);
    const aWin = ok && na !== nb && (lowerBetter ? na < nb : na > nb), bWin = ok && na !== nb && !aWin;
    if (k !== 'GP' && k !== 'MIN') { if (aWin) winsA++; if (bWin) winsB++; }
    const m = Math.max(Math.abs(na) || 0, Math.abs(nb) || 0) || 1;
    return `<div class="cmp-row big"><span class="l${aWin ? ' win' : ''}">${esc(va ?? '–')}</span>
      <div class="mid"><span>${label}</span><div class="cmp-bars"><div><i data-w="${ok ? (na / m * 100).toFixed(1) : 0}" style="background:${aWin ? 'var(--sideA)' : 'var(--muted)'}"></i></div><div><i data-w="${ok ? (nb / m * 100).toFixed(1) : 0}" style="background:${bWin ? 'var(--sideB)' : 'var(--muted)'}"></i></div></div></div>
      <span class="r${bWin ? ' win' : ''}">${esc(vb ?? '–')}</span></div>`;
  }).join('');
  const missing = !sa || !sb;
  body.innerHTML = `<div class="cmp-grid">${card(A, 'A')}${card(B, 'B')}</div>
    <div class="card cmp-card-stats">
      <div class="card-h"><h4>${S.cmpSplit === 'season' ? 'This season' : 'Career'} · per game</h4>
        <span class="cmp-score"><b style="color:var(--sideA)">${esc(A.last || A.name)} ${winsA}</b> – <b style="color:var(--sideB)">${winsB} ${esc(B.last || B.name)}</b> <span class="eyebrow">categories won</span></span></div>
      <div class="cmp">${rows}</div>
      ${missing ? `<p class="odds-note">${!sa && !sb ? 'Neither player has' : `${esc((!sa ? A : B).name)} hasn't`} played ${S.cmpSplit === 'season' ? 'this season' : 'yet'}, so some numbers are missing.</p>` : ''}
    </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#cmpBody [data-w]').forEach(i => i.style.width = i.dataset.w + '%')));
}
function cmpPicker(slot) {
  const inp = $(`#cmpIn${slot}`), drop = $(`#cmpDrop${slot}`);
  let t = 0, seq = 0, items = [], idx = 0;
  const show = html => { drop.innerHTML = html; drop.hidden = !html; };
  const draw = () => show(items.length ? items.map((p, i) => `<button class="sp-row${i === idx ? ' on' : ''}" data-pick="${i}">${face(p.id, p.name, 'sp-face', 120)}<span><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></span></button>`).join('') : '');
  const choose = i => {
    const p = items[i]; if (!p) return;
    S.cmp[slot] = p.id; rememberPlayer({ id: p.id, displayName: p.name }, p.teamId);
    inp.value = p.name; show(''); inp.blur(); renderCompare();
  };
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('input', () => {
    clearTimeout(t); idx = 0;
    const q = inp.value.trim();
    if (q.length < 2) { items = []; show(''); return; }
    show('<div class="sp-msg">Searching…</div>');
    t = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(q)}&limit=12&type=player&sport=basketball&league=${LG}`, { retries: 0, timeout: 8000 });
        if (my !== seq) return;
        items = (r.items || []).filter(it => it.league === LG && it.isActive !== false).slice(0, 7).map(it => { const tn = it.teamRelationships?.[0]?.displayName; return { id: it.id, name: it.displayName, sub: [it.position?.abbreviation, tn].filter(Boolean).join(' · '), teamId: teamByName(tn)?.id }; });
        items.length ? draw() : show(`<div class="sp-msg">No players match “${esc(q)}”.</div>`);
      } catch (e) { show('<div class="sp-msg">Search is unavailable right now.</div>'); }
    }, 180);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(idx); }
    else if (e.key === 'Escape') { show(''); inp.blur(); }
  });
  drop.addEventListener('pointerdown', e => { const b = e.target.closest('[data-pick]'); if (b) { e.preventDefault(); choose(+b.dataset.pick); } });
  inp.addEventListener('blur', () => setTimeout(() => { show(''); const P = S.cmpCache[S.cmp[slot]]; if (P) inp.value = P.name; }, 150));
}
cmpPicker(0); cmpPicker(1);
$('#cmpSwap').addEventListener('click', () => { S.cmp = [S.cmp[1], S.cmp[0]]; renderCompare(); });

