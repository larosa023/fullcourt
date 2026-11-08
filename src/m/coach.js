/* Coach sheet: opens from the head coach's name on a team page. The coach's record (this season, with the team, career,
   playoffs, titles), season by season, awards and how they got here, then the front office: who runs it, their record in
   charge, and the team's recent trades. coaches.json is built weekly on GitHub from Basketball-Reference
   (tools/coach.mjs, branch coach-data); the trades come straight from ESPN. */

const COACH_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/coach-data/coaches.json';
let coachP = null;
function loadCoaches() {
  if (coachP) return coachP;
  let c = null; try { c = JSON.parse(localStorage.getItem('fc-coaches') || 'null'); } catch (e) {}
  if (c?.d && Date.now() - c.at < 24 * 3600e3) return (coachP = Promise.resolve(c.d));
  coachP = fetch(`${COACH_URL}?t=${Math.floor(Date.now() / 3600e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { try { localStorage.setItem('fc-coaches', JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; })
    .catch(e => { coachP = null; if (c?.d) return c.d; throw e; });
  return coachP;
}
const coRec = (w, l) => w == null ? '–' : `${w}-${l}`;
const coPct = (w, l) => w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '–';
const ordN = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const coAge = b => { const d = /^\d{4}-\d{2}-\d{2}$/.test(b) ? new Date(b + 'T12:00') : new Date(b); return isNaN(d) ? null : Math.floor((Date.now() - d) / 31557600000); };
const coDate = b => { const d = /^\d{4}-\d{2}-\d{2}$/.test(b) ? new Date(b + 'T12:00') : new Date(b); return isNaN(d) ? b : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
const LOGO_OK = a => !!S.teams && Object.values(S.teams).some(t => t.abbr === a);

async function openCoach(abbr, teamId, name) {
  const sheet = openSheet(name || 'Head coach'); sheet.el.classList.add('co-sheet');
  sheet.body.innerHTML = '<div class="sk" style="height:460px;border-radius:16px"></div>';
  const lg = LGK === 'wnba' ? 'wnba' : 'nba';
  let D = null; try { D = await loadCoaches(); } catch (e) {}
  const T = D?.[lg]?.teams?.[abbr], C = T?.coach, X = T?.exec;
  const tc = teamColor(teamId || abbr), tm = S.teams[teamId] || {};
  if (!C) { sheet.body.innerHTML = `<div class="empty"><b>${esc(name || 'Coach')}</b><span>No coaching record for this team yet.</span></div>`; drawTrades(sheet, teamId, lg); return; }
  setTitle(sheet, C.name);
  const titles = (C.seasons || []).filter(s => /(W?NBA|BAA) Champions/.test(s.note)).map(s => s.s);
  const finals = (C.seasons || []).filter(s => /Champions|Finals/.test(s.note)).length;
  const age = C.born ? coAge(C.born) : null;
  const tenure = C.seasons?.franchise;
  C.awards = (C.awards || []).filter(a => !/of the Month/.test(a)); // monthly awards are noise next to the rest
  const coy = C.awards.filter(a => /Coach of the Year|Red Auerbach/.test(a));
  const seasons = (C.seasons || []).slice().reverse();
  const maxW = Math.max(1, ...seasons.map(s => s.g || 0));
  sheet.body.innerHTML = `
    <div class="co-hero" style="--tc:${tc}">
      <div class="co-mono"><span>${esc(initials(C.name))}</span>${tm.abbr ? logo(tm.abbr, 64, 'lg co-ml') : ''}</div>
      <div><span class="eyebrow">Head coach · ${esc(tm.name || abbr)}</span><h2>${esc(C.name)}</h2>
        <p>${esc([tenure ? `${ordN(tenure)} season with the team` : '', C.seasons?.overall && C.seasons.overall !== tenure ? `${ordN(C.seasons.overall)} as a head coach` : (C.seasons?.overall === 1 ? 'first season as a head coach' : '')].filter(Boolean).join(' · '))}</p>
        <p class="co-bio">${esc([C.born ? `Born ${coDate(C.born)}${age ? ` (${age})` : ''}` : '', C.from ? `in ${C.from}` : ''].filter(Boolean).join(' '))}${C.college ? ` · ${esc(C.college)}` : ''}</p>
        ${C.played ? `<p class="co-bio">As a player: ${esc(C.played)}</p>` : ''}</div>
    </div>
    <div class="co-big">
      <div><b>${coRec(C.cur?.w, C.cur?.l)}</b><span>This season</span></div>
      <div><b>${coRec(C.fr?.w, C.fr?.l)}</b><span>With the team · ${coPct(C.fr?.w || 0, C.fr?.l || 0)}</span></div>
      <div><b>${coRec(C.car?.w, C.car?.l)}</b><span>Career · ${coPct(C.car?.w || 0, C.car?.l || 0)}</span></div>
      <div><b>${C.car?.pg ? coRec(C.car.pw, C.car.pl) : '–'}</b><span>Playoffs</span></div>
      <div class="${titles.length ? 'gold' : ''}"><b>${titles.length}</b><span>Title${titles.length === 1 ? '' : 's'}${titles.length ? ` · ${esc(titles.map(s => s.slice(0, 4).replace(/^(\d{4})$/, y => lg === 'nba' ? +y + 1 : y)).join(', '))}` : ''}</span></div>
    </div>
    ${coy.length || C.awards?.length ? `<div class="co-chips">${coy.map(a => `<span class="gold">${esc(a)}</span>`).join('')}${(C.awards || []).filter(a => !coy.includes(a)).slice(0, 8).map(a => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
    ${seasons.length ? `<section class="co-sec"><h3>Season by season <span>as head coach</span></h3>
      <div class="box-wrap drag-x" data-drag><table class="box co-tbl"><thead><tr><th>Season</th><th>Team</th><th>W-L</th><th></th><th>Finish</th><th>Playoffs</th><th>Result</th></tr></thead><tbody>
      ${seasons.map(s => `<tr class="${/Champions$/.test(s.note) && /(W?NBA|BAA) Champions/.test(s.note) ? 'won' : ''}"><td>${esc(s.s)}</td><td><span class="co-tm">${LOGO_OK(s.team) ? logo(s.team, 40) : ''}${esc(s.team)}</span></td><td><b>${coRec(s.w, s.l)}</b></td><td class="co-bar"><i style="width:${((s.w || 0) / maxW * 100).toFixed(1)}%"></i></td><td>${esc(s.fin || '')}</td><td>${s.pg ? coRec(s.pw, s.pl) : '–'}</td><td>${esc(s.note || '')}</td></tr>`).join('')}
      </tbody></table></div></section>` : `<p class="co-note co-note">${finals ? '' : ''}Season-by-season records for this coach aren't available yet.</p>`}
    ${C.path?.length ? `<section class="co-sec"><h3>The road here</h3><div class="co-path">${C.path.slice(-10).map(p => `<span><b>${esc(p.s)}</b> ${esc(p.role)}, ${esc(p.team)}</span>`).join('')}</div></section>` : ''}
    ${C.moves?.length ? `<section class="co-sec"><h3>Coaching moves</h3><ul class="co-moves">${C.moves.slice().reverse().map(m => `<li><span>${esc(m.d)}</span>${esc(m.t)}</li>`).join('')}</ul></section>` : ''}
    ${X ? frontOffice(X, abbr) : ''}
    <section class="co-sec" id="coTrades"><h3>Recent trades</h3><div class="sk" style="height:120px;border-radius:14px"></div></section>
    <p class="co-src">Coaching and front-office records from Basketball-Reference (updated weekly). Trades from ESPN.</p>`;
  wireDrag(sheet.body);
  drawTrades(sheet, teamId, lg);
}

function frontOffice(X, abbr) {
  const here = (X.seasons || []).filter(s => s.team === abbr), w = here.reduce((t, s) => t + (s.w || 0), 0), l = here.reduce((t, s) => t + (s.l || 0), 0);
  const pw = here.reduce((t, s) => t + (s.pw || 0), 0), pl = here.reduce((t, s) => t + (s.pl || 0), 0), elsewhere = [...new Set((X.seasons || []).filter(s => s.team !== abbr).map(s => s.team))];
  const first = here[0]?.s, age = X.born ? coAge(X.born) : null;
  return `<section class="co-sec co-fo"><h3>Front office</h3>
    <div class="co-x"><div class="co-mono sm"><span>${esc(initials(X.name))}</span></div><div><b>${esc(X.name)}</b><small>${esc(['Runs basketball operations', first ? `in charge since ${first}` : '', age ? `${age} years old` : ''].filter(Boolean).join(' · '))}</small></div></div>
    ${here.length ? `<div class="co-big sm"><div><b>${here.length}</b><span>Season${here.length === 1 ? '' : 's'} in charge</span></div><div><b>${coRec(w, l)}</b><span>Record · ${coPct(w, l)}</span></div><div><b>${pw + pl ? coRec(pw, pl) : '–'}</b><span>Playoffs</span></div><div><b>${here.filter(s => s.pw + s.pl > 0).length}</b><span>Playoff trips</span></div></div>
      ${here.length >= 4 ? `<div class="co-strip">${here.map(s => `<span title="${esc(s.s)}: ${coRec(s.w, s.l)}${s.pw + s.pl ? `, playoffs ${coRec(s.pw, s.pl)}` : ''}" class="${s.pw + s.pl ? 'po' : ''}"><i style="height:${Math.max(6, ((s.w || 0) / 82) * 100).toFixed(0)}%"></i><em>${esc(s.s.slice(2, 4))}</em></span>`).join('')}</div>` : ''}` : ''}
    ${elsewhere.length ? `<p class="co-note">Also ran ${esc(elsewhere.join(', '))} before this job.</p>` : ''}
  </section>`;
}

async function drawTrades(sheet, teamId, lg) {
  const box = () => $('#coTrades', sheet.body); if (!teamId) { box()?.remove(); return; }
  const y = new Date().getFullYear(), seasons = lg === 'nba' ? [y + 1, y, y - 1] : [y, y - 1, y - 2];
  const all = (await Promise.all(seasons.map(s => getJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/transactions?team=${teamId}&limit=100&season=${s}`).catch(() => null))))
    .flatMap(d => d?.transactions || []);
  const seen = new Set(), trades = all.filter(t => /\b(Acquired|Traded)\b/.test(t.description || '') && !seen.has(t.description) && seen.add(t.description)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);
  const b = box(); if (!b) return;
  b.innerHTML = `<h3>Recent trades</h3>${trades.length ? `<ul class="co-moves">${trades.map(t => `<li><span>${esc(new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</span>${esc(t.description)}</li>`).join('')}</ul>` : '<p class="co-note">No trades in the last couple of seasons.</p>'}`;
}
