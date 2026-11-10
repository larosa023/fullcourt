/* =====================================================================
   MY BETS — bets added from Ask, tracked live from ESPN box scores.
   Saved in this browser only. Loads only when there are bets to show.
   ===================================================================== */
const BET_KEY = () => lsKey('fc-bets');
const readBets = () => { try { return JSON.parse(lsGet(BET_KEY()) || '[]') || []; } catch (e) { return []; } };
const writeBets = list => lsSet(BET_KEY(), list.length ? JSON.stringify(list.slice(-200)) : null);
const BSTAT = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', tov: 'TO', tpa: '3PA', fga: 'FGA', fgm: 'FGM', fta: 'FTA', ftm: 'FTM', fpts: 'FPTS', oreb: 'OREB', dreb: 'DREB', fg2: '2PM', fg2a: '2PA', pf: 'PF' };
const KEEP_SETTLED = 20 * 3600e3;
const MIN_KEY = () => lsKey('fc-bets-min');
const readMin = () => { try { return new Set(JSON.parse(lsGet(MIN_KEY()) || '[]')); } catch (e) { return new Set(); } };
function toggleBetMin(id) { const m = readMin(); m.has(id) ? m.delete(id) : m.add(id); lsSet(MIN_KEY(), m.size ? JSON.stringify([...m]) : null); $$(`.bt-card[data-bid="${CSS.escape(id)}"]`).forEach(c => { c.classList.toggle('mini', m.has(id)); const b = c.querySelector('.bt-min'); if (b) { b.setAttribute('aria-expanded', !m.has(id)); b.title = m.has(id) ? 'Show details' : 'Minimize'; } }); } // settled bets stay on Scores for most of a day

function addBet(bet) {
  const list = readBets();
  list.push(bet);
  writeBets(list);
  renderBets(true);
  toast(bet.legs.length > 1 ? `Tracking your ${bet.legs.length}-leg parlay` : 'Tracking your bet');
}
function removeBet(id) {
  writeBets(readBets().filter(b => b.id !== id));
  renderBets();
}

/* ---------------- grading ---------------- */
function boxStats(d, pid) {
  for (const T of d?.boxscore?.players || []) {
    const st = T.statistics?.[0]; if (!st) continue;
    const a = (st.athletes || []).find(x => String(x.athlete?.id) === String(pid)); if (!a) continue;
    if (!a.stats?.length) return { dnp: true };
    const lab = st.labels || st.names || [], v = k => a.stats[lab.indexOf(k)];
    const n = k => +(v(k) ?? 0) || 0;
    const ma = (k, i) => +(String(v(k) || '0-0').split('-')[i]) || 0;
    return { pts: n('PTS'), reb: n('REB'), ast: n('AST'), stl: n('STL'), blk: n('BLK'), tov: n('TO'), tpm: ma('3PT', 0), tpa: ma('3PT', 1), fgm: ma('FG', 0), fga: ma('FG', 1), ftm: ma('FT', 0), fta: ma('FT', 1), min: n('MIN'), oreb: n('OREB'), dreb: n('DREB'), pf: n('PF'), fg2: ma('FG', 0) - ma('3PT', 0), fg2a: ma('FG', 1) - ma('3PT', 1), fpts: Math.round((n('PTS') + 1.2 * n('REB') + 1.5 * n('AST') + 3 * n('BLK') + 3 * n('STL') - n('TO')) * 10) / 10 };
  }
  return null;
}
function gameState(d) {
  const c = d?.header?.competitions?.[0]; if (!c) return null;
  const t = c.status?.type || {};
  const side = ha => { const x = c.competitors.find(y => y.homeAway === ha); return { id: x.team.id, abbr: x.team.abbreviation, score: +x.score || 0 }; };
  const g = { state: t.state, period: c.status?.period, clock: c.status?.displayClock, desc: t.description, date: c.date, home: side('home'), away: side('away') };
  g.label = g.state === 'pre' ? fmtTime(g.date) : statusText(g);
  return g;
}
// how far through the game we are (0..1), for "on pace" reads
const gameFrac = g => {
  if (!g || g.state === 'pre') return 0;
  if (g.state === 'post') return 1;
  const per = RULES.per / 60, regs = REG_PERIODS;
  const [mm, ss] = String(g.clock || '0:0').split(':').map(Number);
  const left = (mm || 0) + (ss || 0) / 60;
  const p = Math.min(g.period || 1, regs);
  return Math.max(0, Math.min(1, ((p - 1) * per + (per - (g.period > regs ? 0 : left))) / (per * regs)));
};

