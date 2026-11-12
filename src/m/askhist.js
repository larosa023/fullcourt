/* Ask, NBA history beyond one season's stat lines: drafts, career totals, accolades and rings, champions and playoff
   series, searches across every season ("players who averaged 30 and 10", "best seasons at age 19", "50-40-90
   seasons"), bios of retired players, franchise history and the record book. The data is built weekly from
   Basketball-Reference (tools/eras.mjs, era-data branch). histAnswer() returns null when the question isn't one of
   these, and Ask carries on to its other answers. */
const AH_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/era-data' + (IS_W ? '/wnba' : '');
const ahP = {};
const ahGet = (name, hours = 24) => ahP[name] || (ahP[name] = fetch(`${AH_URL}/${name}.json?t=${Math.floor(Date.now() / (hours * 3600e3))}`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(e => { delete ahP[name]; throw e; }));
const ahObj = (cols, r) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; };
const ahM = {};
const ahOnce = (k, fn) => ahM[k] || (ahM[k] = fn().catch(e => { delete ahM[k]; throw e; }));
const ahSeasons = () => ahOnce('table', async () => { const d = await ahGet('table'); return { rows: d.rows.map(r => ahObj(d.cols, r)), games: d.games }; });
const ahCareers = () => ahOnce('careers', async () => { const d = await ahGet('careers'); return new Map(d.players.map(r => [r[0], ahObj(d.cols, r)])); });
const ahTeams = () => ahOnce('teams', async () => { const d = await ahGet('teams'); return d.rows.map(r => ahObj(d.cols, r)); });
const ahBios = () => ahOnce('bio', async () => { if (IS_W) return new Map(); const d = await ahGet('bio', 24 * 7); return new Map(d.players.map(r => [r[0], ahObj(d.cols, r)])); }); // no bios for the WNBA yet
const ahDrafts = () => ahOnce('draft', async () => { const d = await ahGet('draft', 24 * 7); const by = new Map(); for (const [y, L] of Object.entries(d.years)) for (const r of L) { const o = { y: +y, ...ahObj(d.cols, r) }; if (o.id && !by.has(o.id)) by.set(o.id, o); } return { years: Object.fromEntries(Object.entries(d.years).map(([y, L]) => [y, L.map(r => ({ y: +y, ...ahObj(d.cols, r) }))])), by }; });
const ahN = n => (n == null || !Number.isFinite(+n) ? '–' : Math.round(+n).toLocaleString('en-US'));
const ahJoin = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const ahFt = inch => (inch ? `${Math.floor(inch / 12)}'${inch % 12}"` : '');
const ahDate = iso => { const d = new Date(iso); return Number.isFinite(+d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''; };
const ahSeason = y => (IS_W ? String(y) : `${y - 1}-${String(y).slice(2)}`);
const ahPo = po => (!po ? 'missed the playoffs' : po === 'Champions' ? 'won the title' : /Tiebreaker/.test(po) ? 'missed the playoffs' : `lost in the ${po.replace(/^Lost /, '').replace(/ (Finals|Semifinals|First Round|Quarterfinals)$/, (m, w) => ` ${w === 'Finals' ? 'Finals' : w.toLowerCase()}`).replace(/^Finals$/, 'Finals')}`);
// still playing: in this season's data (the WNBA's "current" season is next year's for half the year)
const ahLive = (p, I) => !!p && p.y1 >= I.cur - (IS_W ? 1 : 0);
const ahTimes = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// the stats history questions name. tot: the season/career total. rate: a per-game or percentage column in the seasons table
const AH_STATS = [
  { k: 'td', re: / (triple doubles?) /, word: 'triple-doubles', tot: 'tdT' },
  { k: 'ws', re: / (win shares?) /, word: 'win shares', rate: 'ws', dp: 1, from: 1947 },
  { k: 'per', re: / (per|player efficiency( rating)?|efficiency rating) /, word: 'PER', rate: 'per', dp: 1 },
  { k: 'ts', re: / (true shooting( percent\w*)?|ts percent\w*|shooting seasons?|most efficient( scoring)?( seasons?)?) /, word: 'true shooting', rate: 'ts', pct: 1, min: r => r.pts >= 12 },
  { k: 'usg', re: / (usage( rate)?|usg) /, word: 'usage rate', rate: 'usg', dp: 1, from: 1978 },
  { k: 'bpm', re: / (bpm|box plus minus) /, word: 'box plus/minus', rate: 'bpm', dp: 1, from: 1974 },
  { k: 'tpp', re: / (three point (percent\w*|pct|shoot\w*)|3 point (percent\w*|pct|shoot\w*)|3p percent\w*|3pt percent\w*|percent\w* from (three|deep)|shoot\w* from (three|deep)) /, word: 'three-point percentage', rate: 'tpp', pct: 1, from: 1980, min: r => r.tpa >= 2 },
  { k: 'ftp', re: / (free throw (percent\w*|pct|shoot\w*)|ft percent\w*|from the (line|stripe)) /, word: 'free throw percentage', rate: 'ftp', pct: 1, min: r => r.fta >= 2 },
  { k: 'fgp', re: / (field goal (percent\w*|pct)|fg percent\w*|shooting percent\w*) /, word: 'field goal percentage', rate: 'fgp', pct: 1, min: r => r.pts >= 10 },
  { k: 'tp', re: / (threes|3s|three pointers?|3 pointers?|3pm|3pt|made threes) /, word: 'threes', rate: 'tp', tot: 'tpT', dp: 1, from: 1980 },
  { k: 'pts', re: / (points?|pts|ppg|scor(ers?|ing|ed|e)|buckets) /, word: 'points', rate: 'pts', tot: 'ptsT', dp: 1 },
  { k: 'trb', re: / (rebound(s|ers?|ing)?|boards|rpg) /, word: 'rebounds', rate: 'trb', tot: 'trbT', dp: 1, from: 1951 },
  { k: 'ast', re: / (assists?|apg|dimes|passers?) /, word: 'assists', rate: 'ast', tot: 'astT', dp: 1 },
  { k: 'stl', re: / (steals?|spg) /, word: 'steals', rate: 'stl', tot: 'stlT', dp: 1, from: 1974 },
  { k: 'blk', re: / (blocks?|bpg|blocked shots|shot blockers?) /, word: 'blocks', rate: 'blk', tot: 'blkT', dp: 1, from: 1974 },
  { k: 'mp', re: / (minutes|mpg) /, word: 'minutes', rate: 'mp', tot: 'mpT', dp: 1 },
  { k: 'g', re: / (games( played)?) /, word: 'games', tot: 'g' },
];
const ahStat = nn => AH_STATS.find(s => s.re.test(nn)) || null;
const ahFmt = (s, v) => (v == null || !Number.isFinite(+v) ? '–' : s.pct ? `${(v * 100).toFixed(1)}%` : (+v).toFixed(s.dp ?? 0));
const AH_AW = [
  { k: 'MVP', re: / (mvps?|most valuable( players?)?) /, name: 'MVP', plural: 'MVPs' }, { k: 'DPOY', re: / (dpoys?|dpoty|defensive players? of the year|defensive player) /, name: 'Defensive Player of the Year', plural: 'Defensive Player of the Year awards' },
  { k: 'ROY', re: / (roy|roty|rookies? of the year) /, name: 'Rookie of the Year', plural: 'Rookie of the Year awards' }, { k: '6MOY', re: / (6moy|smoy|(sixth|6th) (m[ae]n|woman|women|player)( of the year)?) /, name: IS_W ? 'Sixth Player of the Year' : 'Sixth Man of the Year', plural: IS_W ? 'Sixth Player awards' : 'Sixth Man awards' },
  { k: 'MIP', re: / (mip|most improved( players?)?) /, name: 'Most Improved Player', plural: 'Most Improved Player awards' }, { k: 'CPOY', re: / (cpoy|clutch players? of the year) /, name: 'Clutch Player of the Year', plural: 'Clutch Player awards' },
];
const AH_POS = [[/ (centers?|big men|bigs) /, /C/, 'centers'], [/ (point guards?) /, /PG/, 'point guards'], [/ (shooting guards?) /, /SG/, 'shooting guards'], [/ (guards?) /, /G/, 'guards'], [/ (small forwards?) /, /SF/, 'small forwards'], [/ (power forwards?) /, /PF/, 'power forwards'], [/ (forwards?|wings?) /, /F/, 'forwards']];
// single-game records that have stood for decades
const AH_GAME = [
  [/ (points?|scor\w*|100) /, 'points', 'Wilt Chamberlain scored <b>100 points</b> for the Philadelphia Warriors against the Knicks on March 2, 1962. It is still the most in an NBA game.', 'chambwi01'],
  [/ (rebounds?|boards) /, 'rebounds', 'Wilt Chamberlain grabbed <b>55 rebounds</b> against the Celtics on November 24, 1960, the most in an NBA game.', 'chambwi01'],
  [/ (assists?|dimes) /, 'assists', 'Scott Skiles had <b>30 assists</b> for the Magic against the Nuggets on December 30, 1990, the most in an NBA game.', 'skilesc01'],
  [/ (blocks?) /, 'blocks', 'Elmore Smith blocked <b>17 shots</b> for the Lakers against the Trail Blazers on October 28, 1973, the most since blocks were first counted that season.', 'smithel01'],
  [/ (steals?) /, 'steals', 'The record is <b>11 steals</b> in a game: Larry Kenon for the Spurs in 1976 and Kendall Gill for the Nets in 1999.', 'kenonla01'],
];

/* ---------------- people ---------------- */
function ahLink(p, X) {
  const now = X.rows?.find(r => X.E.eraFold(r.name) === p.key && p.y1 >= X.I.cur - 1);
  const L = X.Hd?.legends?.[p.id], espn = now?.id || p.espn || L?.espn || X.Hd?.espn?.[p.id] || null;
  return { espn, attr: now ? `data-player="${esc(now.id)}"` : L ? `data-hleg="${esc(p.id)}"` : espn ? `data-hespn="${esc(espn)}"` : '' };
}
function ahRow(p, value, sub, X) {
  if (!p) return '';
  const { espn, attr } = ahLink(p, X), own = X.H?.ownKey?.(p.id);
  const noPhoto = (X.Hd?.nophoto || []).includes(espn) || X.Hd?.legends?.[p.id]?.photo === false;
  const ph = own ? `<img class="ask-face" src="${new URL(`data/photos/${own}.webp`, ASSET_BASE).href}" alt="" loading="lazy" draggable="false">` : face(noPhoto ? null : espn, p.name, 'ask-face', 120);
  return `<button class="ask-li" ${attr}>${ph}<span class="nm"><b>${esc(p.name)}</b><small>${esc(sub || '')}</small></span>${value != null ? `<span class="v">${value}</span>` : ''}</button>`;
}
const ahTbl = (head, rows) => `<div class="ask-tbl-wrap"><table class="ask-tbl ec-tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const ahTr = (p, X, cells, rank) => { const a = p ? ahLink(p, X).attr : ''; return `<tr ${a}${a ? ' style="cursor:pointer"' : ''}><td>${rank != null ? `<i class="ec-rk">${rank}</i>` : ''}${esc(p?.name || '')}</td>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`; };
const ahP1 = (I, id, name) => I.byId.get(id) || { id, name: name || id, key: nameKey(name || id), y0: 0, y1: 0, score: 0 };
// a side-by-side card of seasons: items [{ p, line, head }]
async function ahCard(X, items, title, sub, keys, foot) {
  const E = X.E, cols = await Promise.all(items.map(it => E.eraCol(it.p, it.line, X, it.head, it.sub)));
  const std = keys.filter(k => E.ERA_ROW[k]), extra = keys.filter(k => !E.ERA_ROW[k]);
  const rows = [...extra.map(k => { const s = AH_STATS.find(x => x.k === k || x.rate === k || x.tot === k); return { lab: { per: 'PER', ts: 'TS%', usg: 'USG%', ws: 'WS', bpm: 'BPM', ptsT: 'PTS', trbT: 'REB', astT: 'AST', age: 'AGE' }[k] || k.toUpperCase(), vals: items.map(it => (k === 'age' ? String(it.line.age ?? '–') : /T$/.test(k) ? ahN(it.line[k]) : ahFmt(s || {}, it.line[k]).replace('%', ''))) }; }), ...E.eraRowsFor(std, items.map(it => it.line))];
  return E.ecHTML({ title, sub, cols, rows, foot });
}

/* ---------------- teams across time ---------------- */
// the franchise a question means: a current team (with every name and city it has had) or an old name ("Sonics", "Bullets")
async function ahFranchise(Q, X) {
  const TM = await ahTeams(), E = X.E;
  const t = Q.teams[0];
  if (t) return { t, name: t.name, short: t.short || t.name, rows: TM.filter(r => E.eraAbbr(r.ab) === t.abbr) };
  const nn = Q.nn.replace(/ sonics /, ' supersonics ');
  const seen = new Map();
  for (const r of TM) { const w = nameKey(r.name).split(' '), nick = w.at(-1), nick2 = w.slice(-2).join(' '); for (const k of [nick2, nick]) if (k.length >= 4 && !seen.has(k)) seen.set(k, r); }
  for (const [k, r] of [...seen].sort((a, b) => b[0].length - a[0].length)) if (nn.includes(` ${k} `)) {
    const fr = E.eraAbbr(r.ab), rows = TM.filter(x => E.eraAbbr(x.ab) === fr), mine = rows.filter(x => nameKey(x.name).endsWith(k));
    const cur = Object.values(S.teams).find(x => x.abbr === fr);
    return { t: cur || null, name: mine.at(-1)?.name || r.name, short: mine.at(-1)?.name.split(' ').at(-1) || k, rows: mine.length ? mine : rows, old: !cur || !nameKey(cur.name).endsWith(k) };
  }
  return null;
}
const ahTeamName = (TM, y, ab) => TM.find(r => r.y === y && r.ab === ab)?.name || ab;
const ahNick = name => String(name).split(' ').slice(/Trail Blazers$/.test(name) ? -2 : -1).join(' ');

/* ---------------- the draft ---------------- */
async function ahDraft(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  if (!has(/ (draft\w*|picks?|picked|selected|taken|lottery|undrafted|went (first|second|third|number|no)) /)) return null;
  const D = await ahDrafts(), yrs = Object.keys(D.years).map(Number), last = Math.max(...yrs);
  const y = X.years.find(v => D.years[v]) || (has(/ last (year s|years|year) draft | (this|the latest|most recent) draft /) ? last : null);
  const ord = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  const pm = nn.match(/ (?:no|number|pick|#) ?(\d{1,2}) /) || nn.match(/ (\d{1,2})(?:st|nd|rd|th) (?:overall |pick )/), pw = nn.match(/ (first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|seventh|eighth|ninth|tenth) (?:overall |pick|picks|selection)/) || nn.match(/ went (first|second|third|fourth|fifth) /);
  const pick = pm ? +pm[1] : pw ? ord[pw[1]] : has(/ (top pick|number one|no 1|#1) /) ? 1 : null;
  const nameOf = o => (o.id ? I.byId.get(o.id)?.name : null) || o.name, tmName = ab => Object.values(S.teams).find(t => t.abbr === X.E.eraAbbr(ab))?.short || ab;
  const p = X.ps[0];
  // one player: where he went
  if (p && !has(/ (best|top|class|steals?|busts?) /)) {
    const d = D.by.get(p.id);
    if (!d) {
      if (p.y0 && p.y0 < 1948) return null;
      return { text: `${esc(p.name)} wasn't drafted${p.y0 ? `; he came into the league in ${ahSeason(p.y0)}` : ''}.`, html: card(ahRow(p, 'Undrafted', p.y0 ? `Debut ${ahSeason(p.y0)}` : '', X)), ...X.out };
    }
    const L = D.years[d.y];
    if (has(/ (before|ahead of|after|behind|right after|right before|picks? (before|after)) /)) {
      const before = has(/ (before|ahead of) /), near = L.filter(o => (before ? o.pick < d.pick : o.pick > d.pick)).sort((a, b) => (before ? a.pick - b.pick : a.pick - b.pick)).slice(before ? -Math.min(6, d.pick - 1) : 0, before ? undefined : 5);
      if (!near.length) return { text: `Nobody: ${esc(p.name)} was the first pick of the ${d.y} draft, by the ${esc(tmName(d.tm))}.`, html: card(ahRow(p, '#1', `${d.y} · ${d.tm}`, X)), ...X.out };
      return { text: `${esc(p.name)} went <b>${X.E.eraOrd(d.pick)}</b> in ${d.y}. ${before ? 'Picked ahead of him' : 'Taken right after him'}: ${ahJoin(near.map(o => `${esc(nameOf(o))} (${o.pick}, ${esc(o.tm)})`))}.`, html: card(ahTbl(['Pick', 'Team', 'Player', 'College'], L.filter(o => Math.abs(o.pick - d.pick) <= 6).map(o => `<tr${o.id === p.id ? ' class="me"' : ''}><td>${o.pick}</td><td>${esc(o.tm)}</td><td>${o.id === p.id ? '<b>' : ''}${esc(nameOf(o))}${o.id === p.id ? '</b>' : ''}</td><td>${esc(o.college || '')}</td></tr>`))), ...X.out };
    }
    return { text: `The ${esc(tmName(d.tm))} took ${esc(p.name)} with the <b>${X.E.eraOrd(d.pick)} pick</b> of the ${d.y} draft${d.round > 1 ? ` (round ${d.round})` : ''}${d.college ? `, out of ${esc(d.college)}` : ''}.`, html: card(ahRow(p, `#${d.pick}`, `${d.y} draft · ${d.tm}${d.college ? ` · ${d.college}` : ''}`, X)), ...X.out };
  }
  // a list of first picks
  if (!y && pick === 1 && has(/ (list|every|all|history|picks|by year|since|recent|last) /)) {
    const L = yrs.sort((a, b) => b - a).slice(0, 20).map(v => D.years[v].find(o => o.pick === 1)).filter(Boolean);
    return { text: `The last ${L.length} No. 1 picks, newest first. ${esc(nameOf(L[0]))} went first in ${L[0].y}.`, html: card(ahTbl(['Year', 'Team', 'Player', 'College'], L.map(o => `<tr><td>${o.y}</td><td>${esc(o.tm)}</td><td>${esc(nameOf(o))}</td><td>${esc(o.college || '')}</td></tr>`))), ...X.out };
  }
  if (!y) return null;
  const L = D.years[y];
  const team = Q.teams[0] || null;
  if (team) {
    const mine = L.filter(o => X.E.eraAbbr(o.tm) === team.abbr);
    if (!mine.length) return { text: `The ${esc(team.short || team.name)} didn't make a pick in the ${y} draft (or traded it before draft night).`, ...X.out };
    return { text: `In the ${y} draft the ${esc(team.short || team.name)} took ${ahJoin(mine.slice(0, 4).map(o => `<b>${esc(nameOf(o))}</b> (${X.E.eraOrd(o.pick)})`))}${mine.length > 4 ? ' and others' : ''}.`, html: card(ahTbl(['Pick', 'Player', 'College'], mine.map(o => `<tr><td>${o.pick}</td><td>${esc(nameOf(o))}</td><td>${esc(o.college || '')}</td></tr>`))), ...X.out };
  }
  if (pick && !has(/ (top \d+|best) /)) {
    const o = L.find(v => v.pick === pick); if (!o) return { text: `I don't have a ${X.E.eraOrd(pick)} pick for the ${y} draft.`, ...X.out };
    const pl = o.id && I.byId.get(o.id);
    return { text: `<b>${esc(nameOf(o))}</b> was the ${X.E.eraOrd(pick)} pick of the ${y} draft, taken by the ${esc(tmName(o.tm))}${o.college ? ` out of ${esc(o.college)}` : ''}.`, html: card((pl ? ahRow(pl, `#${pick}`, `${y} draft · ${o.tm}`, X) : '') + ahTbl(['Pick', 'Team', 'Player', 'College'], L.slice(0, 10).map(v => `<tr><td>${v.pick}</td><td>${esc(v.tm)}</td><td>${esc(nameOf(v))}</td><td>${esc(v.college || '')}</td></tr>`))), ...X.out };
  }
  if (has(/ (best|greatest|top players|steals?|class) /) && !has(/ top (\d+) picks? /)) {
    const B = L.filter(o => o.id && I.byId.get(o.id)).map(o => ({ o, p: I.byId.get(o.id) })).sort((a, b) => b.p.score - a.p.score).slice(0, 8);
    const C = await ahCareers();
    return { text: `The best careers out of the ${y} draft: ${ahJoin(B.slice(0, 4).map(x => `<b>${esc(x.p.name)}</b> (${X.E.eraOrd(x.o.pick)} pick)`))}. ${esc(nameOf(L[0]))} went first.`,
      html: card(B.map(x => { const c = C.get(x.p.id); return ahRow(x.p, `#${x.o.pick}`, `${x.o.tm} · ${c ? `${ahN(c.ptsT)} pts` : ''}${c?.aw?.AS ? ` · ${c.aw.AS}× All-Star` : ''}`, X); }).join('')), ...X.out };
  }
  const n = Math.min(30, +(nn.match(/ top (\d{1,2}) /)?.[1] || 0) || 10);
  return { text: `<b>${esc(nameOf(L[0]))}</b> went first in the ${y} draft, to the ${esc(tmName(L[0].tm))}. ${L[1] ? `${esc(nameOf(L[1]))} (${esc(L[1].tm)}) and ${esc(nameOf(L[2]))} (${esc(L[2].tm)}) followed.` : ''}`, html: card(ahTbl(['Pick', 'Team', 'Player', 'College'], L.slice(0, n).map(o => { const pl = o.id && I.byId.get(o.id); const a = pl ? ahLink(pl, X).attr : ''; return `<tr ${a}${a ? ' style="cursor:pointer"' : ''}><td>${o.pick}</td><td>${esc(o.tm)}</td><td>${esc(nameOf(o))}</td><td>${esc(o.college || '')}</td></tr>`; }))), ...X.out };
}

