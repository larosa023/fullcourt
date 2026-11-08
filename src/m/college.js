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
  const tabs = [['ap', 'AP Top 25'], ['coaches', 'Coaches'], ['conf', 'Conferences'], ['march', 'Bracketology'], ['bracket', 'Bracket']];
  if (CS.std === 'march') {
    wrap.classList.remove('tbl-wrap', 'drag-x'); wrap.removeAttribute('data-drag');
    const ctrl = `<div class="cs-ctrl"><div class="seg" id="csSeg"><span class="knob"></span>${tabs.map(([k, l]) => `<button data-csstd="${k}" aria-pressed="${CS.std === k}">${l}</button>`).join('')}</div></div>`;
    lazy('march').then(m => { if (CS.std === 'march' && S.view === 'standings') m.renderMarch(wrap, ctrl); }).catch(() => { wrap.innerHTML = ctrl + '<div class="empty"><b>Bracketology didn\'t load</b><button class="btn" data-retry="standings">Try again</button></div>'; });
    return;
  }
  if (CS.std === 'bracket') { wrap.classList.remove('tbl-wrap', 'drag-x'); wrap.removeAttribute('data-drag'); renderBracket(wrap, tabs); return; }
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

/* ---------- Bracket: the NCAA Tournament and every conference tournament ---------- */
// date windows per season (the year the season ends). Each day is one scoreboard request; finished days are saved for good.
const NCAA_DAYS = { 2026: ['20260317', '20260406'], 2027: ['20270316', '20270405'] };
const CONF_DAYS = { 2026: ['20260225', '20260316'], 2027: ['20270224', '20270315'] };
const SEL_SUNDAY = { 2027: 'Sunday, March 14' };
const RO = ['First Four', '1st Round', '2nd Round', 'Sweet 16', 'Elite 8', 'Final Four', 'National Championship'];
const SEEDO = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
const BK = {}; // `${kind}${year}` -> { days: {date: games[]}, busy, done }
const dayList = ([a, b]) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
const slimG = g => ({ id: g.id, date: g.date, state: g.state, detail: g.detail, note: g.note || '', period: g.period,
  home: { id: g.home.id, abbr: g.home.abbr, name: g.home.name, score: g.home.score, rank: g.home.rank, conf: g.home.conf }, away: { id: g.away.id, abbr: g.away.abbr, name: g.away.name, score: g.away.score, rank: g.away.rank, conf: g.away.conf } });
