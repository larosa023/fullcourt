/* ---------------- team page: depth chart ----------------
   NBA: ESPN's depth chart (point guard to center, in order). ESPN has none for the WNBA or college, so there Fullcourt
   builds one: the starting five from who started the last few games (then the season's start rate), everyone else by
   recent minutes, grouped as guards, forwards and centers. Injured players are marked, and players who are out drop
   to the end of their row. */
const DC_POS = { pg: 'Point guard', sg: 'Shooting guard', sf: 'Small forward', pf: 'Power forward', c: 'Center' };
const DC_GROUP = [['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']];
const DC_RECENT = 5;

async function fillDepth(box, id, evs, athletes, injP) {
  const [st, inj, dc] = await Promise.all([
    getJSON(`${API}/teams/${id}/athletes/statistics`).catch(() => null),
    Promise.resolve(injP).then(x => x?.list || []).catch(() => []),
    LGK === 'nba' ? getJSON(`${API}/teams/${id}/depthcharts`).catch(() => null) : null,
  ]);
  // who's who: roster, then season stats
  const P = new Map();
  for (const a of athletes) P.set(String(a.id), { id: String(a.id), name: a.displayName, short: a.shortName || a.displayName, pos: a.position?.abbreviation || '' });
  for (const l of st?.results?.[0]?.leaders || []) {
    const v = {}; (l.statistics || []).forEach(c => (c.stats || []).forEach(x => { if (!(x.name in v)) v[x.name] = x.value; }));
    const k = String(l.athlete?.id || ''); if (!k) continue;
    const p = P.get(k) || { id: k, name: l.athlete.displayName, short: l.athlete.shortName || l.athlete.displayName, pos: l.athlete.position?.abbreviation || '' };
    Object.assign(p, { mpg: v.avgMinutes, gp: v.gamesPlayed || 0, gs: v.gamesStarted || 0 });
    P.set(k, p);
  }
  const injBy = new Map(inj.filter(n => n.id).map(n => [String(n.id), n]));
  const isOut = k => /^out$|out for|suspend/i.test(injBy.get(k)?.status || '');

  let rows, note;
  const espn = dc?.depthchart?.[0]?.positions;
  if (espn && Object.keys(espn).length) {
    rows = Object.keys(DC_POS).filter(k => espn[k]?.athletes?.length).map(k => {
      const ids = espn[k].athletes.map(a => { const s = String(a.id); if (!P.has(s)) P.set(s, { id: s, name: a.displayName, short: a.shortName || a.displayName, pos: k.toUpperCase() }); return s; });
      return { label: k.toUpperCase(), full: espn[k].position?.displayName || DC_POS[k], ids, starters: new Set(ids.slice(0, 1)) };
    });
    note = 'ESPN depth chart';
  } else {
    // the last few finished games' box scores: who started, and minutes
    const recent = evs.filter(e => e.state === 'post').slice(-DC_RECENT);
    const sums = await Promise.all(recent.map(e => getJSON(`${API}/summary?event=${e.id}`).catch(() => null)));
    const rs = new Map(), rmin = new Map();
    let n = 0;
    for (const d of sums) {
      const side = d?.boxscore?.players?.find(t => String(t.team?.id) === String(id)); if (!side) continue;
      n++;
      const sec = side.statistics?.[0], mi = (sec?.labels || []).indexOf('MIN');
      for (const a of sec?.athletes || []) {
        const k = String(a.athlete?.id || ''); if (!k) continue;
        if (!P.has(k)) P.set(k, { id: k, name: a.athlete.displayName, short: a.athlete.shortName || a.athlete.displayName, pos: a.athlete.position?.abbreviation || '' });
        if (a.starter) rs.set(k, (rs.get(k) || 0) + 1);
        rmin.set(k, (rmin.get(k) || 0) + (+a.stats?.[mi] || 0));
      }
    }
    const recentMin = k => n ? (rmin.get(k) || 0) / n : (P.get(k)?.mpg || 0);
    const startScore = k => { const p = P.get(k) || {}; return (rs.get(k) || 0) * 10 + (p.gp ? p.gs / p.gp : 0) * 5 + recentMin(k) / 10; };
    const everyone = [...P.keys()].filter(k => P.get(k).mpg || rs.get(k) || rmin.get(k) || athletes.some(a => String(a.id) === k));
    const starters = new Set(everyone.filter(k => !isOut(k)).sort((a, b) => startScore(b) - startScore(a)).slice(0, 5).filter(k => startScore(k) > 0));
    const group = k => { const p = String(P.get(k)?.pos || '').toUpperCase(); return p.startsWith('C') ? 'C' : p.startsWith('F') || p === 'PF' || p === 'SF' ? 'F' : 'G'; };
    rows = DC_GROUP.map(([g, full]) => ({
      label: g, full, starters,
      ids: everyone.filter(k => group(k) === g).sort((a, b) => (isOut(a) - isOut(b)) || (starters.has(b) - starters.has(a)) || recentMin(b) - recentMin(a) || (P.get(b).mpg || 0) - (P.get(a).mpg || 0)),
    })).filter(r => r.ids.length);
    note = n ? `Fullcourt's estimate · last ${plural(n, 'game')}` : `Fullcourt's estimate · season minutes`;
  }
  if (!box.isConnected) return;
  if (!rows?.length) { box.remove(); return; }
  const pill = (k, starter) => {
    const p = P.get(k) || {}, inj = injBy.get(k);
    const mins = Number.isFinite(p.mpg) && p.mpg > 0 ? `${p.mpg.toFixed(1)} min` : '';
    return `<button class="dc-p${starter ? ' st' : ''}${isOut(k) ? ' out' : ''}" data-player="${esc(k)}" title="${esc(p.name || '')}${inj ? ` · ${esc(inj.status)}` : ''}">
      ${face(k, p.name || '', '', 80)}<span class="dc-n"><b>${esc(p.short || p.name || '')}</b><small>${starter ? '<em>Starter</em>' : ''}${mins}${inj ? `<i class="inj-red">${esc(inj.status)}</i>` : ''}</small></span></button>`;
  };
  box.innerHTML = `<div class="card-h"><h4>Depth chart</h4><span class="eyebrow">${esc(note)}</span></div>
    <div class="dc-rows">${rows.map(r => `<div class="dc-row"><span class="dc-pos" title="${esc(r.full)}">${esc(r.label)}</span>
      <div class="dc-ps hs drag-x" data-drag>${r.ids.map(k => pill(k, r.starters.has(k))).join('')}</div></div>`).join('')}</div>`;
  box.hidden = false;
  wireDrag(box);
}