/* ---------------- careers: totals, accolades, rings ---------------- */
const ahAwCount = (c, k) => (k === 'NBA' ? (c.aw.NBA1 || 0) + (c.aw.NBA2 || 0) + (c.aw.NBA3 || 0) : k === 'DEF' ? (c.aw.DEF1 || 0) + (c.aw.DEF2 || 0) : c.aw[k] || 0);
const ahFmvps = (X, id) => (X.Hd?.champions || []).filter(c => c.fmvpId === id).map(c => c.y);
function ahResume(c, X, id) {
  const b = [], n = (k, one, many) => { const v = ahAwCount(c, k); if (v) b.push(`${v}× ${v === 1 ? one : many || one}`); };
  if (c.rings.length) b.push(`${c.rings.length}× champion`);
  n('MVP', 'MVP'); const fm = ahFmvps(X, id).length; if (fm) b.push(`${fm}× Finals MVP`);
  n('AS', 'All-Star'); n('NBA', 'All-NBA'); n('DEF', 'All-Defensive'); n('DPOY', 'Defensive Player of the Year'); n('ROY', 'Rookie of the Year'); n('6MOY', 'Sixth Man of the Year'); n('MIP', 'Most Improved');
  if (c.ldr[0]) b.push(`${c.ldr[0]}× scoring champion`); if (c.ldr[1]) b.push(`${c.ldr[1]}× rebounding leader`); if (c.ldr[2]) b.push(`${c.ldr[2]}× assists leader`);
  return b;
}
async function ahCareer(X, Q) {
  const { nn, I } = X, has = re => re.test(nn), p = X.ps[0];
  if (IS_W && has(/ all ?stars? /)) return { text: `I don't have WNBA All-Star rosters yet. I do have MVP and award voting, All-WNBA and All-Defensive teams, titles and career totals.`, ...X.out };
  const C = await ahCareers();
  const st = ahStat(nn), aw = AH_AW.find(a => a.re.test(nn));
  const acc = has(/ (all ?stars?|all star (games?|selections?|appearances?|teams?)) /) ? ['AS', 'All-Star selections', 'an All-Star', 'All-Star teams'] : has(/ all w?nba /) ? ['NBA', 'All-NBA teams', 'All-NBA'] : has(/ (all defensive|all defense) /) ? ['DEF', 'All-Defensive teams', 'All-Defensive'] : aw ? [aw.k, aw.plural, aw.name] : null;
  const rings = has(/ (rings?|championships?|titles?|champions?|chips?|won it all) /) && !has(/ (scoring|rebounding|assists?|steals?|blocks?) (titles?|champions?) /);
  const fmvp = has(/ finals mvps? /);
  const ldrK = has(/ scoring (titles?|champions?|crowns?) /) ? [0, 'scoring titles', 'pts'] : has(/ (rebounding|rebound) (titles?|champions?|crowns?) /) ? [1, 'rebounding titles', 'trb'] : has(/ assists? (titles?|champions?|crowns?) /) ? [2, 'assists titles', 'ast'] : has(/ steals? (titles?|champions?) /) ? [3, 'steals titles', 'stl'] : has(/ blocks? (titles?|champions?) /) ? [4, 'blocks titles', 'blk'] : null;
  const most = has(/ (most|leaders?|all time|who has the most|record for|ever|in history|list of|top \d+|highest|kings?) /);
  const count = has(/ (how many|number of|total|count|times) /);
  const post = has(/ (playoffs?|postseason) /);

  // one player
  if (p && !X.ps[1]) {
    const c = C.get(p.id); if (!c) return null;
    if (fmvp) { const ys = ahFmvps(X, p.id); return { text: ys.length ? `${esc(p.name)} won <b>${ys.length} Finals MVP${ys.length > 1 ? 's' : ''}</b>: ${ys.sort().join(', ')}.` : `${esc(p.name)} never won Finals MVP${c.rings.length ? `, though he won ${c.rings.length === 1 ? 'a title' : `${c.rings.length} titles`} (${c.rings.join(', ')})` : ''}.`, html: card(ahRow(p, ys.length ? `${ys.length}×` : '0', 'Finals MVP', X)), ...X.out }; }
    if (ldrK && !has(/ (who|which) /)) { const n = c.ldr[ldrK[0]]; const AW = (await ahGet('awards')).years; const ys = Object.keys(AW).filter(y => AW[y].ldr?.[ldrK[2]]?.[0] === p.id); return { text: n ? `${esc(p.name)} won <b>${n} ${n === 1 ? ldrK[1].replace(/s$/, '') : ldrK[1]}</b>: ${ys.map(y => ahSeason(+y)).join(', ')}.` : `${esc(p.name)} never led the league in ${ldrK[2] === 'pts' ? 'scoring' : ldrK[1].replace(/ titles/, '')}.`, html: card(ahRow(p, `${n}×`, ldrK[1], X)), ...X.out }; }
    if (rings && !has(/ (team|teams|franchise|finals mvp|beat|lost to|playoffs?) /) && !X.y && !Q.teams.length) {
      const TM = await ahTeams(), n = c.rings.length;
      const by = c.rings.map(y => `${y} (${ahNick(ahTeamName(TM, y, (TM.find(r => r.y === y && r.po === 'Champions') || {}).ab))})`);
      return { text: n ? `${esc(p.name)} won <b>${n} championship${n > 1 ? 's' : ''}</b>: ${by.join(', ')}.` : `${esc(p.name)} never won a championship.`, html: card(ahRow(p, `${n}×`, 'NBA champion', X)), ...X.out };
    }
    if (acc && (count || has(/ (did|does|has|have|make|made|win|won|selections?|appearances?|teams?|was|is|ever) /)) && !X.y) {
      const n = ahAwCount(c, acc[0]);
      const split = acc[0] === 'NBA' && n ? ` (${[['NBA1', 'First'], ['NBA2', 'Second'], ['NBA3', 'Third']].filter(([k]) => c.aw[k]).map(([k, w]) => `${c.aw[k]} ${w} Team`).join(', ')})` : acc[0] === 'DEF' && n ? ` (${[['DEF1', 'First'], ['DEF2', 'Second']].filter(([k]) => c.aw[k]).map(([k, w]) => `${c.aw[k]} ${w} Team`).join(', ')})` : '';
      const AW = (await ahGet('awards')).years, ys = ['MVP', 'DPOY', 'ROY', '6MOY', 'MIP', 'CPOY'].includes(acc[0]) ? Object.keys(AW).filter(y => AW[y][acc[0]]?.[0]?.[0] === p.id && AW[y][acc[0]][0][1] === 1) : [];
      const text = ['AS', 'NBA', 'DEF'].includes(acc[0]) ? (n ? `${esc(p.name)} made <b>${n} ${n === 1 ? (acc[3] || acc[1]).replace(/s$/, '') : acc[3] || acc[1]}</b>${split}.` : `${esc(p.name)} never made ${acc[2] === 'an All-Star' ? 'an All-Star team' : `an ${acc[2]} team`}.`)
        : n ? `${esc(p.name)} won ${acc[2] === 'MVP' ? 'MVP' : `the ${acc[2]} award`} <b>${ahTimes(n)}</b>${ys.length ? `: ${ys.map(y => ahSeason(+y)).join(', ')}` : ''}.` : `${esc(p.name)} never won ${acc[2] === 'MVP' ? 'MVP' : `the ${acc[2]} award`}.`;
      return { text, html: card(ahRow(p, `${n}×`, acc[1], X)), ...X.out };
    }
    if (has(/ (accolades|awards|resume|honors|achievements|accomplishments|trophies|what did .* win) /)) {
      const b = ahResume(c, X, p.id);
      return { text: b.length ? `${esc(p.name)}: ${b.join(', ')}.` : `${esc(p.name)} didn't win any of the major awards.`, html: card(ahRow(p, null, `${ahSeason(p.y0)} to ${ahSeason(p.y1)} · ${c.n} seasons`, X)), ...X.out };
    }
    if (st?.tot && (count || has(/ (career|total|totals|all time|in his career|lifetime) /)) && !X.y && !has(/ (in a (single )?(game|season)|per game|averag\w*|season high|tonight|last night|yesterday|this season|this year|last game|last \d+|vs|against) /)) {
      const v = post ? { ptsT: c.pptsT, trbT: c.ptrbT, astT: c.pastT, g: c.pg }[st.tot] : c[st.tot];
      if (v == null) return null;
      const cov = !post && c.cov?.[st.tot]; if (cov === 0) return { text: `${st.word[0].toUpperCase() + st.word.slice(1)} weren't recorded during ${esc(p.name)}'s career.`, ...X.out };
      const live = ahLive(p, I), nowRow = live && !post ? Q.players?.[0] : null, nowTot = nowRow?.tot?.[{ ptsT: 'pts', trbT: 'reb', astT: 'ast', stlT: 'stl', blkT: 'blk', tpT: 'tpm', tdT: 'td' }[st.tot]];
      return { text: `${esc(p.name)} ${live ? 'has' : 'finished with'} <b>${ahN(v)} ${post ? 'playoff ' : live ? 'career ' : ''}${st.k === 'g' ? 'games' : st.word}</b>${Number.isFinite(nowTot) ? ` (${ahN(nowTot)} this season)` : ''} in ${post ? `${ahN(c.pg)} playoff games` : `${ahN(c.g)} regular-season games`}${st.k !== 'g' && st.k !== 'td' && (post ? c.pg : c.g) ? ` (${(v / (post ? c.pg : c.g)).toFixed(1)} a game)` : ''}.${cov ? ` (Recorded for ${cov}% of his games.)` : ''}${live ? ' Totals update weekly.' : ''}`,
        html: card(ahRow(p, ahN(v), `Career ${st.word}${post ? ', playoffs' : ''}`, X)), ...X.out };
    }
    return null;
  }
  if (p) return null;

  // league-wide lists
  const rankBy = async (val, label, fmt, min1 = 1, sub) => {
    const L = [...C].map(([id, c]) => ({ id, c, v: val(c, id) })).filter(x => x.v >= min1).sort((a, b) => b.v - a.v);
    const top = L.slice(0, Q.topN || 10); if (!top.length) return null;
    const nm = x => I.byId.get(x.id) || ahP1(I, x.id);
    const tie = L.filter(x => x.v === top[0].v);
    return { text: `${tie.length > 1 ? ahJoin(tie.slice(0, 4).map(x => esc(nm(x).name))) + ' share' : esc(nm(top[0]).name) + ' has'} the most ${label}: <b>${fmt(top[0].v)}</b>.${top[tie.length] ? ` Next: ${ahJoin(top.slice(tie.length, tie.length + 2).map(x => `${esc(nm(x).name)} (${fmt(x.v)})`))}.` : ''}`,
      html: card(top.map((x, i) => ahRow(nm(x), fmt(x.v), `#${i + 1}${sub ? ' · ' + sub(x) : ''}`, X)).join('')), ...X.out };
  };
  if (fmvp && (most || count)) return rankBy((c, id) => ahFmvps(X, id).length, 'Finals MVPs', v => `${v}`, 1, x => ahFmvps(X, x.id).sort().join(', '));
  if (ldrK && most) return rankBy(c => c.ldr[ldrK[0]], ldrK[1], v => `${v}`, 1);
  if (rings && most && has(/ (players?|who|anyone|rings?) /) && !has(/ (teams?|franchises?|organizations?) /) && !Q.teams.length) return rankBy(c => c.rings.length, 'championships as a player', v => `${v}`, 1, x => `${x.c.rings[0]} to ${x.c.rings.at(-1)}`);
  if (acc && most && !X.y) return rankBy(c => ahAwCount(c, acc[0]), acc[1], v => `${v}`, 1);
  // "players with MVP and DPOY", "won MVP and Finals MVP"
  if (aw && has(/ (and|both) /)) {
    const two = AH_AW.filter(a => a.re.test(nn)).map(a => a.k); if (fmvp) two.push('FMVP');
    if (two.length >= 2) {
      const L = [...C].filter(([id, c]) => two.every(k => (k === 'FMVP' ? ahFmvps(X, id).length : c.aw[k]))).map(([id]) => I.byId.get(id)).filter(Boolean).sort((a, b) => b.score - a.score);
      const lab = two.map(k => (k === 'FMVP' ? 'Finals MVP' : AH_AW.find(a => a.k === k).name)).join(' and ');
      return { text: L.length ? `${L.length === 1 ? 'One player has' : `${L.length} players have`} won both ${lab} in their careers: ${ahJoin(L.slice(0, 6).map(x => esc(x.name)))}${L.length > 6 ? ' and others' : ''}.` : `Nobody has won both ${lab}.`, html: card(L.slice(0, 12).map(x => ahRow(x, null, `${ahSeason(x.y0)} to ${ahSeason(x.y1)}`, X)).join('')), ...X.out };
    }
  }
  // "30,000 point club", "how many players have 10000 assists"
  const club = nn.match(/ (\d{1,2}) ?(?:000|k) (points?|rebounds?|assists?|steals?|blocks?|threes|3s|three pointers?|games) /) || nn.match(/ (\d{4,5}) (points?|rebounds?|assists?|steals?|blocks?|threes|3s|three pointers?|games) /);
  if (club && has(/ (players?|club|who|how many|members|anyone|career) /)) {
    const n = +club[1] < 100 ? +club[1] * 1000 : +club[1], s2 = ahStat(` ${club[2]} `); if (!s2?.tot) return null;
    const L = [...C].filter(([, c]) => c[s2.tot] >= n).map(([id, c]) => ({ p: I.byId.get(id), v: c[s2.tot] })).filter(x => x.p).sort((a, b) => b.v - a.v);
    return { text: L.length ? `<b>${L.length} player${L.length > 1 ? 's have' : ' has'}</b> reached ${ahN(n)} career ${s2.word}: ${ahJoin(L.slice(0, 5).map(x => esc(x.p.name)))}${L.length > 5 ? ' and others' : ''}.` : `Nobody has reached ${ahN(n)} career ${s2.word}.`, html: card(L.slice(0, 15).map((x, i) => ahRow(x.p, ahN(x.v), `#${i + 1}`, X)).join('')), ...X.out };
  }
  // career leaders: totals, or per game ("highest career scoring average")
  const careerish = has(/ (career|all time|of all time|ever|in (nba )?history|lifetime) /) || (post && has(/ (most|leaders?|leading) /) && !X.y) || (st?.k === 'g' && has(/ most /));
  if (st && careerish && has(/ (most|leaders?|leading|highest|best|top|who has|who is|all time|kings?|record) /) && !has(/ (in a (single )?(game|season|playoffs?|series|half|quarter)|single season|single game|seasons?|per game in a|rookie|at age|by a) /) && !X.y && !X.decade) {
    const perG = has(/ (averag\w*|per game|ppg|rpg|apg|spg|bpg) /) && st.rate && st.tot && st.k !== 'g';
    if (perG) {
      const gKey = post ? 'pg' : 'g', tKey = post ? { ptsT: 'pptsT', trbT: 'ptrbT', astT: 'pastT' }[st.tot] : st.tot; if (!tKey) return null;
      const L = [...C].filter(([, c]) => c[gKey] >= (post ? 25 : 400) && !(c.cov?.[st.tot] < 90)).map(([id, c]) => ({ p: I.byId.get(id), v: c[tKey] / c[gKey], g: c[gKey] })).filter(x => x.p).sort((a, b) => b.v - a.v).slice(0, Q.topN || 10);
      return { text: `${esc(L[0].p.name)} has the highest career ${post ? 'playoff ' : ''}${st.word} average: <b>${L[0].v.toFixed(1)}</b> a game over ${ahN(L[0].g)} games. Next: ${ahJoin(L.slice(1, 3).map(x => `${esc(x.p.name)} (${x.v.toFixed(1)})`))}. Minimum ${post ? 25 : 400} games.`, html: card(L.map((x, i) => ahRow(x.p, x.v.toFixed(1), `#${i + 1} · ${ahN(x.g)} games`, X)).join('')), ...X.out };
    }
    if (st.tot || st.k === 'ws') {
      const key = st.k === 'ws' ? 'ws' : post ? { ptsT: 'pptsT', trbT: 'ptrbT', astT: 'pastT', g: 'pg' }[st.tot] : st.tot; if (!key) return null;
      // the record book's exact career lists where History has them, otherwise the season totals added up
      const hk = { ptsT: 'pts', trbT: 'trb', astT: 'ast', stlT: 'stl', blkT: 'blk', tpT: 'fg3', g: 'g' }[st.tot], HL = !post && hk && X.Hd?.leaders?.[hk];
      const L = (HL ? HL.map(x => ({ p: ahP1(I, x.id, x.name), v: x.v })) : [...C].map(([id, c]) => ({ p: I.byId.get(id), v: c[key] })).filter(x => x.p && x.v > 0).sort((a, b) => b.v - a.v)).slice(0, Q.topN || 10);
      const f = v => (st.k === 'ws' ? v.toFixed(1) : ahN(v));
      return { text: `${esc(L[0].p.name)} is the all-time ${post ? 'playoff ' : ''}leader in ${st.k === 'g' ? 'games played' : st.word} with <b>${f(L[0].v)}</b>. Next: ${ahJoin(L.slice(1, 3).map(x => `${esc(x.p.name)} (${f(x.v)})`))}.`, html: card(L.map((x, i) => ahRow(x.p, f(x.v), `#${i + 1}${ahLive(x.p, I) ? ' · active' : ''}`, X)).join('')), ...X.out };
    }
  }
  return null;
}