const isNcaa = n => /NCAA (Men's|Women's) Basketball Championship/i.test(n);
const isConfT = n => / - /.test(n) && !isNcaa(n) && /(Championship|Tournament|Playoffs)/i.test(n) && !/\b(NIT|CBI|CIT|WBI|WNIT|Crown|Invitational|Classic|Showcase|Challenge)\b/i.test(n);
async function loadBk(kind, yr, rerender) {
  const key = kind + yr, R = BK[key] || (BK[key] = { days: {}, busy: false });
  if (R.busy) return R; R.busy = true;
  const range = (kind === 'ncaa' ? NCAA_DAYS : CONF_DAYS)[yr]; if (!range) { R.busy = false; R.done = true; return R; }
  const days = dayList(range).filter(d => d <= S.today);
  const want = days.filter(d => { if (R.days[d]?.fin) return false; try { const v = JSON.parse(localStorage.getItem(lsKey(`fc-bk-${kind}-${d}`)) || 'null'); if (v) { R.days[d] = { games: v, fin: true }; return false; } } catch (e) {} return true; });
  let n = 0;
  const one = async d => {
    try {
      const games = (await scoreboardOn(d)).filter(g => kind === 'ncaa' ? isNcaa(g.note || '') : isConfT(g.note || '')).map(slimG);
      const fin = d < S.today && games.every(g => g.state === 'post');
      R.days[d] = { games, fin };
      if (fin) try { localStorage.setItem(lsKey(`fc-bk-${kind}-${d}`), JSON.stringify(games)); } catch (e) {}
    } catch (e) {}
    if (++n % 4 === 0) rerender();
  };
  const q = [...want]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await one(q.shift()); }));
  R.busy = false; R.done = true; rerender();
  return R;
}
const winOf = g => g && g.state === 'post' ? (+g.home.score > +g.away.score ? g.home : g.away) : null;
function bkCard(g, cls = '') {
  if (!g) return `<div class="bk-c tbd ${cls}"><div class="bk-r"><small></small><i class="bk-ph"></i><span>TBD</span><b></b></div><div class="bk-r"><small></small><i class="bk-ph"></i><span>TBD</span><b></b></div></div>`;
  const w = winOf(g), live = g.state === 'in';
  const st = g.state === 'post' ? (g.period > REG_PERIODS ? 'Final/OT' : 'Final') : live ? `<i class="dot on"></i>${esc(g.detail || 'Live')}` : esc(fmtLocal(g.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(g.date, true));
  const row = t => `<div class="bk-r${w && w.id !== t.id ? ' l' : ''}"><small>${t.rank || ''}</small>${logo(t.abbr, 40)}<span>${esc(t.name || t.abbr)}${t.id === favId ? ' ★' : ''}</span><b>${g.state === 'pre' ? '' : esc(t.score ?? '')}</b></div>`;
  return `<button class="bk-c ${cls}${live ? ' live' : ''}" data-game="${g.id}"><span class="bk-s">${st}${upsetOf(g) ? ' <em class="tk-up">Upset</em>' : ''}</span>${row(g.away)}${row(g.home)}</button>`;
}
function ncaaBracket(R) {
  const regs = {}, ff = [], ch = [];
  for (const d of Object.keys(R.days).sort()) for (const g of R.days[d].games) {
    const rd = RO.findIndex(x => g.note.includes(x));
    if (rd === 5) { ff.push(g); continue; } if (rd === 6) { ch.push(g); continue; }
    const m = g.note.match(/- ([A-Za-z]+) Region -/) || g.note.match(/Regional (\d+) in ([^-]+?)\s*-/);
    if (!m || rd < 0) continue;
    const key = m[1], label = m[2] ? `Regional ${m[1]} · ${m[2].trim()}` : `${m[1]}`;
    const reg = regs[key] || (regs[key] = { key, label, r: [[], [], [], [], []] });
    if (rd === 0) { reg.r[0].push(g); continue; }
    const sd = Math.min(g.home.rank || 99, g.away.rank || 99), slot = SEEDO.indexOf(sd), pos = slot < 0 ? reg.r[rd].length : Math.floor(slot / 2 ** rd);
    reg.r[rd][pos] = g;
  }
  return { regs: Object.values(regs).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })), ff, ch };
}
function renderBracket(wrap, tabs) {
  const nowYr = +S.today.slice(0, 4) + (+S.today.slice(4, 6) >= 7 ? 1 : 0); // season = the year it ends
  if (!CS.bk) CS.bk = 'ncaa';
  const kind = CS.bk, range = (kind === 'ncaa' ? NCAA_DAYS : CONF_DAYS)[nowYr];
  const started = range && S.today >= range[0];
  if (!CS.byr) CS.byr = started ? nowYr : nowYr - 1;
  const yr = CS.byr, R = BK[kind + yr];
  const rerender = () => { if (S.view === 'standings' && CS.std === 'bracket' && CS.bk === kind && CS.byr === yr) renderStandings(); };
  if (!R || (!R.done && !R.busy)) loadBk(kind, yr, rerender);
  const seasonLbl = y => `${y - 1}-${String(y).slice(2)}`;
  const ctrl = `<div class="cs-ctrl"><div class="seg" id="csSeg"><span class="knob"></span>${tabs.map(([k, l]) => `<button data-csstd="${k}" aria-pressed="${CS.std === k}">${l}</button>`).join('')}</div></div>
    <div class="cs-ctrl bk-ctrl"><div class="seg" id="bkSeg"><span class="knob"></span><button data-bkk="ncaa" aria-pressed="${kind === 'ncaa'}">NCAA Tournament</button><button data-bkk="conf" aria-pressed="${kind === 'conf'}">Conference tournaments</button></div>
      <div class="seg" id="bkYr"><span class="knob"></span>${[nowYr, nowYr - 1].map(y => `<button data-bky="${y}" aria-pressed="${yr === y}">${seasonLbl(y)}</button>`).join('')}</div></div>`;
  const days = R ? Object.values(R.days) : [], total = days.reduce((n, d) => n + d.games.length, 0);
  let body;
  if (yr === nowYr && !started) {
    body = `<div class="empty"><b>${kind === 'ncaa' ? `The ${seasonLbl(yr)} field is announced on Selection Sunday${SEL_SUNDAY[yr] ? `, ${SEL_SUNDAY[yr]}` : ''}` : 'Conference tournaments start in late February'}</b>The bracket fills in here as games are scheduled, with live scores during the tournament.<div class="btn-row" style="justify-content:center;margin-top:12px"><button class="btn ghost" data-bky="${yr - 1}">See last season's</button></div></div>`;
  } else if (!total) {
    body = R?.done ? `<div class="empty"><b>No games found</b>ESPN doesn't list this tournament's games.</div>` : `<div style="display:grid;gap:10px">${Array.from({ length: 6 }, () => '<div class="sk" style="height:64px;border-radius:12px"></div>').join('')}</div><p class="cs-when">Loading the bracket from ESPN…</p>`;
  } else if (kind === 'ncaa') {
    const B = ncaaBracket(R);
    if (!CS.breg || (CS.breg !== 'ff' && !B.regs.some(r => r.key === CS.breg))) CS.breg = B.regs[0]?.key || 'ff';
    const champ = winOf(B.ch[0]);
    const regBtns = `<div class="chips bk-regs hs drag-x" data-drag>${B.regs.map(r => `<button class="chip" data-bkreg="${esc(r.key)}" aria-pressed="${CS.breg === r.key}">${esc(r.label.replace(/^([A-Za-z]+)$/, '$1 Region'))}</button>`).join('')}<button class="chip" data-bkreg="ff" aria-pressed="${CS.breg === 'ff'}">Final Four</button></div>`;
    const meta = `<p class="cs-when">${yr} NCAA Tournament · ${total} of 67 games${champ ? ` · <b>${esc(champ.name)} won the title</b>` : ''} · tap a game for the box score</p>`;
    if (CS.breg === 'ff') {
      body = meta + regBtns + `<div class="bk-ff"><div><h4>National semifinals</h4>${[0, 1].map(i => bkCard(B.ff[i])).join('')}</div><div><h4>National championship</h4>${bkCard(B.ch[0], 'champ')}</div></div>
        <p class="cs-when">Final Four: ${B.regs.map(r => { const w = winOf(r.r[4][0]); return `${esc(r.label.replace(/^([A-Za-z]+)$/, '$1'))} <b>${w ? esc(w.name) : 'TBD'}</b>`; }).join(' · ')}</p>`;
    } else {
      const reg = B.regs.find(r => r.key === CS.breg), cols = ['1st Round', '2nd Round', 'Sweet 16', 'Elite 8'];
      let h = `<div class="bk-grid">${cols.map((c, i) => `<div class="bk-h" style="grid-column:${i + 1}">${c}</div>`).join('')}`;
      for (let rd = 1; rd <= 4; rd++) { const n = 8 / 2 ** (rd - 1), span = 2 ** rd; for (let p = 0; p < n; p++) h += `<div class="bk-cell" style="grid-column:${rd};grid-row:${p * span + 2} / span ${span}">${bkCard(reg.r[rd][p], rd === 4 ? 'last' : '')}</div>`; }
      h += '</div>';
      body = meta + regBtns + (reg.r[0].length ? `<h4 class="bk-sub">First Four</h4><div class="bk-f4">${reg.r[0].map(g => bkCard(g)).join('')}</div>` : '') + `<div class="bk-scroll drag-x" data-drag>${h}</div>`;
    }
  } else {
    // conference tournaments: one at a time, rounds as columns
    const all = days.flatMap(d => d.games);
    const confName = id => S.standings?.confs.find(c => c.id === id)?.name || 'Other';
    const byConf = {};
    for (const g of all) { const c = g.home.conf && g.home.conf === g.away.conf ? g.home.conf : g.home.conf || g.away.conf || 'x'; (byConf[c] || (byConf[c] = [])).push(g); }
    const cids = Object.keys(byConf).sort((a, b) => confName(a).localeCompare(confName(b)));
    const favConf = favId && S.teams[favId]?.confId;
    if (!CS.bconfPicked || !byConf[CS.bconf]) CS.bconf = byConf[favConf] ? favConf : cids.find(c => /^(SEC|ACC|Big Ten|Big 12|Big East)$/.test(S.standings?.confs.find(x => x.id === c)?.short || '')) || cids[0];
    const games = (byConf[CS.bconf] || []).sort((a, b) => a.date.localeCompare(b.date));
    const rounds = []; for (const g of games) { const r = g.note.split(' - ').pop().trim(); let col = rounds.find(x => x.r === r); if (!col) rounds.push(col = { r, games: [] }); col.games.push(g); }
    const last = rounds.at(-1), champ = last && /final|championship/i.test(last.r) && last.games.length === 1 ? winOf(last.games[0]) : null;
    const tName = (games[0]?.note || '').split(' - ')[0];
    body = `<div class="cs-ctrl"><select class="cs-sel" data-bkconf aria-label="Conference">${cids.map(c => `<option value="${c}"${c === CS.bconf ? ' selected' : ''}>${esc(confName(c))} · ${byConf[c].length}</option>`).join('')}</select></div>
      <p class="cs-when">${esc(tName)}${champ ? ` · <b>${esc(champ.name)} won it</b>` : ''} · ${seasonLbl(yr)}</p>
      <div class="bk-scroll drag-x" data-drag><div class="bk-rounds" style="grid-template-columns:repeat(${rounds.length}, minmax(220px, 1fr))">${rounds.map(c => `<div class="bk-col"><div class="bk-h">${esc(c.r)}</div>${c.games.map(g => bkCard(g)).join('')}</div>`).join('')}</div></div>`;
  }
  wrap.innerHTML = ctrl + body;
  $$('.bk-scroll, .bk-regs', wrap).forEach(dragScroll);
  requestAnimationFrame(() => { placeKnob($('#csSeg')); placeKnob($('#bkSeg')); placeKnob($('#bkYr')); });
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
  const k = e.target.closest('[data-bkk]'); if (k) { CS.bk = k.dataset.bkk; renderStandings(); return; }
  const y = e.target.closest('[data-bky]'); if (y) { CS.byr = +y.dataset.bky; renderStandings(); return; }
  const r = e.target.closest('[data-bkreg]'); if (r) { CS.breg = r.dataset.bkreg; renderStandings(); return; }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-csconf]')) { CS.conf = e.target.value; renderStandings(); }
  if (e.target.matches('[data-bkconf]')) { CS.bconf = e.target.value; CS.bconfPicked = true; renderStandings(); }
  if (e.target.matches('[data-ctconf]')) { CS.tconf = e.target.value; CS.tq = ''; renderTeams(); }
});
let tqT = 0;
document.addEventListener('input', e => { if (e.target.matches('[data-ctq]')) { CS.tq = e.target.value; clearTimeout(tqT); tqT = setTimeout(renderTeams, 150); } });

loadPolls().then(() => { renderMini(); if (S.view === 'scores') renderGames(false); }).catch(() => {});

