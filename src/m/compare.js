/* ---------------- player comparison ---------------- */
S.cmp = (() => { try { const v = JSON.parse(lsGet(lsKey('fc-cmp')) || 'null'); return Array.isArray(v) && v.length === 2 ? v : [null, null]; } catch (e) { return [null, null]; } })();
S.cmpSplit = 'season';
// a shared link (?cmp=ID,ID&split=career) opens straight to that matchup
try { const q = new URLSearchParams(location.search), c = q.get('cmp');
  if (c) { const ids = c.split(',').filter(x => /^\d+$/.test(x)); if (ids.length === 2) S.cmp = ids; if (q.get('split') === 'career') S.cmpSplit = 'career'; history.replaceState(null, '', location.pathname + location.hash); }
} catch (e) {}
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
        <span class="cmp-share"><button class="btn ghost sm" data-cmpshare title="Share this comparison as an image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><span>Share</span></button><button class="btn ghost sm" data-cmplink title="Copy a link to this comparison"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg><span>Link</span></button></span>
        <span class="cmp-score"><b style="color:var(--sideA)">${esc(A.last || A.name)} ${winsA}</b> – <b style="color:var(--sideB)">${winsB} ${esc(B.last || B.name)}</b> <span class="eyebrow">categories won</span></span></div>
      <div class="cmp">${rows}</div>
      ${missing ? `<p class="odds-note">${!sa && !sb ? 'Neither player has' : `${esc((!sa ? A : B).name)} hasn't`} played ${S.cmpSplit === 'season' ? 'this season' : 'yet'}, so some numbers are missing.</p>` : ''}
    </div>`;
  S.cmpShown = { A, B, sa, sb, winsA, winsB };
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


/* ---------------- share a comparison ---------------- */
function cmpLink() { return `${location.origin}${location.pathname}?cmp=${S.cmp.join(',')}${S.cmpSplit === 'career' ? '&split=career' : ''}#compare`; }
const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function cmpImage() {
  const X = S.cmpShown; if (!X) return null;
  const { A, B, sa, sb, winsA, winsB } = X;
  try { await document.fonts.ready; } catch (e) {}
  const W = 1080, rowH = 74, top = 470, H = top + CMP_STATS.length * rowH + 120;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const disp = "Archivo, 'Arial Narrow', Arial, sans-serif", mono = "'IBM Plex Mono', Menlo, monospace", body = "'Instrument Sans', system-ui, sans-serif";
  const font = (w, sz, f, cond) => { x.font = `${w} ${sz}px ${f}`; try { x.fontStretch = cond ? 'condensed' : 'normal'; } catch (e) {} };
  const colA = '#ff7a3d', colB = '#5b9dff', ink = '#f2f4f7', mute = '#8b93a1', line = '#262c36';
  x.fillStyle = '#0d0f13'; x.fillRect(0, 0, W, H);
  const [fa, fb] = await Promise.all([loadImg(headSrc(A.id, 700)), loadImg(headSrc(B.id, 700))]);
  // two player panels in team colours
  const panel = (P, X0, img, col) => {
    const tc = teamColor(P.teamId) || '#333', g = x.createLinearGradient(X0, 0, X0 + 520, 400); g.addColorStop(0, tc); g.addColorStop(1, '#0d0f13');
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(X0, 40, 500, 380, 28) : x.rect(X0, 40, 500, 380); x.fillStyle = g; x.fill(); x.clip();
    if (img) { const h = 290, w = h * img.width / img.height; try { x.drawImage(img, X0 + 500 - w + 24, 420 - h, w, h); } catch (e) {} }
    x.fillStyle = col; x.fillRect(X0, 414, 500, 6);
    x.restore();
    // name up top-left, clear of the face; shrink long names to fit
    const t = S.teams[P.teamId] || {}, l1 = (P.first || P.name.split(' ')[0]).toUpperCase(), l2 = (P.last || P.name.split(' ').slice(1).join(' ')).toUpperCase();
    let sz = 58; font(800, sz, disp, true); while (sz > 30 && Math.max(x.measureText(l1).width, x.measureText(l2).width) > 440) { sz -= 2; font(800, sz, disp, true); }
    x.fillStyle = ink; x.textBaseline = 'alphabetic'; x.fillText(l1, X0 + 28, 108); x.fillText(l2, X0 + 28, 108 + sz * 0.98);
    font(600, 22, body); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText([t.short, P.pos].filter(Boolean).join(' · '), X0 + 28, 108 + sz * 0.98 + 36);
  };
  panel(A, 30, fa, colA); panel(B, 550, fb, colB);
  // header line
  font(700, 22, mono); x.fillStyle = mute; x.textAlign = 'center';
  x.fillText(`${S.cmpSplit === 'season' ? 'THIS SEASON' : 'CAREER'} · PER GAME`, W / 2, top - 14);
  x.textAlign = 'left';
  CMP_STATS.forEach(([k, label, lowerBetter], i) => {
    const y = top + i * rowH, va = sa?.[k], vb = sb?.[k], na = parseFloat(va), nb = parseFloat(vb), ok = Number.isFinite(na) && Number.isFinite(nb);
    const aWin = ok && na !== nb && (lowerBetter ? na < nb : na > nb), bWin = ok && na !== nb && !aWin, m = Math.max(Math.abs(na) || 0, Math.abs(nb) || 0) || 1;
    x.fillStyle = line; x.fillRect(40, y + rowH - 1, W - 80, 1);
    font(800, 40, disp, true); x.fillStyle = aWin ? colA : mute; x.fillText(va ?? '–', 40, y + 48);
    x.textAlign = 'right'; x.fillStyle = bWin ? colB : mute; x.fillText(vb ?? '–', W - 40, y + 48); x.textAlign = 'center';
    font(600, 18, mono); x.fillStyle = mute; x.fillText(label.toUpperCase(), W / 2, y + 26); x.textAlign = 'left';
    const bw = 300, cy = y + 42;
    x.fillStyle = '#1b2029'; x.fillRect(W / 2 - 4 - bw, cy, bw, 8); x.fillRect(W / 2 + 4, cy, bw, 8);
    if (ok) { const wa = bw * Math.min(1, na / m), wb = bw * Math.min(1, nb / m);
      x.fillStyle = aWin ? colA : '#596171'; x.fillRect(W / 2 - 4 - wa, cy, wa, 8);
      x.fillStyle = bWin ? colB : '#596171'; x.fillRect(W / 2 + 4, cy, wb, 8); }
  });
  const fy = top + CMP_STATS.length * rowH + 60;
  font(800, 34, disp, true); x.fillStyle = colA; x.fillText(`${(A.last || A.name).toUpperCase()} ${winsA}`, 40, fy);
  x.textAlign = 'right'; x.fillStyle = colB; x.fillText(`${winsB} ${(B.last || B.name).toUpperCase()}`, W - 40, fy);
  x.textAlign = 'center'; font(600, 18, mono); x.fillStyle = mute; x.fillText('CATEGORIES WON', W / 2, fy - 6);
  font(800, 24, disp, true); x.fillStyle = '#ff7a2f'; x.fillText('FULLCOURT', W / 2, H - 22);
  x.textAlign = 'left';
  try { return await new Promise(r => c.toBlob(r, 'image/png')); } catch (e) { return null; } // a tainted canvas (no face CORS) can't export
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-cmplink]')) {
    const url = cmpLink();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: 'Player comparison', url }); return; } catch (err) { if (err?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (err) { toast(url); }
    return;
  }
  if (!e.target.closest('[data-cmpshare]')) return;
  const blob = await cmpImage(); if (!blob) { toast("Couldn't make the image"); return; }
  const { A, B } = S.cmpShown, name = `fullcourt-${(A.last || 'a').toLowerCase()}-vs-${(B.last || 'b').toLowerCase()}.png`;
  const f = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] }) && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ files: [f], title: `${A.name} vs ${B.name}`, url: cmpLink() }); return; } catch (err) { if (err?.name === 'AbortError') return; } }
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Image copied: paste it anywhere'); return; } catch (err) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Image saved');
});