// result for one leg: { st: 'pending'|'live'|'won'|'lost'|'push'|'void', now, need, text, pct }
function gradeLeg(l, d) {
  const g = gameState(d);
  if (!g) return { st: 'pending', text: 'Waiting for the game' };
  const fin = g.state === 'post', live = g.state === 'in';
  // ruled out (on the game's injury report as Out and not in the box score): books void the leg
  if ((l.k === 'prop' || l.k === 'dd' || l.k === 'td') && l.pid) {
    const b0 = boxStats(d, l.pid), out = (d?.injuries || []).some(t => (t.injuries || []).some(i => String(i.athlete?.id) === String(l.pid) && /^out/i.test(i.status || i.type?.description || '')));
    if (out && (!b0 || b0.dnp)) return { st: 'void', g, now: null, text: 'Ruled out · leg void' };
  }
  if (g.state === 'pre') return { st: 'pending', g, text: `${g.away.abbr} @ ${g.home.abbr}` };
  const mine = l.teamId && (g.home.id === l.teamId ? g.home : g.away.id === l.teamId ? g.away : null);
  const opp = mine && (mine === g.home ? g.away : g.home);
  const over = l.side !== 'u';
  const fromLine = (val, line) => {
    if (over && val > line) return 'won';
    if (!over && val > line) return 'lost';
    if (!fin) return 'live';
    if (val === line) return 'push';
    return over ? 'lost' : 'won';
  };
  if (l.k === 'prop' || l.k === 'dd' || l.k === 'td') {
    const b = boxStats(d, l.pid);
    if (!b) return { st: fin ? 'void' : 'live', g, now: 0, text: fin ? 'Did not play' : 'Not playing so far' };
    if (b.dnp) return { st: fin ? 'void' : 'live', g, now: 0, text: fin ? 'Did not play' : 'Hasn\'t played yet' };
    if (l.k !== 'prop') {
      const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => b[k] >= 10).length, need = l.k === 'dd' ? 2 : 3;
      const yes = tens >= need;
      const st = over ? (yes ? 'won' : fin ? 'lost' : 'live') : (yes ? 'lost' : fin ? 'won' : 'live');
      return { st, g, now: tens, need, text: `${b.pts} PTS · ${b.reb} REB · ${b.ast} AST`, pct: Math.min(1, tens / need) };
    }
    const val = l.stats.reduce((s, k) => s + (b[k] || 0), 0);
    const st = fromLine(val, l.line);
    const left = Math.floor(l.line) + 1 - val; // whole numbers still needed to clear the line
    const pace = live && val > 0 && gameFrac(g) > 0.15 ? Math.round(val / gameFrac(g)) : null;
    const how = st !== 'live' ? '' : over ? ` · ${left} more to hit${pace != null ? ` · pace ${pace}` : ''}` : ` · ${Math.floor(l.line) - val} to spare`;
    return { st, g, now: val, need: l.line, pct: Math.min(1, val / Math.max(0.5, l.line)), text: `${val} ${l.stats.map(k => BSTAT[k]).join('+')}${b.min ? ` · ${b.min} min` : ''}${how}` };
  }
  if (!mine) return { st: 'pending', g, text: `${g.away.abbr} @ ${g.home.abbr}` };
  if (l.k === 'ml') {
    const diff = mine.score - opp.score;
    const st = fin ? (diff > 0 ? 'won' : 'lost') : 'live';
    return { st, g, now: diff, text: `${mine.abbr} ${mine.score}-${opp.score}${!fin ? diff > 0 ? ' · leading' : diff < 0 ? ' · trailing' : ' · tied' : ''}`, pct: 0.5 + Math.max(-0.5, Math.min(0.5, diff / 30)) };
  }
  if (l.k === 'spread') {
    const m = mine.score + l.line - opp.score;
    const st = fin ? (m > 0 ? 'won' : m < 0 ? 'lost' : 'push') : 'live';
    return { st, g, now: m, text: `${mine.abbr} ${mine.score}-${opp.score} · ${m > 0 ? `covering by ${m}` : m < 0 ? `short by ${-m}` : 'right on the number'}`, pct: 0.5 + Math.max(-0.5, Math.min(0.5, m / 30)) };
  }
  if (l.k === 'total' || l.k === 'ttotal') {
    const val = l.k === 'total' ? g.home.score + g.away.score : mine.score;
    const st = fromLine(val, l.line);
    const pace = live && gameFrac(g) > 0.15 ? Math.round(val / gameFrac(g)) : null;
    return { st, g, now: val, need: l.line, pct: Math.min(1, val / l.line), text: `${val} points${pace != null && st === 'live' ? ` · pace ${pace}` : ''}` };
  }
  return { st: 'pending', g, text: '' };
}
function betStatus(results) {
  if (results.some(r => r.st === 'lost')) return 'lost';
  const live = results.filter(r => r.st !== 'push' && r.st !== 'void');
  if (results.every(r => ['won', 'push', 'void'].includes(r.st))) return live.length ? 'won' : 'push';
  if (results.some(r => r.st === 'live' || r.st === 'won')) return 'live';
  return 'pending';
}
const dec = o => o > 0 ? 1 + o / 100 : 1 + 100 / -o;
// profit boost (b.boost, a %) multiplies the winnings; b.toWin, when saved, already includes it
function payout(b, results) {
  if (b.stake == null) return null;
  if (Number.isFinite(+b.payOverride) && +b.payOverride > 0) return Math.round((+b.payOverride - b.stake) * 100) / 100; // the book's own number wins
  if (b.toWin != null && !results?.some(r => r.st === 'push' || r.st === 'void')) return b.toWin;
  const p = rawPayout(b, results); return p == null ? null : Math.round(p * (1 + (+b.boost || 0) / 100) * 100) / 100;
}
function rawPayout(b, results) {
  const legOdds = b.legs.map((l, i) => results?.[i] && ['push', 'void'].includes(results[i].st) ? null : l.odds);
  let price = null;
  if (b.odds && b.legs.length > 1 && !results?.some(r => ['push', 'void'].includes(r.st))) price = dec(b.odds);
  else if (b.legs.length === 1 && (b.odds || b.legs[0].odds)) price = dec(b.odds || b.legs[0].odds);
  else if (legOdds.every(o => o == null || o)) { const p = legOdds.filter(Boolean); if (p.length && p.length === legOdds.filter(o => o !== null).length) price = p.reduce((s, o) => s * dec(o), 1); }
  return price ? Math.round(b.stake * (price - 1) * 100) / 100 : null;
}

