/* College: AP / Coaches polls, conference standings, and teams by conference.
   Core hands these views over when the site is in NCAAW or NCAAM mode. */

const CS = { poll: 0, std: 'ap', conf: null, tconf: 'top', tq: '' };
let pollP = null;
function loadPolls(force) {
  if (pollP && !force) return pollP;
  pollP = getJSON(`${API}/rankings`).then(d => {
    const polls = (d.rankings || []).map(r => ({
      name: r.name, short: /coach/i.test(r.name) ? 'Coaches' : 'AP Top 25', when: r.occurrence?.displayValue || '', date: r.date,
      ranks: (r.ranks || []).map(x => { regTeam(x.team); return { rank: x.current, prev: x.previous, pts: x.points, fpv: x.firstPlaceVotes, trend: x.trend, rec: x.recordSummary, id: String(x.team.id), abbr: x.team.abbreviation, name: x.team.location, nick: x.team.name }; }),
      others: (r.others || []).map(x => ({ id: String(x.team.id), name: x.team.location, pts: x.points })),
    }));
    S.polls = polls; S.apRank = new Map((polls[0]?.ranks || []).map(r => [r.id, r.rank]));
    return polls;
  }).catch(e => { pollP = null; throw e; });
  return pollP;
}
setInterval(() => { if (!document.hidden) loadPolls(true).then(() => { renderMini(); if (S.view === 'standings') renderStandings(); }).catch(() => {}); }, 30 * 60e3);

const trendHTML = r => {
  if (!r.prev || r.prev > 25) return r.prev === 0 || !r.prev ? '<span class="cp-tr new" title="Newly ranked">new</span>' : '<span class="cp-tr new">new</span>';
  const d = r.prev - r.rank;
  return d > 0 ? `<span class="cp-tr up" title="Up ${d}">▲${d}</span>` : d < 0 ? `<span class="cp-tr dn" title="Down ${-d}">▼${-d}</span>` : '<span class="cp-tr" title="No change">–</span>';
};
const preseason = p => /preseason/i.test(p?.when || '');

/* ---------- sidebar: the AP Top 25 ---------- */
function renderMini() {
  const box = $('#miniStd'); if (!box) return;
  const h = box.closest('.panel')?.querySelector('h3');
  if (h) h.innerHTML = `<span>AP Top 25</span><button class="link-btn" data-view="standings">Full poll</button>`;
  const seg = $('#miniSeg'); if (seg) seg.hidden = true;
  if (!S.polls) { box.innerHTML = Array.from({ length: 10 }, () => '<div class="sk" style="height:30px;margin:4px 0;border-radius:8px"></div>').join(''); loadPolls().then(renderMini).catch(() => { box.innerHTML = '<div class="empty" style="padding:18px"><b>Poll unavailable</b></div>'; }); return; }
  const p = S.polls[0]; if (!p) { box.innerHTML = '<div class="empty" style="padding:18px"><b>No poll yet</b></div>'; return; }
  box.innerHTML = `<p class="cp-when">${esc(p.when)}${p.date ? ' · ' + esc(new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}</p>` + p.ranks.slice(0, 15).map(r => `
    <button class="mini-row${r.id === favId ? ' fav-row' : ''}" data-team="${r.id}"><span class="sd">${r.rank}</span>${logo(r.abbr, 48)}<span class="nm">${esc(r.name)}</span><span class="rc">${esc(r.rec || '')}</span><span class="gb">${preseason(p) ? (r.fpv ? `<span title="First-place votes">${r.fpv}★</span>` : '') : trendHTML(r)}</span></button>`).join('')
    + `<button class="link-btn cp-more" data-view="standings">All 25 and others receiving votes →</button>`;
}

