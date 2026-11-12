// Fullcourt's Discord bot: turns a slash command into a reply. No Discord library and nothing that stays running: Discord
// sends each command to functions/api/discord.js (Cloudflare Pages), which checks the signature and calls handle() here.
// Data is the same the site uses: ESPN's public scoreboard, standings and player feeds, and the repo's own data branches
// (sportsbook lines, highlight videos).
import { TEAMS } from './teams.mjs';
import { STATS } from './commands.mjs';

const LGS = { nba: 'NBA', wnba: 'WNBA' };
const API = lg => `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}`;
const API2 = lg => `https://site.api.espn.com/apis/v2/sports/basketball/${lg}`;
const WEB = lg => `https://site.web.api.espn.com/apis/common/v3/sports/basketball/${lg}`;
const SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search';
const RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const TZ = 'America/New_York';
const ACCENT = 0xf2703a;

// a message for the person who ran the command (shown only to them), as opposed to a bug
class Say extends Error {}

async function get(url, ttl = 30) {
  // cf.cacheTtl: Cloudflare keeps the answer for that many seconds, so a busy server costs one upstream read, not one per command
  const r = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}

/* ---------- small helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const unix = iso => Math.floor(Date.parse(iso) / 1000);
const when = (iso, f = 't') => `<t:${unix(iso)}:${f}>`; // Discord shows these in each reader's own time zone
// the site's day: New York time, and it doesn't roll over until 4 AM so late West Coast games stay on their night
const dayET = (off = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() - 4 * 3600e3 + off * 86400e3)).replace(/-/g, '');
const dayLabel = ymd => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), 12)));
const shortDate = iso => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(iso));
const colorOf = hex => { const n = parseInt(hex || '', 16); return Number.isFinite(n) && n > 0x151515 ? n : ACCENT; }; // near-black disappears on Discord's dark theme
const opt = (i, name) => i.data?.options?.find(o => o.name === name)?.value;
const lgOf = i => (LGS[opt(i, 'league')] ? opt(i, 'league') : 'nba');
const block = rows => '```\n' + rows.join('\n') + '\n```';
const button = (label, url) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });
const embed = e => ({ color: ACCENT, footer: { text: 'Fullcourt' }, ...e });

/* ---------- teams and players ---------- */
const teamObj = (lg, t) => ({ lg, id: t[0], ab: t[1], loc: t[2], name: t[3], full: `${t[2]} ${t[3]}`, color: t[4] });
// what the person picked from the suggestions ("nba:18"), or whatever they typed
function findTeam(text, lg) {
  const m = /^(nba|wnba):(\d+)$/.exec(String(text || '').trim());
  if (m) { const t = TEAMS[m[1]].find(x => x[0] === m[2]); if (t) return teamObj(m[1], t); }
  const q = norm(text); if (!q) return null;
  for (const l of lg ? [lg] : ['nba', 'wnba']) {
    const L = TEAMS[l], hit = L.find(t => norm(t[1]) === q) || L.find(t => norm(t[3]) === q || norm(`${t[2]} ${t[3]}`) === q) || L.find(t => norm(`${t[2]} ${t[3]}`).includes(q)) || L.find(t => q.split(' ').some(w => w.length > 2 && norm(t[3]).startsWith(w)));
    if (hit) return teamObj(l, hit);
  }
  return null;
}
function needTeam(i) {
  const raw = opt(i, 'team'), t = findTeam(raw, opt(i, 'league') && lgOf(i));
  if (!t) throw new Say(`I couldn't find a team called "${cut(String(raw), 40)}". Pick one from the list that appears as you type.`);
  return t;
}
async function searchPlayers(q, lg) {
  const d = await get(`${SEARCH}?query=${encodeURIComponent(q)}&limit=12&type=player&sport=basketball${lg ? '&league=' + lg : ''}`, 300);
  // the search also knows retired players and other leagues' players filed under the NBA: keep the ones on a current team
  return (d.items || []).filter(x => LGS[x.league] && (!lg || x.league === lg) && x.isRetired !== true).map(x => ({ lg: x.league, id: String(x.id), name: x.displayName, team: x.teamRelationships?.[0]?.displayName || '' }))
    .filter(p => TEAMS[p.lg].some(t => `${t[2]} ${t[3]}` === p.team));
}
// "nba:3934672:Jalen Brunson" from the suggestions, or a typed name
async function needPlayer(i) {
  const raw = String(opt(i, 'player') || '').trim(), m = /^(nba|wnba):(\d+):(.+)$/.exec(raw);
  if (m) return { lg: m[1], id: m[2], name: m[3] };
  let hits = raw.length > 1 ? await searchPlayers(raw).catch(() => []) : [];
  // the search wants names spelled its way ("A'ja", "Dončić"): try the surname and match the rest ourselves
  const words = norm(raw).split(' ').filter(w => w.length > 1);
  if (!hits.length && words.length > 1) hits = (await searchPlayers(words[words.length - 1]).catch(() => [])).filter(h => words.every(w => norm(h.name).includes(w)));
  if (!hits.length) throw new Say(`I couldn't find a player called "${cut(raw, 40)}". Pick one from the list that appears as you type.`);
  return hits.find(h => norm(h.name) === norm(raw)) || hits[0];
}