/* ---------------- scores page card ---------------- */
let betBusy = false;
const sums = {};
async function gradeBet(b) {
  const ids = [...new Set(b.legs.map(l => l.gid).filter(Boolean))];
  await Promise.all(ids.map(async id => {
    if (sums[id]?.fin) return;
    try { const d = await summaryCached(id, 15000); sums[id] = { d, fin: d?.header?.competitions?.[0]?.status?.type?.state === 'post' }; } catch (e) {}
  }));
  return b.legs.map(l => sums[l.gid] ? gradeLeg(l, sums[l.gid].d) : { st: 'pending', text: 'Loading…' });
}
const ICON = {
  won: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  lost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  push: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 12h10"/></svg>',
};
const legName = l => {
  const side = l.side === 'u' ? 'U' : 'O';
  if (l.k === 'prop') return `${l.name.split(' ').slice(-1)[0]} ${side} ${l.line} ${l.stats.map(k => BSTAT[k]).join('+')}`;
  if (l.k === 'dd' || l.k === 'td') return `${l.name.split(' ').slice(-1)[0]} ${l.side === 'u' ? 'no ' : ''}${l.k === 'dd' ? 'double' : 'triple'}-double`;
  if (l.k === 'spread') return `${l.abbr} ${l.line > 0 ? '+' + l.line : l.line === 0 ? 'PK' : l.line}`;
  if (l.k === 'ml') return `${l.abbr} ML`;
  if (l.k === 'total') return `${l.game || l.abbr} ${side} ${l.line}`;
  if (l.k === 'ttotal') return `${l.abbr} TT ${side} ${l.line}`;
  return '';
};
const money = v => v == null ? '' : '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
/* ---------------- edit an open bet ---------------- */
let EDIT = null; // { id, b: working copy }
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>';
const odTxt = o => Number.isFinite(+o) && +o ? (+o > 0 ? '+' + +o : String(+o)) : '';
function editForm(b) {
  const legTitle = l => l.k === 'prop' ? `${l.name} · ${l.stats.map(k => BSTAT[k]).join('+')}` : l.k === 'dd' || l.k === 'td' ? `${l.name} · ${l.k === 'dd' ? 'double' : 'triple'}-double` : l.k === 'ml' ? `${l.abbr} moneyline` : l.k === 'spread' ? `${l.abbr} spread` : l.k === 'ttotal' ? `${l.abbr} team total` : `${l.game || l.abbr || 'Game'} total`;
  const hasSide = l => ['prop', 'total', 'ttotal', 'dd', 'td'].includes(l.k), hasLine = l => ['prop', 'total', 'ttotal', 'spread'].includes(l.k);
  return `<div class="bte">
    ${b.legs.map((l, i) => `<div class="bte-leg"><span class="bte-n">${esc(legTitle(l))}</span>
      ${hasSide(l) ? `<span class="bte-side"><button data-bteside="${i}" data-v="o" aria-pressed="${l.side !== 'u'}">${l.k === 'dd' || l.k === 'td' ? 'Yes' : 'O'}</button><button data-bteside="${i}" data-v="u" aria-pressed="${l.side === 'u'}">${l.k === 'dd' || l.k === 'td' ? 'No' : 'U'}</button></span>` : '<span></span>'}
      ${hasLine(l) ? `<input inputmode="decimal" value="${l.line ?? ''}" data-bteline="${i}" aria-label="Line">` : '<span></span>'}
      <input inputmode="numeric" placeholder="odds" value="${odTxt(l.odds)}" data-bteodds="${i}" aria-label="Odds">
      ${b.legs.length > 1 ? `<button class="bte-x" data-bterm="${i}" aria-label="Remove leg">×</button>` : '<span></span>'}</div>`).join('')}
    <div class="bte-row"><label>Stake <span>$<input inputmode="decimal" value="${b.stake ?? ''}" data-btestake></span></label>${b.legs.length > 1 ? `<label>Parlay odds <input inputmode="numeric" placeholder="from legs" value="${odTxt(b.odds)}" data-bteparl></label>` : ''}</div>
    <div class="bte-row"><label title="What your book says it pays (stake included). Use it when a leg was voided or same-game legs were priced together, so the tracker matches the book exactly.">Book payout <span>$<input inputmode="decimal" placeholder="optional" value="${b.payOverride ?? ''}" data-btepay></span></label></div>
    <div class="bte-boost"><span>Profit boost</span>${[0, 10, 25, 50].map(v => `<button data-bteboost="${v}" aria-pressed="${(+b.boost || 0) === v}">${v ? v + '%' : 'None'}</button>`).join('')}</div>
    <div class="bte-act"><button class="btn" data-btesave="${esc(b.id)}">Save</button><button class="btn ghost" data-btecancel>Cancel</button></div>
  </div>`;
}
function redrawCard(id) {
  const b = EDIT?.id === id ? EDIT.b : readBets().find(x => x.id === id); if (!b) return;
  const res = S.betRes?.[id] || (b.legRes ? hist(b) : b.legs.map(() => ({ st: 'pending', text: '' })));
  $$(`.bt-card[data-bid="${CSS.escape(id)}"]`).forEach(c => { c.outerHTML = betCard(b, res); });
}
if (!window.__bteWired) {
  window.__bteWired = true;
  const num = v => { const n = parseFloat(String(v).replace(/[^\d.+-]/g, '')); return Number.isFinite(n) ? n : null; };
  document.addEventListener('click', e => {
    const op = e.target.closest('[data-bteopen]');
    if (op) { const b = readBets().find(x => x.id === op.dataset.bteopen); if (b) { EDIT = { id: b.id, b: JSON.parse(JSON.stringify(b)) }; redrawCard(b.id); } return; }
    if (!EDIT) return;
    const card = e.target.closest('.bt-card'); if (!card || card.dataset.bid !== EDIT.id) return;
    const W = EDIT.b, id = EDIT.id;
    const sd = e.target.closest('[data-bteside]'); if (sd) { W.legs[+sd.dataset.bteside].side = sd.dataset.v; redrawCard(id); return; }
    const rm = e.target.closest('[data-bterm]'); if (rm) { W.legs.splice(+rm.dataset.bterm, 1); W.odds = null; redrawCard(id); return; }
    const bo = e.target.closest('[data-bteboost]'); if (bo) { W.boost = +bo.dataset.bteboost || undefined; redrawCard(id); return; }
    if (e.target.closest('[data-btecancel]')) { EDIT = null; redrawCard(id); return; }
    if (e.target.closest('[data-btesave]')) {
      // edits change the price, so drop the saved to-win and let it be worked out from the odds and boost
      W.toWin = null; delete W.legRes; delete W.legNow; delete W.result; delete W.settledAt;
      writeBets(readBets().map(x => x.id === id ? W : x));
      EDIT = null; if (S.betRes) delete S.betRes[id];
      renderBets(true); redrawCard(id); document.dispatchEvent(new Event('fcbets'));
      toast('Bet updated');
    }
  });
  document.addEventListener('input', e => {
    if (!EDIT) return; const W = EDIT.b, t = e.target;
    if (t.matches('[data-bteline]')) W.legs[+t.dataset.bteline].line = num(t.value);
    else if (t.matches('[data-bteodds]')) W.legs[+t.dataset.bteodds].odds = num(t.value) || null;
    else if (t.matches('[data-btestake]')) W.stake = num(t.value);
    else if (t.matches('[data-bteparl]')) W.odds = num(t.value) || null;
    else if (t.matches('[data-btepay]')) { const v = num(t.value); if (v) W.payOverride = v; else delete W.payOverride; }
    else return;
    // keep the "To win" line in step while typing
    const w = payout({ ...W, toWin: null }, S.betRes?.[EDIT.id] || []);
    $$(`.bt-card[data-bid="${CSS.escape(EDIT.id)}"] .bt-f span:last-child b`).forEach(x => { x.textContent = w != null && W.stake != null ? money(+W.stake + w) : '–'; });
  });
}
function betCard(b, res) {
  if (EDIT?.id === b.id) b = EDIT.b;
  const st = b.result || betStatus(res);
  const editing = EDIT?.id === b.id;
  const win = editing ? payout({ ...b, toWin: null }, res) : payout(b, res);
  const head = b.dfs ? `${b.legs.length}-pick entry` : b.legs.length > 1 ? `${b.legs.length}-leg parlay` : 'Single';
  const pill = { won: 'Won', lost: 'Lost', push: 'Push', live: 'Live', pending: 'Upcoming' }[st];
  const done = res.filter(r => r.st === 'won').length, voids = res.filter(r => r.st === 'void').length;
  const mini = readMin().has(b.id);
  return `<div class="bt-card ${st}${mini ? ' mini' : ''}" data-bid="${esc(b.id)}">
    <div class="bt-h"><span><b>${head}</b>${b.legs.length > 1 ? `<small title="${done} of ${b.legs.length - voids} legs hit${voids ? `, ${voids} void` : ''}">${done}/${b.legs.length - voids}${voids ? ` · ${voids}v` : ''}</small>` : ''}</span>
      <span class="bt-pill ${st}" title="${esc(pill)}">${st === 'live' ? '<i class="dot on"></i>' : ''}<span class="bt-pt">${pill}</span></span>
      <button class="bt-sh" data-bteopen="${esc(b.id)}" title="${b.result ? 'Fix this bet (payout, stake, boost…)' : 'Edit this bet'}" aria-label="Edit this bet">${PEN}</button>
      <button class="bt-sh" data-betshare="${esc(b.id)}" title="Share as an image" aria-label="Share this bet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></button>
      <button class="bt-min" data-betmin="${esc(b.id)}" aria-expanded="${!mini}" title="${mini ? 'Show details' : 'Minimize'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg></button>
      <button class="bt-x" data-betdel="${esc(b.id)}" title="Remove this bet" aria-label="Remove this bet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
    ${EDIT?.id === b.id ? editForm(b) : `<div class="bt-legs">${b.legs.map((l, i) => { const r = res[i] || {}; return `<button class="bt-leg ${r.st || 'pending'}" ${l.gid ? `data-game="${esc(l.gid)}"` : ''}${l.gid && l.pid && (l.k === 'prop' || l.k === 'dd' || l.k === 'td') ? ` data-legpid="${esc(l.pid)}" title="Open the game at ${esc(l.name || 'this player')}'s line"` : ''}>
      <span class="bt-ic">${ICON[r.st] || (r.st === 'void' ? ICON.push : '')}</span>
      <span class="bt-fc">${l.pid && (l.k === 'prop' || l.k === 'dd' || l.k === 'td') ? face(l.pid, l.name || '', 'bt-face', 80) : l.abbr ? logo(l.abbr, 40) : ''}</span>
      <span class="bt-t"><b>${esc(legName(l))}</b><small>${esc(r.text || '')}${r.g && r.st !== 'pending' ? ` · ${esc(r.g.label)}` : ''}</small>
        ${(l.k === 'prop' || l.k === 'total' || l.k === 'ttotal' || l.k === 'dd' || l.k === 'td') && r.st && r.st !== 'pending' && r.st !== 'void' ? `<span class="bt-bar"><i style="width:${Math.round((r.pct || 0) * 100)}%"></i>${r.need != null && l.k !== 'dd' && l.k !== 'td' ? `<em style="left:${Math.min(100, Math.round(r.need / Math.max(r.need, r.now || 0, 0.5) * 100))}%"></em>` : ''}</span>` : ''}
      </span>
      <span class="bt-v">${r.now != null && (l.k === 'prop' || l.k === 'total' || l.k === 'ttotal') ? `<b>${r.now}</b><small>/${l.line}</small>` : r.g && r.st === 'pending' ? `<small>${esc(r.g.label)}</small>` : ''}</span>
    </button>`; }).join('')}</div>`}
    ${b.stake != null ? `<div class="bt-f"><span>${money(b.stake)} stake${b.boost ? ` <em class="bt-boost">${b.boost}% boost</em>` : ''}</span>${win != null ? `<span title="${money(win)} profit + ${money(b.stake)} stake">${editing ? 'Pays' : st === 'won' ? 'Paid' : st === 'lost' ? 'Would have paid' : st === 'push' ? 'Returned' : 'Pays'} <b>${money(st === 'push' && !editing ? b.stake : b.stake + win)}</b></span>` : ''}</div>` : ''}
  </div>`;
}
// what a live parlay still needs, in one line
function needLine(b, res) {
  const last = l => (l.name || '').split(' ').slice(-1)[0];
  const parts = b.legs.map((l, i) => {
    const r = res[i] || {};
    if (r.st === 'pending') return `${legName(l)} (not started)`;
    if (r.st !== 'live') return null;
    if (l.k === 'prop') return l.side === 'u' ? `${last(l)} stays under ${l.line}` : `${last(l)} ${Math.max(1, Math.floor(l.line) + 1 - (r.now || 0))} more ${l.stats.map(k => BSTAT[k]).join('+')}`;
    if (l.k === 'dd' || l.k === 'td') return `${last(l)} ${l.side === 'u' ? 'no ' : ''}${l.k === 'dd' ? 'double' : 'triple'}-double`;
    if (l.k === 'spread') return r.now > 0 ? `${l.abbr} keeps covering` : `${l.abbr} ${-r.now + 1} more to cover`;
    if (l.k === 'ml') return r.now > 0 ? `${l.abbr} holds on` : `${l.abbr} ${-r.now + 1} to lead`;
    if (l.k === 'total' || l.k === 'ttotal') return l.side === 'u' ? `${l.k === 'total' ? 'game' : l.abbr} stays under ${l.line}` : `${Math.max(1, Math.floor(l.line) + 1 - (r.now || 0))} more points${l.k === 'ttotal' ? ` from ${l.abbr}` : ''}`;
    return legName(l);
  }).filter(Boolean);
  return parts.length ? `<div class="bt-need"><b>Needs ${parts.length}</b> ${esc(parts.join(' · '))}</div>` : '';
}
function recordLine(list) {
  const w = list.filter(b => b.result === 'won').length, l = list.filter(b => b.result === 'lost').length;
  if (!w && !l) return '';
  let net = 0, known = true;
  for (const b of list) { if (b.result === 'won') { const p = payout(b); if (p == null) known = false; else net += p; } else if (b.result === 'lost') { if (b.stake == null) known = false; else net -= b.stake; } }
  return `${w}-${l}${known && (w + l) ? ` · ${net >= 0 ? '+' : '-'}${money(Math.abs(net))}` : ''}`;
}