/* ---------------- awards and honors by year ---------------- */
async function ahHonors(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  const AW = (await ahGet('awards')).years;
  const team = has(/ all w?nba /) ? ['NBA', 'All-NBA'] : has(/ (all defensive|all defense) /) ? ['DEF', 'All-Defensive'] : has(/ (all ?stars?|all star (game|team|roster)s?) /) && !has(/ (most|how many) /) ? ['AS', 'All-Star'] : null;
  if (team && X.y && !X.ps.length) {
    const A = AW[X.y]; if (!A) return null;
    if (IS_W && team[0] === 'AS') return { text: `I don't have WNBA All-Star rosters yet.`, ...X.out };
    const nm = id => I.byId.get(id) || ahP1(I, id);
    if (team[0] === 'AS') {
      const L = (A.AS || []).map(nm).sort((a, b) => b.score - a.score); if (!L.length) return { text: `There was no All-Star Game in ${ahSeason(X.y)}, or I don't have its rosters.`, ...X.out };
      return { text: `${L.length} players were All-Stars in ${ahSeason(X.y)}, including ${ahJoin(L.slice(0, 5).map(p => esc(p.name)))}.`, html: card(L.map(p => ahRow(p, null, 'All-Star', X)).join('')), ...X.out };
    }
    const which = has(/ (first|1st) /) ? [1] : has(/ (second|2nd) /) ? [2] : has(/ (third|3rd) /) ? [3] : [1, 2, 3];
    const parts = which.map(n => [n, (A[team[0] + n] || []).map(nm)]).filter(x => x[1].length);
    if (!parts.length) return { text: `I don't have ${team[1]} teams for ${ahSeason(X.y)}${team[0] === 'DEF' ? ' (they began in 1968-69)' : ''}.`, ...X.out };
    const W = ['', 'First', 'Second', 'Third'];
    return { text: `The ${ahSeason(X.y)} ${team[1]} ${W[parts[0][0]]} Team: ${ahJoin(parts[0][1].map(p => `<b>${esc(p.name)}</b>`))}.`, html: card(parts.map(([n, L]) => `<div class="ask-sub">${W[n]} Team</div>` + L.map(p => ahRow(p, null, '', X)).join('')).join('')), ...X.out };
  }
  const aw = has(/ finals mvps? /) ? null : AH_AW.find(a => a.re.test(nn));
  const sup = has(/ youngest /) ? ['age', 1, 'youngest'] : has(/ oldest /) ? ['age', -1, 'oldest'] : has(/ (lowest scoring|fewest points|worst) /) ? ['pts', 1, 'lowest-scoring'] : has(/ (highest scoring|most points|best scoring) /) ? ['pts', -1, 'highest-scoring'] : null;
  if (aw && sup && !X.ps.length && !X.y && !has(/ (race|ladder|odds|this (season|year)) /)) {
    const T = (await ahSeasons()).rows.filter(r => new RegExp(`(^|,)${aw.k}-1(,|$)`).test(r.aw || '') && r[sup[0]] != null).sort((a, b) => sup[1] * (a[sup[0]] - b[sup[0]]) || a.y - b.y), top = T.slice(0, 5); if (!top.length) return null;
    const P = r => I.byId.get(r.id) || ahP1(I, r.id), f = r => (sup[0] === 'age' ? `${r.age}` : r.pts.toFixed(1));
    return { text: `The ${sup[2]} ${aw.name} winner: <b>${esc(P(top[0]).name)}</b>, ${sup[0] === 'age' ? `${top[0].age} years old` : `${f(top[0])} points a game`} in ${ahSeason(top[0].y)}. Next: ${ahJoin(top.slice(1, 3).map(r => `${esc(P(r).name)} (${f(r)}, ${ahSeason(r.y)})`))}.`,
      html: card(await ahCard(X, top.map(r => ({ p: P(r), line: r, head: `${ahSeason(r.y)} Season` })), `${sup[2][0].toUpperCase() + sup[2].slice(1)} ${aw.name} winners`, 'Per game · regular season', ['age', 'pts', 'trb', 'ast'])), ...X.out };
  }
  const listy = has(/ (list|winners|every|all the|all time|history|by year|each year|since|recent|last (\d+|few|five|ten)|back to back|consecutive|in a row|repeat) /);
  if (aw && !X.ps.length && !X.y && listy && !has(/ (most|how many|race|ladder|odds|favorite) /)) {
    const ys = Object.keys(AW).map(Number).filter(y => AW[y][aw.k]?.[0]?.[1] === 1 && y < I.cur).sort((a, b) => b - a);
    const win = y => AW[y][aw.k][0];
    if (has(/ (back to back|consecutive|in a row|repeat) /)) {
      const runs = []; let run = null;
      for (const y of [...ys].reverse()) { const id = win(y)[0]; if (run && run.id === id && y === run.b + 1) run.b = y; else { if (run && run.b > run.a) runs.push(run); run = { id, a: y, b: y }; } }
      if (run && run.b > run.a) runs.push(run);
      runs.reverse();
      return { text: `${runs.length} players have won ${aw.name === 'MVP' ? 'MVP' : `the ${aw.name} award`} in back-to-back seasons. The most recent: ${ahJoin(runs.slice(0, 3).map(r => `${esc(I.byId.get(r.id)?.name || r.id)} (${ahSeason(r.a)} to ${ahSeason(r.b)})`))}.`, html: card(ahTbl(['Player', 'Seasons', 'In a row'], runs.map(r => ahTr(I.byId.get(r.id), X, [`${ahSeason(r.a)} to ${ahSeason(r.b)}`, r.b - r.a + 1])))), ...X.out };
    }
    const L = ys.slice(0, Math.min(40, +(nn.match(/ last (\d+) /)?.[1] || 0) || 20));
    return { text: `${aw.name} winners, newest first. ${esc(I.byId.get(win(L[0])[0])?.name || '')} won in ${ahSeason(L[0])}.`, html: card(ahTbl(['Season', 'Winner', 'Team'], L.map(y => `<tr><td>${ahSeason(y)}</td><td>${esc(I.byId.get(win(y)[0])?.name || win(y)[0])}</td><td>${esc(win(y)[2] || '')}</td></tr>`))), ...X.out };
  }
  // stat titles by year: "scoring champions", "who led the league in rebounds the most"
  const tk = has(/ scoring (champions?|champs|titles?|leaders? by year) /) ? 'pts' : has(/ (rebounding|rebound) (champions?|champs|titles?) /) ? 'trb' : has(/ assists? (champions?|champs|titles?) /) ? 'ast' : null;
  if (tk && !X.ps.length && !X.y && !has(/ (most|how many) /)) {
    const ys = Object.keys(AW).map(Number).filter(y => AW[y].ldr?.[tk]).sort((a, b) => b - a).slice(0, 20), s = AH_STATS.find(x => x.k === tk);
    return { text: `The league's ${s.word} leaders by season, newest first. ${esc(I.byId.get(AW[ys[0]].ldr[tk][0])?.name || '')} led in ${ahSeason(ys[0])} at ${AW[ys[0]].ldr[tk][1].toFixed(1)} a game.`, html: card(ahTbl(['Season', 'Leader', 'Team', 'Per game'], ys.map(y => { const l = AW[y].ldr[tk]; return `<tr><td>${ahSeason(y)}</td><td>${esc(I.byId.get(l[0])?.name || l[0])}</td><td>${esc(l[2] || '')}</td><td>${l[1].toFixed(1)}</td></tr>`; }))), ...X.out };
  }
  return null;
}