/* ---------- suggestions while typing ---------- */
async function complete(i) {
  const f = i.data?.options?.find(o => o.focused); if (!f) return [];
  const q = norm(f.value), lg = opt(i, 'league') && lgOf(i);
  if (f.name === 'team') {
    const all = (lg ? [lg] : ['nba', 'wnba']).flatMap(l => TEAMS[l].map(t => teamObj(l, t)));
    const rank = t => (norm(t.ab) === q ? 0 : norm(t.name).startsWith(q) || norm(t.loc).startsWith(q) ? 1 : 2);
    return all.filter(t => !q || norm(`${t.full} ${t.ab}`).includes(q)).sort((a, b) => (a.lg === 'wnba') - (b.lg === 'wnba') || rank(a) - rank(b)).slice(0, 25).map(t => ({ name: t.lg === 'wnba' ? `${t.full} (WNBA)` : t.full, value: `${t.lg}:${t.id}` }));
  }
  if (f.name === 'player') {
    if (q.length < 2) return [];
    return (await searchPlayers(f.value, i.data.name === 'props' ? 'nba' : lg)).slice(0, 25).map(p => ({ name: cut(`${p.name}${p.team ? ' · ' + p.team : ''}${p.lg === 'wnba' ? ' (WNBA)' : ''}`, 100), value: cut(`${p.lg}:${p.id}:${p.name}`, 100) }));
  }
  return [];
}

