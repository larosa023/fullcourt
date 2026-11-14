/* ---------------- Today: your team, your open bets and your starred players on one page ----------------
   Made for the phone: one tap from the tab bar (or the home-screen icon's "Today" shortcut) and everything you're
   following tonight is there, live. Refreshes every 20 seconds while it's open and on screen, changing only what moved. */
let tdOpen = null;
async function openToday() {
  if (tdOpen?.alive) return;
  const sheet = openSheet('Today'); tdOpen = sheet;
  sheet.el.classList.add('td-sheet');
  let busy = false;
  const draw = async () => {
    if (busy || !sheet.alive) return; busy = true;
    try {
      const html = await tdHTML();
      if (!sheet.alive) return;
      const box = $('.td', sheet.body);
      if (!box) sheet.body.innerHTML = html;
      else { const t = document.createElement('div'); t.innerHTML = html; tdMorph(box, t.firstElementChild); }
    } catch (e) { if (sheet.alive && !$('.td', sheet.body)) sheet.body.innerHTML = '<div class="empty"><b>Today didn\'t load</b>Check your connection and try again.</div>'; }
    finally { busy = false; }
  };
  sheet.el.addEventListener('click', async e => {
    if (!e.target.closest('[data-tdmine]')) return;
    e.stopPropagation(); closeAll();
    const m = await lazy('betdesk'); m.BD.tab = 'mine';
    if (S.view === 'bets') m.bdDraw(); else go('bets');
  });
  await draw();
  const tick = () => sheet.timers.push(setTimeout(async () => { if (!sheet.alive) return; if (!document.hidden) await draw(); tick(); }, 20000));
  tick();
}

let tdDay = null; // { at, ymd, games }
async function tdGames() {
  if (tdDay && tdDay.ymd === S.today && Date.now() - tdDay.at < 15000) return tdDay.games;
  const d = await getJSON(`${API}/scoreboard?dates=${S.today}${SB_QS}`, { timeout: 12000 });
  tdDay = { at: Date.now(), ymd: S.today, games: (d.events || []).map(parseGame) };
  return tdDay.games;
}

