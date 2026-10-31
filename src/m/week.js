/* ---------------- this week: every game for the next 7 days ---------------- */
async function openWeek() {
  const sheet = openSheet('This week');
  const from = S.today, to = addDays(S.today, 6);
  let evs;
  try {
    const d = await getJSON(`https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=${LG}&dates=${from}-${to}`, { timeout: 15000 });
    evs = d.sports?.[0]?.leagues?.[0]?.events || [];
  } catch (e) { if (sheet.alive) sheet.body.innerHTML = `<div class="empty"><b>The week didn't load</b>Check your connection and try again.</div>`; return; }
  if (!sheet.alive) return;
  let mine = false;
  const draw = () => {
    const games = evs.map(e => {
      const c = e.competitors || [], a = c.find(x => x.homeAway === 'away'), h = c.find(x => x.homeAway === 'home');
      if (!a || !h) return null;
      return { id: e.id, date: e.date, day: etYmd(e.date), state: e.status, sum: e.summary || '', a, h, tv: (e.broadcasts || []).filter(b => b.isNational).map(b => b.shortName).join(' · '), line: e.odds?.details || '' };
    }).filter(Boolean).filter(g => !mine || g.a.id === favId || g.h.id === favId);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = addDays(from, i); days.push([d, games.filter(g => g.day === d).sort((x, y) => new Date(x.date) - new Date(y.date))]); }
    const row = g => {
      const fav = g.a.id === favId || g.h.id === favId;
      const team = s => `<span class="wk-t${g.state === 'post' && !s.winner ? ' lose' : ''}">${logo(s.abbreviation, 40)}<b>${esc(s.abbreviation)}</b>${g.state !== 'pre' ? `<em>${esc(s.score)}</em>` : ''}</span>`;
      const st = g.state === 'pre' ? esc(fmtTime(g.date).replace(' ET', '')) : g.state === 'in' ? `<span class="wk-live">Live</span>` : 'Final';
      return `<button class="wk-g${fav ? ' fav' : ''}" data-game="${esc(g.id)}"><span class="wk-st">${st}</span>${team(g.a)}<i>@</i>${team(g.h)}<span class="wk-x">${esc(g.tv || (g.state === 'pre' ? g.line : ''))}</span></button>`;
    };
    sheet.body.innerHTML = `<div class="wk">
      ${favId ? `<div class="seg wk-seg"><span class="knob"></span><button data-wkall aria-pressed="${!mine}">All games</button><button data-wkmine aria-pressed="${mine}">${esc(S.teams[favId]?.short || 'Your team')}</button></div>` : ''}
      ${days.map(([d, list]) => `<section class="wk-day"><div class="wk-h"><b>${d === S.today ? 'Today' : d === addDays(S.today, 1) ? 'Tomorrow' : esc(fmtDay(d, { weekday: 'long' }))}</b><span>${esc(fmtDay(d, { month: 'short', day: 'numeric' }))} · ${list.length ? plural(list.length, 'game') : 'No games'}</span></div>${list.map(row).join('')}</section>`).join('')}
    </div>`;
    const seg = $('.wk-seg', sheet.body); if (seg) requestAnimationFrame(() => placeKnob(seg));
  };
  sheet.body.addEventListener('click', e => {
    if (e.target.closest('[data-wkall]')) { mine = false; draw(); }
    if (e.target.closest('[data-wkmine]')) { mine = true; draw(); }
  });
  draw();
}
