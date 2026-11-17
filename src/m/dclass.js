/* ---------------- a past NBA draft class, in full (opened from a player's "Draft" line) ----------------
   ESPN's draft feed has every class from 2001: picks in order with team, school, position and trade notes. Some older
   picks carry no player id (LeBron among them), so those are looked up by name when tapped. */
const DC_CACHE = new Map();
async function draftClass(year) {
  if (DC_CACHE.has(year)) return DC_CACHE.get(year);
  const d = await getJSON(`${API}/draft?season=${year}`, { timeout: 12000 });
  const pos = Object.fromEntries((d.positions || []).map(p => [String(p.id), p.abbreviation]));
  const teams = Object.fromEntries((d.teams || []).map(t => [String(t.id), t]));
  const picks = (d.picks || []).map(p => {
    const a = p.athlete || {}, link = a.proLink || a.link || '', idFromLink = link.match(/\/id\/(\d+)/)?.[1];
    return { ov: p.overall, rd: p.round, pk: p.pick, tm: teams[String(p.teamId)] || {}, name: a.displayName || '', pid: a.alternativeId || idFromLink || '', school: a.team?.shortDisplayName || a.team?.location || '', pos: pos[String(a.position?.id)] || '', note: p.tradeNote || '' };
  });
  const v = { name: d.displayName || `${year} NBA Draft`, picks };
  DC_CACHE.set(year, v); if (DC_CACHE.size > 12) DC_CACHE.delete(DC_CACHE.keys().next().value);
  return v;
}
async function openDraftClass(year, focus = '') {
  year = +year;
  const sheet = openSheet(`${year} Draft`);
  sheet.body.innerHTML = '<div class="sk" style="height:420px;border-radius:14px"></div>';
  let round = 'all';
  let D;
  try { D = await draftClass(year); } catch (e) { if (sheet.alive) sheet.body.innerHTML = `<div class="empty"><b>The ${year} draft didn't load</b>Check your connection and try again.</div>`; return; }
  if (!sheet.alive) return;
  if (!D.picks.length) { sheet.body.innerHTML = `<div class="empty"><b>No draft list for ${year}</b>ESPN has NBA draft classes from 2001 on.</div>`; return; }
  const rounds = [...new Set(D.picks.map(p => p.rd))];
  const yrs = [year - 1, year + 1].filter(y => y >= 2001 && y <= new Date().getFullYear());
  const row = p => {
    const me = focus && String(p.pid) === String(focus);
    const who = p.pid ? `data-player="${esc(p.pid)}"` : `data-dcname="${esc(p.name)}"`;
    return `<li class="dc-r${me ? ' me' : ''}"${me ? ' data-dcme' : ''}>
      <span class="dc-n"><b>${p.ov}</b><small>R${p.rd} · ${p.pk}</small></span>
      <button class="dc-p" ${who}>${p.pid ? face(p.pid, p.name, 'dc-face', 96) : `<span class="dc-face avatar">${esc(initials(p.name))}</span>`}<span><b>${esc(p.name)}</b><small>${esc([p.pos, p.school].filter(Boolean).join(' · '))}</small></span></button>
      <button class="dc-t" data-team="${esc(p.tm.id || '')}" title="${esc(p.tm.displayName || '')}">${p.tm.abbreviation ? logo(p.tm.abbreviation, 40) : ''}<span>${esc(p.tm.abbreviation || '')}</span></button>
      ${p.note ? `<span class="dc-note">${esc(p.note)}</span>` : ''}
    </li>`;
  };
  const draw = () => {
    const list = D.picks.filter(p => round === 'all' || String(p.rd) === round);
    sheet.body.innerHTML = `<div class="dc">
      <div class="dc-h"><div><p class="eyebrow">NBA draft · ${D.picks.length} picks</p><h3>${esc(D.name)}</h3></div>
        <div class="dc-nav">${yrs.map(y => `<button class="chip sm" data-dcyear="${y}">${y < year ? '‹ ' : ''}${y}${y > year ? ' ›' : ''}</button>`).join('')}</div></div>
      ${rounds.length > 1 ? `<div class="seg sm dc-seg"><span class="knob"></span>${[['all', 'All'], ...rounds.map(r => [String(r), `Round ${r}`])].map(([k, t]) => `<button data-dcround="${k}" aria-pressed="${round === k}">${t}</button>`).join('')}</div>` : ''}
      <ol class="dc-list">${list.map(row).join('')}</ol>
      <p class="odds-note">From ESPN's draft records. Tap a player for his page or a team for theirs; trade notes show where a pick changed hands.</p>
    </div>`;
    $$('.seg', sheet.body).forEach(placeKnob);
  };
  draw();
  sheet.body.addEventListener('click', async e => {
    const r = e.target.closest('[data-dcround]'); if (r) { e.stopPropagation(); round = r.dataset.dcround; draw(); return; }
    const y = e.target.closest('[data-dcyear]'); if (y) { e.stopPropagation(); closeTop(); setTimeout(() => openDraftClass(+y.dataset.dcyear, ''), 60); return; }
    const n = e.target.closest('[data-dcname]');
    if (n) {
      e.stopPropagation();
      try {
        const r2 = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(n.dataset.dcname)}&limit=5&type=player&sport=basketball&league=nba`, { retries: 0, timeout: 8000 });
        const hit = (r2.items || []).find(it => it.league === 'nba');
        if (hit) openPlayer(hit.id); else toast(`No page for ${n.dataset.dcname}`);
      } catch (x) { toast("Couldn't look that player up"); }
    }
  });
  // start at his pick when opened from a player
  const me = $('[data-dcme]', sheet.body); if (me) requestAnimationFrame(() => me.scrollIntoView({ block: 'center' }));
}