/* ---------- Rankings page: polls + conference standings ---------- */
function renderStandings() {
  const wrap = $('#stdWrap'); if (!wrap) return;
  const view = $('#v-standings');
  $('.page-title', view).textContent = 'Rankings';
  $('#stdSeg').hidden = true; $('#stdLegend').hidden = true;
  if (!S.standings || !S.polls) {
    wrap.innerHTML = `<div style="padding:14px;display:grid;gap:8px">${Array.from({ length: 10 }, () => '<div class="sk" style="height:34px;border-radius:8px"></div>').join('')}</div>`;
    Promise.all([loadStandings(), loadPolls()]).then(() => { if (S.view === 'standings') renderStandings(); }).catch(() => { wrap.innerHTML = `<div class="empty" style="border:0"><b>Rankings didn't load</b>The feed may be busy.<br><button class="btn" data-retry="standings">Try again</button></div>`; });
    return;
  }
  const confs = S.standings.confs;
  if (!CS.conf || !confs.some(c => c.id === CS.conf)) CS.conf = (favId && S.teams[favId]?.confId) || confs[0]?.id;
  $('#stdSeason').textContent = `${S.standings.season || ''} season`;
  const tabs = [['ap', 'AP Top 25'], ['coaches', 'Coaches'], ['conf', 'Conferences']];
  const ctrl = `<div class="cs-ctrl"><div class="seg" id="csSeg"><span class="knob"></span>${tabs.map(([k, l]) => `<button data-csstd="${k}" aria-pressed="${CS.std === k}">${l}</button>`).join('')}</div>
    ${CS.std === 'conf' ? `<select class="cs-sel" data-csconf aria-label="Conference">${confs.map(c => `<option value="${c.id}"${c.id === CS.conf ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}</div>`;
  let body, note = '', foot = '';
  if (CS.std === 'conf') {
    const c = confs.find(x => x.id === CS.conf) || confs[0];
    body = `<table class="std cs-std">
      <thead><tr><th># · Team</th><th>Conf</th><th>Overall</th><th>PCT</th><th>Home</th><th>Away</th><th>vs AP</th><th>Strk</th><th>PPG</th><th>OPP</th><th>Diff</th></tr></thead>
      <tbody>${c.rows.map((r, i) => {
        const sw = /^W/.test(r.strk) ? 'strk-w' : /^L/.test(r.strk) ? 'strk-l' : '', rk = S.apRank?.get(String(r.id));
        return `<tr class="${r.id === favId ? 'fav-row' : ''}" data-team="${r.id}" style="--i:${i}">
          <td><div class="team-cell"><span class="seed">${i + 1}</span>${logo(r.abbr, 56)}<b>${rk ? `<i class="rk">${rk}</i>` : ''}${esc(r.loc)}</b><span class="ab">${esc(r.abbr)}</span></div></td>
          <td><b>${esc(r.conf)}</b></td><td>${r.w}-${r.l}</td><td>${esc(r.pct)}</td><td>${esc(r.home)}</td><td>${esc(r.road)}</td><td>${esc(r.vsAP)}</td>
          <td class="${sw}">${esc(r.strk)}</td><td>${esc(r.ppg)}</td><td>${esc(r.opp)}</td><td class="${r.diff > 0 ? 'strk-w' : r.diff < 0 ? 'strk-l' : ''}">${esc(r.diffD)}</td></tr>`;
      }).join('')}</tbody></table>`;
  } else {
    const p = S.polls[CS.std === 'coaches' ? 1 : 0] || S.polls[0];
    const pre = preseason(p);
    note = `<p class="cs-when">${esc(p.name)} · ${esc(p.when)}${p.date ? ' · ' + esc(new Date(p.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })) : ''}</p>`;
    body = `<table class="std cs-poll">
      <thead><tr><th>Rank · Team</th><th>Record</th><th>Points</th><th>1st</th>${pre ? '' : '<th>Prev</th><th>Move</th>'}<th>Conf</th></tr></thead>
      <tbody>${p.ranks.map((r, i) => `<tr class="${r.id === favId ? 'fav-row' : ''}" data-team="${r.id}" style="--i:${i}">
        <td><div class="team-cell"><span class="seed cs-rk">${r.rank}</span>${logo(r.abbr, 56)}<b>${esc(r.name)}</b><span class="ab">${esc(r.abbr || '')}</span></div></td>
        <td>${esc(r.rec || '0-0')}</td><td>${r.pts ?? '–'}</td><td>${r.fpv || ''}</td>${pre ? '' : `<td>${r.prev && r.prev <= 25 ? r.prev : 'NR'}</td><td>${trendHTML(r)}</td>`}<td>${esc(S.teams[r.id]?.confShort || '')}</td></tr>`).join('')}</tbody></table>
    `;
    foot = `${p.others.length ? `<p class="cs-others"><b>Others receiving votes:</b> ${p.others.map(o => `<button class="link-btn" data-team="${o.id}">${esc(o.name)}</button> ${o.pts}`).join(', ')}</p>` : ''}`;
  }
  wrap.classList.remove('tbl-wrap', 'drag-x'); wrap.removeAttribute('data-drag');
  wrap.innerHTML = ctrl + note + `<div class="tbl-wrap drag-x cs-tbl" data-drag>${body}</div>` + foot;
  dragScroll($('.cs-tbl', wrap));
  requestAnimationFrame(() => placeKnob($('#csSeg')));
}

/* ---------- Teams: every Division I school, by conference ---------- */
function renderTeams() {
  const body = $('#teamsBody'); if (!body) return;
  const seg = $('#teamsSeg'); if (seg) seg.hidden = true;
  if (!S.standings) {
    body.innerHTML = `<div class="team-grid">${Array.from({ length: 12 }, () => '<div class="sk" style="height:132px"></div>').join('')}</div>`;
    loadStandings().catch(() => { body.innerHTML = `<div class="empty"><b>Teams didn't load</b><button class="btn" data-retry="teams">Try again</button></div>`; });
    return;
  }
  if (!S.polls) loadPolls().then(() => { if (S.view === 'teams') renderTeams(); }).catch(() => {});
  const confs = S.standings.confs, all = confs.flatMap(c => c.rows.map(r => ({ ...r, cs: c.short })));
  $('#teamsCount').textContent = `${all.length} Division I teams`;
  const tile = (r, i) => `
      <button class="ttile enter" style="--i:${Math.min(i, 24)};--tc:${teamColor(r.id)}" data-team="${r.id}">
        ${logo(r.abbr, 240, 'lg bg-logo')}
        ${logo(r.abbr, 88)}
        ${r.id === favId ? '<span class="tile-star" title="Your team">★</span>' : ''}<div><span>${esc(r.cs)}</span><b>${S.apRank?.get(String(r.id)) ? `<i class="rk">${S.apRank.get(String(r.id))}</i>` : ''}${esc(r.loc)}</b><span class="num">${r.w}-${r.l} · ${esc(r.conf)} conf${r.strk && r.strk !== '–' ? ' · ' + esc(r.strk) : ''}</span></div>
      </button>`;
  const q = CS.tq.trim().toLowerCase();
  let groups;
  if (q) groups = [{ name: 'Search', rows: all.filter(r => [r.loc, r.name, r.abbr, r.cs].some(x => String(x || '').toLowerCase().includes(q))) }];
  else if (CS.tconf === 'top') { const ap = S.polls?.[0]?.ranks || []; groups = [{ name: 'AP Top 25', rows: ap.map(p => all.find(r => String(r.id) === p.id)).filter(Boolean) }]; }
  else if (CS.tconf === 'all') groups = confs.map(c => ({ name: c.name, rows: [...c.rows].map(r => ({ ...r, cs: c.short })).sort((a, b) => a.loc.localeCompare(b.loc)) }));
  else { const c = confs.find(x => x.id === CS.tconf) || confs[0]; groups = [{ name: c.name, rows: [...c.rows].map(r => ({ ...r, cs: c.short })) }]; }
  const keep = document.activeElement?.matches?.('[data-ctq]') ? document.activeElement.selectionStart : null;
  body.innerHTML = `<div class="cs-ctrl ct-ctrl">
      <select class="cs-sel" data-ctconf aria-label="Conference"><option value="top"${CS.tconf === 'top' ? ' selected' : ''}>AP Top 25</option><option value="all"${CS.tconf === 'all' ? ' selected' : ''}>All conferences</option>${confs.map(c => `<option value="${c.id}"${c.id === CS.tconf ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <input class="cs-q" type="search" placeholder="Find a school" value="${esc(CS.tq)}" data-ctq aria-label="Find a school">
    </div>` + (groups.some(g => g.rows.length) ? groups.map(g => `<div class="conf-h"><h2 class="h-display">${esc(g.name)}</h2><span class="eyebrow">${g.rows.length} team${g.rows.length === 1 ? '' : 's'}</span></div>
    <div class="team-grid">${g.rows.map(tile).join('')}</div>`).join('') : `<div class="empty"><b>No schools match "${esc(CS.tq)}"</b></div>`);
  if (keep != null) { const i = $('[data-ctq]', body); i.focus(); i.setSelectionRange(keep, keep); }
}

/* ---------- controls ---------- */
document.addEventListener('click', e => {
  const s = e.target.closest('[data-csstd]'); if (s) { CS.std = s.dataset.csstd; renderStandings(); return; }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-csconf]')) { CS.conf = e.target.value; renderStandings(); }
  if (e.target.matches('[data-ctconf]')) { CS.tconf = e.target.value; CS.tq = ''; renderTeams(); }
});
let tqT = 0;
document.addEventListener('input', e => { if (e.target.matches('[data-ctq]')) { CS.tq = e.target.value; clearTimeout(tqT); tqT = setTimeout(renderTeams, 150); } });

loadPolls().then(() => { renderMini(); if (S.view === 'scores') renderGames(false); }).catch(() => {});

