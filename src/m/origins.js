/* ---------------- History: where they're from ----------------
   Every NBA player's birthplace on a map (the world, or the US by state) and every college, filtered by team and era.
   Tap a place for its players. From Basketball-Reference's birthplace and draft pages plus ESPN (tools/origins.mjs,
   weekly); the map shapes are prepared by the same job (tools/origins-shapes.mjs). */
const OR_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt/origins-data';
let OR_P = null;
const orLoad = () => OR_P ||= (async () => {
  const get = async (f, hours) => {
    const url = `${OR_RAW}/${f}?t=${Math.floor(Date.now() / (hours * 36e5))}`, key = `${location.origin}/__fc-or/${f}`;
    try { if (self.caches) { const c = await caches.open('fc-keep-or-v1'), hit = await c.match(key); if (hit && Date.now() - (+hit.headers.get('x-t') || 0) < hours * 36e5) return await hit.json(); const r = await fetch(url); if (!r.ok) throw new Error(r.status); const t = await r.text(); c.put(key, new Response(t, { headers: { 'content-type': 'application/json', 'x-t': String(Date.now()) } })).catch(() => {}); return JSON.parse(t); } } catch (e) { if (/^\d+$/.test(e.message)) throw e; }
    const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json();
  };
  const [o, sh] = await Promise.all([get('origins.json', 24), get('shapes.json', 24 * 7)]);
  const C = Object.fromEntries(o.cols.map((k, i) => [k, i]));
  const players = o.players.map(p => ({ id: p[C.id], name: p[C.name], espn: p[C.espn], y0: p[C.first], y1: p[C.last], score: p[C.score] || 0, born: p[C.born], college: p[C.college], teams: p[C.teams] ? p[C.teams].split(',') : [], played: p[C.played] ? p[C.played].split(',') : null }));
  return { players, places: o.places || {}, shapes: sh, last: Math.max(...players.map(p => p.y1 || 0)) };
})().catch(e => { OR_P = null; throw e; });

const OR_TEAMS = [['ATL', 'Atlanta Hawks'], ['BOS', 'Boston Celtics'], ['BKN', 'Brooklyn Nets'], ['CHA', 'Charlotte Hornets'], ['CHI', 'Chicago Bulls'], ['CLE', 'Cleveland Cavaliers'], ['DAL', 'Dallas Mavericks'], ['DEN', 'Denver Nuggets'], ['DET', 'Detroit Pistons'], ['GS', 'Golden State Warriors'], ['HOU', 'Houston Rockets'], ['IND', 'Indiana Pacers'], ['LAC', 'LA Clippers'], ['LAL', 'Los Angeles Lakers'], ['MEM', 'Memphis Grizzlies'], ['MIA', 'Miami Heat'], ['MIL', 'Milwaukee Bucks'], ['MIN', 'Minnesota Timberwolves'], ['NO', 'New Orleans Pelicans'], ['NY', 'New York Knicks'], ['OKC', 'Oklahoma City Thunder'], ['ORL', 'Orlando Magic'], ['PHI', 'Philadelphia 76ers'], ['PHX', 'Phoenix Suns'], ['POR', 'Portland Trail Blazers'], ['SAC', 'Sacramento Kings'], ['SA', 'San Antonio Spurs'], ['TOR', 'Toronto Raptors'], ['UTAH', 'Utah Jazz'], ['WSH', 'Washington Wizards']];
const OR_ERAS = [['all', 'All time'], ['now', 'Playing now'], ['2020', '2020s'], ['2010', '2010s'], ['2000', '2000s'], ['1990', '1990s'], ['1980', '1980s'], ['1970', '1970s'], ['1960', '1960s'], ['1946', '1940s and 1950s']];
const OS = (() => { try { return { view: 'world', mode: 'born', team: '', era: 'all', sel: '', ...JSON.parse(lsGet('fc-org') || '{}') }; } catch (e) { return { view: 'world', mode: 'born', team: '', era: 'all', sel: '' }; } })();
const orSave = () => lsSet('fc-org', JSON.stringify({ view: OS.view, mode: OS.mode, team: OS.team, era: OS.era }));
const orYear = y => `${y - 1}-${String(y).slice(2)}`;