// which day(s) a bet's games are on (ET), so it only shows on those days' Scores pages
const etDay = d => dfmt('en-CA', { timeZone: 'America/New_York' }, new Date(d)).replace(/-/g, '');
async function betDays(list) {
  let changed = false;
  await Promise.all(list.filter(b => !b.days).map(async b => {
    const days = new Set();
    await Promise.all(b.legs.map(async l => {
      if (!l.gid) return;
      const onPage = (S.games || []).find(g => String(g.id) === String(l.gid));
      if (onPage) { days.add(etDay(onPage.date)); return; }
      try { const d = await summaryCached(l.gid, 6 * 3600e3), dt = d?.header?.competitions?.[0]?.date; if (dt) days.add(etDay(dt)); } catch (e) {}
    }));
    if (!days.size) { if (b.legs.some(l => l.gid)) return; days.add(etDay(b.at)); } // nothing to look up: the day it was added
    b.days = [...days]; changed = true;
  }));
  if (changed) { const byId = new Map(list.map(b => [b.id, b])); writeBets(readBets().map(b => byId.get(b.id) || b)); }
}
async function renderBets(force) {
  const blk = $('#betBlock'); if (!blk) return;
  let list = readBets();
  if (list.some(b => !b.days)) await betDays(list);
  const day = S.date || S.today;
  const show = list.filter(b => b.days?.includes(day));
  // bets still open on other days keep getting graded in the background so they settle
  const grade = list.filter(b => show.includes(b) || (!b.result && b.days?.some(d => d <= S.today)));
  if (!show.length) blk.hidden = true;
  else blk.hidden = false;
  const draw = res => {
    if (EDIT && document.activeElement?.closest?.('.bte')) return; // don't redraw under someone typing in an edit
    $('#betStrip').innerHTML = show.map(b => betCard(b, res[b.id] || b.legs.map(() => ({ st: 'pending', text: 'Loading…' })))).join('');
    dragScroll($('#betStrip'));
  };
  if (!S.betRes) S.betRes = {};
  if (show.length) draw(S.betRes);
  if (betBusy && !force) return;
  betBusy = true;
  let changed = false;
  for (const b of grade) {
    if (b.result && S.betRes[b.id] && b.legs.every(l => sums[l.gid]?.fin)) continue;
    const res = await gradeBet(b);
    const prev = S.betRes[b.id];
    if (prev && !b.result) res.forEach((r, i) => { const p = prev[i]?.st; if ((r.st === 'won' || r.st === 'lost') && (p === 'live' || p === 'pending')) legAlert(b, b.legs[i], r); else milestoneAlert(b, i, r, prev[i]); });
    S.betRes[b.id] = res;
    const st = betStatus(res);
    const gamesOver = b.legs.every(l => sums[l.gid]?.fin);
    if (gamesOver && !b.legRes) { b.legRes = res.map(r => r.st); b.legNow = res.map(r => r.now ?? null); changed = true; }
    if (!b.result && (st === 'lost' || (gamesOver && ['won', 'push'].includes(st)))) { b.result = st; b.settledAt = Date.now(); changed = true; }
  }
  if (changed) { list = readBets().map(b => grade.find(x => x.id === b.id) || b); writeBets(list); }
  betBusy = false;
  if (show.length) draw(S.betRes);
}