/* ---------------- champions, Finals and playoff series ---------------- */
async function ahTitles(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  if (!has(/ (finals?|championships?|champions?|champs?|titles?|rings?|won it all|playoffs?|postseason|series|swept|sweep|eliminated|knocked out|lost to|beat|conference finals|drought|banners?|how far|won the (east|west|eastern|western)|win the (east|west|eastern|western)) /)) return null;
  if (has(/ (stats|averag\w*|points?|rebounds?|assists?|scor\w*|mvp race|odds|this (season|year)|tonight|favorite) /) && !has(/ finals mvp /)) return null;
  const [TM, PO] = await Promise.all([ahTeams(), ahGet('playoffs').then(d => d.years)]);
  const champ = y => TM.find(r => r.y === y && r.po === 'Champions'), runner = y => { const f = (PO[y] || []).find(s => s[0] === 'Finals'); return f ? TM.find(r => r.y === y && r.ab === f[2]) : null; };
  const fin = y => (PO[y] || []).find(s => s[0] === 'Finals'), HC = y => (X.Hd?.champions || []).find(c => c.y === y);
  const fmName = y => { const h = HC(y); return h?.fmvpId ? I.byId.get(h.fmvpId)?.name || h.fmvp : h?.fmvp || ''; };
  const sLine = (y, s) => `${esc(ahNick(ahTeamName(TM, y, s[1])))} over ${esc(ahNick(ahTeamName(TM, y, s[2])))} ${s[3]}-${s[4]}`;
  const y = X.y; let F = X.ps.length ? null : await ahFranchise(Q, X);
  if (X.ps.length && !has(/ finals mvps? /)) {
    if (X.ps.length > 1 || !y || !has(/ (beat|beaten|lost|lose|face[ds]?|play(ed)? (against|in)|opponent|how far|run|eliminated|knocked out|swept|sweep|make the|made the|reach\w*|win the|won the) /)) return null;
    const Sn = await X.E.eraSeason(y).catch(() => null), r = Sn?.byId.get(X.ps[0].id); if (!r) return null;
    const ab = String(r.tm).split('/').pop(), fr = X.E.eraAbbr(ab), rows = TM.filter(x => X.E.eraAbbr(x.ab) === fr), row = rows.find(x => x.y === y); if (!row) return null;
    F = { t: null, name: row.name, short: ahNick(row.name), rows };
  }
  // Finals MVP in a year, or the list
  if (has(/ finals mvps? /) && !X.ps.length) {
    if (y) { const h = HC(y), p = h?.fmvpId && I.byId.get(h.fmvpId); if (!h?.fmvp) return { text: y < 1969 ? `There was no Finals MVP award in ${y}; it began in 1969.` : `I don't have the ${y} Finals MVP.`, ...X.out }; return { text: `<b>${esc(p?.name || h.fmvp)}</b> was the ${y} Finals MVP, as the ${esc(h.champ)} beat the ${esc(h.runner)}.`, html: p ? card(ahRow(p, y, `Finals MVP · ${h.champ}`, X)) : '', ...X.out }; }
    if (has(/ (list|winners|every|all|history|recent|last) /)) { const L = (X.Hd?.champions || []).filter(c => c.fmvp).slice(0, 20); return { text: `Finals MVPs, newest first. ${esc(fmName(L[0].y))} won in ${L[0].y}.`, html: card(ahTbl(['Year', 'Finals MVP', 'Champion'], L.map(c => `<tr><td>${c.y}</td><td>${esc(fmName(c.y))}</td><td>${esc(c.champ)}</td></tr>`))), ...X.out }; }
    return null;
  }
  // one year
  if (y && PO[y] && !F && has(/ (east|west|eastern|western|conference) /) && has(/ (won|win|champions?|champs?|finals|title) /)) {
    const cf = PO[y].filter(s => /(Conference|Division) Finals/.test(s[0])), side = has(/ (east|eastern) /) ? /^East/ : has(/ (west|western) /) ? /^West/ : null;
    const mine = side ? cf.filter(s => side.test(s[0])) : cf;
    if (mine.length) return { text: `${ahJoin(mine.map(s => `The <b>${esc(ahTeamName(TM, y, s[1]))}</b> won the ${y} ${esc(s[0].replace(/ Finals$/, ''))} title, beating the ${esc(ahTeamName(TM, y, s[2]))} ${s[3]}-${s[4]}`))}. The ${esc(champ(y)?.name || '')} went on to win the championship.`, html: card(ahTbl(['Round', 'Result'], PO[y].map(s => `<tr><td>${esc(s[0])}</td><td>${sLine(y, s)}</td></tr>`))), ...X.out };
  }
  if (y && PO[y] && !has(/ (how many|most|last time|since|drought) /)) {
    const c = champ(y), f = fin(y);
    if (F) {
      const abs = new Set(F.rows.filter(r => r.y === y).map(r => r.ab)), mine = PO[y].filter(s => abs.has(s[1]) || abs.has(s[2])), row = F.rows.find(r => r.y === y);
      if (!row) return null;
      if (!mine.length) return { text: `The ${ahSeason(y)} ${esc(row.name)} went ${row.w}-${row.l} and missed the playoffs.`, ...X.out };
      const lost = mine.find(s => abs.has(s[2])), wins = mine.filter(s => abs.has(s[1]));
      const text = row.po === 'Champions' ? `The ${ahSeason(y)} ${esc(row.name)} won the championship, beating the ${esc(ahTeamName(TM, y, f[2]))} ${f[3]}-${f[4]} in the Finals${fmName(y) ? ` (${esc(fmName(y))} was Finals MVP)` : ''}. ${wins.length > 1 ? `On the way: ${ahJoin(wins.filter(s => s !== f).map(s => `the ${esc(ahNick(ahTeamName(TM, y, s[2])))} ${s[3]}-${s[4]}`))}.` : ''}`
        : `The ${ahSeason(y)} ${esc(row.name)} lost the ${esc(lost[0])} to the ${esc(ahTeamName(TM, y, lost[1]))}, ${lost[4]}-${lost[3]}.${wins.length ? ` They beat ${ahJoin(wins.map(s => `the ${esc(ahNick(ahTeamName(TM, y, s[2])))} ${s[3]}-${s[4]}`))} first.` : ''}`;
      return { text, html: card(ahTbl(['Round', 'Result'], mine.slice().reverse().map(s => `<tr><td>${esc(s[0])}</td><td>${sLine(y, s)}</td></tr>`))), ...X.out };
    }
    if (!c || !f) return null;
    const conf = PO[y].filter(s => /Conference Finals|Division Finals/.test(s[0]));
    return { text: `The <b>${esc(c.name)}</b> won the ${y} championship, beating the ${esc(ahTeamName(TM, y, f[2]))} ${f[3]}-${f[4]} in the Finals${fmName(y) ? `. ${esc(fmName(y))} was Finals MVP` : ''}.${conf.length ? ` Before that: ${ahJoin(conf.map(s => sLine(y, s)))}.` : ''}`,
      html: card(ahTbl(['Round', 'Result'], PO[y].map(s => `<tr><td>${esc(s[0])}</td><td>${sLine(y, s)}</td></tr>`))), ...X.out };
  }
  // a franchise
  if (F) {
    const titles = F.rows.filter(r => r.po === 'Champions').map(r => r.y).sort((a, b) => b - a), finals = F.rows.filter(r => r.po === 'Champions' || r.po === 'Lost Finals').map(r => r.y).sort((a, b) => b - a), inPO = F.rows.filter(r => r.po).map(r => r.y).sort((a, b) => b - a);
    const nm = F.old ? `The ${esc(F.name)}` : `The ${esc(F.short)}`;
    const want = has(/ (finals) /) && !has(/ (won|win|titles?|championships?|rings?|champions?) /) ? 'fin' : has(/ (playoffs?|postseason) /) && !has(/ (titles?|championships?|rings?|champions?|finals) /) ? 'po' : 'title';
    const L = { title: titles, fin: finals, po: inPO }[want], lab = { title: ['championship', 'won a championship', 'won the title'], fin: ['Finals appearance', 'reached the Finals', 'made the Finals'], po: ['playoff appearance', 'made the playoffs', 'made the playoffs'] }[want];
    const tbl = ahTbl(['Season', 'Record', 'Result'], F.rows.filter(r => L.includes(r.y)).sort((a, b) => b.y - a.y).slice(0, 25).map(r => `<tr><td>${ahSeason(r.y)}</td><td>${r.w}-${r.l}</td><td>${esc(r.po || '')}</td></tr>`));
    if (has(/ (last|most recent|when did|how long|since|drought|ever) /) && !has(/ how many /)) {
      if (!L.length) return { text: `${nm} have never ${lab[1]}${want === 'title' && finals.length ? `. They reached the Finals in ${finals.slice(0, 4).join(', ')}` : ''}.`, ...X.out };
      const ago = I.cur - 1 - L[0];
      return { text: `${nm} last ${lab[2]} in <b>${L[0]}</b>${ago > 0 ? `, ${ago === 1 ? 'one season' : `${ago} seasons`} ago` : ''}${want === 'title' ? `, beating the ${esc(ahTeamName(TM, L[0], fin(L[0])?.[2]))} in the Finals` : ''}. That makes ${L.length} ${lab[0]}${L.length > 1 ? 's' : ''} in all.`, html: card(tbl), ...X.out };
    }
    return { text: L.length ? `${nm} have <b>${L.length} ${lab[0]}${L.length > 1 ? 's' : ''}</b>${want === 'po' ? ` in ${F.rows.filter(r => r.po != null).length} seasons` : `: ${L.slice().reverse().slice(0, 20).join(', ')}`}${want === 'title' && finals.length > titles.length ? `. They lost the Finals ${ahTimes(finals.length - titles.length)}` : ''}.` : `${nm} have never ${lab[1]}.`, html: L.length ? card(tbl) : '', ...X.out };
  }
  if (X.ps.length) return null;
  // league-wide
  if (has(/ (most|how many) /) && (has(/ (teams?|franchises?|organizations?) /) || (has(/ (who has|which|who) /) && !has(/ (rings?|players?) /))) && has(/ (titles?|championships?|rings?|banners?) /)) {
    const by = new Map(); for (const r of TM) if (r.po === 'Champions') { const k = X.E.eraAbbr(r.ab); by.set(k, (by.get(k) || []).concat(r.y)); }
    const L = [...by].sort((a, b) => b[1].length - a[1].length || Math.max(...b[1]) - Math.max(...a[1])).slice(0, 10), nm = k => Object.values(S.teams).find(t => t.abbr === k) || (n => ({ abbr: k, name: n, short: ahNick(n), id: '' }))(TM.filter(r => X.E.eraAbbr(r.ab) === k).at(-1)?.name || k);
    return { text: `The ${esc(nm(L[0][0]).short || nm(L[0][0]).name)} have the most championships with <b>${L[0][1].length}</b>, then the ${esc(nm(L[1][0]).short || nm(L[1][0]).name)} (${L[1][1].length}) and the ${esc(nm(L[2][0]).short || nm(L[2][0]).name)} (${L[2][1].length}).`, html: card(L.map(([k, ys]) => Q.ui.tRow(nm(k), ys.length, `Last: ${Math.max(...ys)}`)).join('')), ...X.out };
  }
  if (has(/ (list|every|all|recent|last (\d+|few|five|ten)|champions by year|past champions|defending|reigning|who won the (title|championship|finals)|last year s|last season s) /) && has(/ (champions?|champs?|finals|titles?|championships?) /)) {
    const ys = Object.keys(PO).map(Number).filter(v => champ(v)).sort((a, b) => b - a);
    if (has(/ (defending|reigning|last year|last season|who won the (title|championship|finals) ) /) && !has(/ (list|every|all|recent|last \d+) /)) { const v = ys[0], c = champ(v), f = fin(v); return { text: `The <b>${esc(c.name)}</b> are the defending champions. They beat the ${esc(ahTeamName(TM, v, f[2]))} ${f[3]}-${f[4]} in the ${v} Finals${fmName(v) ? `, with ${esc(fmName(v))} as Finals MVP` : ''}.`, html: card(ahTbl(['Round', 'Result'], PO[v].map(s => `<tr><td>${esc(s[0])}</td><td>${sLine(v, s)}</td></tr>`))), ...X.out }; }
    const L = ys.slice(0, Math.min(40, +(nn.match(/ last (\d+) /)?.[1] || 0) || 15));
    return { text: `NBA champions, newest first. The ${esc(champ(L[0]).name)} won in ${L[0]}.`, html: card(ahTbl(['Year', 'Champion', 'Runner-up', 'Series', 'Finals MVP'], L.map(v => `<tr><td>${v}</td><td>${esc(champ(v).name)}</td><td>${esc(runner(v)?.name || '')}</td><td>${fin(v)[3]}-${fin(v)[4]}</td><td>${esc(fmName(v))}</td></tr>`))), ...X.out };
  }
  return null;
}