async function histMap(pane) {
  let D;
  try { D = await orLoad(); }
  catch (e) { pane.innerHTML = '<div class="empty"><b>The map is still being built</b><span>Every player\'s birthplace and college are being collected. Check back in a little while.</span></div>'; return; }
  // who counts under the filters
  const inEra = p => { if (OS.era === 'all') return true; if (OS.era === 'now') return p.y1 >= D.last; const a = +OS.era, b = a === 1946 ? 1960 : a + 10; return p.y0 <= b && p.y1 >= a + 1; };
  const list = D.players.filter(p => (!OS.team || p.teams.includes(OS.team)) && inEra(p));
  const keyOf = p => OS.mode === 'college' ? p.college : OS.view === 'us' ? (p.born?.startsWith('US-') ? p.born : '') : (p.born?.startsWith('US-') ? 'US' : p.born);
  const groups = new Map(); for (const p of list) { const k = keyOf(p); if (!k) continue; (groups.get(k) || groups.set(k, []).get(k)).push(p); }
  const nameOf = k => OS.mode === 'college' ? k : k === 'US' ? 'United States' : D.places[k] || D.shapes?.world?.shapes?.[k]?.n || D.shapes?.us?.shapes?.[k]?.n || k;
  const ranked = [...groups].sort((a, b) => b[1].length - a[1].length);
  const total = list.length, placed = ranked.reduce((a, [, ps]) => a + ps.length, 0);
  if (OS.sel && !groups.has(OS.sel)) OS.sel = '';
  // the map: shading by how many players came from each place (a log scale, so one big state doesn't wash out the rest)
  let mapHTML = '';
  if (OS.mode !== 'college') {
    const M = OS.view === 'us' ? D.shapes.us : D.shapes.world, max = Math.max(1, ...ranked.map(([, ps]) => ps.length));
    const lvl = n => n ? 0.18 + 0.82 * Math.log(1 + n) / Math.log(1 + max) : 0;
    const paths = Object.entries(M.shapes).map(([k, s]) => { const n = groups.get(k)?.length || 0, a = lvl(n);
      return `<path d="${s.d}" data-orsel="${n ? k : ''}" class="or-sh${n ? ' has' : ''}${OS.sel === k ? ' on' : ''}" style="${n ? `--a:${(a * 100).toFixed(0)}%` : ''}"><title>${esc(nameOf(k))}: ${n} player${n === 1 ? '' : 's'}</title></path>`; }).join('');
    const off = ranked.filter(([k]) => !M.shapes[k]);
    mapHTML = `<div class="or-map card"><svg viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="Players by ${OS.view === 'us' ? 'state' : 'country'} of birth">${paths}</svg>
      <div class="or-scale"><span>Fewer</span><i></i><span>More players</span></div>
      ${off.length ? `<div class="or-off"><span class="or-lab">Not on the map</span>${off.map(([k, ps]) => `<button class="chip${OS.sel === k ? ' on' : ''}" data-orsel="${esc(k)}">${esc(nameOf(k))} <b>${ps.length}</b></button>`).join('')}</div>` : ''}</div>`;
  }
  const top = ranked.slice(0, OS.mode === 'college' ? 40 : 15), tmax = top[0]?.[1].length || 1;
  const sel = OS.sel ? groups.get(OS.sel) : null;
  const people = sel ? sel.slice().sort((a, b) => b.score - a.score) : [];
  pane.innerHTML = `<div class="or">
    <div class="or-ctl">
      <div class="seg sm" data-ormode><span class="knob"></span>${[['world', 'World'], ['us', 'United States'], ['college', 'Colleges']].map(([k, l]) => `<button data-ormode="${k}" aria-pressed="${(OS.mode === 'college' ? 'college' : OS.view) === k}">${l}</button>`).join('')}</div>
      <select class="or-sel" data-orf="team" aria-label="Team"><option value="">Any team</option>${OR_TEAMS.map(([k, n]) => `<option value="${k}"${OS.team === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select class="or-sel" data-orf="era" aria-label="Era">${OR_ERAS.map(([k, l]) => `<option value="${k}"${OS.era === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <p class="or-sum"><b>${total.toLocaleString()}</b> player${total === 1 ? '' : 's'}${OS.team ? ` who played for the ${esc(OR_TEAMS.find(t => t[0] === OS.team)?.[1] || OS.team)}` : ''}${OS.era !== 'all' ? ` · ${esc(OR_ERAS.find(e => e[0] === OS.era)[1].toLowerCase())}` : ''} · ${OS.mode === 'college' ? `${placed.toLocaleString()} with a college on record, from ${groups.size.toLocaleString()} schools` : OS.view === 'us' ? `${placed.toLocaleString()} born in ${groups.size} states` : `born in ${groups.size} countries${groups.get('US') ? ` · ${Math.round(groups.get('US').length / Math.max(1, placed) * 100)}% in the US` : ''}`}</p>
    <div class="or-body">
      ${mapHTML}
      <div class="or-side">
        ${sel ? `<div class="card or-pick"><div class="or-ph"><div><span class="or-lab">${OS.mode === 'college' ? 'College' : 'Born in'}</span><b>${esc(nameOf(OS.sel))}</b></div><span class="or-n">${sel.length}</span><button class="icon-btn" data-orsel="" aria-label="Close">×</button></div>
          <ol class="or-ps">${people.slice(0, 200).map(p => `<li>${p.espn ? `<button class="or-p" data-player="${p.espn}">` : '<div class="or-p">'}${face(p.espn, p.name, 'or-f', 60)}<span><b>${esc(p.name)}</b><small>${orYear(p.y0)} to ${p.y1 >= D.last ? 'now' : orYear(p.y1)}${(p.played || p.teams).length ? ` · ${esc((p.played || p.teams).slice(0, 4).join(', '))}${(p.played || p.teams).length > 4 ? '…' : ''}` : ''}${OS.mode === 'college' && p.born ? ` · ${esc(nameOf(p.born.startsWith('US-') ? p.born : p.born))}` : ''}</small></span>${p.espn ? '</button>' : '</div>'}</li>`).join('')}</ol>
          ${people.length > 200 ? `<p class="or-note">And ${people.length - 200} more.</p>` : ''}</div>` : ''}
        <div class="card or-top"><span class="or-lab">${OS.mode === 'college' ? 'Most players' : OS.view === 'us' ? 'Top states' : 'Top countries'}</span>
          <ol>${top.map(([k, ps], i) => `<li><button data-orsel="${esc(k)}" class="${OS.sel === k ? 'on' : ''}"><span class="or-rk">${i + 1}</span><span class="or-nm">${esc(nameOf(k))}</span><i style="--w:${(ps.length / tmax * 100).toFixed(0)}%"></i><b>${ps.length}</b></button></li>`).join('')}</ol>
          ${OS.view === 'world' && OS.mode !== 'college' && groups.get('US') ? '<button class="btn ghost sm" data-ormode="us">See the US by state</button>' : ''}</div>
      </div>
    </div>
    <p class="or-note">Birthplaces from Basketball-Reference (US players by state, others by country); colleges from every draft since 1947, plus ESPN for undrafted players since 2000-01. Updated weekly.</p>
  </div>`;
  $$('.seg', pane).forEach(placeKnob);
  if (!pane._or) {
    pane._or = true;
    pane.addEventListener('click', e => {
      if (!pane.querySelector('.or')) return;
      const m = e.target.closest('[data-ormode]'); if (m && m.dataset.ormode) { const k = m.dataset.ormode; if (k === 'college') OS.mode = 'college'; else { OS.mode = 'born'; OS.view = k; } OS.sel = ''; orSave(); histMap(pane); return; }
      const s = e.target.closest('[data-orsel]'); if (s && !e.target.closest('[data-player]')) { const k = s.dataset.orsel; OS.sel = OS.sel === k ? '' : k; histMap(pane).then(() => { if (OS.sel && matchMedia('(max-width: 900px)').matches) pane.querySelector('.or-pick')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }); }
    });
    pane.addEventListener('change', e => { const f = e.target.closest('[data-orf]'); if (!f) return; OS[f.dataset.orf] = f.value; OS.sel = ''; orSave(); histMap(pane); });
  }
}