// a leg just hit or just died: toast here, a notification if the tab is in the background
function legAlert(b, l, r) {
  const won = r.st === 'won', left = (S.betRes[b.id] || []).filter((x, i) => x.st !== 'won' && x.st !== 'push' && x.st !== 'void' && i !== b.legs.indexOf(l)).length;
  const msg = `${won ? '✓' : '✗'} ${legName(l)} ${won ? 'hit' : 'missed'}${b.legs.length > 1 ? won ? left ? ` · ${left} to go` : ' · parlay cashed' : ' · parlay down' : ''}`;
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') notify(won ? 'Leg hit' : 'Leg missed', msg, l.gid || 'bets');
  else toast(msg);
}

// a live player prop getting close: one bucket away, late in the game and still short, or an under nearly used up.
// Each kind fires once per leg (remembered for the day so a reload doesn't repeat it).
const MS_KEY = 'fc-legms';
const msSeen = (() => { try { const v = JSON.parse(sessionStorage.getItem(MS_KEY) || '[]'); return new Set(v); } catch (e) { return new Set(); } })();
const msMark = k => { msSeen.add(k); try { sessionStorage.setItem(MS_KEY, JSON.stringify([...msSeen].slice(-200))); } catch (e) {} };
function milestoneAlert(b, i, r, prevR) {
  const l = b.legs[i];
  if (l.k !== 'prop' || r.st !== 'live' || r.now == null || !r.g || r.g.state !== 'in') return;
  const over = l.side !== 'u', need = Math.floor(l.line) + 1 - r.now, room = Math.floor(l.line) - r.now;
  // "close" = one more basket for points-type props, one more for counting stats like rebounds or steals
  const scoring = l.stats.some(k => k === 'pts' || k === 'fg2' || k === 'fga' || k === 'fg2a' || k === 'tpa') || l.stats.length > 1;
  const close = scoring ? 3 : 1;
  const [mm, ss] = String(r.g.clock || '0:0').split(':').map(Number), secs = (mm || 0) * 60 + (ss || 0);
  const late = r.g.period >= REG_PERIODS && secs <= 300;
  const who = (l.name || 'Your player').split(' ').slice(-1)[0], what = l.stats.map(k => BSTAT[k]).join('+');
  const when = `${r.g.clock} left in the ${r.g.period > REG_PERIODS ? 'OT' : RULES.halves ? '2nd half' : '4th'}`;
  const base = `${b.id}:${i}:`;
  let kind = null, msg = '';
  if (over && need > 0 && need <= close && !msSeen.has(base + 'close')) { kind = 'close'; msg = `${who} needs ${need} more ${what} (${r.now} of ${Math.floor(l.line) + 1}) · ${r.g.label}`; }
  else if (over && need > 0 && late && !msSeen.has(base + 'late')) { kind = 'late'; msg = `${who} needs ${need} more ${what} · ${when}`; }
  else if (!over && room >= 0 && room < close && !msSeen.has(base + 'room')) { kind = 'room'; msg = `${who} is at ${r.now} ${what} · only ${room} to spare on the under (${l.line})`; }
  if (!kind) return;
  // only when it just became true (not on first load mid-game for something that was already the case)
  if (prevR && prevR.now === r.now && kind !== 'late') { msMark(base + kind); return; }
  msMark(base + kind);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') notify(kind === 'room' ? 'Under in danger' : 'Leg is close', msg, l.gid || 'bets');
  else toast(msg);
}

