// Fullcourt's Discord bot: turns a slash command, a button press or a menu choice into a reply. No Discord library and
// nothing that stays running: Discord sends each one to functions/api/discord.js (Cloudflare Pages), which checks the
// signature and calls handle() here.
//
// Everything the bot can show is a "view": { k: kind, ...settings }, e.g. { k: 'game', lg: 'nba', id: '401…', tab: 'box' }.
// A command becomes a view; a button carries the view it leads to as its id; the picture's address carries the same
// view. espn.mjs loads the numbers for a view (its model), REPLY below writes the message, cards.mjs draws the picture.
import { STATS } from './commands.mjs';
import { LGS, Say, model, norm, cut, dayET, addDays, dayLabel, findTeam, teamById, allTeams, searchPlayers, findPlayer, teamGame, highlights, check } from './espn.mjs';
import { hasCard } from './cards.mjs';
import { ask, EXAMPLES } from './ask.mjs';
export { check };

const ACCENT = 0xf2703a;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unix = iso => Math.floor(Date.parse(iso) / 1000);
const when = (iso, f = 't') => `<t:${unix(iso)}:${f}>`; // Discord shows these in each reader's own time zone
const colorOf = hex => { const n = parseInt(hex || '', 16); return Number.isFinite(n) && Math.max(n >> 16 & 255, n >> 8 & 255, n & 255) > 0x38 ? n : ACCENT; }; // near-black disappears on Discord's dark theme
const opt = (i, name) => i.data?.options?.find(o => o.name === name)?.value;
const lgOf = i => (LGS[opt(i, 'league')] ? opt(i, 'league') : 'nba');
const logo = t => `https://a.espncdn.com/i/teamlogos/${t.lg}/500/${t.ab.toLowerCase()}.png`;
const embed = e => ({ color: ACCENT, footer: { text: 'Fullcourt' }, ...e });