/* ---------- /score ---------- */
function gameOf(e) {
  const c = e.competitions?.[0] || {}, st = e.status?.type || c.status?.type || {};
  const side = ha => {
    const t = (c.competitors || []).find(x => x.homeAway === ha) || {}, lead = n => { const l = (t.leaders || []).find(x => x.name === n)?.leaders?.[0]; return l ? `${l.athlete?.shortName} ${l.displayValue}` : null; };
    return { id: t.team?.id, ab: t.team?.abbreviation || '?', name: t.team?.displayName, color: t.team?.color, logo: t.team?.logo, score: t.score?.displayValue ?? t.score ?? '', rec: (t.records || []).find(r => r.type === 'total')?.summary || t.records?.[0]?.summary || '', lines: (t.linescores || []).map(l => String(l.displayValue ?? l.value ?? '')), win: !!t.winner, pts: lead('points'), reb: lead('rebounds'), ast: lead('assists') };
  };
  const o = c.odds?.[0];
  return { id: e.id, date: e.date, state: st.state, detail: st.shortDetail || st.description || '', home: side('home'), away: side('away'), tv: (c.broadcasts || []).flatMap(b => b.names || []).slice(0, 2).join(', '), line: o?.details || '', ou: o?.overUnder };
}
const gameUrl = (site, lg, id) => `${site}/?league=${lg}&game=${id}`;
function scoreText(g) {
  if (g.state === 'pre') return `${g.away.ab} @ ${g.home.ab}`;
  const a = `${g.away.ab} ${g.away.score}`, h = `${g.home.ab} ${g.home.score}`;
  return g.state === 'post' ? (g.away.win ? `**${a}**, ${h}` : g.home.win ? `${a}, **${h}**` : `${a}, ${h}`) : `${a}, ${h}`;
}
function gameLine(g, site, lg) {
  const link = `[${scoreText(g)}](${gameUrl(site, lg, g.id)})`;
  if (g.state === 'pre') return /postponed|canceled|tbd/i.test(g.detail) ? `${link} · ${g.detail}` : `${link} · ${when(g.date)}${g.tv ? ' · ' + g.tv : ''}`;
  return g.state === 'in' ? `🔴 ${link} · ${g.detail}` : `${link} · ${g.detail}`;
}
async function cmdScore(i, ctx) {
  const lg = opt(i, 'team') && !opt(i, 'league') ? (findTeam(opt(i, 'team'))?.lg || 'nba') : lgOf(i);
  const off = [-1, 0, 1].includes(+opt(i, 'day')) ? +opt(i, 'day') : 0, ymd = dayET(off);
  const sb = await get(`${API(lg)}/scoreboard?dates=${ymd}`, 15), games = (sb.events || []).map(gameOf);
  if (!opt(i, 'team')) {
    const order = { in: 0, pre: 1, post: 2 };
    games.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || Date.parse(a.date) - Date.parse(b.date));
    return { embeds: [embed({ title: `${LGS[lg]} scores · ${dayLabel(ymd)}`, url: `${ctx.site}/?league=${lg}#scores`, description: games.length ? cut(games.map(g => gameLine(g, ctx.site, lg)).join('\n'), 4000) : `No ${LGS[lg]} games ${off === 0 ? 'today' : off < 0 ? 'yesterday' : 'tomorrow'}.` })], components: [button('Open Fullcourt', `${ctx.site}/?league=${lg}#scores`)] };
  }
  const t = needTeam(i), g = games.find(x => x.home.id === t.id || x.away.id === t.id);
  if (!g) {
    const { last, next } = await teamGames(t);
    const fields = [];
    if (last.length) fields.push({ name: 'Last game', value: resultLine(last[last.length - 1], t) });
    if (next.length) fields.push({ name: 'Next game', value: nextLine(next[0], t) });
    return { embeds: [embed({ title: t.full, color: colorOf(t.color), description: `No ${t.name} game ${off === 0 ? 'today' : off < 0 ? 'yesterday' : 'tomorrow'}.`, fields, thumbnail: { url: logo(t) } })] };
  }
  const mine = g.home.id === t.id ? g.home : g.away, e = { title: g.state === 'pre' ? `${g.away.name} at ${g.home.name}` : `${scoreText(g).replace(/\*\*/g, '')} · ${g.detail}`, url: gameUrl(ctx.site, lg, g.id), color: colorOf(mine.color || t.color), thumbnail: { url: logo(t) }, fields: [] };
  if (g.state === 'pre') {
    e.description = [`Tips ${when(g.date, 'F')} (${when(g.date, 'R')})`, [g.away, g.home].filter(s => s.rec).map(s => `${s.ab} ${s.rec}`).join(' · '), g.tv && `On ${g.tv}`, g.line && `Line: ${g.line}${g.ou ? ` · O/U ${g.ou}` : ''}`].filter(Boolean).join('\n');
  } else {
    const n = Math.max(g.away.lines.length, g.home.lines.length);
    if (n) {
      const head = Array.from({ length: n }, (_, k) => (k < 4 ? String(k + 1) : k === 4 ? 'OT' : `O${k - 3}`));
      const row = (ab, cells, tot) => ab.padEnd(5) + cells.map(c => String(c).padStart(4)).join('') + String(tot).padStart(5);
      e.fields.push({ name: 'By quarter', value: block([row('', head, 'T'), row(g.away.ab, g.away.lines, g.away.score), row(g.home.ab, g.home.lines, g.home.score)]) });
    }
    for (const s of [g.away, g.home]) { const l = [s.pts && `${s.pts} PTS`, s.reb && `${s.reb} REB`, s.ast && `${s.ast} AST`].filter(Boolean); if (l.length) e.fields.push({ name: `${s.ab} leaders`, value: l.join(' · '), inline: true }); }
  }
  return { embeds: [embed(e)], components: [button('Open the game in Fullcourt', gameUrl(ctx.site, lg, g.id))] };
}