/* ---------------- searching every season ---------------- */
// the conditions in "averaged 30 points and 10 rebounds", "25 5 5", "a triple double", "50 40 90"
function ahConds(nn) {
  const out = [];
  if (/ (50 40 90|fifty forty ninety) /.test(nn)) return { conds: [['fgp', 0.5], ['tpp', 0.4], ['ftp', 0.9]], label: '50-40-90', fifty: true };
  if (/ (a|averag\w*|average) (a )?triple double /.test(nn)) return { conds: [['pts', 10], ['trb', 10], ['ast', 10]], label: 'a triple-double' };
  const W = [['pts', 'points?|pts|ppg'], ['trb', 'rebounds?|rebs?|boards|rpg'], ['ast', 'assists?|asts?|dimes|apg'], ['stl', 'steals?|spg'], ['blk', 'blocks?|bpg'], ['tp', 'threes|three pointers?|3s|3 pointers?']];
  for (const [k, w] of W) { const m = nn.match(new RegExp(` (\\d{1,2}(?: \\d)?) (?:plus |or more )?(?:${w})(?: per game| a game)? `)); if (m) out.push([k, +m[1].replace(' ', '.')]); }
  const bare = nn.match(/ (\d{2}) (?:and |\/ ?)?(\d{1,2})(?: (?:and |\/ ?)?(\d{1,2}))? (?!(?:plus |or more )?(?:points?|pts|rebounds?|rebs?|boards|assists?|steals?|blocks?|threes|games?|seasons?|years?|wins?|percent))/);
  if (bare && !out.length) ['pts', 'trb', 'ast'].forEach((k, i) => bare[i + 1] && out.push([k, +bare[i + 1]]));
  else if (!out.length) { const one = nn.match(/ averag\w* (?:at least |over |more than )?(\d{2}) /); if (one) out.push(['pts', +one[1]]); }
  if (!out.length) return null;
  const nm = { pts: 'points', trb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tp: 'threes' };
  return { conds: out, label: ahJoin(out.map(([k, v]) => `${v} ${nm[k]}`)) };
}
async function ahSearch(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  const C = ahConds(nn), st = ahStat(nn);
  const ageM = nn.match(/ (?:at|age|aged|at age|age of) (\d{2}) /) || nn.match(/ (\d{2}) (?:year old|years old|yr old)s? /), over = nn.match(/ (?:after|over|past|older than|at least) (?:age |the age of )?(\d{2}) /) || nn.match(/ (\d{2}) (?:and|or) older /), under = nn.match(/ (?:under|before|younger than|before turning|before age) (?:age |the age of )?(\d{2}) /);
  const teen = has(/ (teenagers?|as a teen|teens) /);
  const rookie = has(/ (rookies?|rookie (seasons?|years?)|first (year|season)|as a rookie|by a rookie) /) && !has(/ (rookie of the year|roy|roty) /);
  const pos = AH_POS.find(([re]) => re.test(nn));
  const young = has(/ youngest /), old = has(/ oldest /), first = has(/ (first|earliest) (player|person|one|man|to|time) /), lastP = has(/ (last|most recent|latest) (player|person|one|man|to|time) | last time (someone|anyone|a player|anybody) /);
  const superl = has(/ (best|greatest|top|highest|most|record|leaders?|lowest|fewest|worst) /);
  const seasonish = has(/ (seasons?|years?|ever|all time|in (nba )?history|of all time|single season|averag\w*|per game) /) || X.decade || rookie || ageM || over || under || teen || pos;
  const count = has(/ (how many|number of|count) /);
  if (IS_W && (ageM || over || under || teen || young || old)) return (C || superl || X.y) ? { text: `Players' ages aren't in the WNBA history data yet, so I can't answer by age. Everything else works: "players who averaged 20 and 10", "best rookie seasons", "highest PER ever".`, ...X.out } : null;
  const F = (X.ps.length || !has(/ (for the|by a|in .* history|franchise|team) /)) ? null : await ahFranchise(Q, X).catch(() => null);
  // one season in particular: every player that year, straight from the season's file
  const pre = [];
  if (rookie) pre.push('rookies'); if (teen) pre.push('teenagers'); if (pos) pre.push(pos[2]);
  if (ageM) pre.push(`${ageM[1]}-year-olds`); if (over) pre.push(`players ${over[1]} and older`); if (under) pre.push(`players under ${under[1]}`);
  if (has(/ (this season|this year|right now|currently|so far|tonight|last night|career) /)) return null;
  // one player at an age: "LeBron at age 38"
  if (X.ps.length === 1 && ageM && !C) {
    const p = X.ps[0], mine = (await ahSeasons()).rows.filter(r => r.id === p.id && r.age === +ageM[1]);
    if (!mine.length) return { text: `I don't have a full season for ${esc(p.name)} at age ${ageM[1]}. His career ran from ${ahSeason(p.y0)} to ${ahSeason(p.y1)}.`, ...X.out };
    const r = mine[0];
    return { text: `At ${r.age}, in ${ahSeason(r.y)}, ${esc(p.name)} averaged <b>${r.pts?.toFixed(1)} points</b>, ${r.trb?.toFixed(1) ?? '–'} rebounds and ${r.ast?.toFixed(1)} assists in ${r.g} games for ${esc(r.tm)}.`, html: card(await ahCard(X, [{ p, line: r, head: `${ahSeason(r.y)} Season` }], `${p.name} at ${r.age}`, 'Per game · regular season', ['pts', 'trb', 'ast', 'stl', 'blk', 'fgp'])), ...X.out };
  }
  const filtered = rookie || teen || ageM || over || under || pos || F || X.decade && st && !st.tot;
  if (!(C || young || old || first || lastP || (superl && st && seasonish) || (superl && filtered) || (X.y && (rookie || old || young)))) return null;
  if (X.ps.length && !(young || old || first || lastP)) return null;
  // the plain lists ("best scoring seasons ever", "top scorers 1987") already have their own answers
  if (!C && !filtered && !(young || old || first || lastP) && (!st || (['pts', 'trb', 'ast', 'stl', 'blk', 'tp', 'mp'].includes(st.k) && !has(/ (total|totals) /)))) return null;
  let rows;
  if (X.y) {
    const Sn = await X.E.eraSeason(X.y).catch(() => null); if (!Sn) return null;
    const minG = (C || st?.rate) && !(old || young) ? 0.58 * Sn.maxG : 1;
    rows = Sn.reg.filter(r => (r.g || 0) >= minG);
  } else rows = (await ahSeasons()).rows;
  const y0 = id => I.byId.get(id)?.y0;
  let L = rows;
  if (X.decade) L = L.filter(r => r.y > X.decade && r.y <= X.decade + 10);
  if (rookie) L = L.filter(r => y0(r.id) === r.y && r.y > I.first); // in the league's first season everyone was new
  if (teen) L = L.filter(r => r.age != null && r.age <= 19);
  if (ageM) L = L.filter(r => r.age === +ageM[1]);
  if (over) L = L.filter(r => r.age >= +over[1]);
  if (under) L = L.filter(r => r.age != null && r.age < +under[1]);
  if (pos) L = L.filter(r => pos[1].test(String(r.pos || '').split('-')[0]) || (pos[2] === 'guards' || pos[2] === 'forwards') && pos[1].test(String(r.pos || '')));
  if (F) { const abs = new Set(F.rows.map(r => r.ab)); L = L.filter(r => String(r.tm).split('/').some(a => abs.has(a))); }
  if (C) {
    L = L.filter(r => C.conds.every(([k, v]) => r[k] != null && r[k] >= v - 1e-9));
    if (C.fifty) L = L.filter(r => r.tpa >= 1 && r.fta >= 1.5 && r.pts >= 8);
  }
  if (X.ps.length) { const ids = new Set(X.ps.map(p => p.id)); L = L.filter(r => ids.has(r.id)); }
  const who = pre.length ? pre.join(' ') : 'players';
  const scope = `${X.y ? ` in ${ahSeason(X.y)}` : X.decade ? ` in the ${X.decade}s` : ''}${F ? ` for the ${F.short}` : ''}`;
  const P = r => I.byId.get(r.id) || ahP1(I, r.id, r.name);
  const lineOf = r => `${r.pts?.toFixed(1)} points, ${r.trb != null ? `${r.trb.toFixed(1)} rebounds, ` : ''}${r.ast?.toFixed(1)} assists`;
  const tblSeasons = (list, extra) => ahTbl(['Player', 'Season', 'Age', 'Team', 'PTS', 'REB', 'AST', ...(extra ? [extra[0]] : [])], list.map((r, i) => ahTr(P(r), X, [ahSeason(r.y), r.age ?? '', esc(r.tm || ''), r.pts?.toFixed(1) ?? '–', r.trb?.toFixed(1) ?? '–', r.ast?.toFixed(1) ?? '–', ...(extra ? [extra[1](r)] : [])], i + 1)));
  if (!L.length) return { text: `Nobody fits that${C ? `: no ${who} averaged ${C.label}${scope}` : scope}.`, ...X.out };
  // youngest / oldest / first / last to do it
  if (young || old || first || lastP) {
    if (!C && !X.y && !rookie) return null;
    const S2 = L.filter(r => r.age != null).sort((a, b) => (young ? a.age - b.age || a.y - b.y : old ? b.age - a.age || b.y - a.y : first ? a.y - b.y : b.y - a.y));
    const r = S2[0]; if (!r) return null;
    const ties = (young || old) ? S2.filter(x => x.age === r.age && x.id !== r.id).slice(0, 3) : S2.filter(x => x.y === r.y && x.id !== r.id).slice(0, 3);
    const what = C ? `to average ${C.label}${scope}` : `${scope.trim() || 'on record'}`;
    const text = (young || old) && X.y && !C ? `${esc(P(r).name)} was the ${young ? 'youngest' : 'oldest'} ${who.replace(/s$/, '')} in the league in ${ahSeason(X.y)} at <b>${r.age}</b> (${lineOf(r)} in ${r.g} games for ${esc(r.tm)}).${ties.length ? ` Also ${r.age}: ${ahJoin(ties.map(x => esc(P(x).name)))}.` : ''}`
      : young || old ? `${esc(P(r).name)} is the ${young ? 'youngest' : 'oldest'} ${who.replace(/s$/, '')} ${what}: he was <b>${r.age}</b> in ${ahSeason(r.y)} (${lineOf(r)} for ${esc(r.tm)}).${ties.length ? ` Also ${r.age}: ${ahJoin(ties.map(x => `${esc(P(x).name)} (${ahSeason(x.y)})`))}.` : ''}`
      : `${esc(P(r).name)} was the ${first ? 'first' : 'most recent'} ${who.replace(/s$/, '')} ${what}, in <b>${ahSeason(r.y)}</b> (${lineOf(r)} for ${esc(r.tm)}).${ties.length ? ` ${first ? 'The same season' : 'Also that season'}: ${ahJoin(ties.map(x => esc(P(x).name)))}.` : ''}`;
    const html = card(await ahCard(X, S2.slice(0, 3).map(x => ({ p: P(x), line: x, head: `${ahSeason(x.y)} Season` })), `${young ? 'Youngest' : old ? 'Oldest' : first ? 'First' : 'Latest'} ${C ? `to average ${C.label}` : who}`, `Per game · regular season${scope}`, ['age', ...(C ? C.conds.map(c => c[0]) : ['pts', 'trb', 'ast'])].slice(0, 4)) + tblSeasons(S2.slice(0, 12)));
    return { text, html, ...X.out };
  }
  // threshold lists: who did it, how many times
  if (C && !(superl && st && !count && !has(/ (who|players|seasons|anyone|list) /))) {
    const by = new Map(); for (const r of L) by.set(r.id, (by.get(r.id) || []).concat(r));
    const ppl = [...by].map(([id, rs]) => ({ p: P(rs[0]), rs: rs.sort((a, b) => b.y - a.y) })).sort((a, b) => b.rs.length - a.rs.length || b.p.score - a.p.score);
    const sorted = L.slice().sort((a, b) => b[C.conds[0][0]] - a[C.conds[0][0]]);
    const text = X.y ? `<b>${ppl.length} ${ppl.length === 1 ? who.replace(/s$/, '') : who}</b> ${C.fifty ? 'shot 50-40-90' : `averaged ${C.label}`} in ${ahSeason(X.y)}: ${ahJoin(sorted.slice(0, 6).map(r => `${esc(P(r).name)} (${C.conds.map(([k]) => r[k].toFixed(C.fifty ? 3 : 1).replace(/^0\./, '.')).join('/')})`))}${sorted.length > 6 ? ' and others' : ''}.`
      : `<b>${ppl.length} ${ppl.length === 1 ? who.replace(/s$/, '') : who}</b> ${ppl.length === 1 ? 'has' : 'have'} ${C.fifty ? 'had a 50-40-90 season' : `averaged ${C.label} for a season`}${scope}, ${L.length} ${L.length === 1 ? 'time' : 'times'} in all. ${ppl[0].rs.length > 1 ? `${esc(ppl[0].p.name)} did it most often (${ppl[0].rs.length} seasons)${ppl[1] ? `, then ${ahJoin(ppl.slice(1, 4).map(x => `${esc(x.p.name)}${x.rs.length > 1 ? ` (${x.rs.length})` : ''}`))}` : ''}` : `The most recent: ${ahJoin(L.slice().sort((a, b) => b.y - a.y).slice(0, 4).map(r => `${esc(P(r).name)} (${ahSeason(r.y)})`))}`}.`.replace(/, (\d+) times? in all\. The most recent/, (m, n) => (+n === ppl.length ? '. The most recent' : m));
    const top = X.y ? sorted.slice(0, 5) : ppl.slice(0, 5).map(x => x.rs.slice().sort((a, b) => b[C.conds[0][0]] - a[C.conds[0][0]])[0]);
    const cardH = await ahCard(X, top.map(r => ({ p: P(r), line: r, head: `${ahSeason(r.y)} Season` })), `Averaged ${C.label}`, `Per game · regular season${scope}`, [...new Set([...C.conds.map(c => c[0]), 'pts', 'trb', 'ast'])].slice(0, 4), X.y ? null : [{ lab: 'Seasons', vals: ppl.slice(0, 5).map(x => String(x.rs.length)) }]);
    const tbl = X.y ? tblSeasons(sorted.slice(0, 20)) : ahTbl(['Player', 'Times', 'Seasons'], ppl.slice(0, 25).map((x, i) => ahTr(x.p, X, [x.rs.length, esc(x.rs.length > 6 ? `${ahSeason(x.rs.at(-1).y)} to ${ahSeason(x.rs[0].y)}` : x.rs.map(r => ahSeason(r.y)).reverse().join(', '))], i + 1)));
    return { text, html: card(cardH + tbl), ...X.out };
  }
  // best seasons by a stat, within the filters
  const s = st || AH_STATS.find(x => x.k === 'pts');
  const total = s.tot && (has(/ (total|totals) /) || !s.rate || (has(/ most /) && has(/ in a (single )?season /) && has(/ total /)));
  const key = total ? s.tot : s.rate; if (!key) return null;
  const low = has(/ (lowest|fewest|worst) /);
  let R = L.filter(r => r[key] != null && (!s.min || s.min(r)));
  if (!X.y && !total) R = R.filter(r => (r.g || 0) >= 0.7 * ((ahM.gamesByYear || (ahM.gamesByYear = {}))[r.y] || (ahM.gamesByYear[r.y] = Math.max(...rows.filter(x => x.y === r.y).map(x => x.g || 0)))));
  R.sort((a, b) => (low ? a[key] - b[key] : b[key] - a[key]));
  const top = R.slice(0, Math.min(5, Q.topN || 5)); if (!top.length) return null;
  const f = r => (total ? ahN(r[key]) : ahFmt(s, r[key]));
  const title = `${low ? 'Lowest' : 'Best'} ${s.word} seasons${pre.length ? ` by ${who}` : ''}${scope}`;
  const text = `${X.y ? `${esc(P(top[0]).name)} ${low ? 'had the lowest' : 'led'} ${pre.length ? `all ${who}` : 'the league'} in ${s.word}${total ? '' : s.pct || ['per', 'ws', 'usg', 'bpm'].includes(s.k) ? '' : ' per game'} in ${ahSeason(X.y)} at <b>${f(top[0])}</b>` : `The ${low ? 'lowest' : 'best'} ${s.k === 'pts' ? 'scoring' : s.k === 'trb' ? 'rebounding' : s.word} season${pre.length ? ` by ${pre.length === 1 && !/^players/.test(who) && !/year-olds$/.test(who) ? `a ${who.replace(/s$/, '')}` : who}` : ''}${scope}: <b>${esc(P(top[0]).name)}, ${f(top[0])}${total || s.pct || ['per', 'ws', 'usg', 'bpm'].includes(s.k) ? '' : ' a game'} in ${ahSeason(top[0].y)}</b>${top[0].age != null && (ageM || over || under || teen || rookie) ? ` at age ${top[0].age}` : ''}`}. Next: ${ahJoin(top.slice(1, 3).map(r => `${esc(P(r).name)} (${f(r)}${X.y ? '' : `, ${ahSeason(r.y)}`})`))}.`;
  const keys = [...new Set([key, 'pts', 'trb', 'ast'])].slice(0, 4);
  const html = card(await ahCard(X, top.map(r => ({ p: P(r), line: r, head: `${ahSeason(r.y)} Season` })), title, total ? 'Season totals' : 'Per game · regular season', keys, [{ lab: 'Rank', vals: top.map((_, i) => String(i + 1)), trophy: true }]) + tblSeasons(R.slice(0, 15), ['pts', 'trb', 'ast'].includes(key) ? null : [s.word === 'PER' ? 'PER' : s.word.replace(/^./, c => c.toUpperCase()), f]));
  return { text, html, ...X.out };
}