/* ---------- views as text (button ids, picture addresses) ---------- */
export const encodeView = v => [v.k, ...Object.entries(v).filter(([k, x]) => k !== 'k' && x != null && x !== '').map(([k, x]) => `${k}=${String(x).replace(/[|=]/g, ' ')}`)].join('|');
export function decodeView(s) { const [k, ...rest] = String(s || '').split('|'), v = { k }; for (const p of rest) { const n = p.indexOf('='); if (n > 0) v[p.slice(0, n)] = p.slice(n + 1); } return v; }
// a short fingerprint of what a picture shows, so its address changes when the numbers do (and Discord fetches it again)
const stamp = m => { const s = JSON.stringify(m); let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const cardUrl = (v, m, ctx) => `${ctx.site}/api/card?v=${encodeURIComponent(encodeView(v))}&h=${stamp(m)}`;

/* ---------- buttons and menus ---------- */
// the button for the view on screen stays live (and blue): pressing it again refreshes
const btn = (label, view, on = false) => ({ type: 2, style: on ? 1 : 2, label: cut(label, 80), custom_id: cut(encodeView(view), 100) });
const link = (label, url) => ({ type: 2, style: 5, label: cut(label, 80), url });
const row = (...items) => ({ type: 1, components: items.filter(Boolean).slice(0, 5) });
// a menu that changes one setting of a view: its id is "~setting|view", the choice becomes that setting's value
const menu = (param, view, placeholder, options) => ({ type: 1, components: [{ type: 3, custom_id: cut(`~${param}|${encodeView(view)}`, 100), placeholder: cut(placeholder, 150), options: options.slice(0, 25).map(o => ({ ...o, label: cut(o.label, 100), ...(o.description ? { description: cut(o.description, 100) } : {}) })) }] });

/* ---------- teams and players in a command ---------- */
function needTeam(i, name = 'team') {
  const raw = opt(i, name), t = findTeam(raw, opt(i, 'league') && lgOf(i));
  if (!t) throw new Say(`I couldn't find a team called "${cut(String(raw), 40)}". Pick one from the list that appears as you type.`);
  return t;
}
// "nba:3934672:Jalen Brunson" from the suggestions, or a typed name
async function needPlayer(i, name = 'player') {
  const raw = String(opt(i, name) || '').trim(), m = /^(nba|wnba):(\d+):(.+)$/.exec(raw);
  if (m) return { lg: m[1], id: m[2], name: m[3] };
  const hit = await findPlayer(raw);
  if (!hit) throw new Say(`I couldn't find a player called "${cut(raw, 40)}". Pick one from the list that appears as you type.`);
  return hit;
}
// suggestions while typing
async function complete(i) {
  const f = i.data?.options?.find(o => o.focused); if (!f) return [];
  const q = norm(f.value), lg = opt(i, 'league') && lgOf(i);
  if (f.name === 'team') {
    const rank = t => (norm(t.ab) === q ? 0 : norm(t.name).startsWith(q) || norm(t.loc).startsWith(q) ? 1 : 2);
    return allTeams(lg).filter(t => !q || norm(`${t.full} ${t.ab}`).includes(q)).sort((a, b) => (a.lg === 'wnba') - (b.lg === 'wnba') || rank(a) - rank(b)).slice(0, 25).map(t => ({ name: t.lg === 'wnba' ? `${t.full} (WNBA)` : t.full, value: `${t.lg}:${t.id}` }));
  }
  if (f.name === 'player' || f.name === 'against') {
    if (q.length < 2) return [];
    return (await searchPlayers(f.value, i.data.name === 'props' ? 'nba' : lg)).slice(0, 25).map(p => ({ name: cut(`${p.name}${p.team ? ' · ' + p.team : ''}${p.lg === 'wnba' ? ' (WNBA)' : ''}`, 100), value: cut(`${p.lg}:${p.id}:${p.name}`, 100) }));
  }
  if (f.name === 'question') return EXAMPLES.filter(e => !q || e.includes(q)).slice(0, 10).map(e => ({ name: e, value: e }));
  return [];
}

/* ---------- a command -> its view ---------- */
const dayWord = off => (off === 0 ? 'today' : off < 0 ? 'yesterday' : 'tomorrow');
async function gameView(t, off, tab = 'score') {
  const g = await teamGame(t, off);
  if (!g) throw new Say(off == null ? `The ${t.name} haven't played yet this season.` : `No ${t.name} game ${dayWord(off)}. Leave the day out and I'll show their latest game.`);
  return { k: 'game', lg: t.lg, id: g.id, d: g.d, tab };
}
const COMMAND = {
  async score(i) {
    const off = [-1, 0, 1].includes(+opt(i, 'day')) ? +opt(i, 'day') : null;
    if (opt(i, 'team')) return gameView(needTeam(i), off);
    return { k: 'score', lg: lgOf(i), d: dayET(off ?? 0) };
  },
  async game(i) { const off = [-1, 0, 1].includes(+opt(i, 'day')) ? +opt(i, 'day') : null, v = await gameView(needTeam(i), off, opt(i, 'show') || 'score'); if (v.tab === 'box') v.side = 'team:' + needTeam(i).id; return v; },
  async standings(i) { return { k: 'standings', lg: lgOf(i), conf: opt(i, 'conference') || 'both' }; },
  async player(i) { const p = await needPlayer(i); return { k: 'player', lg: p.lg, id: p.id, tab: opt(i, 'show') || 'season' }; },
  async compare(i) { const [a, b] = await Promise.all([needPlayer(i, 'player'), needPlayer(i, 'against')]); if (a.id === b.id) throw new Say('Pick two different players.'); return { k: 'compare', lg: a.lg, a: a.id, b: b.id, ...(b.lg !== a.lg ? { lb: b.lg } : {}) }; },
  async team(i) { const t = needTeam(i); return { k: 'team', lg: t.lg, id: t.id }; },
  async leaders(i) { return { k: 'leaders', lg: lgOf(i), stat: opt(i, 'stat') || 'avgPoints' }; },
  async props(i) { const p = await needPlayer(i); if (p.lg !== 'nba') throw new Say('Prop lines are NBA only for now.'); return { k: 'props', id: p.id, n: p.name }; },
  async odds(i) { return { k: 'odds', lg: lgOf(i), d: dayET([-1, 0, 1].includes(+opt(i, 'day')) ? +opt(i, 'day') : 0) }; },
  async injuries(i) { const t = needTeam(i); return { k: 'injuries', lg: t.lg, id: t.id }; },
  async highlights(i) { const t = opt(i, 'team') ? needTeam(i) : null; return { k: 'highlights', lg: t ? t.lg : lgOf(i), ...(t ? { id: t.id } : {}) }; },
  async ask(i) { const q = String(opt(i, 'question') || ''); return { ...(await ask(q)), asked: q }; },
  async help() { return { k: 'help' }; },
};

/* ---------- a view + its model -> the message ---------- */
const site = (ctx, lg, rest = '') => `${ctx.site}/?league=${lg}${rest}`;
const gameUrl = (ctx, lg, id) => site(ctx, lg, `&game=${id}`);
const scoreText = g => (g.st === 'pre' ? `${g.a.ab} @ ${g.h.ab}` : `${g.a.ab} ${g.a.s}, ${g.h.ab} ${g.h.s}`);
const REPLY = {
  score(v, m, ctx) {
    const n = s => m.games.filter(g => g.st === s).length, parts = [n('in') && `🔴 ${n('in')} live`, n('post') && `${n('post')} final`, n('pre') && `${n('pre')} to come`].filter(Boolean);
    const prev = addDays(m.ymd, -1), next = addDays(m.ymd, 1), day = d => ({ k: 'score', lg: m.lg, d });
    return { embeds: [embed({ title: `${LGS[m.lg]} scores · ${dayLabel(m.ymd)}`, url: site(ctx, m.lg, '#scores'), description: m.games.length ? parts.join(' · ') : `No ${LGS[m.lg]} games on ${dayLabel(m.ymd)}.` })],
      components: [
        ...(m.games.length ? [menu('id', { k: 'game', lg: m.lg, d: m.ymd, tab: 'score' }, 'Open a game: box score, team stats, win probability', m.games.map(g => ({ label: g.st === 'pre' ? `${g.a.ab} @ ${g.h.ab}` : `${g.a.ab} ${g.a.s} @ ${g.h.ab} ${g.h.s}`, value: g.id, description: g.st === 'pre' ? `${g.tag} ET` : g.det })))] : []),
        row(btn(`◀ ${dayLabel(prev)}`, day(prev)), btn(m.ymd === m.today ? 'Refresh' : dayLabel(m.ymd), day(m.ymd), true), btn(`${dayLabel(next)} ▶`, day(next)), ![prev, m.ymd, next].includes(m.today) && btn('Today', day(m.today)), link('Open Fullcourt', site(ctx, m.lg, '#scores'))),
      ] };
  },
  game(v, g, ctx) {
    const tab = v.tab || 'score', at = (t, extra) => ({ k: 'game', lg: g.lg, id: g.id, d: v.d, tab: t, ...extra }), pre = g.st === 'pre';
    const lead = t => [t.pts && `${t.pts[0]} ${t.pts[1]} pts`, t.reb && `${t.reb[0]} ${t.reb[1]} reb`, t.ast && `${t.ast[0]} ${t.ast[1]} ast`].filter(Boolean).join(', ');
    const desc = pre ? [`Tips ${when(g.date, 'F')} (${when(g.date, 'R')})`, g.line && `Line: ${g.line}${g.ou != null ? ` · O/U ${g.ou}` : ''}`, g.tv && `On ${g.tv}`].filter(Boolean).join('\n')
      : [g.note, tab === 'score' && [g.a, g.h].map(t => lead(t) && `**${t.ab}** ${lead(t)}`).filter(Boolean).join('\n')].filter(Boolean).join('\n');
    return { embeds: [embed({ title: pre ? `${g.a.name || g.a.ab} at ${g.h.name || g.h.ab}` : `${scoreText(g)} · ${g.det}`, url: gameUrl(ctx, g.lg, g.id), color: colorOf((g.h.win || pre ? g.h : g.a.win ? g.a : g.h).color), description: desc || undefined })],
      components: [
        ...(pre ? [] : [row(btn(g.st === 'in' && tab === 'score' ? 'Score · refresh' : 'Score', at('score'), tab === 'score'), btn(`${g.a.ab} box`, at('box', { side: 'a' }), tab === 'box' && v.side !== 'h'), btn(`${g.h.ab} box`, at('box', { side: 'h' }), tab === 'box' && v.side === 'h'), btn('Team stats', at('stats'), tab === 'stats'), btn('Win probability', at('wp'), tab === 'wp'))]),
        row(pre && btn('Refresh', at('score'), true), btn(g.a.nick || g.a.ab, { k: 'team', lg: g.lg, id: g.a.id }), btn(g.h.nick || g.h.ab, { k: 'team', lg: g.lg, id: g.h.id }), link('Open the game in Fullcourt', gameUrl(ctx, g.lg, g.id))),
      ] };
  },
  player(v, p, ctx) {
    const tab = v.tab || 'season', at = t => ({ k: 'player', lg: p.lg, id: p.id, tab: t }), url = site(ctx, p.lg, `&player=${p.id}`), s = p.now;
    const bio = [[p.pos, p.jersey, p.team].filter(Boolean).join(' · '), p.away && `**${p.away}**`].filter(Boolean).join(' · ');
    return { embeds: [embed({ title: p.name, url, color: colorOf(p.color), description: [bio, s && `**${s.pts}** PTS · **${s.reb}** REB · **${s.ast}** AST · ${s.fgp} FG% · ${s.gp} GP`, p.draft && `Draft: ${p.draft}${p.from ? ` · ${p.from}` : ''}`].filter(Boolean).join('\n'), thumbnail: p.head ? { url: p.head } : undefined })],
      components: [row(btn('Season', at('season'), tab === 'season'), btn('Game log', at('log'), tab === 'log'), btn('Career', at('career'), tab === 'career'), p.lg === 'nba' && btn('Props', { k: 'props', id: p.id, n: p.name }), p.tid && btn(p.ab || 'Team', { k: 'team', lg: p.lg, id: p.tid })), row(link(`Open ${cut(p.name, 40)} in Fullcourt`, url))] };
  },
  compare(v, m, ctx) {
    const { a, b } = m, one = p => p.now && `**${p.name}** · ${p.now.pts} PTS · ${p.now.reb} REB · ${p.now.ast} AST`;
    return { embeds: [embed({ title: `${a.name} vs ${b.name}`, url: site(ctx, a.lg, `&player=${a.id}`), description: [one(a), one(b)].filter(Boolean).join('\n') || 'No games yet this season.' })],
      components: [row(btn(a.name, { k: 'player', lg: a.lg, id: a.id, tab: 'season' }), btn(b.name, { k: 'player', lg: b.lg, id: b.id, tab: 'season' }), btn('Swap sides', { k: 'compare', lg: b.lg, a: b.id, b: a.id, ...(a.lg !== b.lg ? { lb: a.lg } : {}) }))] };
  },
  team(v, t, ctx) {
    const url = site(ctx, t.lg, `&team=${t.id}`), nx = t.next[0];
    return { embeds: [embed({ title: t.name, url, color: colorOf(t.color), thumbnail: { url: logo(t) }, description: [[t.rec, t.place].filter(Boolean).join(' · '), nx && `Next: ${nx.home ? 'vs' : '@'} ${nx.opp} · ${when(nx.date, 'f')}`].filter(Boolean).join('\n') || undefined })],
      components: [row(btn('Overview', { k: 'team', lg: t.lg, id: t.id }, true), btn('Injuries', { k: 'injuries', lg: t.lg, id: t.id }), t.last.length && btn('Latest game', { k: 'game', lg: t.lg, id: t.last[t.last.length - 1].id, tab: 'score' }), btn('Standings', { k: 'standings', lg: t.lg, conf: 'both' }), link(`Open the ${t.nick} in Fullcourt`, url))] };
  },
  injuries(v, t, ctx) {
    const url = site(ctx, t.lg, `&team=${t.id}`);
    return { embeds: [embed({ title: `${t.name} injury report`, url, color: colorOf(t.color), thumbnail: { url: logo(t) }, description: t.rows.length ? cut(t.rows.filter(r => r.note).slice(0, 6).map(r => `**${r.name}** · ${r.note}`).join('\n\n'), 3500) : 'No injuries listed.' })],
      components: [row(btn('Overview', { k: 'team', lg: t.lg, id: t.id }), btn('Injuries', { k: 'injuries', lg: t.lg, id: t.id }, true), link(`Open the ${t.nick} in Fullcourt`, url))] };
  },
  standings(v, m, ctx) {
    const conf = v.conf === 'east' || v.conf === 'west' ? v.conf : 'both', at = c => ({ k: 'standings', lg: m.lg, conf: c }), top = m.groups.map(g => g.rows[0] && `${g.name}: **${g.rows[0].ab}** ${g.rows[0].w}-${g.rows[0].l}`).filter(Boolean).join(' · ');
    return { embeds: [embed({ title: `${LGS[m.lg]} standings`, url: site(ctx, m.lg, '#standings'), description: top || undefined })],
      components: [row(...(m.groups.length > 1 ? [btn('Both', at('both'), conf === 'both'), btn('East', at('east'), conf === 'east'), btn('West', at('west'), conf === 'west')] : []), link('Open standings in Fullcourt', site(ctx, m.lg, '#standings')))] };
  },
  leaders(v, m, ctx) {
    return { embeds: [embed({ title: `${LGS[m.lg]} leaders · ${m.label}`, url: site(ctx, m.lg, '#leaders'), description: m.rows.length ? m.rows.slice(0, 3).map((r, k) => `${k + 1}. **${r.name}** ${r.ab} · ${r.val}`).join('\n') : `No ${LGS[m.lg]} leaders yet this season.` })],
      components: [menu('stat', { k: 'leaders', lg: m.lg }, 'Another stat', STATS.map(s => ({ label: s[0], value: s[2], default: s[2] === m.stat }))), row(m.rows[0] && btn(m.rows[0].name, { k: 'player', lg: m.lg, id: m.rows[0].id, tab: 'season' }), link('Open leaders in Fullcourt', site(ctx, m.lg, '#leaders')))] };
  },
  props(v, m, ctx) {
    const url = site(ctx, 'nba', '#bets'), buttons = row(m.id && btn(m.name, { k: 'player', lg: 'nba', id: m.id, tab: 'season' }), m.id && btn('Game log', { k: 'player', lg: 'nba', id: m.id, tab: 'log' }), link('Open the Bet Desk', url));
    if (!m.rows.length) return { embeds: [embed({ title: `${m.name} props`, url, description: `No sportsbook lines for ${m.name} right now. Lines usually go up the morning of a game.` })], components: [buttons] };
    return { embeds: [embed({ title: `${m.name} props · ${m.game}`, url, description: `Tip-off ${when(m.starts, 'f')} · lines read ${when(m.updated, 'R')}\n${m.rows.slice(0, 3).map(r => `**${r.label} ${r.line}** · over ${r.o ? `${r.o[0] > 0 ? '+' : ''}${r.o[0]} ${r.o[1]}` : '–'} · under ${r.u ? `${r.u[0] > 0 ? '+' : ''}${r.u[0]} ${r.u[1]}` : '–'}`).join('\n')}` })], components: [buttons] };
  },
  odds(v, m, ctx) {
    const url = site(ctx, m.lg, '#bets');
    return { embeds: [embed({ title: `${LGS[m.lg]} odds · ${dayLabel(m.ymd)}`, url, description: m.games.length ? m.games.slice(0, 4).map(g => `**${g.a.ab} @ ${g.h.ab}** · ${g.line || '–'}${g.ou != null ? ` · O/U ${g.ou}` : ''} · ${when(g.date)}`).join('\n') : `No lines posted for ${dayLabel(m.ymd)}. They usually go up the day before.` })],
      components: [...(m.games.length ? [menu('id', { k: 'game', lg: m.lg, d: m.ymd, tab: 'score' }, 'Open a game', m.games.map(g => ({ label: `${g.a.ab} @ ${g.h.ab}`, value: g.id, description: `${g.line || ''}${g.ou != null ? ` · O/U ${g.ou}` : ''}` })))] : []), row(btn('Scores', { k: 'score', lg: m.lg, d: m.ymd }), link('Open the Bet Desk', url))] };
  },
};
// replies with no picture
async function highlightsReply(v, ctx) {
  const t = v.id ? teamById(v.lg, v.id) : null, vids = await highlights(v.lg, t);
  const name = x => `${x.title.split(' | ')[0].replace(/\b([A-Z0-9])([A-Z0-9]+)\b/g, (m, a, b) => (m === 'NBA' || m === 'WNBA' ? m : a + b.toLowerCase())).replace(/\bAt\b/, 'at').replace(/\bVs\b/, 'vs')} · ${dayLabel(x.d)}`;
  if (!vids.length) throw new Say(t ? `No full game highlights for the ${t.name} yet.` : `No ${LGS[v.lg]} highlights yet.`);
  if (t) return { content: `**${name(vids[0])}**\nhttps://www.youtube.com/watch?v=${vids[0].id}` }; // one video: post the link itself so Discord shows the player
  return { embeds: [embed({ title: `${LGS[v.lg]} full game highlights`, url: site(ctx, v.lg, '#replay'), description: vids.slice(0, 10).map(x => `[${name(x)}](https://www.youtube.com/watch?v=${x.id})`).join('\n') })], components: [row(link('Open Replay in Fullcourt', site(ctx, v.lg, '#replay')))] };
}
function helpReply(ctx) {
  const lines = [['/score', 'today\'s games, or one team\'s game'], ['/game', 'one game: score, box score, team stats, win probability'], ['/player', 'season card, game log, career'], ['/compare', 'two players side by side'], ['/team', 'record, form, next games'], ['/standings', 'both conferences or one'], ['/leaders', 'league leaders in a stat'], ['/props', 'a player\'s lines and the best price each way'], ['/odds', 'spreads, totals and moneylines'], ['/injuries', 'a team\'s injury report'], ['/highlights', 'full game highlight videos'], ['/ask', 'just type the question']];
  return { embeds: [embed({ title: 'Fullcourt bot', url: ctx.site, description: `${lines.map(([c, d]) => `**${c}** · ${d}`).join('\n')}\n\n**Things /ask understands**\n${EXAMPLES.map(e => `• ${e}`).join('\n')}\n\nButtons under a reply switch what it shows; the blue one refreshes.` })], components: [row(link('Open Fullcourt', ctx.site))] };
}

async function render(v, ctx) {
  if (v.k === 'help') return helpReply(ctx);
  if (v.k === 'highlights') return highlightsReply(v, ctx);
  if (!REPLY[v.k]) throw new Say('That button is from an older version of the bot. Run the command again.');
  const m = await model(v, ctx.store);
  if (String(v.side || '').startsWith('team:')) v.side = m.h?.id === v.side.slice(5) ? 'h' : 'a'; // "this team's box score" -> which side that is
  const data = REPLY[v.k](v, m, ctx);
  if (hasCard(v, m)) data.embeds[0].image = { url: cardUrl(v, m, ctx) };
  if (v.asked) data.content = `> ${cut(v.asked.replace(/[\n`*_~|<>@]/g, ' '), 200)}`;
  return data;
}

// One interaction in, one Discord response out. ctx: { site, waitUntil, store }.
export async function handle(i, ctx) {
  if (i.type === 1) return { type: 1 }; // Discord checking the address is alive
  if (i.type === 4) return { type: 8, data: { choices: await Promise.race([complete(i).catch(() => []), sleep(2500).then(() => [])]) } };
  const pressed = i.type === 3; // a button or a menu on one of our replies
  if (!pressed && !(i.type === 2 && COMMAND[i.data?.name])) return { type: 4, data: { content: 'I don\'t know that command.', flags: 64 } };
  const view = async () => {
    if (!pressed) return COMMAND[i.data.name](i, ctx);
    const id = String(i.data?.custom_id || '');
    if (id.startsWith('~')) { const cutAt = id.indexOf('|'), v = decodeView(id.slice(cutAt + 1)); v[id.slice(1, cutAt)] = String(i.data.values?.[0] ?? ''); return v; }
    return decodeView(id);
  };
  let failed = false;
  const work = view().then(v => render(v, ctx)).catch(e => { failed = true; return e instanceof Say ? { content: e.message, flags: 64 } : (console.log('failed:', i.data?.name || i.data?.custom_id, e?.message), { content: 'The stats feed didn\'t answer just now. Try again in a minute.', flags: 64 }); });
  // Discord wants an answer within 3 seconds. Usually the data is back well inside that; when it isn't, say "thinking" and fill it in after
  const quick = await Promise.race([work, sleep(2200).then(() => null)]);
  // a press replaces the reply it was on; if it can't, the reason goes to the person who pressed, as a note only they see
  if (quick) return { type: pressed && !failed ? 7 : 4, data: quick };
  const hook = `https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}`, send = (url, method, data) => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  ctx.waitUntil(work.then(data => (pressed && failed ? send(hook, 'POST', data) : send(`${hook}/messages/@original`, 'PATCH', data))).catch(() => {}));
  return { type: pressed ? 6 : 5 };
}