/* ---------- /team ---------- */
const logo = t => `https://a.espncdn.com/i/teamlogos/${t.lg}/500/${t.ab.toLowerCase()}.png`;
async function teamGames(t) {
  const sc = await get(`${API(t.lg)}/teams/${t.id}/schedule`, 120);
  const evs = (sc.events || []).map(e => {
    const c = e.competitions?.[0] || {}, me = (c.competitors || []).find(x => String(x.team?.id) === t.id) || {}, op = (c.competitors || []).find(x => x !== me) || {};
    return { id: e.id, date: e.date, state: c.status?.type?.state, done: !!c.status?.type?.completed, home: me.homeAway === 'home', win: !!me.winner, my: me.score?.displayValue ?? '', their: op.score?.displayValue ?? '', opp: op.team?.abbreviation || '?' };
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { last: evs.filter(e => e.done), next: evs.filter(e => e.state === 'pre') };
}
const resultLine = (e, t) => `**${e.win ? 'W' : 'L'}** ${e.my}-${e.their} ${e.home ? 'vs' : '@'} ${e.opp} · ${shortDate(e.date)}`;
const nextLine = e => `${e.home ? 'vs' : '@'} ${e.opp} · ${when(e.date, 'f')}`;
async function cmdTeam(i, ctx) {
  const t = needTeam(i);
  const [d, g] = await Promise.all([get(`${API(t.lg)}/teams/${t.id}`, 120), teamGames(t).catch(() => ({ last: [], next: [] }))]);
  const T = d.team || {}, rec = k => (T.record?.items || []).find(x => x.type === k), stat = n => rec('total')?.stats?.find(s => s.name === n)?.value;
  const streak = stat('streak'), fields = [];
  const desc = [rec('total')?.summary, T.standingSummary, rec('home') && `Home ${rec('home').summary}`, rec('road') && `Away ${rec('road').summary}`, Number.isFinite(streak) && streak !== 0 && `${streak > 0 ? 'Won' : 'Lost'} ${Math.abs(streak)} in a row`].filter(Boolean).join(' · ');
  if (Number.isFinite(stat('avgPointsFor'))) fields.push({ name: 'Per game', value: `${stat('avgPointsFor').toFixed(1)} scored · ${stat('avgPointsAgainst').toFixed(1)} allowed · ${(stat('differential') > 0 ? '+' : '') + stat('differential').toFixed(1)}` });
  if (g.last.length) fields.push({ name: 'Last 5', value: g.last.slice(-5).reverse().map(e => resultLine(e, t)).join('\n'), inline: true });
  if (g.next.length) fields.push({ name: 'Next up', value: g.next.slice(0, 4).map(e => nextLine(e, t)).join('\n'), inline: true });
  return { embeds: [embed({ title: t.full, url: `${ctx.site}/?league=${t.lg}&team=${t.id}`, color: colorOf(T.color || t.color), description: desc || 'No record yet this season.', fields, thumbnail: { url: logo(t) } })], components: [button(`Open the ${t.name} in Fullcourt`, `${ctx.site}/?league=${t.lg}&team=${t.id}`)] };
}

/* ---------- /standings ---------- */
async function cmdStandings(i, ctx) {
  const lg = lgOf(i), want = opt(i, 'conference'), d = await get(`${API2(lg)}/standings`, 120);
  const groups = (d.children?.length ? d.children : [d]).map(c => ({ name: c.name || LGS[lg], rows: (c.standings?.entries || []).map(e => {
    const s = n => e.stats?.find(x => x.name === n || x.type === n);
    return { ab: e.team?.abbreviation || '?', seed: s('playoffSeed')?.value ?? 99, w: s('wins')?.value ?? 0, l: s('losses')?.value ?? 0, gb: s('gamesBehind')?.displayValue ?? '', l10: s('lasttengames')?.displayValue ?? '', strk: s('streak')?.displayValue ?? '' };
  }).sort((a, b) => a.seed - b.seed || b.w - a.w) }));
  const shown = want && groups.length > 1 ? groups.filter(g => g.name.toLowerCase().startsWith(want)) : groups;
  const wide = shown.length === 1;
  const table = g => block([(wide ? ' #  TEAM   W-L    GB   L10  STRK' : ' #  TEAM   W-L    GB'), ...g.rows.map((r, k) => `${String(k + 1).padStart(2)}  ${r.ab.padEnd(5)}${`${r.w}-${r.l}`.padStart(5)}${String(r.gb === '0' ? '-' : r.gb).padStart(6)}${wide ? `  ${r.l10.padStart(4)}  ${r.strk.padStart(4)}` : ''}`)]);
  return { embeds: [embed({ title: `${LGS[lg]} standings`, url: `${ctx.site}/?league=${lg}#standings`, fields: shown.map(g => ({ name: g.name, value: table(g), inline: !wide })) })], components: [button('Open standings in Fullcourt', `${ctx.site}/?league=${lg}#standings`)] };
}

/* ---------- /player ---------- */
async function cmdPlayer(i, ctx) {
  const p = await needPlayer(i);
  const [a, o] = await Promise.all([get(`${WEB(p.lg)}/athletes/${p.id}`, 300), get(`${WEB(p.lg)}/athletes/${p.id}/overview`, 60).catch(() => ({}))]);
  const A = a.athlete || {}, url = `${ctx.site}/?league=${p.lg}&player=${p.id}`, fields = [];
  const bio = [A.position?.displayName, A.displayJersey, A.team?.displayName, [A.displayHeight, A.displayWeight].filter(Boolean).join(', '), A.age && `Age ${A.age}`, A.college?.name, A.displayExperience].filter(Boolean).join(' · ');
  const away = A.status && A.status.type !== 'active' ? `\n**${A.status.name}**` : '';
  const S = o.statistics, reg = S?.splits?.find(x => /regular/i.test(x.displayName)) || S?.splits?.[0];
  if (reg) {
    const v = n => { const k = S.names.indexOf(n); return k < 0 ? null : reg.stats[k]; };
    fields.push({ name: a.athlete?.statsSummary?.displayName ? cut(A.statsSummary.displayName.replace(/ stats$/i, ''), 60) : 'This season', value: `**${v('avgPoints')}** PTS · **${v('avgRebounds')}** REB · **${v('avgAssists')}** AST · ${v('avgSteals')} STL · ${v('avgBlocks')} BLK\n${v('fieldGoalPct')} FG% · ${v('threePointPct')} 3P% · ${v('freeThrowPct')} FT% · ${v('avgMinutes')} MIN · ${v('gamesPlayed')} GP` });
  }
  const L = o.gameLog?.statistics?.[0];
  if (L?.events?.length) {
    const at = n => L.names.indexOf(n), row = ev => {
      const g = o.gameLog.events?.[ev.eventId] || {}, s = n => ev.stats[at(n)] ?? '-';
      return `${shortDate(g.gameDate)} ${g.atVs || ''} ${g.opponent?.abbreviation || ''} · ${g.gameResult || ''} ${g.score || ''} · **${s('points')}** pts, ${s('totalRebounds')} reb, ${s('assists')} ast`;
    };
    fields.push({ name: `Last ${Math.min(5, L.events.length)}`, value: cut(L.events.slice(0, 5).map(row).join('\n'), 1024) });
  }
  const n = o.nextGame?.league?.events?.[0];
  if (n && n.status === 'pre') fields.push({ name: 'Next game', value: `${n.shortName} · ${when(n.date, 'f')}` });
  else if (n && n.status === 'in') fields.push({ name: 'Playing now', value: `[${n.shortName}](${gameUrl(ctx.site, p.lg, n.id)})` });
  return { embeds: [embed({ title: A.displayName || p.name, url, color: colorOf(A.team?.color), description: bio + away, fields, thumbnail: A.headshot?.href ? { url: A.headshot.href } : undefined })], components: [button(`Open ${cut(A.displayName || p.name, 40)} in Fullcourt`, url)] };
}

/* ---------- /leaders ---------- */
async function cmdLeaders(i, ctx) {
  const lg = lgOf(i), S = STATS.find(s => s[2] === opt(i, 'stat')) || STATS[0];
  const d = await get(`${WEB(lg)}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=10&sort=${S[1]}.${S[2]}:desc`, 300);
  const k = d.categories?.find(c => c.name === S[1])?.names?.indexOf(S[2]) ?? -1;
  const rows = (d.athletes || []).map((x, n) => { const c = x.categories?.find(q => q.name === S[1]); return `${n + 1}. **${x.athlete?.displayName}** ${x.athlete?.teamShortName || ''} · ${c?.totals?.[k] ?? c?.values?.[k] ?? '-'}`; });
  return { embeds: [embed({ title: `${LGS[lg]} leaders · ${S[0]}`, url: `${ctx.site}/?league=${lg}#leaders`, description: rows.length ? rows.join('\n') : `No ${LGS[lg]} leaders yet this season.` })], components: [button('Open leaders in Fullcourt', `${ctx.site}/?league=${lg}#leaders`)] };
}

/* ---------- /props ---------- */
const MARKETS = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: 'Threes', pra: 'Pts+Reb+Ast', pr: 'Pts+Reb', pa: 'Pts+Ast', ra: 'Reb+Ast', stl: 'Steals', blk: 'Blocks', sb: 'Stl+Blk' };
const BOOK = { draftkings: 'DK', fanduel: 'FD', espnbet: 'ESPN', betmgm: 'MGM', caesars: 'CZR', fanatics: 'FAN', hardrockbet: 'HR', bet365: '365', bovada: 'BOV', betrivers: 'BR' };
const price = n => (Number.isFinite(n) ? (n > 0 ? '+' + n : String(n)) : '–');
async function cmdProps(i, ctx) {
  const p = await needPlayer(i);
  if (p.lg !== 'nba') throw new Say('Prop lines are NBA only for now.');
  const d = await get(`${RAW}/odds-data/odds.json?t=${Math.floor(Date.now() / 300e3)}`, 120);
  let ev = null, st = null;
  for (const e of d.events || []) { const k = Object.keys(e.props || {}).find(n => norm(n) === norm(p.name)); if (k) { ev = e; st = e.props[k]; break; } }
  const rows = st ? Object.keys(MARKETS).filter(k => st[k] && Object.keys(st[k].books || {}).length).map(k => {
    const bs = Object.entries(st[k].books), same = bs.every(([, v]) => v.l === bs[0][1].l);
    return `**${MARKETS[k]}${same ? ' ' + bs[0][1].l : ''}** · ${bs.map(([b, v]) => `${BOOK[b] || b.slice(0, 3).toUpperCase()} ${same ? '' : v.l + ' '}${price(v.o)} / ${price(v.u)}`).join(' · ')}`;
  }) : [];
  const url = `${ctx.site}/?league=nba#bets`;
  if (!rows.length) return { embeds: [embed({ title: `${p.name} props`, url, description: `No sportsbook lines for ${p.name} right now. Lines usually go up the morning of a game.` })], components: [button('Open the Bet Desk', url)] };
  return { embeds: [embed({ title: `${p.name} props · ${ev.away} @ ${ev.home}`, url, description: cut(`${rows.join('\n')}\n\nPrices are over / under. Tip-off ${when(ev.starts, 'f')} · lines read ${when(d.updated, 'R')}`, 4000) })], components: [button('Open the Bet Desk', url)] };
}

/* ---------- /injuries ---------- */
async function cmdInjuries(i, ctx) {
  const t = needTeam(i), d = await get(`${API(t.lg)}/injuries`, 300);
  const list = (d.injuries || []).find(x => String(x.id) === t.id)?.injuries || [];
  const rows = list.slice(0, 12).map(x => `**${x.athlete?.displayName}** · ${x.status}${x.date ? ' · ' + shortDate(x.date) : ''}\n${cut(x.shortComment || x.longComment || '', 160)}`);
  return { embeds: [embed({ title: `${t.full} injury report`, url: `${ctx.site}/?league=${t.lg}&team=${t.id}`, color: colorOf(t.color), description: rows.length ? cut(rows.join('\n\n'), 4000) : 'No injuries listed.', thumbnail: { url: logo(t) } })] };
}

/* ---------- /highlights ---------- */
async function cmdHighlights(i, ctx) {
  const raw = opt(i, 'team'), t = raw ? needTeam(i) : null, lg = t ? t.lg : lgOf(i);
  const d = await get(`${RAW}/yt-data/highlights.json?t=${Math.floor(Date.now() / 600e3)}`, 300);
  let vids;
  if (lg === 'nba') {
    const nick = t && norm(t.name).replace(/ /g, '');
    vids = Object.entries(d.games || {}).filter(([k, v]) => v?.id && (!v.lg || v.lg === 'nba') && (!nick || k.split('|').slice(1).includes(nick))).map(([k, v]) => ({ d: k.slice(0, 8), id: v.id, title: v.title, at: v.at }));
  } else {
    vids = Object.values(d.wnba || {}).filter(v => v?.fgh?.id && (!t || norm(v.fgh.title).includes(norm(t.name)))).map(v => ({ d: v.d, id: v.fgh.id, title: v.fgh.title, at: v.fgh.at }));
  }
  vids.sort((a, b) => b.d.localeCompare(a.d) || String(b.at).localeCompare(String(a.at)));
  const name = v => `${v.title.split(' | ')[0].replace(/\b([A-Z0-9])([A-Z0-9]+)\b/g, (m, a, b) => (m === 'NBA' || m === 'WNBA' ? m : a + b.toLowerCase())).replace(/\bAt\b/, 'at').replace(/\bVs\b/, 'vs')} · ${dayLabel(v.d)}`;
  if (!vids.length) throw new Say(t ? `No full game highlights for the ${t.name} yet.` : `No ${LGS[lg]} highlights yet.`);
  // one video: post the link itself so Discord shows the player
  if (t) return { content: `**${name(vids[0])}**\nhttps://www.youtube.com/watch?v=${vids[0].id}` };
  return { embeds: [embed({ title: `${LGS[lg]} full game highlights`, url: `${ctx.site}/?league=${lg}#replay`, description: vids.slice(0, 10).map(v => `[${name(v)}](https://www.youtube.com/watch?v=${v.id})`).join('\n') })], components: [button('Open Replay in Fullcourt', `${ctx.site}/?league=${lg}#replay`)] };
}

const RUN = { score: cmdScore, standings: cmdStandings, player: cmdPlayer, team: cmdTeam, leaders: cmdLeaders, props: cmdProps, injuries: cmdInjuries, highlights: cmdHighlights };

// One interaction in, one Discord response out. ctx: { site, waitUntil }.
export async function handle(i, ctx) {
  if (i.type === 1) return { type: 1 }; // Discord checking the address is alive
  if (i.type === 4) return { type: 8, data: { choices: await Promise.race([complete(i).catch(() => []), sleep(2500).then(() => [])]) } };
  if (i.type !== 2 || !RUN[i.data?.name]) return { type: 4, data: { content: 'I don\'t know that command.', flags: 64 } };
  const work = RUN[i.data.name](i, ctx).catch(e => (e instanceof Say ? { content: e.message, flags: 64 } : (console.log('command failed:', i.data.name, e?.message), { content: 'The stats feed didn\'t answer just now. Try again in a minute.', flags: 64 })));
  // Discord wants an answer within 3 seconds. Usually the data is back well inside that; when it isn't, say "thinking" and fill it in after
  const quick = await Promise.race([work, sleep(2200).then(() => null)]);
  if (quick) return { type: 4, data: quick };
  ctx.waitUntil(work.then(data => fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })).catch(() => {}));
  return { type: 5 };
}
