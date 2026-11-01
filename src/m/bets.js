/* =====================================================================
   MY BETS — bets added from Ask, tracked live from ESPN box scores.
   Saved in this browser only. Loads only when there are bets to show.
   ===================================================================== */
const BET_KEY = () => lsKey('fc-bets');
const readBets = () => { try { return JSON.parse(lsGet(BET_KEY()) || '[]') || []; } catch (e) { return []; } };
const writeBets = list => lsSet(BET_KEY(), list.length ? JSON.stringify(list.slice(-200)) : null);
const BSTAT = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', tov: 'TO', tpa: '3PA', fga: 'FGA', fgm: 'FGM', fta: 'FTA', ftm: 'FTM', fpts: 'FPTS', oreb: 'OREB', dreb: 'DREB', fg2: '2PM', pf: 'PF' };
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
    return { pts: n('PTS'), reb: n('REB'), ast: n('AST'), stl: n('STL'), blk: n('BLK'), tov: n('TO'), tpm: ma('3PT', 0), tpa: ma('3PT', 1), fgm: ma('FG', 0), fga: ma('FG', 1), ftm: ma('FT', 0), fta: ma('FT', 1), min: n('MIN'), oreb: n('OREB'), dreb: n('DREB'), pf: n('PF'), fg2: ma('FG', 0) - ma('3PT', 0), fpts: Math.round((n('PTS') + 1.2 * n('REB') + 1.5 * n('AST') + 3 * n('BLK') + 3 * n('STL') - n('TO')) * 10) / 10 };
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
  const per = IS_W ? 10 : 12, regs = 4;
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
function payout(b, results) {
  if (b.stake == null) return null;
  if (b.toWin != null && !results?.some(r => r.st === 'push' || r.st === 'void')) return b.toWin;
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
function betCard(b, res) {
  const st = b.result || betStatus(res);
  const win = payout(b, res);
  const head = b.dfs ? `${b.legs.length}-pick entry` : b.legs.length > 1 ? `${b.legs.length}-leg parlay` : 'Single';
  const pill = { won: 'Won', lost: 'Lost', push: 'Push', live: 'Live', pending: 'Upcoming' }[st];
  const done = res.filter(r => r.st === 'won').length;
  const mini = readMin().has(b.id);
  return `<div class="bt-card ${st}${mini ? ' mini' : ''}" data-bid="${esc(b.id)}">
    <div class="bt-h"><span><b>${head}</b>${b.legs.length > 1 ? `<small>${done}/${b.legs.length} hit</small>` : ''}</span>
      <span class="bt-pill ${st}">${st === 'live' ? '<i class="dot on"></i>' : ''}${pill}</span>
      <button class="bt-min" data-betmin="${esc(b.id)}" aria-expanded="${!mini}" title="${mini ? 'Show details' : 'Minimize'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg></button>
      <button class="bt-x" data-betdel="${esc(b.id)}" title="Remove this bet" aria-label="Remove this bet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
    <div class="bt-legs">${b.legs.map((l, i) => { const r = res[i] || {}; return `<button class="bt-leg ${r.st || 'pending'}" ${l.gid ? `data-game="${esc(l.gid)}"` : ''}>
      <span class="bt-ic">${ICON[r.st] || (r.st === 'void' ? ICON.push : '')}</span>
      <span class="bt-t"><b>${esc(legName(l))}</b><small>${esc(r.text || '')}${r.g && r.st !== 'pending' ? ` · ${esc(r.g.label)}` : ''}</small>
        ${(l.k === 'prop' || l.k === 'total' || l.k === 'ttotal' || l.k === 'dd' || l.k === 'td') && r.st && r.st !== 'pending' ? `<span class="bt-bar"><i style="width:${Math.round((r.pct || 0) * 100)}%"></i>${r.need != null && l.k !== 'dd' && l.k !== 'td' ? `<em style="left:${Math.min(100, Math.round(r.need / Math.max(r.need, r.now || 0, 0.5) * 100))}%"></em>` : ''}</span>` : ''}
      </span>
      <span class="bt-v">${r.now != null && (l.k === 'prop' || l.k === 'total' || l.k === 'ttotal') ? `<b>${r.now}</b><small>/${l.line}</small>` : r.g && r.st === 'pending' ? `<small>${esc(r.g.label)}</small>` : ''}</span>
    </button>`; }).join('')}</div>
    ${b.stake != null ? `<div class="bt-f"><span>${money(b.stake)} stake</span>${win != null ? `<span>${st === 'won' ? 'Won' : st === 'lost' ? 'Would have won' : 'To win'} <b>${money(win)}</b></span>` : ''}</div>` : ''}
  </div>`;
}
function recordLine(list) {
  const w = list.filter(b => b.result === 'won').length, l = list.filter(b => b.result === 'lost').length;
  if (!w && !l) return '';
  let net = 0, known = true;
  for (const b of list) { if (b.result === 'won') { const p = payout(b); if (p == null) known = false; else net += p; } else if (b.result === 'lost') { if (b.stake == null) known = false; else net -= b.stake; } }
  return `${w}-${l}${known && (w + l) ? ` · ${net >= 0 ? '+' : '-'}${money(Math.abs(net))}` : ''}`;
}

async function renderBets(force) {
  const blk = $('#betBlock'); if (!blk) return;
  let list = readBets();
  const now = Date.now();
  const show = list.filter(b => !b.result || now - (b.settledAt || 0) < KEEP_SETTLED);
  if (!show.length) { blk.hidden = true; $('#betRec') && ($('#betRec').textContent = ''); return; }
  blk.hidden = false;
  const draw = res => {
    $('#betRec').textContent = recordLine(list) ? `Record ${recordLine(list)}` : 'Updates live';
    $('#betStrip').innerHTML = show.map(b => betCard(b, res[b.id] || b.legs.map(() => ({ st: 'pending', text: 'Loading…' })))).join('');
    dragScroll($('#betStrip'));
  };
  if (!S.betRes) S.betRes = {};
  draw(S.betRes);
  if (betBusy && !force) return;
  betBusy = true;
  let changed = false;
  for (const b of show) {
    if (b.result && S.betRes[b.id] && b.legs.every(l => sums[l.gid]?.fin)) continue;
    const res = await gradeBet(b);
    S.betRes[b.id] = res;
    const st = betStatus(res);
    const gamesOver = b.legs.every(l => sums[l.gid]?.fin);
    if (!b.result && (st === 'lost' || (gamesOver && ['won', 'push'].includes(st)))) { b.result = st; b.settledAt = Date.now(); changed = true; }
  }
  if (changed) { const ids = new Set(show.map(b => b.id)); list = list.map(b => ids.has(b.id) ? show.find(x => x.id === b.id) : b); writeBets(list); }
  betBusy = false;
  draw(S.betRes);
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