/* ---------------- who a retired (or any) player was ---------------- */
async function ahBio(X, Q) {
  const { nn, I } = X, has = re => re.test(nn), p = X.ps[0];
  const tall = has(/ (tallest|shortest|heaviest|lightest|smallest|biggest) /);
  if (!p) {
    if (tall && has(/ (ever|all time|in (nba |league )?history|of all time|to play) /)) {
      const B = await ahBios(), k = has(/ (heaviest|lightest) /) ? 'weight' : 'height', dir = has(/ (tallest|heaviest|biggest) /) ? -1 : 1;
      const L = [...B.values()].filter(b => b[k] && I.byId.get(b.id)).sort((a, b) => dir * (a[k] - b[k]) || I.byId.get(b.id).score - I.byId.get(a.id).score), top = L.slice(0, 8);
      const f = b => (k === 'height' ? ahFt(b.height) : `${b.weight} lbs`), tie = L.filter(b => b[k] === top[0][k]);
      return { text: `${tie.length > 1 ? `${ahJoin(tie.slice(0, 3).map(b => esc(I.byId.get(b.id).name)))} are` : `${esc(I.byId.get(top[0].id).name)} is`} the ${nn.match(/ (tallest|shortest|heaviest|lightest|smallest|biggest) /)[1]} to play in the NBA at <b>${f(top[0])}</b>.`, html: card(top.map(b => ahRow(I.byId.get(b.id), f(b), `${ahSeason(I.byId.get(b.id).y0)} to ${ahSeason(I.byId.get(b.id).y1)}${b.pos ? ` · ${b.pos}` : ''}`, X)).join('')), ...X.out };
    }
    // "players from Duke", "best players from Kentucky ever"
    const cm = nn.match(/ (?:players?|guys|nba players|alumni|everyone|anyone|who) (?:that |who )?(?:are |were |is |was )?(?:from|went to|out of|attended|played (?:at|for)) ([a-z .&']{3,28}?) (?:ever |all time |in (?:nba )?history |of all time |in the nba |in the league )?$/) || nn.match(/ (?:best|greatest|top) ([a-z .&']{3,28}?) (?:players|alumni|products) (?:ever |all time |in (?:nba )?history |of all time |in the nba )?$/);
    if (cm && has(/ (ever|all time|history|of all time|best|greatest|top) /)) {
      const want = nameKey(cm[1]).replace(/^(the|a) /, ''), B = await ahBios();
      const L = [...B.values()].filter(b => b.college && String(b.college).split(',').some(c => nameKey(c) === want || nameKey(c).replace(/ (university|college|state university)$/, '') === want)).map(b => I.byId.get(b.id)).filter(Boolean).sort((a, b) => b.score - a.score);
      if (!L.length) return null;
      const C = await ahCareers();
      return { text: `${L.length} NBA players came out of ${esc(cm[1].replace(/\b\w/g, c => c.toUpperCase()))}. The biggest careers: ${ahJoin(L.slice(0, 4).map(x => esc(x.name)))}.`, html: card(L.slice(0, 12).map((x, i) => ahRow(x, `${ahN(C.get(x.id)?.ptsT)} pts`, `#${i + 1} · ${ahSeason(x.y0)} to ${ahSeason(x.y1)}`, X)).join('')), ...X.out };
    }
    return null;
  }
  if (X.ps[1]) return null;
  const wants = { height: has(/ (how tall|height|tall|how big) /), weight: has(/ (weigh\w*|weight|heavy) /), born: has(/ (born|birthday|birthdate|date of birth|birth) /), age: has(/ (how old|age|old was|old is) /),
    college: has(/ (college|school|university|alma mater|where did .* (go|play) (to )?(school|college)) /), pos: has(/ (position|what did .* play|guard or|forward or|center or) /), hof: has(/ (hall of fame|hof|hall of famer|inducted|enshrined) /),
    teams: has(/ (what teams?|which teams?|teams did|every team|all the teams|who did .* play for|played for|play for|how many teams) /), retire: has(/ (retire\w*|last (season|game|year)|final (season|game|year)|stop playing|still play\w*|still in the (league|nba)|when did .* (play|career)) /),
    rookie: has(/ (rookie (year|season)|first (season|year|game)|debut\w*|enter(ed)? the (league|nba)|come into the league|start(ed)? playing) /) && !has(/ (stats|averag\w*|points|numbers) /), seasons: has(/ how (many|long) .*(seasons|years|play|career|league) | (how long|career length|years in the league) /),
    died: has(/ (die[ds]?|death|passed away|alive|dead) /) };
  if (!Object.values(wants).some(Boolean)) return null;
  if (IS_W && !Q.players.length && (wants.height || wants.weight || wants.born || wants.age || wants.pos || wants.hof || wants.died) && !(wants.teams || wants.retire || wants.seasons || wants.rookie || wants.college)) return { text: `I don't have heights, birth dates or Hall of Fame status for past WNBA players yet. I can tell you ${esc(p.name)}'s teams, seasons, college, draft pick, awards and career numbers.`, ...X.out };
  if (ahLive(p, I) && !X.y && !(wants.teams || wants.retire || wants.seasons || wants.rookie || wants.hof) && Q.players.length) return null; // an active player's height, age, college: the live feed has those
  const [B, C] = await Promise.all([ahBios(), ahCareers()]);
  const b = B.get(p.id) || {}, c = C.get(p.id), L = X.Hd?.legends?.[p.id];
  const live = ahLive(p, I), was = live ? 'is' : 'was';
  const teams = String(c?.teams || '').split(';').filter(Boolean).map(s => { const [ab, ys] = s.split(':'); return { ab, ys, n: ys.split(',').reduce((a, r) => { const [x, y] = r.split('-').map(Number); return a + (y ? y - x + 1 : 1); }, 0) }; });
  const TMn = async ab => { const TM = await ahTeams(); return ahNick(TM.filter(r => r.ab === ab).at(-1)?.name || ab); };
  const span = ys => ys.split(',').map(r => { const [x, y] = r.split('-').map(Number); return y ? `${x - 1}-${String(y).slice(2)}` : ahSeason(x); }).join(', ');
  const facts = card(ahRow(p, null, [b.pos, b.height ? ahFt(b.height) : '', b.weight ? `${b.weight} lbs` : '', `${ahSeason(p.y0)} to ${live ? 'now' : ahSeason(p.y1)}`].filter(Boolean).join(' · '), X));
  let text = '';
  if (wants.age && X.y) { const Sn = await X.E.eraSeason(X.y).catch(() => null), r = Sn?.byId.get(p.id); text = r?.age != null ? `${esc(p.name)} was <b>${r.age}</b> in the ${ahSeason(X.y)} season${b.born ? ` (born ${esc(ahDate(b.born))})` : ''}.` : b.born ? `${esc(p.name)} was born ${esc(ahDate(b.born))}, so about ${X.y - +b.born.slice(0, 4) - 1} in ${ahSeason(X.y)}. He didn't play that season.` : ''; }
  else if (wants.teams && X.y) { const Sn = await X.E.eraSeason(X.y).catch(() => null), r = Sn?.byId.get(p.id); if (r) { const T = String(r.tm).split('/'); text = `${esc(p.name)} played for the <b>${ahJoin(await Promise.all(T.map(async ab => esc(Sn.teams[ab]?.[0] || await TMn(ab)))))}</b> in ${ahSeason(X.y)}${T.length > 1 ? ' (traded during the season)' : ''}: ${r.pts?.toFixed(1)} points in ${r.g} games.`; } else text = `${esc(p.name)} didn't play in ${ahSeason(X.y)}. His career ran from ${ahSeason(p.y0)} to ${ahSeason(p.y1)}.`; }
  else if (wants.teams && teams.length) { const nm = await Promise.all(teams.map(async t => `the ${esc(await TMn(t.ab))} (${span(t.ys)})`)); text = `${esc(p.name)} ${live ? 'has played' : 'played'} for <b>${teams.length} team${teams.length > 1 ? 's' : ''}</b>: ${ahJoin(nm)}.`; }
  else if (wants.hof) text = b.hof ? `Yes. ${esc(p.name)} is in the Hall of Fame${L?.hof ? ` (inducted ${esc(String(L.hof))})` : ''}.` : live || ahLive(p, I) - 4 ? `Not yet. ${esc(p.name)} ${live ? 'is still playing' : `last played in ${ahSeason(p.y1)}`}, and players have to be retired for several seasons before they are eligible.` : `No. ${esc(p.name)} isn't in the Hall of Fame as a player.`;
  else if (wants.height && b.height) text = `${esc(p.name)} ${was} <b>${ahFt(b.height)}</b>${b.weight ? ` and ${b.weight} pounds` : ''}.`;
  else if (wants.weight && b.weight) text = `${esc(p.name)} ${was} listed at <b>${b.weight} pounds</b>${b.height ? ` (${ahFt(b.height)})` : ''}.`;
  else if (wants.died && L) text = L.died ? `${esc(p.name)} died ${esc(/^\d{4}-\d\d-\d\d$/.test(L.died) ? ahDate(L.died) : L.died)}${b.born ? ` (born ${esc(ahDate(b.born))})` : ''}.` : `${esc(p.name)} is alive${b.born ? `, born ${esc(ahDate(b.born))}` : ''}.`;
  else if ((wants.born || wants.age) && b.born) { const age = Math.floor((Date.now() - Date.parse(b.born)) / (365.2425 * 864e5)); text = `${esc(p.name)} was born <b>${esc(ahDate(b.born))}</b>${L?.died ? '' : ` (${age} now)`}.${has(/ where /) ? ' I have his birth date but not his birthplace.' : ''}`; }
  else if (wants.college && !b.college && (await ahDrafts().catch(() => null))?.by.get(p.id)?.college) text = `${esc(p.name)} went to <b>${esc((await ahDrafts()).by.get(p.id).college)}</b>.`;
  else if (wants.college && IS_W) text = '';
  else if (wants.college) text = b.college ? `${esc(p.name)} went to <b>${esc(b.college)}</b>.` : `${esc(p.name)} didn't play college basketball in the U.S.${L?.draft ? ` (${esc(L.draft)})` : ''}`;
  else if (wants.pos && b.pos) { const P = { G: 'guard', F: 'forward', C: 'center', 'G-F': 'guard and forward', 'F-G': 'forward and guard', 'F-C': 'forward and center', 'C-F': 'center and forward' }[b.pos] || b.pos; text = `${esc(p.name)} ${was} a <b>${P}</b>${b.height ? `, ${ahFt(b.height)}` : ''}.`; }
  else if (wants.retire) text = (has(/ still /) && !live ? 'No. ' : '') + (live ? `${esc(p.name)} is still playing: this is season ${c?.n || ''} of his career, which began in ${ahSeason(p.y0)}.` : `${esc(p.name)}'s last season was <b>${ahSeason(p.y1)}</b>${teams.length ? ` with the ${esc(await TMn(teams.at(-1).ab))}` : ''}, after ${c?.n || p.y1 - p.y0 + 1} seasons.`);
  else if (wants.seasons) text = `${esc(p.name)} ${live ? 'is in' : 'played'} <b>${live ? `season ${c?.n}` : `${c?.n || p.y1 - p.y0 + 1} seasons`}</b>${live ? '' : ` (${ahN(c?.g)} games)`}, from ${ahSeason(p.y0)}${live ? '' : ` to ${ahSeason(p.y1)}`}${teams.length ? `, for ${teams.length === 1 ? 'one team' : `${teams.length} teams`}` : ''}.`;
  else if (wants.rookie) { const D = (await ahDrafts()).by.get(p.id); text = `${esc(p.name)}'s rookie season was <b>${ahSeason(p.y0)}</b>${teams.length ? ` with the ${esc(await TMn(teams[0].ab))}` : ''}${D ? `, after going ${X.E.eraOrd(D.pick)} in the ${D.y} draft` : ''}.`; }
  if (!text) return null;
  return { text, html: facts, ...X.out };
}