/* ---------------- history (Bet desk → My bets) ---------------- */
const hist = b => (b.legRes || []).map((st, i) => { const now = b.legNow?.[i] ?? null, l = b.legs[i]; return { st, now, need: l.line, pct: now != null && l.line ? Math.min(1, now / Math.max(0.5, l.line)) : st === 'won' ? 1 : 0 }; });
const weekOf = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
async function historyHTML() {
  const list = readBets();
  if (!list.length) return `<div class="empty"><b>No bets tracked yet</b>Add props to a parlay here and press Track, or paste a slip into Ask. Every bet you track lands here with your record and profit.</div>`;
  const done = list.filter(b => b.result), open = list.filter(b => !b.result);
  const w = done.filter(b => b.result === 'won'), l = done.filter(b => b.result === 'lost'), p = done.filter(b => b.result === 'push');
  const net = b => b.result === 'won' ? payout(b) : b.result === 'lost' ? (b.stake == null ? null : -b.stake) : 0;
  const staked = done.filter(b => b.stake != null && b.result !== 'push').reduce((s, b) => s + b.stake, 0);
  const profit = done.reduce((s, b) => s + (net(b) ?? 0), 0), roi = staked ? profit / staked : null;
  const sign = v => (v >= 0 ? '+' : '−') + money(Math.abs(v));
  // weeks, newest first
  const weeks = new Map();
  for (const b of done) { const k = weekOf(b.settledAt || b.at).getTime(); const o = weeks.get(k) || { w: 0, l: 0, p: 0, net: 0, st: 0 }; o[{ won: 'w', lost: 'l', push: 'p' }[b.result]]++; o.net += net(b) ?? 0; if (b.stake != null && b.result !== 'push') o.st += b.stake; weeks.set(k, o); }
  // legs by market
  const MK = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: 'Threes', pra: 'Pts+Reb+Ast', pr: 'Pts+Reb', pa: 'Pts+Ast', ra: 'Reb+Ast', stl: 'Steals', blk: 'Blocks', sb: 'Stl+Blk', ml: 'Moneyline', spread: 'Spread', total: 'Game total', ttotal: 'Team total', dd: 'Double-double', td: 'Triple-double' };
  const mkOf = l => l.k !== 'prop' ? l.k : ({ 'pts,reb,ast': 'pra', 'pts,reb': 'pr', 'pts,ast': 'pa', 'reb,ast': 'ra', 'ast,reb': 'ra', 'stl,blk': 'sb' })[l.stats.join(',')] || (l.stats.length === 1 ? l.stats[0] : 'other');
  const legs = new Map();
  for (const b of done) (b.legRes || []).forEach((r, i) => { if (r !== 'won' && r !== 'lost') return; const k = mkOf(b.legs[i]); const o = legs.get(k) || { w: 0, l: 0 }; o[r === 'won' ? 'w' : 'l']++; legs.set(k, o); });
  const best = w.filter(b => payout(b) != null).sort((a, b) => payout(b) - payout(a))[0];
  // closest call: a lost parlay that missed by one leg, or the leg that came closest to the line
  const close = l.filter(b => b.legRes && b.legs.length > 1 && b.legRes.filter(r => r === 'lost').length === 1).sort((a, b) => (payout(b) ?? 0) - (payout(a) ?? 0))[0];
  const tile = (lab, v, sub, cls = '') => `<div class="rc-big ${cls}"><small>${lab}</small><b>${v}</b><span>${sub}</span></div>`;
  const pctPill = (a, b) => { const r = a + b ? a / (a + b) : null; return r == null ? '–' : `<span class="bd-pill ${r >= 0.58 ? 'hot' : r >= 0.5 ? 'warm' : 'cold'}">${Math.round(r * 100)}%</span>`; };
  const fmtW = t => new Date(+t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `<div class="rc-top">
      ${tile('Record', `${w.length}–${l.length}${p.length ? `–${p.length}` : ''}`, `${done.length ? Math.round(w.length / Math.max(1, w.length + l.length) * 100) + '% won' : 'nothing settled yet'}${open.length ? ` · ${open.length} open` : ''}`)}
      ${tile('Profit', staked ? sign(profit) : '–', staked ? `on ${money(staked)} staked` : 'add stakes to see profit', staked ? profit >= 0 ? 'pos' : 'neg' : '')}
      ${tile('ROI', roi != null ? `${roi >= 0 ? '+' : '−'}${Math.abs(Math.round(roi * 1000) / 10)}%` : '–', 'profit ÷ staked', roi != null ? roi >= 0 ? 'pos' : 'neg' : '')}
    </div>
    ${weeks.size ? `<div class="card rc-card"><div class="card-h"><h4>By week</h4></div><table class="bd-t rc-t"><thead><tr><th class="pl">Week of</th><th>Record</th><th>Profit</th></tr></thead><tbody>${[...weeks].sort((a, b) => b[0] - a[0]).map(([k, o]) => `<tr><td class="pl">${fmtW(k)}</td><td class="nm">${o.w}–${o.l}${o.p ? `–${o.p}` : ''}</td><td class="nm ${o.st ? o.net >= 0 ? 'pos' : 'neg' : ''}">${o.st ? sign(o.net) : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${legs.size ? `<div class="card rc-card"><div class="card-h"><h4>Legs by market</h4></div><table class="bd-t rc-t"><thead><tr><th class="pl">Market</th><th>Legs</th><th>Hit</th></tr></thead><tbody>${[...legs].sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l)).map(([k, o]) => `<tr><td class="pl">${esc(MK[k] || BSTAT[k] || k)}</td><td class="nm">${o.w}–${o.l}</td><td>${pctPill(o.w, o.l)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${best || close ? `<div class="rc-pair">${best ? `<div class="card rc-card"><div class="card-h"><h4>Best win</h4></div>${betCard(best, hist(best))}</div>` : ''}${close ? `<div class="card rc-card"><div class="card-h"><h4>Closest call</h4></div>${betCard(close, hist(close))}</div>` : ''}</div>` : ''}
    ${open.length ? `<div class="card rc-card"><div class="card-h"><h4>Open</h4></div><div class="bt-ask">${open.slice(-6).reverse().map(b => betCard(b, S.betRes?.[b.id] || b.legs.map(() => ({ st: 'pending', text: '' })))).join('')}</div></div>` : ''}
    <p class="bd-note">Saved in this browser. Profit counts bets with a stake; pushes return the stake. Leg hit rates start with bets settled from now on.</p>`;
}

/* ---------------- share a bet as an image ---------------- */
// card = { title, sub, status, legs: [{ name, what, st, val }], foot: [[label, value, green?]] }
async function shareCard(card, file = 'fullcourt-bet.png') {
  try { await document.fonts.ready; } catch (e) {}
  const W = 1080, pad = 64, rowH = 118, legs = card.legs.slice(0, 12);
  const H = pad + 186 + legs.length * rowH + 40 + (card.foot?.length ? 150 : 0) + 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const disp = "Archivo, 'Arial Narrow', Arial, sans-serif", body = "'Instrument Sans', system-ui, sans-serif", mono = "'IBM Plex Mono', Menlo, monospace";
  const C = { bg: '#0d0f13', card: '#161a21', line: '#262c36', ink: '#f2f4f7', mute: '#8b93a1', win: '#2fd47a', loss: '#ff5a5f', acc: '#ff7a2f' };
  const font = (w, sz, f, cond) => { x.font = `${w} ${sz}px ${f}`; try { x.fontStretch = cond ? 'condensed' : 'normal'; } catch (e) {} };
  const fit = (t, max) => { if (x.measureText(t).width <= max) return t; while (t.length > 1 && x.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); };
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  // header
  font(800, 30, disp, true); x.fillStyle = C.acc; x.textBaseline = 'alphabetic'; x.fillText('FULLCOURT', pad, pad + 26);
  const stCol = { won: C.win, lost: C.loss, live: C.acc }[String(card.status).toLowerCase()] || C.mute;
  if (card.status) { font(700, 24, mono); const t = card.status.toUpperCase(), tw = x.measureText(t).width + 36; rr(W - pad - tw, pad, tw, 44, 22); x.fillStyle = stCol + '26'; x.fill(); x.fillStyle = stCol; x.fillText(t, W - pad - tw + 18, pad + 31); }
  font(800, 72, disp, true); x.fillStyle = C.ink; x.fillText(fit(card.title.toUpperCase(), W - pad * 2), pad, pad + 112);
  if (card.sub) { font(500, 28, body); x.fillStyle = C.mute; x.fillText(fit(card.sub, W - pad * 2), pad, pad + 150); }
  // legs
  let y = pad + 186;
  rr(pad - 20, y - 14, W - pad * 2 + 40, legs.length * rowH + 14, 28); x.fillStyle = C.card; x.fill();
  legs.forEach((l, i) => {
    const cy = y + i * rowH + rowH / 2 - 8, col = { won: C.win, lost: C.loss, push: C.mute, void: C.mute }[l.st];
    x.beginPath(); x.arc(pad + 22, cy, 20, 0, Math.PI * 2); x.fillStyle = col ? col + '30' : C.line; x.fill();
    x.strokeStyle = col || C.mute; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath();
    if (l.st === 'won') { x.moveTo(pad + 12, cy); x.lineTo(pad + 19, cy + 8); x.lineTo(pad + 33, cy - 8); }
    else if (l.st === 'lost') { x.moveTo(pad + 14, cy - 8); x.lineTo(pad + 30, cy + 8); x.moveTo(pad + 30, cy - 8); x.lineTo(pad + 14, cy + 8); }
    else if (l.st === 'push' || l.st === 'void') { x.moveTo(pad + 13, cy); x.lineTo(pad + 31, cy); }
    else { x.arc(pad + 22, cy, 6, 0, Math.PI * 2); x.fillStyle = l.st === 'live' ? C.acc : C.mute; x.fill(); }
    x.stroke();
    const vw = l.val ? (font(800, 44, disp, true), x.measureText(l.val).width) : 0;
    font(700, 36, body); x.fillStyle = C.ink; x.fillText(fit(l.name, W - pad * 2 - 90 - vw - 30), pad + 66, cy - 4);
    font(500, 26, body); x.fillStyle = C.mute; x.fillText(fit(l.what, W - pad * 2 - 90 - vw - 30), pad + 66, cy + 34);
    if (l.val) { font(800, 44, disp, true); x.fillStyle = col || C.ink; x.textAlign = 'right'; x.fillText(l.val, W - pad, cy + 14); x.textAlign = 'left'; }
    if (i < legs.length - 1) { x.fillStyle = C.line; x.fillRect(pad + 66, y + (i + 1) * rowH - 8, W - pad * 2 - 66, 2); }
  });
  y += legs.length * rowH + 40;
  // footer numbers
  if (card.foot?.length) {
    const n = card.foot.length, gap = 16, w = (W - pad * 2 - gap * (n - 1)) / n;
    card.foot.forEach(([lab, v, g], i) => {
      const X = pad + i * (w + gap); rr(X, y, w, 130, 22); x.fillStyle = C.card; x.fill();
      font(500, 20, mono); x.fillStyle = C.mute; x.fillText(lab.toUpperCase(), X + 22, y + 42);
      font(800, 52, disp, true); x.fillStyle = g ? C.win : C.ink; x.fillText(fit(v, w - 40), X + 22, y + 104);
    });
    y += 150;
  }
  font(500, 22, mono); x.fillStyle = C.mute; x.fillText(SHARE_TAG, pad, H - 44);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) { toast("Couldn't make the image"); return; }
  const f = new File([blob], file, { type: 'image/png' });
  // phone: share sheet. desktop: copy the image (paste it into a chat), and save a copy if copying isn't allowed
  if (navigator.canShare?.({ files: [f] }) && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ files: [f], title: card.title }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Image copied: paste it anywhere'); return; } catch (e) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image saved');
}
async function shareBet(id) {
  const b = readBets().find(x => x.id === id); if (!b) return;
  const res = S.betRes?.[b.id] || (b.legRes ? hist(b) : await gradeBet(b));
  const st = b.result || betStatus(res), win = payout(b, res);
  const title = b.dfs ? `${b.legs.length}-pick entry` : b.legs.length > 1 ? `${b.legs.length}-leg parlay` : 'Single';
  const legs = b.legs.map((l, i) => { const r = res[i] || {}; return { name: l.k === 'prop' || l.k === 'dd' || l.k === 'td' ? l.name : legName(l), what: l.k === 'prop' ? `${l.side === 'u' ? 'Under' : 'Over'} ${l.line} ${l.stats.map(k => BSTAT[k]).join('+')}` + (l.game ? ` · ${l.game}` : '') : l.k === 'dd' || l.k === 'td' ? legName(l).split(' ').slice(1).join(' ') + (l.game ? ` · ${l.game}` : '') : (r.text || ''), st: r.st, val: r.now != null && (l.k === 'prop' || l.k === 'total' || l.k === 'ttotal') ? `${r.now}/${l.line}` : '' }; });
  const foot = [];
  if (b.stake != null) foot.push(['Stake', money(b.stake)]);
  if (b.odds) foot.push(['Odds', b.odds > 0 ? '+' + b.odds : String(b.odds)]);
  if (win != null) foot.push([st === 'won' ? 'Paid' : 'Payout', money(b.stake + win), st === 'won']);
  await shareCard({ title, sub: new Date(b.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), status: { won: 'Won', lost: 'Lost', push: 'Push', live: 'Live', pending: 'Upcoming' }[st], legs, foot });
}

// for Ask: "my bets"
async function betsAnswer() {
  const list = readBets();
  if (!list.length) return { text: "You're not tracking any bets yet. Type one, like <b>Tatum over 26.5 points</b> or <b>Celtics -4.5</b>, or paste a screenshot of your slip." };
  const recent = list.slice(-6).reverse();
  const res = await Promise.all(recent.map(gradeBet));
  const rec = recordLine(list);
  return { text: `${recent.length === list.length ? `Your ${list.length === 1 ? 'bet' : `${list.length} bets`}` : `Your latest ${recent.length} bets`}${rec ? ` · record ${rec}` : ''}.`, html: `<div class="bt-ask">${recent.map((b, i) => betCard(b, res[i])).join('')}</div>` };
}
