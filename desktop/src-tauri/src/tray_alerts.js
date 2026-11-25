// Alerts while Fullcourt sits in the tray with its window closed (so the web view, most of the app's memory, is gone).
// The rules are the phone-alert service's own (netlify/push/alerts.mjs and extras.mjs), run here for this one PC
// instead of for every subscriber. The app (src/alerts.rs) runs this in a small JavaScript engine, does the network
// reads itself and shows what comes back as Windows notifications. One pass, in three steps:
//   fc.plan(now)               the scoreboards to read, as [{ lg, url }] (none: nothing is switched on)
//   fc.boards(boards, now)     the scoreboards -> team alerts now due, and the game feeds and injury reports to read
//   fc.finish(extra, now)      those feeds -> every alert due this pass, and how long until the next one
// What was seen is kept between passes in this engine. It's made fresh each time the window goes to the tray (the
// page sends its own alerts while it's open), so a game already under way is noted without repeating what happened.
import { LEAGUES, scoreboardUrl, slim, step, messageFor, idleFor } from 'alerts.mjs';
import { cleanPlayers, cleanBets, playerAlerts, betAlerts, gamesToRead, injuryAlerts, injuryLeagues, injuryMap } from 'extras.mjs';

const KEY = 'sub/0000000000000000'; // the one "subscriber": this PC
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
let sub = null;
let st = null;
let pass = null; // the pass in progress, between fc.boards and fc.finish
const fresh = () => ({ games: {}, day: '', per: { seen: [], last: {} }, injAt: {} });
st = fresh();

// The site's day, as alerts.mjs dayET: New York time, rolling over at 4 AM. Worked out by hand because this engine
// has no time-zone data: US Eastern is UTC-4 from 2 AM on the second Sunday of March to 2 AM on the first Sunday of
// November, UTC-5 the rest of the year.
export function etDay(now) {
  const t = now - 4 * 3600e3, y = new Date(t).getUTCFullYear();
  const sunday = (month, nth) => { const d = new Date(Date.UTC(y, month, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + 7 * (nth - 1); };
  const dstStart = Date.UTC(y, 2, sunday(2, 2), 7), dstEnd = Date.UTC(y, 10, sunday(10, 1), 6);
  const off = t >= dstStart && t < dstEnd ? 4 : 5;
  const d = new Date(t - off * 3600e3), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

function leagues() {
  if (!sub) return [];
  const want = new Set([...(sub.any ? LEAGUES : Object.keys(sub.teams)), ...(sub.want.players ? sub.players.map(p => p.lg) : []), ...(sub.want.bets ? sub.bets.map(b => b.lg) : [])]);
  return LEAGUES.filter(l => want.has(l));
}

globalThis.fc = {
  // what the page sent: { teams: { nba: '18' }, any, night, players, bets, want } (the alert service's shape, plus
  // night: the day game night is on for, which counts as "any close finish" for that night only)
  prefs(json) {
    let b = null; try { b = JSON.parse(json); } catch (e) {}
    const teams = {};
    for (const lg of LEAGUES) { const t = b?.teams?.[lg]; if (t != null && /^\d{1,6}$/.test(String(t))) teams[lg] = String(t); }
    sub = { key: KEY, teams, any: !!b?.any, always: !!b?.any, night: /^\d{8}$/.test(String(b?.night || '')) ? String(b.night) : '', players: cleanPlayers(b?.players), bets: cleanBets(b?.bets), want: { players: b?.want?.players === true, bets: b?.want?.bets !== false } };
    return JSON.stringify(leagues());
  },
  plan(now) {
    if (sub) sub.any = sub.always || sub.night === etDay(now);
    return JSON.stringify(leagues().map(lg => ({ lg, url: scoreboardUrl(lg, etDay(now)) })));
  },
  // boards: { nba: <scoreboard JSON text, or null when it didn't answer> }
  boards(boardsJson, now) {
    const boards = JSON.parse(boardsJson), ymd = etDay(now), games = [], failed = new Set();
    for (const [lg, text] of Object.entries(boards)) {
      let d = null; try { d = text ? JSON.parse(text) : null; } catch (e) {}
      if (!d) { failed.add(lg); continue; }
      games.push(...(d.events || []).map(e => slim(lg, e)));
    }
    // as the service's check(): compare with the last pass, keeping the records of a league that didn't answer
    const recs = Object.fromEntries(Object.entries(st.games).filter(([, r]) => failed.has(r.lg))), msgs = [];
    for (const g of games) { const { rec, due } = step(g, st.games[g.id]); recs[g.id] = rec; for (const key of due) { const m = messageFor(sub, g, key); if (m) msgs.push(m); } }
    const prev = st.games, finals = new Set(games.filter(g => g.state === 'post' && prev[g.id] && prev[g.id].s !== 'post').map(g => g.id));
    const quiet = new Set(games.filter(g => !prev[g.id]).map(g => g.id));
    if (st.day !== ymd) { st.per = { seen: [], last: {} }; st.injAt = {}; }
    const read = [...gamesToRead([sub], games, finals)].map(id => ({ id, url: `${ESPN}/${games.find(g => g.id === id).lg}/summary?event=${id}` }));
    const inj = [...injuryLeagues([sub], games)].filter(lg => now - (st.injAt[lg] || 0) >= 3 * 60e3).map(lg => ({ lg, url: `${ESPN}/${lg}/injuries` }));
    pass = { games, finals, quiet, failed, msgs, ymd };
    st.games = recs; st.day = ymd;
    return JSON.stringify({ read, inj });
  },
  // extra: { sums: { <game id>: <summary JSON text> }, inj: { nba: <injury report JSON text> } }
  finish(extraJson, now) {
    if (!pass) return JSON.stringify({ msgs: [], sleep: 60e3 });
    const { games, finals, quiet, failed, msgs } = pass, extra = JSON.parse(extraJson), sums = {}, inj = {};
    for (const [id, text] of Object.entries(extra.sums || {})) { try { sums[id] = JSON.parse(text); } catch (e) {} }
    for (const [lg, text] of Object.entries(extra.inj || {})) { try { inj[lg] = injuryMap(JSON.parse(text)); st.injAt[lg] = now; } catch (e) {} }
    if (Object.keys(sums).length || Object.keys(inj).length) {
      const seen = new Set(st.per.seen);
      msgs.push(...(sub.want.players ? playerAlerts(sub, games, sums, seen, quiet, finals) : []));
      if (sub.want.bets) msgs.push(...betAlerts(sub, sums, seen, st.per.last, quiet), ...injuryAlerts(sub, games, inj, seen, now));
      st.per.seen = [...seen].slice(-400);
    }
    pass = null;
    const sleep = failed.size ? 60e3 : Math.min(idleFor(games, now), injuryLeagues([sub], games).size ? 3 * 60e3 : Infinity);
    return JSON.stringify({ msgs: msgs.map(m => ({ title: m.title, body: m.body, game: m.game, lg: m.lg })), sleep });
  },
};