/* ---------------- franchises: records, eras, best and worst ---------------- */
async function ahTeamHist(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  if (X.ps.length) return null;
  const TM = await ahTeams();
  const pct = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);
  const done = TM.filter(r => r.y < I.cur);
  const tRow = (r, v, sub) => { const cur = Object.values(S.teams).find(t => t.abbr === X.E.eraAbbr(r.ab)); const known = cur && nameKey(cur.name) === nameKey(r.name); return known ? Q.ui.tRow({ id: cur.id, abbr: cur.abbr, name: `${ahSeason(r.y)} ${r.name}` }, v, sub) : `<div class="ask-li"><span class="ask-face avatar" style="background:${X.E.eraColor(r.ab)};color:#fff">${esc(r.ab)}</span><span class="nm"><b>${esc(`${ahSeason(r.y)} ${r.name}`)}</b><small>${esc(sub || '')}</small></span><span class="v">${v}</span></div>`; };
  const F = await ahFranchise(Q, X);
  const wn = nn.match(/ (\d{2}) (?:plus |or more )?(?:win|wins|games) /) || nn.match(/ (?:won|win|wins) (\d{2}) /), ln = nn.match(/ (\d{2}) (?:plus |or more )?loss(?:es)? /) || nn.match(/ (?:lost|lose|loses) (\d{2}) /);
  // team stat superlatives: best offense / defense / pace / point differential, by year or ever
  const ts = has(/ (offen[cs]e|offensive rating|highest scoring team|scoring offense) /) ? ['ortg', 1, 'offense', 'points per 100 possessions'] : has(/ (defen[cs]e|defensive rating) /) ? ['drtg', -1, 'defense', 'points allowed per 100 possessions'] : has(/ (pace|fastest|slowest) /) ? ['pace', 1, 'pace', 'possessions a game'] : has(/ (srs|point differential|margin|most dominant) /) ? ['srs', 1, 'rating (SRS)', 'points better than average'] : has(/ (points per game|ppg|scored the most|most points) /) && has(/ teams? /) ? ['ppg', 1, 'scoring', 'points a game'] : null;
  if (ts && (X.y || has(/ (ever|all time|history|of all time) /) || X.decade) && !F) {
    const [k, dir, word, unit] = ts, worst = has(/ (worst|lowest|slowest|fewest) /);
    let L = (X.y ? TM.filter(r => r.y === X.y) : done).filter(r => r[k] != null); if (X.decade) L = L.filter(r => r.y > X.decade && r.y <= X.decade + 10);
    L.sort((a, b) => (worst ? -1 : 1) * dir * (b[k] - a[k])); const top = L.slice(0, Q.topN || 6); if (!top.length) return null;
    const adj = k === 'pace' ? (worst ? 'slowest' : 'fastest') : worst ? 'worst' : 'best';
    return { text: `The ${adj} ${word}${X.y ? ` of ${ahSeason(X.y)}` : X.decade ? ` of the ${X.decade}s` : ' on record'}: the <b>${X.y ? '' : ahSeason(top[0].y) + ' '}${esc(top[0].name)}</b> at ${top[0][k].toFixed(k === 'srs' ? 2 : 1)} ${unit} (${top[0].w}-${top[0].l}${top[0].po != null ? `, ${ahPo(top[0].po)}` : ''}).${X.y ? '' : ' Ratings are per 100 possessions, so eras with different pace compare fairly.'}`, html: card(top.map((r, i) => tRow(r, r[k].toFixed(k === 'srs' ? 2 : 1), `#${i + 1} · ${r.w}-${r.l}${r.po ? ` · ${r.po}` : ''}`)).join('')), ...X.out };
  }
  // best / worst records
  const recQ = has(/ (best|worst|most|fewest|greatest|winningest|losingest) /) && (has(/ (records?|wins|losses|teams?) /) || (F && has(/ (seasons?|years?) /))) && !has(/ (players?|scor\w*|points?|rebound\w*|assists?|rookies?|draft\w*|offen[cs]e|defen[cs]e) /);
  if (recQ && (X.y || X.decade || F || has(/ (ever|all time|history|of all time|in a season|single season|regular season) /))) {
    const worst = has(/ (worst|fewest wins|most losses|losingest) /);
    let L = X.y ? TM.filter(r => r.y === X.y) : F ? F.rows.filter(r => r.y < I.cur) : done; if (X.decade) L = L.filter(r => r.y > X.decade && r.y <= X.decade + 10);
    L = L.filter(r => r.w + r.l >= 40).sort((a, b) => (worst ? pct(a) - pct(b) || b.l - a.l : pct(b) - pct(a) || b.w - a.w)); const top = L.slice(0, Q.topN || 6); if (!top.length) return null;
    const scope = X.y ? ` in ${ahSeason(X.y)}` : F ? ` in ${F.old ? esc(F.name) : esc(F.short)} history` : X.decade ? ` of the ${X.decade}s` : ' in NBA history';
    return { text: `The ${worst ? 'worst' : 'best'} record${scope}: the <b>${X.y ? '' : ahSeason(top[0].y) + ' '}${esc(top[0].name)}, ${top[0].w}-${top[0].l}</b>${top[0].po != null ? ` (${ahPo(top[0].po)})` : ''}. Next: ${ahJoin(top.slice(1, 3).map(r => `the ${X.y ? '' : ahSeason(r.y) + ' '}${esc(ahNick(r.name))} (${r.w}-${r.l})`))}.`, html: card(top.map((r, i) => tRow(r, `${r.w}-${r.l}`, `#${i + 1}${r.po ? ` · ${r.po}` : ''}`)).join('')), ...X.out };
  }
  if (!F) {
    if ((wn || ln) && !X.y && has(/ (how many|teams?|which|who|seasons?|list|ever|history) /)) {
      const n = +(wn || ln)[1], L = done.filter(r => (wn ? r.w >= n : r.l >= n)).sort((a, b) => (wn ? b.w - a.w : b.l - a.l));
      return { text: `<b>${L.length} team${L.length === 1 ? ' has' : 's have'}</b> ${wn ? 'won' : 'lost'} ${n} or more games in a season. The ${wn ? 'most' : 'most losses'}: the ${ahSeason(L[0].y)} ${esc(L[0].name)} (${L[0].w}-${L[0].l}).`, html: card(L.slice(0, 12).map((r, i) => tRow(r, `${r.w}-${r.l}`, `#${i + 1}${r.po ? ` · ${r.po}` : ''}`)).join('')), ...X.out };
    }
    return null;
  }
  const nm = F.old ? `The ${esc(F.name)}` : `The ${esc(F.short)}`, mine = F.rows.slice().sort((a, b) => b.y - a.y), past = mine.filter(r => r.y < I.cur);
  if ((wn || ln) && !X.y) {
    const n = +(wn || ln)[1], L = past.filter(r => (wn ? r.w >= n : r.l >= n));
    if (has(/ (last|most recent|when) /) && !has(/ how many /)) return { text: L.length ? `${nm} last ${wn ? 'won' : 'lost'} ${n} games in <b>${ahSeason(L[0].y)}</b>, going ${L[0].w}-${L[0].l}${L[0].po != null ? ` (${ahPo(L[0].po)})` : ''}. They have done it ${ahTimes(L.length)}.` : `${nm} have never ${wn ? 'won' : 'lost'} ${n} games in a season. Their ${wn ? 'best' : 'worst'} is ${(wn ? past.slice().sort((a, b) => b.w - a.w) : past.slice().sort((a, b) => b.l - a.l))[0].w}-${(wn ? past.slice().sort((a, b) => b.w - a.w) : past.slice().sort((a, b) => b.l - a.l))[0].l}.`, html: L.length ? card(L.slice(0, 12).map(r => tRow(r, `${r.w}-${r.l}`, r.po || 'Missed the playoffs')).join('')) : '', ...X.out };
    return { text: `${nm} have had <b>${L.length} season${L.length === 1 ? '' : 's'}</b> with ${n} or more ${wn ? 'wins' : 'losses'}${L.length ? `, most recently ${ahSeason(L[0].y)} (${L[0].w}-${L[0].l})` : ''}.`, html: L.length ? card(L.slice(0, 15).map(r => tRow(r, `${r.w}-${r.l}`, r.po || 'Missed the playoffs')).join('')) : '', ...X.out };
  }
  // who led a team in a stat that year
  const st = ahStat(nn);
  if (X.y && st?.rate && has(/ (led|lead|leading|leader|top|best|most|who) /)) {
    const Sn = await X.E.eraSeason(X.y).catch(() => null), abs = new Set(F.rows.filter(r => r.y === X.y).map(r => r.ab)); if (!Sn || !abs.size) return null;
    const L = Sn.reg.filter(r => String(r.tm).split('/').some(a => abs.has(a)) && r[st.rate] != null && (r.g || 0) >= Sn.maxG * 0.4).sort((a, b) => b[st.rate] - a[st.rate]).slice(0, 5); if (!L.length) return null;
    const row = F.rows.find(r => r.y === X.y);
    return { text: `<b>${esc(L[0].name)}</b> led the ${ahSeason(X.y)} ${esc(row.name)} in ${st.word} at ${ahFmt(st, L[0][st.rate])}${st.pct ? '' : ' a game'}${L[1] ? `, ahead of ${ahJoin(L.slice(1, 3).map(r => `${esc(r.name)} (${ahFmt(st, r[st.rate])})`))}` : ''}. The team went ${row.w}-${row.l}.`, html: card(L.map(r => ahRow(I.byId.get(r.id) || ahP1(I, r.id, r.name), ahFmt(st, r[st.rate]), `${r.g} games · ${r.pts?.toFixed(1)} PTS`, X)).join('')), ...X.out };
  }
  // the franchise year by year
  if (has(/ (history|by year|year by year|every season|all time record|all time|records? by|over the years|since \d{4}|decade|franchise|best seasons?|worst seasons?|best teams?|worst teams?) /) && !X.y) {
    const W = past.reduce((a, r) => a + r.w, 0), Ls = past.reduce((a, r) => a + r.l, 0), best = past.slice().sort((a, b) => pct(b) - pct(a))[0], titles = past.filter(r => r.po === 'Champions').length, po = past.filter(r => r.po).length;
    let show = mine; if (X.decade) show = show.filter(r => r.y > X.decade && r.y <= X.decade + 10);
    return { text: `${nm} are <b>${ahN(W)}-${ahN(Ls)}</b> all time over ${past.length} seasons (${(100 * W / (W + Ls)).toFixed(1)}%), with ${titles} championship${titles === 1 ? '' : 's'} and ${po} playoff appearances. Their best record: ${best.w}-${best.l} in ${ahSeason(best.y)}.`, html: card(ahTbl(['Season', 'Team', 'W-L', 'Result'], show.slice(0, 30).map(r => `<tr><td>${ahSeason(r.y)}</td><td>${esc(ahNick(r.name))}</td><td>${r.w}-${r.l}</td><td>${esc(r.y === I.cur ? 'In progress' : r.po || '')}</td></tr>`))), ...X.out };
  }
  return null;
}

/* ---------------- the record book, the league through time, and the big argument ---------------- */
async function ahMisc(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  if (IS_W) return null; // the record book and league averages here are the NBA's
  if (has(/ in a (single )?game | single game | game record | one game | in one night /) && has(/ (most|record|highest|ever|who scored|who had|all time) /) && !X.ps.length && !has(/ (this season|this year|last night|tonight|playoffs?) /)) {
    const g = AH_GAME.find(([re]) => re.test(nn)); if (!g) return null;
    const p = I.byId.get(g[3]);
    return { text: g[2], html: p ? card(ahRow(p, null, `Single-game ${g[1]} record`, X)) : '', ...X.out };
  }
  if (has(/ (highest scoring|most points in an?) (nba )?game /) && has(/ (ever|all time|history|record|teams?) /) && !X.ps.length) return { text: 'The highest-scoring game in NBA history: the Detroit Pistons beat the Denver Nuggets <b>186-184</b> in three overtimes on December 13, 1983. The 370 combined points are still the record.', ...X.out };
  if (has(/ (who scored|scored) (100|a hundred|one hundred) /) || has(/ 100 point game /)) { const p = I.byId.get('chambwi01'); return { text: AH_GAME[0][2], html: p ? card(ahRow(p, '100', 'March 2, 1962', X)) : '', ...X.out }; }
  if (has(/ (goat|greatest of all time|greatest player|best player (ever|of all time|in (nba )?history)|greatest ever|best ever) /) && !X.ps[1]) {
    const C = await ahCareers(), ids = ['jordami01', 'jamesle01', 'abdulka01'], ps = ids.map(id => I.byId.get(id)).filter(Boolean);
    const cols = await Promise.all(ps.map(p => X.E.eraCol(p, null, X, `${ahSeason(p.y0).slice(0, 4)} to ${ahLive(p, I) ? 'now' : p.y1}`, '')));
    const c = id => C.get(id), row = (lab, f) => ({ lab, vals: ids.map(id => f(c(id), id)) });
    const spec = { title: 'The usual three', sub: 'Career · regular season', cols, rows: [row('PTS', x => (x.ptsT / x.g).toFixed(1)), row('REB', x => (x.trbT / x.g).toFixed(1)), row('AST', x => (x.astT / x.g).toFixed(1)), row('Titles', x => String(x.rings.length)), row('MVPs', x => String(x.aw.MVP || 0)), row('All-NBA', x => String(ahAwCount(x, 'NBA')))] };
    return { text: `That one is an argument, not a stat. The names it usually comes down to are <b>Michael Jordan</b> (6 titles in 6 Finals, 10 scoring titles), <b>LeBron James</b> (the all-time leading scorer, 4 titles, the longest prime) and <b>Kareem Abdul-Jabbar</b> (6 MVPs, the most ever). Here is the case in numbers; ask me to compare any two.`, html: card(X.E.ecHTML(spec)), ...X.out };
  }
  // the league through time
  if (has(/ (league average|average (nba )?(player|team|score|height|age|weight)|leaguewide|league wide|scoring (era|environment)|pace of play) /) || (has(/ (when (was|were|did)|which (year|season|era|decade)|what (year|season|era)) /) && has(/ (highest|most|lowest|fewest|fastest|slowest|peak) /) && has(/ (scoring|pace|threes|three pointers|points) /) && !X.ps.length && !Q.teams.length && !Q.players.length)) {
    const G = await ahGet('league'), R = G.rows.map(r => ahObj(G.cols, r)).filter(r => r.y < I.cur);
    const k = has(/ (pace|fastest|slowest|possessions) /) ? ['pace', 'possessions a game', 1] : has(/ (threes|three pointers|3 pointers|from three) /) ? ['tpa', 'three-point attempts a game', 1] : has(/ (height|tall) /) ? ['height', '', 0] : has(/ (age|old|young) /) ? ['age', 'years', 1] : has(/ (true shooting|efficien\w*) /) ? ['ts', '', 3] : ['pts', 'points a game', 1];
    if (X.y) { const r = R.find(x => x.y === X.y) || G.rows.map(x => ahObj(G.cols, x)).find(x => x.y === X.y); if (!r) return null; return { text: `In ${ahSeason(X.y)} the average NBA team scored <b>${r.pts} points</b> a game at a pace of ${r.pace ?? '–'} possessions${r.tpa ? `, taking ${r.tpa} threes` : ''}. The average player was ${r.height || '–'} and ${r.age} years old.`, html: card(ahTbl(['Season', 'PTS', 'Pace', '3PA', 'FG%', 'Age'], R.filter(x => Math.abs(x.y - X.y) <= 4).sort((a, b) => b.y - a.y).map(x => `<tr${x.y === X.y ? ' class="me"' : ''}><td>${ahSeason(x.y)}</td><td>${x.pts}</td><td>${x.pace ?? '–'}</td><td>${x.tpa ?? '–'}</td><td>${x.fgp != null ? (x.fgp * 100).toFixed(1) : '–'}</td><td>${x.age}</td></tr>`))), ...X.out }; }
    if (k[0] === 'height') { const r = R.at(-1); return { text: `The average NBA player last season was <b>${esc(r.height)}</b>, ${r.weight} pounds and ${r.age} years old.`, ...X.out }; }
    const low = has(/ (lowest|fewest|slowest|least) /), L = R.filter(r => r[k[0]] != null).sort((a, b) => (low ? a[k[0]] - b[k[0]] : b[k[0]] - a[k[0]])), last = R.at(-1);
    return { text: `The ${low ? 'lowest' : 'highest'} league-wide ${k[1].replace(/ a game$/, '')} came in <b>${ahSeason(L[0].y)}</b>: ${L[0][k[0]]} ${k[1]}. Last season it was ${last[k[0]]}.`, html: card(ahTbl(['Season', 'PTS', 'Pace', '3PA', 'FG%'], L.slice(0, 10).map(x => `<tr><td>${ahSeason(x.y)}</td><td>${x.pts}</td><td>${x.pace ?? '–'}</td><td>${x.tpa ?? '–'}</td><td>${x.fgp != null ? (x.fgp * 100).toFixed(1) : '–'}</td></tr>`))), ...X.out };
  }
  return null;
}