async function tdHTML() {
  const games = await tdGames(), B = await lazy('bets');
  const ids = new Set(games.map(g => g.id));
  // your team
  const fav = favId ? String(favId) : null, fg = fav ? games.find(g => String(g.home.id) === fav || String(g.away.id) === fav) : null;
  const favT = fav ? Object.values(S.teams || {}).find(t => String(t.id) === fav) : null;
  const teamBlock = !fav ? '' : fg ? `<div class="td-games">${gameCard(fg, 0)}</div>`
    : `<button class="td-none" data-team="${esc(fav)}">${favT ? logo(favT.abbr, 40) : ''}<span><b>No ${esc(favT?.name || 'team')} game today</b><small>Open the team page for the schedule</small></span></button>`;
  // open bets that have a leg tonight (or still live from last night)
  // every bet with a leg tonight, settled ones included (a parlay that cashed an hour ago is still tonight's news)
  const bets = (B.readBets() || []).filter(b => b.legs?.some(l => ids.has(String(l.gid))));
  const graded = await Promise.all(bets.map(async b => { const res = await B.gradeBet(b); return { b, res, st: b.result || B.betStatus(res) }; }));
  const order = { live: 0, pending: 1, won: 2, lost: 3, push: 4 };
  graded.sort((x, y) => (order[x.st] ?? 5) - (order[y.st] ?? 5));
  const counts = ['live', 'pending', 'won', 'lost'].map(k => [k, graded.filter(x => x.st === k).length]).filter(([, n]) => n);
  const betBlock = graded.length ? `<div class="td-bets">${graded.map(x => B.betCard(x.b, x.res)).join('')}</div>` : '';
  // starred players with a game today
  const stars = (Array.isArray(watch) ? watch : []).map(w => ({ w, g: games.find(g => String(g.home.id) === String(w.teamId) || String(g.away.id) === String(w.teamId)) })).filter(x => x.g);
  const lines = await Promise.all(stars.map(async ({ w, g }) => {
    let s = null;
    if (g.state !== 'pre') { try { s = B.boxStats(await summaryCached(g.id, 20000), w.id); } catch (e) {} }
    const opp = String(g.home.id) === String(w.teamId) ? `vs ${g.away.abbr}` : `@ ${g.home.abbr}`;
    const when = g.state === 'pre' ? fmtTime(g.date) : statusText(g);
    const stat = !s ? '' : s.dnp ? 'Did not play' : `${s.reb} reb · ${s.ast} ast${s.tpm ? ` · ${s.tpm} 3PM` : ''}${s.min ? ` · ${s.min} min` : ''}`;
    return `<button class="td-p${g.state === 'in' ? ' live' : ''}" data-game="${esc(g.id)}" data-legpid="${esc(w.id)}">
      ${face(w.id, w.name || '', 'td-face', 96)}
      <span class="td-pt"><b>${esc(w.name || w.short || '')}</b><small>${g.state === 'in' ? '<i class="dot on"></i>' : ''}${esc(opp)} · ${esc(when)}</small></span>
      <span class="td-ps">${stat ? `${s && !s.dnp ? `<b>${s.pts}<em>pts</em></b>` : ''}<small>${esc(stat)}</small>` : `<small>${g.state === 'pre' ? 'Not started' : ''}</small>`}</span></button>`;
  }));
  const playerBlock = lines.length ? `<div class="td-ps-list">${lines.join('')}</div>` : '';
  const sec = (title, sub, body, more) => `<section class="td-sec"><div class="td-h"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${more || ''}</div>${body}</section>`;
  const live = games.filter(g => g.state === 'in').length;
  const empty = !fav && !graded.length && !lines.length;
  return `<div class="td">
    <p class="td-top">${esc(fmtDay(S.today, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${plural(games.length, 'game')}${live ? ` · <em class="td-live"><i class="dot on"></i>${live} live</em>` : ''}</p>
    ${fav ? sec('Your team', '', teamBlock) : ''}
    ${graded.length ? sec('Your bets', counts.map(([k, n]) => `${n} ${{ live: 'live', pending: 'upcoming', won: 'won', lost: 'lost' }[k]}`).join(' · '), betBlock, '<button class="td-more" data-tdmine>All bets</button>') : ''}
    ${lines.length ? sec('Your players', `${stars.length} playing today`, playerBlock) : ''}
    ${empty ? `<div class="empty td-empty"><b>Nothing to follow yet</b>Pick your team in Settings, star players with ☆ on their pages, and track bets from the Bet Desk. They'll all show up here, live.</div>` : ''}
    ${!empty && (!fav || !graded.length || !lines.length) ? `<p class="td-hint">${[!fav && 'Pick your team in Settings', !lines.length && 'star players with ☆', !graded.length && 'track bets from the Bet Desk'].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase())} to see them here too.</p>` : ''}
    <div class="td-games-all">${sec('All games', '', `<div class="td-games">${games.map((g, i) => gameCard(g, i)).join('') || '<div class="empty" style="border:0">No games today</div>'}</div>`)}</div>
  </div>`;
}

// update `a` to match `b`, keeping every element that didn't change (no flashing photos on refresh)
function tdMorph(a, b) {
  if (a.isEqualNode(b)) return;
  if (a.nodeType !== 1 || a.tagName !== b.tagName) { a.replaceWith(b); return; }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const olds = [...a.childNodes], news = [...b.childNodes];
  const out = news.map((n, i) => {
    const o = olds[i];
    if (!o || o.nodeType !== n.nodeType || (o.nodeType === 1 && o.tagName !== n.tagName)) return n;
    if (o.nodeType === 1) { tdMorph(o, n); return o; }
    if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return o;
  });
  out.forEach((n, j) => { if (a.childNodes[j] !== n) a.insertBefore(n, a.childNodes[j] || null); });
  while (a.childNodes.length > out.length) a.lastChild.remove();
}
