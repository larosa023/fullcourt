// What to tell whom: compares each game on the scoreboard with what was seen a minute ago and decides which alerts
// are due. Same moments the site already alerts on while it's open (core.js alertCheck): tip-off, overtime, a close
// finish, the final. Pure functions, so they can be tested against made-up game nights.

const LEAGUE = { nba: { path: 'nba', quarter: 720 }, wnba: { path: 'wnba', quarter: 600 } };
export const LEAGUES = Object.keys(LEAGUE);
export const scoreboardUrl = (lg, ymd) => `https://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE[lg].path}/scoreboard?dates=${ymd}`;

// the site's day: New York time, rolling over at 4 AM so late West Coast games stay on their night
export function dayET(now = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now - 4 * 3600e3));
  const get = t => p.find(x => x.type === t).value;
  return `${get('year')}${get('month')}${get('day')}`;
}

const secs = clock => { const m = /^(\d+):(\d+)/.exec(clock || ''); return m ? +m[1] * 60 + +m[2] : parseFloat(clock) || 0; };
const perLabel = p => (p <= 4 ? ['1st', '2nd', '3rd', '4th'][p - 1] : p === 5 ? 'OT' : `${p - 4}OT`);

// a scoreboard event -> the few fields alerts need
export function slim(lg, e) {
  const c = e.competitions?.[0] || {}, st = c.status || e.status || {}, side = ha => {
    const t = (c.competitors || []).find(x => x.homeAway === ha) || {}, lead = (t.leaders || []).find(l => l.name === 'points')?.leaders?.[0];
    return { id: String(t.team?.id || ''), abbr: t.team?.abbreviation || '?', name: t.team?.shortDisplayName || t.team?.name || '', score: +t.score || 0, top: lead ? `${lead.athlete?.shortName || ''} ${lead.displayValue} pts`.trim() : '' };
  };
  return { lg, id: String(e.id), start: e.date, state: st.type?.state || 'pre', period: st.period || 0, clock: st.displayClock || '', a: side('away'), h: side('home'), tv: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))][0] || '' };
}

// The moments that are true for a game right now (each is sent at most once per game)
function moments(g) {
  const out = [];
  if (g.state === 'in') {
    const clk = secs(g.clock), q = LEAGUE[g.lg].quarter;
    if (g.period === 1) out.push({ key: 'start', early: clk > q - 240 });
    if (g.period > 4) out.push({ key: `ot${g.period}` });
    if (g.period >= 4 && clk > 0 && clk <= 300 && Math.abs(g.h.score - g.a.score) <= 5) out.push({ key: `close${g.period}`, close: true });
  }
  if (g.state === 'post') out.push({ key: 'final' });
  return out;
}

// prev: what was recorded for this game ({ s: state, sent: [keys] }) or undefined if it's new to us.
// -> { rec: the new record, due: [moment keys to announce] }
// A game seen for the first time part-way through (just deployed, or a missed minute) is recorded without
// announcing what already happened, except a tip-off in its first four minutes; a game first seen as final says nothing.
export function step(g, prev) {
  const sent = new Set(prev?.sent || []), due = [];
  for (const m of moments(g)) {
    if (sent.has(m.key)) continue;
    sent.add(m.key);
    if (!prev) { if (m.key === 'start' && m.early) due.push(m.key); continue; }
    if (m.key === 'final' && prev.s === 'pre') continue; // never seen it live (postponed, or the feed jumped): stay quiet
    due.push(m.key);
  }
  // overtime starting tied is also a "close finish": one alert for it, not two
  const ot = due.find(k => k.startsWith('ot')); if (ot) { const i = due.indexOf(`close${ot.slice(2)}`); if (i >= 0) due.splice(i, 1); }
  return { rec: { lg: g.lg, s: g.state, sent: [...sent] }, due };
}

const line = g => `${g.a.abbr} ${g.a.score} – ${g.h.abbr} ${g.h.score}`;
// The message one subscriber gets for one moment, or null if it isn't for them.
// sub.teams: { nba: '18' } the team they follow per league; sub.any: also any close finish or overtime league-wide
export function messageFor(sub, g, key) {
  const team = sub.teams?.[g.lg], mine = team && (g.a.id === team || g.h.id === team) ? (g.a.id === team ? g.a : g.h) : null;
  const other = mine === g.a ? g.h : g.a, base = { tag: `fc-${g.id}`, game: g.id, lg: g.lg };
  if (key === 'start') return mine ? { ...base, title: `${mine.name} game is on`, body: `${g.a.abbr} @ ${g.h.abbr} just tipped off${g.tv ? ` · ${g.tv}` : ''}` } : null;
  if (key === 'final') {
    if (!mine) return null;
    const won = mine.score > other.score, top = [g.a.top && `${g.a.abbr}: ${g.a.top}`, g.h.top && `${g.h.abbr}: ${g.h.top}`].filter(Boolean).join(' · ');
    return { ...base, title: `Final: ${mine.name} ${won ? 'win' : 'lose'}`, body: `${line(g)}${g.period > 4 ? ` (${perLabel(g.period)})` : ''}${top ? `\n${top}` : ''}`, ttl: 3600 };
  }
  if (!mine && !sub.any) return null;
  const who = mine ? '' : `${g.a.name} at ${g.h.name}: `;
  if (key.startsWith('ot')) { const p = +key.slice(2); return { ...base, title: p === 5 ? 'Overtime' : `${perLabel(p)}`, body: `${who}${line(g)} · heading to ${perLabel(p)}` }; }
  if (key.startsWith('close')) return { ...base, title: 'Close game', body: `${who}${line(g)} · ${perLabel(g.period)}, ${g.clock} left` };
  return null;
}

// How long the checker can sleep: until shortly before the next tip-off when nothing is live (at most 30 minutes)
export function idleFor(games, now = Date.now()) {
  if (games.some(g => g.state === 'in')) return 0;
  const next = games.filter(g => g.state === 'pre').map(g => Date.parse(g.start)).filter(t => t > now - 3600e3).sort((a, b) => a - b)[0];
  if (next) return Math.max(0, Math.min(30 * 60e3, next - now - 3 * 60e3));
  return 30 * 60e3;
}