/* ---------------- this season's advanced numbers (updated weekly) ---------------- */
async function ahNowAdv(X, Q) {
  const { nn, I } = X, has = re => re.test(nn);
  const st = ahStat(nn); if (!st || !['per', 'usg', 'ws', 'bpm'].includes(st.k) || X.y || X.decade || has(/ (ever|all time|history|career|what is|what s|whats|mean|explain|define|teams?) /)) return null;
  const Sn = await X.E.eraSeason(I.cur).catch(() => null); if (!Sn) return null;
  const p = X.ps[0] || (Q.players[0] && I.byKey.get(X.E.eraFold(Q.players[0].name))?.[0]);
  const L = Sn.reg.filter(r => r[st.rate] != null && (r.g || 0) >= 0.5 * Sn.maxG && (r.mp || 0) >= 20).sort((a, b) => b[st.rate] - a[st.rate]); if (!L.length) return null;
  const P = r => I.byId.get(r.id) || ahP1(I, r.id, r.name);
  if (p) { const r = Sn.byId.get(p.id); if (!r || r[st.rate] == null) return null; const i = L.findIndex(x => x.id === p.id); return { text: `${esc(p.name)}'s ${st.word} this season is <b>${ahFmt(st, r[st.rate])}</b>${i >= 0 ? `, ${X.E.eraOrd(i + 1)} among regulars` : ''}. ${esc(L[0].name)} leads at ${ahFmt(st, L[0][st.rate])}. These update weekly.`, html: card(ahRow(p, ahFmt(st, r[st.rate]), `${r.g} games · ${r.pts?.toFixed(1)} PTS`, X)), ...X.out }; }
  const top = L.slice(0, Q.topN || 5);
  return { text: `${esc(top[0].name)} leads the NBA in ${st.word} this season at <b>${ahFmt(st, top[0][st.rate])}</b>, ahead of ${ahJoin(top.slice(1, 3).map(r => `${esc(r.name)} (${ahFmt(st, r[st.rate])})`))}. Regulars only; these update weekly.`, html: card(top.map((r, i) => ahRow(P(r), ahFmt(st, r[st.rate]), `#${i + 1} · ${r.tm} · ${r.pts?.toFixed(1)} PTS`, X)).join('')), ...X.out };
}

/* ---------------- WNBA: champions, MVPs and career leaders (what the History page holds) ---------------- */
async function wnbaHist(raw, Q) {
  const { nn } = Q, has = re => re.test(nn);
  const H = await lazy('history').catch(() => null), Hd = H ? await H.loadHist().catch(() => null) : null; if (!Hd?.champions) return null;
  const out = { ctx: {}, src: 'Basketball-Reference' };
  const ym = nn.match(/ ((?:19|20)\d\d) /), y = ym ? +ym[1] : null;
  const CH = Hd.champions.filter(c => c.champ), cur = Math.max(...CH.map(c => c.y));
  const titleQ = has(/ (finals|championships?|champions?|champs?|titles?|won it all|rings?) /);
  const st = [['pts', / (points?|scor\w*) /, 'points'], ['trb', / (rebound\w*|boards) /, 'rebounds'], ['ast', / (assists?) /, 'assists'], ['stl', / (steals?) /, 'steals'], ['blk', / (blocks?) /, 'blocks'], ['fg3', / (threes|three pointers?|3s|3 pointers?) /, 'threes'], ['g', / (games( played)?) /, 'games']].find(x => x[1].test(nn));
  if (st && has(/ (career|all time|ever|in (wnba )?history|of all time) /) && has(/ (most|leaders?|leading|who has|record|top) /) && !Q.players.length) {
    const L = (Hd.leaders?.[st[0]] || []).slice(0, Q.topN || 10); if (!L.length) return null;
    return { text: `${esc(L[0].name)} is the WNBA's all-time leader in ${st[2]} with <b>${ahN(L[0].v)}</b>. Next: ${ahJoin(L.slice(1, 3).map(x => `${esc(x.name)} (${ahN(x.v)})`))}.`, html: card(ahTbl(['#', 'Player', st[2][0].toUpperCase() + st[2].slice(1)], L.map(x => `<tr data-hleg="${esc(x.id)}" style="cursor:pointer"><td>${x.r}</td><td>${esc(x.name)}${x.active ? ' <small>active</small>' : ''}</td><td>${ahN(x.v)}</td></tr>`)) + `<button class="btn ghost" data-view="history">Open History</button>`), ...out };
  }
  if (has(/ (mvps?|most valuable) /) && !has(/ finals mvp /) && !has(/ (race|ladder|odds|this (season|year)|right now) /) && (y || has(/ (winners|list|history|most|every|all time|last (year|season)) /))) {
    const M = Hd.mvp || [];
    if (y && y <= cur) { const m = M.find(x => x.y === y); if (!m) return { text: `I don't have a WNBA MVP for ${y}.`, ...out }; return { text: `<b>${esc(m.name)}</b> (${esc(m.team)}) was the ${y} WNBA MVP.`, html: card(ahTbl(['Year', 'MVP', 'Team'], M.filter(x => Math.abs(x.y - y) <= 3).map(x => `<tr${x.y === y ? ' class="me"' : ''}><td>${x.y}</td><td>${esc(x.name)}</td><td>${esc(x.team)}</td></tr>`))), ...out }; }
    if (has(/ most /)) { const by = new Map(); for (const m of M) by.set(m.name, (by.get(m.name) || 0) + 1); const L = [...by].sort((a, b) => b[1] - a[1]).slice(0, 8); return { text: `${esc(L[0][0])} has the most WNBA MVPs with <b>${L[0][1]}</b>, then ${ahJoin(L.slice(1, 3).map(x => `${esc(x[0])} (${x[1]})`))}.`, html: card(ahTbl(['Player', 'MVPs'], L.map(x => `<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`))), ...out }; }
    return { text: `WNBA MVPs, newest first. ${esc(M[0].name)} won in ${M[0].y}.`, html: card(ahTbl(['Year', 'MVP', 'Team'], M.slice(0, 20).map(x => `<tr><td>${x.y}</td><td>${esc(x.name)}</td><td>${esc(x.team)}</td></tr>`))), ...out };
  }
  if (!titleQ || has(/ (odds|favorite|will win|going to win|this (season|year)|stats|averag\w*) /)) return null;
  const t = Q.teams[0];
  if (y && y <= cur && !has(/ (how many|most|last time) /)) { const c = CH.find(x => x.y === y); if (!c) return { text: `I don't have a WNBA champion for ${y}.`, ...out }; return { text: `The <b>${esc(c.champ)}</b> won the ${y} WNBA championship${c.runner ? `, beating the ${esc(c.runner)} in the Finals` : ''}.`, html: card(ahTbl(['Year', 'Champion', 'Runner-up'], CH.filter(x => Math.abs(x.y - y) <= 3).map(x => `<tr${x.y === y ? ' class="me"' : ''}><td>${x.y}</td><td>${esc(x.champ)}</td><td>${esc(x.runner || '')}</td></tr>`))), ...out }; }
  if (t) {
    const mine = CH.filter(c => c.champ === t.name || c.champ.endsWith(' ' + (t.short || '~'))), lost = CH.filter(c => c.runner === t.name || (c.runner || '').endsWith(' ' + (t.short || '~')));
    return { text: mine.length ? `The ${esc(t.short || t.name)} have won <b>${mine.length} WNBA championship${mine.length > 1 ? 's' : ''}</b>: ${mine.map(c => c.y).reverse().join(', ')}${lost.length ? `. They lost the Finals ${ahTimes(lost.length)}` : ''}.` : `The ${esc(t.short || t.name)} have never won a WNBA championship${lost.length ? `. They reached the Finals in ${lost.map(c => c.y).reverse().join(', ')}` : ''}.`, ctx: { teamId: t.id }, src: out.src };
  }
  if (has(/ most /)) { const by = new Map(); for (const c of CH) by.set(c.champ, (by.get(c.champ) || 0) + 1); const L = [...by].sort((a, b) => b[1] - a[1]).slice(0, 8); return { text: `The ${esc(L[0][0])} have the most WNBA championships with <b>${L[0][1]}</b>, then the ${ahJoin(L.slice(1, 3).map(x => `${esc(x[0])} (${x[1]})`))}.`, html: card(ahTbl(['Team', 'Titles'], L.map(x => `<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`))), ...out }; }
  if (has(/ (defending|reigning|last (year|season)|who won the (title|championship|finals) ) /) && !has(/ (list|every|all|last \d+) /)) return { text: `The <b>${esc(CH[0].champ)}</b> are the defending WNBA champions. They beat the ${esc(CH[0].runner)} in the ${CH[0].y} Finals.`, ...out };
  if (has(/ (list|every|all|recent|last (\d+|few|five|ten)|by year|past|history|winners) /)) return { text: `WNBA champions, newest first. The ${esc(CH[0].champ)} won in ${CH[0].y}.`, html: card(ahTbl(['Year', 'Champion', 'Runner-up'], CH.slice(0, 20).map(x => `<tr><td>${x.y}</td><td>${esc(x.champ)}</td><td>${esc(x.runner || '')}</td></tr>`)) + `<button class="btn ghost" data-view="history">Open History</button>`), ...out };
  return null;
}

/* ---------------- the router ---------------- */
async function histAnswer(raw, Q) {
  if (IS_C) return null;
  const E = await lazy('eras');
  let I; try { I = await E.eraIndex(); } catch (e) { return null; }
  // a follow-up to the last history answer: "what about 1999?", "and Kobe?"
  const C0 = Q.ctx || {}, fu = String(raw).trim().match(/^(?:and|what about|how about|ok and|and what about|same for|now)\s+(?:in\s+|the\s+)?(.{2,40}?)\??$/i);
  if (fu && C0.hq) {
    const x = fu[1].trim(), yr = x.match(/^(?:19|20)\d\d(?:\s*-\s*\d\d)?$|^'\d\d$|^(?:the )?\d0s$/);
    const yearRe = /\b(?:19|20)\d\d\s*[-\/]\s*\d\d\b|\b(?:19|20)\d\ds?\b|'\d\ds?\b|\b\d0s\b/;
    let q2 = null;
    if (yr) q2 = yearRe.test(C0.hq) ? C0.hq.replace(yearRe, x) : `${C0.hq} ${x}`;
    else {
      const nk = t => ' ' + nameKey(t) + ' ', s1 = ahStat(nk(C0.hq)), s2 = ahStat(nk(x)), who = E.eraFindPlayers(' ' + E.eraFold(x) + ' ', I, null)[0];
      if (s2 && s1 && nameKey(x).split(' ').length <= 3) { const m = nk(C0.hq).match(s1.re); if (m) q2 = nameKey(C0.hq).replace(m[1], nameKey(x)); } // "what about rebounds?"
      else if (who && C0.hpName && new RegExp(C0.hpName, 'i').test(C0.hq)) q2 = C0.hq.replace(new RegExp(C0.hpName, 'i'), x); // "and Kobe?"
      else if (who && /\b(he|his|him)\b/i.test(C0.hq)) { const r = await histAnswer(C0.hq, { ...Q, nn: nk(C0.hq.replace(/%/g, ' percent ')), ctx: { hp: who.id }, players: [] }); if (r) return { ...r, ctx: { ...r.ctx, hp: who.id, hpFull: who.name } }; }
      if (q2 && s2 && C0.hp && /\b(he|his|him)\b/i.test(q2)) { const r = await histAnswer(q2, { ...Q, nn: nk(q2), ctx: { hp: C0.hp, pid: C0.pid }, players: [] }); if (r) return r; }
    }
    if (q2 && q2 !== raw) { const n2 = ' ' + nameKey(q2.replace(/%/g, ' percent ').replace(/(\d)\+/g, '$1 plus ')) + ' '; const r = await histAnswer(q2, { ...Q, nn: n2, ctx: {}, teams: Q.teams?.length ? Q.teams : Q.findTeams ? Q.findTeams(q2, n2) : [] }); if (r) return r; }
  }
  const low = ' ' + deaccent(String(raw)).toLowerCase().replace(/[’`]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim() + ' ';
  const yrs = E.eraYears(low, I.cur), years = [...new Set(yrs.filter(v => v.y).map(v => v.y))], decade = yrs.find(v => v.decade)?.decade || null;
  const nn = Q.nn;
  // the players named: team names and cities come out first so "Houston" and "Washington" aren't read as people
  let txt = low.replace(/\b(?:19|20)\d\d\s*[-\/]\s*\d\d\b|\b(?:19|20)\d\ds?\b|'\d\ds?\b|\b\d0s\b/g, ' ');
  const magicMan = / magic /.test(low) && !/ orlando /.test(low) && / (position|tall|height|old|born|college|draft\w*|retire\w*|rings?|mvps?|assists?|points|career|stats|play(ed)? for|teams? did|hall of fame|johnson) /.test(low);
  for (const t of Q.teams || []) for (const k of [t.name, t.short, t.loc]) if (k && k.length > 3 && !(magicMan && nameKey(k) === 'magic')) txt = txt.split(` ${nameKey(k)} `).join(' ');
  txt = txt.replace(/\b(draft\w*|pick\w*|hall of fame|all[- ]stars?|all[- ]nba|all[- ]defensive|finals|college|retire\w*|born|height|tall\w*|shortest|teams?|club|rings?|championships?|titles?|youngest|oldest|old|ever|list|center|centers|guards?|forwards?|age|aged|record|records|wins?|loss\w*|beat|lost|won|led|offense|defense|pace|goat|league|usage|efficiency|shooting|true|shares|franchise|drought|seasons?|averaged?|averaging)\b/g, ' ');
  const [H] = await Promise.all([lazy('history').catch(() => null), ensureTeamColors()]);
  const Hd = H ? await H.loadHist().catch(() => null) : null;
  let ps = E.eraFindPlayers(txt, I, years.length === 1 ? years[0] : null);
  // "how many rings does he have": the player the last answer was about
  if (!ps.length && / (he|his|him|hes) /.test(nn)) {
    const row = C0.pid && (Q.rows || []).find(r => String(r.id) === String(C0.pid));
    const p0 = (C0.hp && I.byId.get(C0.hp)) || (row && I.byKey.get(E.eraFold(row.name))?.[0]);
    if (p0) ps = [p0];
  }
  if (!years.length && C0.y && / (that (year|season)|same (year|season)|then) /.test(nn)) years.push(C0.y);
  if (magicMan) Q = { ...Q, teams: (Q.teams || []).filter(t => !/magic/i.test(t.name)) };
  // the words the question used for the first player, so a follow-up can swap in another name
  const hpName = ps[0] ? [ps[0].name, ps[0].last, ps[0].first, ...Object.keys(E.ERA_ALIAS).filter(k => E.ERA_ALIAS[k] === ps[0].id)].map(k => nameKey(k)).filter(k => k && low.includes(` ${k} `)).sort((a, b) => b.length - a.length)[0] : null;
  const X = { E, I, H, Hd, rows: Q.rows || [], nn, years, y: years.length === 1 ? years[0] : null, decade, ps, out: { ctx: { hq: String(raw), hpFull: ps[0]?.name || null, pid: (ps[0] && (Q.rows || []).find(r => E.eraFold(r.name) === ps[0].key && ps[0].y1 >= I.cur - 1)?.id) || null, hp: ps[0]?.id || null, hpName: hpName || null, y: years.length === 1 ? years[0] : null }, src: 'Basketball-Reference' } };
  for (const fn of [ahMisc, ahDraft, ahHonors, ahTitles, ahCareer, ahBio, ahSearch, ahTeamHist, ahNowAdv]) {
    try { const r = await fn(X, Q); if (r) return r; } catch (e) { console.warn('ask history', fn.name, e); }
  }
  return null;
}
