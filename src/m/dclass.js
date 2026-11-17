/* ---------------- a past NBA draft class, in full (opened from a player's "Draft" line) ----------------
   ESPN's draft feed has every class from 2001: picks in order with team, school, position and trade notes. Some older
   picks carry no player id (LeBron among them), so those are looked up by name when tapped. */
const DC_CACHE = new Map();
// picks that came from outside US college (G League Ignite, overseas) have no NBA player id in the draft feed: they're
// found by name in ESPN's player search after the list shows, then kept here so it's instant next time
const DC_IDS_KEY = 'fc-dc-ids';
const dcIds = () => { try { return JSON.parse(localStorage.getItem(DC_IDS_KEY) || '{}') || {}; } catch (e) { return {}; } };
const dcNorm = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
async function dcFind(name) {
  const known = dcIds(); if (known[name] !== undefined) return known[name];
  const r = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(name)}&limit=6&type=player&sport=basketball&league=nba`, { retries: 0, timeout: 8000 });
  const want = dcNorm(name), hit = (r.items || []).find(it => it.league === 'nba' && dcNorm(it.displayName) === want);
  let id = hit ? String(hit.id) : '';
  // retired players aren't in the player search; ESPN's general search has them (NBA = l:46)
  if (!id) {
    const g = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5`, { retries: 0, timeout: 8000 }).catch(() => null);
    const cs = (g?.results || []).flatMap(b => b.contents || []).filter(c => dcNorm(c.displayName) === want), c = cs.find(c => /~l:46~a:\d+/.test(c.uid || '')) || cs.find(c => /~l:69~a:\d+/.test(c.uid || ''));
    if (c) id = c.uid.match(/~a:(\d+)/)[1];
  }
  try { const k = dcIds(); k[name] = id; const keys = Object.keys(k); if (keys.length > 600) delete k[keys[0]]; localStorage.setItem(DC_IDS_KEY, JSON.stringify(k)); } catch (e) {}
  return id;
}
async function draftClass(year) {
  if (DC_CACHE.has(year)) return DC_CACHE.get(year);
  // the checked list (draft-history.json) first: its player ids are verified, the raw feed's aren't for older classes
  try {
    const H = await dhGet(), ps = H.years?.[year];
    if (ps?.length) { const v = { name: `${year} NBA Draft`, picks: ps.map(p => ({ ov: p.ov, rd: p.rd, pk: p.pk, tm: { id: p.tmId, abbreviation: p.tm, displayName: NBA_TEAMS[p.tm] || p.tm }, name: p.name, pid: p.pid || dcIds()[p.name] || '', school: p.school, pos: p.pos, note: p.note })) }; DC_CACHE.set(year, v); return v; }
  } catch (e) {}
  const d = await getJSON(`${API}/draft?season=${year}`, { timeout: 12000 });
  const pos = Object.fromEntries((d.positions || []).map(p => [String(p.id), p.abbreviation]));
  const teams = Object.fromEntries((d.teams || []).map(t => [String(t.id), t]));
  const picks = (d.picks || []).map(p => {
    const a = p.athlete || {}, link = a.proLink || a.link || '', idFromLink = link.match(/\/id\/(\d+)/)?.[1];
    return { ov: p.overall, rd: p.round, pk: p.pick, tm: teams[String(p.teamId)] || {}, name: a.displayName || '', pid: idFromLink || (year >= 2018 ? a.alternativeId : '') || dcIds()[a.displayName] || '', school: a.team?.shortDisplayName || a.team?.location || '', pos: pos[String(a.position?.id)] || '', note: p.tradeNote || '' };
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
      <button class="dc-p" ${who} data-dcov="${p.ov}">${p.pid ? face(p.pid, p.name, 'dc-face', 96) : `<span class="dc-face avatar">${esc(initials(p.name))}</span>`}<span><b>${esc(p.name)}</b><small>${esc([p.pos, p.school].filter(Boolean).join(' · '))}</small></span></button>
      <button class="dc-t" data-team="${esc(p.tm.id || '')}" title="${esc(p.tm.displayName || '')}">${dLogo(p.tm.abbreviation, 40)}<span>${esc(p.tm.abbreviation || '')}</span></button>
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
  // fill in the players the feed left without an id: photo and link, a few lookups at a time
  (async () => {
    const todo = D.picks.filter(p => !p.pid && p.name); let i = 0;
    await Promise.all([0, 1, 2, 3].map(async () => {
      while (i < todo.length && sheet.alive) {
        const p = todo[i++]; let id = '';
        try { id = await dcFind(p.name); } catch (e) {}
        if (!id || !sheet.alive) continue;
        p.pid = id;
        const b = $(`.dc-p[data-dcov="${p.ov}"]`, sheet.body); if (!b) continue;
        b.removeAttribute('data-dcname'); b.dataset.player = id;
        const av = $('.dc-face', b); if (av) av.outerHTML = face(id, p.name, 'dc-face', 96);
      }
    }));
  })();
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

/* ---------------- Draft tab: past classes (where are they now, redraft) and team draft history ----------------
   draft-history.json (tools/drafthist.mjs, daily on GitHub) has every class since 2001 with each pick's career from
   Basketball-Reference (seasons, games, per-game numbers, Win Shares) and honours (All-Star games, MVP, ROY, DPOY,
   Sixth Man, Most Improved, All-NBA). */
let DH = null;
const dhGet = () => DH ||= fetch(`https://raw.githubusercontent.com/larosa023/fullcourt/drafthist-data/draft-history.json?t=${Math.floor(Date.now() / 3600e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(e => { DH = null; throw e; });
const DV = { year: null, sort: 'pick', round: 'all', team: null, tsort: 'year' };
try { Object.assign(DV, JSON.parse(localStorage.getItem('fc-dv') || '{}')); } catch (e) {}
const dvSave = () => { try { localStorage.setItem('fc-dv', JSON.stringify(DV)); } catch (e) {} };
const NBA_TEAMS = { ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets', CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons', GS: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers', LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves', NO: 'New Orleans Pelicans', NY: 'New York Knicks', OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns', POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SA: 'San Antonio Spurs', TOR: 'Toronto Raptors', UTAH: 'Utah Jazz', WSH: 'Washington Wizards' };
// teams that have since moved or been renamed keep their old abbreviation in the list, with today's logo
const OLD_LOGO = { NJ: 'BKN', NJN: 'BKN', SEA: 'OKC', NOH: 'NO', NOK: 'NO', VAN: 'MEM', CHH: 'CHA' };
const dLogo = (ab, n) => ab ? logo(OLD_LOGO[ab] || ab, n) : '';
const TAG_SHORT = { 'All-Star': 'All-Star', MVP: 'MVP', 'Rookie of the Year': 'ROY', 'Defensive Player of the Year': 'DPOY', 'Sixth Man': '6MOY', 'Most Improved': 'MIP', 'All-NBA': 'All-NBA' };
const TAG_ORDER = ['MVP', 'All-Star', 'All-NBA', 'Defensive Player of the Year', 'Rookie of the Year', 'Sixth Man', 'Most Improved'];
const dTags = t => !t ? '' : TAG_ORDER.filter(k => t[k]).map(k => `<i class="dh-tag${k === 'MVP' ? ' mvp' : k === 'All-Star' ? ' as' : ''}" title="${esc(k)}${t[k] > 1 ? ` (${t[k]} times)` : ''}">${t[k] > 1 ? `${t[k]}× ` : ''}${TAG_SHORT[k]}</i>`).join('');
const f1 = v => v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1);
const dCareer = p => !p.c ? `<span class="dh-none">${p.ov && (+String(p.yr || 0) >= new Date().getFullYear()) ? 'Rookie season' : 'Never played in the NBA'}</span>`
  : `<span class="dh-car"><b>${f1(p.c.ppg)}</b><small>pts</small> <b>${f1(p.c.rpg)}</b><small>reb</small> <b>${f1(p.c.apg)}</b><small>ast</small><em>${p.c.s || '–'} season${p.c.s === 1 ? '' : 's'} · ${p.c.g || 0} games${p.c.ws != null ? ` · ${f1(p.c.ws)} WS` : ''}</em></span>`;
const dPerson = p => `<button class="dc-p" ${p.pid ? `data-player="${esc(p.pid)}"` : `data-dcname="${esc(p.name)}"`}>${p.pid ? face(p.pid, p.name, 'dc-face', 96) : `<span class="dc-face avatar">${esc(initials(p.name))}</span>`}<span><b>${esc(p.name)}</b><small>${esc([p.pos, p.school].filter(Boolean).join(' · '))}</small></span></button>`;
// career value for the redraft: Win Shares, then games
const dValue = p => (p.c?.ws ?? -50) + (p.c?.g || 0) / 1e4;

async function renderPastDrafts(root, modes) {
  if (!root.querySelector('.dh')) root.innerHTML = `${modes}<div class="sk" style="height:520px;border-radius:16px;margin-top:14px"></div>`;
  let H; try { H = await dhGet(); } catch (e) { root.innerHTML = `${modes}<div class="empty"><b>Past drafts didn't load</b><button class="btn" data-dretry>Try again</button></div>`; return; }
  const years = Object.keys(H.years).map(Number).sort((a, b) => b - a);
  if (!years.includes(DV.year)) DV.year = years[0];
  const all = H.years[DV.year].map(p => ({ ...p, yr: DV.year }));
  const redraft = DV.sort === 'redraft', rank = new Map([...all].sort((a, b) => dValue(b) - dValue(a)).map((p, i) => [p.ov, i + 1]));
  const list = (redraft ? [...all].sort((a, b) => rank.get(a.ov) - rank.get(b.ov)) : all).filter(p => redraft || DV.round === 'all' || String(p.rd) === DV.round);
  const stars = all.filter(p => p.t?.['All-Star']), awards = all.filter(p => p.t && Object.keys(p.t).some(k => k !== 'All-Star' && k !== 'All-NBA'));
  const played = all.filter(p => p.c?.g), top = [...all].sort((a, b) => dValue(b) - dValue(a))[0];
  const row = p => {
    const rk = rank.get(p.ov), mv = p.ov - rk;
    return `<li class="dc-r dh-r">
      <span class="dc-n">${redraft ? `<b>${rk}</b><small class="${mv > 0 ? 'up' : mv < 0 ? 'dn' : ''}">was ${p.ov}${mv ? ` ${mv > 0 ? '▲' : '▼'}${Math.abs(mv)}` : ''}</small>` : `<b>${p.ov}</b><small>R${p.rd} · ${p.pk}</small>`}</span>
      ${dPerson(p)}
      <button class="dc-t" data-team="${esc(p.tmId)}" title="${esc(NBA_TEAMS[p.tm] || p.tm)}">${dLogo(p.tm, 40)}<span>${esc(p.tm)}</span></button>
      <div class="dh-x">${dCareer(p)}${dTags(p.t)}</div>
      ${p.note && !redraft ? `<span class="dc-note">${esc(p.note)}</span>` : ''}
    </li>`;
  };
  root.innerHTML = `${modes}<div class="dh">
    <div class="dh-head">
      <div class="dh-yr"><button class="icon-btn" data-dvyear="${DV.year - 1}" ${years.includes(DV.year - 1) ? '' : 'disabled'} aria-label="Year before">‹</button>
        <select data-dvsel aria-label="Draft year">${years.map(y => `<option value="${y}"${y === DV.year ? ' selected' : ''}>${y} NBA Draft</option>`).join('')}</select>
        <button class="icon-btn" data-dvyear="${DV.year + 1}" ${years.includes(DV.year + 1) ? '' : 'disabled'} aria-label="Year after">›</button></div>
      <div class="seg" role="group" aria-label="Order"><span class="knob"></span><button data-dvsort="pick" aria-pressed="${!redraft}">Draft order</button><button data-dvsort="redraft" aria-pressed="${redraft}">Redraft</button></div>
      ${redraft ? '' : `<div class="seg" role="group" aria-label="Round"><span class="knob"></span>${['all', '1', '2'].map(k => `<button data-dvround="${k}" aria-pressed="${DV.round === k}">${k === 'all' ? 'All' : `Round ${k}`}</button>`).join('')}</div>`}
    </div>
    <div class="dh-sum">
      <div><b>${played.length}</b><small>of ${all.length} played in the NBA</small></div>
      <div><b>${stars.length}</b><small>All-Star${stars.length === 1 ? '' : 's'}${stars.length ? `: ${esc(stars.sort((a, b) => b.t['All-Star'] - a.t['All-Star']).slice(0, 3).map(p => p.name.split(' ').slice(-1)[0]).join(', '))}${stars.length > 3 ? '…' : ''}` : ''}</small></div>
      <div><b>${awards.length}</b><small>won an award</small></div>
      ${top?.c ? `<div><b>${esc(top.name.split(' ').slice(-1)[0])}</b><small>best career so far (pick ${top.ov})</small></div>` : ''}
    </div>
    ${redraft ? `<p class="dh-note">Redraft: the class re-ranked by career Win Shares so far (games break ties). Arrows show how far each player moved from where he was picked.</p>` : ''}
    <ol class="dc-list">${list.map(row).join('')}</ol>
    <p class="odds-note">Picks from ESPN; careers and honours from Basketball-Reference, updated daily. Tap a player for his page or a team for theirs.</p>
  </div>`;
  $$('.seg', root).forEach(s => requestAnimationFrame(() => placeKnob(s)));
  wirePast(root);
}

async function renderTeamDrafts(root, modes) {
  if (!root.querySelector('.dh')) root.innerHTML = `${modes}<div class="sk" style="height:520px;border-radius:16px;margin-top:14px"></div>`;
  let H; try { H = await dhGet(); } catch (e) { root.innerHTML = `${modes}<div class="empty"><b>Draft history didn't load</b><button class="btn" data-dretry>Try again</button></div>`; return; }
  // teams by ESPN id, named by their latest abbreviation (Seattle's picks sit with OKC, New Jersey's with Brooklyn)
  const latest = {}; for (const [y, ps] of Object.entries(H.years)) for (const p of ps) if (p.tmId && (!latest[p.tmId] || +y >= latest[p.tmId].y)) latest[p.tmId] = { y: +y, tm: p.tm };
  const teams = Object.entries(latest).map(([id, v]) => ({ id, ab: v.tm, name: NBA_TEAMS[v.tm] || v.tm })).sort((a, b) => a.name.localeCompare(b.name));
  if (!teams.some(t => t.id === DV.team)) DV.team = (LGK === 'nba' && favId && teams.some(t => t.id === String(favId))) ? String(favId) : teams[0]?.id;
  const T = teams.find(t => t.id === DV.team);
  const picks = Object.entries(H.years).flatMap(([y, ps]) => ps.filter(p => p.tmId === DV.team).map(p => ({ ...p, yr: +y })));
  const byVal = DV.tsort === 'best';
  const list = byVal ? [...picks].sort((a, b) => dValue(b) - dValue(a)) : [...picks].sort((a, b) => b.yr - a.yr || a.ov - b.ov);
  const played = picks.filter(p => p.c?.g), stars = picks.filter(p => p.t?.['All-Star']), r1 = picks.filter(p => p.rd === 1);
  const best = [...picks].sort((a, b) => dValue(b) - dValue(a))[0];
  const row = p => `<li class="dc-r dh-r">
      <span class="dc-n"><b>${p.yr}</b><small>#${p.ov} · R${p.rd}</small></span>
      ${dPerson(p)}
      <span></span>
      <div class="dh-x">${dCareer(p)}${dTags(p.t)}</div>
      ${p.note ? `<span class="dc-note">${esc(p.note)}</span>` : ''}
    </li>`;
  root.innerHTML = `${modes}<div class="dh">
    <div class="dh-head">
      <label class="dh-team">${T ? dLogo(T.ab, 48) : ''}<select data-dvteam aria-label="Team">${teams.map(t => `<option value="${t.id}"${t.id === DV.team ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <div class="seg" role="group" aria-label="Order"><span class="knob"></span><button data-dvtsort="year" aria-pressed="${!byVal}">Newest first</button><button data-dvtsort="best" aria-pressed="${byVal}">Best careers first</button></div>
    </div>
    <div class="dh-sum">
      <div><b>${picks.length}</b><small>picks since ${Math.min(...Object.keys(H.years).map(Number))} (${r1.length} first-rounders)</small></div>
      <div><b>${played.length}</b><small>played in the NBA</small></div>
      <div><b>${stars.length}</b><small>became All-Stars${stars.length ? `: ${esc(stars.slice(0, 3).map(p => p.name.split(' ').slice(-1)[0]).join(', '))}${stars.length > 3 ? '…' : ''}` : ''}</small></div>
      ${best?.c ? `<div><b>${esc(best.name.split(' ').slice(-1)[0])}</b><small>best pick (${best.yr}, #${best.ov})</small></div>` : ''}
    </div>
    <ol class="dc-list">${list.map(row).join('') || '<li class="dh-none">No picks found.</li>'}</ol>
    <p class="odds-note">The picks this franchise made on draft night (picks traded away before the draft count for the team that made them; draft-night trades are in the notes). Careers and honours from Basketball-Reference.</p>
  </div>`;
  $$('.seg', root).forEach(s => requestAnimationFrame(() => placeKnob(s)));
  wirePast(root);
}

function wirePast(root) {
  if (root._dvWired) return; root._dvWired = true;
  const again = () => { dvSave(); lazy('draft').then(m => m.renderDraft()); };
  root.addEventListener('click', async e => {
    const t = e.target;
    const y = t.closest('[data-dvyear]'); if (y && !y.disabled) { DV.year = +y.dataset.dvyear; return again(); }
    const s = t.closest('[data-dvsort]'); if (s) { DV.sort = s.dataset.dvsort; return again(); }
    const r = t.closest('[data-dvround]'); if (r) { DV.round = r.dataset.dvround; return again(); }
    const ts = t.closest('[data-dvtsort]'); if (ts) { DV.tsort = ts.dataset.dvtsort; return again(); }
    const n = t.closest('.dh [data-dcname]');
    if (n) { e.stopPropagation(); try { const id = await dcFind(n.dataset.dcname); if (id) openPlayer(id); else toast(`No page for ${n.dataset.dcname}`); } catch (x) { toast("Couldn't look that player up"); } }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-dvsel]')) { DV.year = +e.target.value; again(); }
    if (e.target.matches('[data-dvteam]')) { DV.team = e.target.value; again(); }
  });
}
