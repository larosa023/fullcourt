/* =====================================================================
   ASK FULLCOURT — rule-based question answering over ESPN's live feeds
   ===================================================================== */
const ASK = { ctx: {}, log: [], busy: false };
const lastNight = () => etNow().hour < ROLLOVER_HOUR ? S.today : addDays(S.today, -1);
const dayLabel = d => d === S.today ? 'tonight' : d === lastNight() || d === addDays(S.today, -1) ? 'last night' : 'on ' + fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' });
const teamNick = id => S.teams[id]?.short || S.teams[id]?.abbr || 'Team';
const STAT = {
  pts: { label: 'points', short: 'PTS', unit: 'points' },
  reb: { label: 'rebounds', short: 'REB', unit: 'rebounds' },
  ast: { label: 'assists', short: 'AST', unit: 'assists' },
  stl: { label: 'steals', short: 'STL', unit: 'steals' },
  blk: { label: 'blocks', short: 'BLK', unit: 'blocks' },
  tpm: { label: '3-pointers made', short: '3PM', unit: 'threes' },
  ftm: { label: 'free throws made', short: 'FTM', unit: 'free throws' },
  tov: { label: 'turnovers', short: 'TO', unit: 'turnovers' },
  min: { label: 'minutes', short: 'MIN', unit: 'minutes' },
  fgp: { label: 'field goal %', short: 'FG%', pct: true },
  tpp: { label: '3-point %', short: '3P%', pct: true },
  ftp: { label: 'free throw %', short: 'FT%', pct: true },
  dd: { label: 'double-doubles', short: 'DD', total: true },
  td: { label: 'triple-doubles', short: 'TD', total: true },
  pm: { label: 'plus-minus', short: '+/-' },
};
const STAT_RES = [
  ['tpp', /\b((3|three)[ -]?(p|pt|point|pointers?)?s? ?(%|percent(age)?|pct|shooting|shooters?)|3p%|3pt%|from (three|deep|3) ?(%|percent)|(deep|outside) shoot(ing|ers?))/],
  ['ftp', /\b(ft ?(%|percent(age)?|pct)|free[ -]throw (%|percent(age)?|pct|shooting|shooters?))/],
  ['fgp', /\b(fg ?(%|percent(age)?|pct)|field[ -]goal (%|percent(age)?|pct)|shooting (%|percent(age)?)|efficien\w*|best shooters?|shooters?)\b/],
  ['td', /\btriple[ -]?doubles?\b/],
  ['dd', /\bdouble[ -]?doubles?\b/],
  ['tpm', /\b(threes|three[ -]pointers?|3[ -]pointers?|3s|3pm|triples|treys)\b/],
  ['ftm', /\bfree[ -]throws?\b/],
  ['pm', /\b(plus[ -]?minus|\+\/-)/],
  ['pts', /\b(points?|pts|scor(e|ed|er|ers|es|ing)|ppg|buckets)\b/],
  ['reb', /\b(rebound(s|ing|er|ers)?|boards|rebs?|rpg)\b/],
  ['ast', /\b(assist(s|ing)?|dimes|asts?|apg|passing|playmaking)\b/],
  ['stl', /\b(steal(s|ing)?|stls?|spg)\b/],
  ['blk', /\b(block(s|ing|ed)?|blks?|bpg|rejections?|shot blocking)\b/],
  ['tov', /\b(turnovers?|tovs?|giveaways)\b/],
  ['min', /\b(minutes|mins|mpg)\b/],
];
const NICKS = {
  sixers: 'PHI', '76ers': 'PHI', cavs: 'CLE', mavs: 'DAL', wolves: 'MIN', 't-wolves': 'MIN', twolves: 'MIN', blazers: 'POR', 'trail blazers': 'POR',
  dubs: 'GS', clips: 'LAC', pels: 'NO', grizz: 'MEM', raps: 'TOR', celts: 'BOS', wiz: 'WSH', okc: 'OKC', nola: 'NO', 'new orleans': 'NO',
  'golden state': 'GS', 'san antonio': 'SA', 'new york': 'NY', 'oklahoma city': 'OKC', 'la clippers': 'LAC', 'la lakers': 'LAL',
};
const PNICKS = {
  sga: 'shai gilgeous alexander', shai: 'shai gilgeous alexander', lebron: 'lebron james', bron: 'lebron james', kd: 'kevin durant', giannis: 'giannis antetokounmpo',
  jokic: 'nikola jokic', joker: 'nikola jokic', embiid: 'joel embiid', wemby: 'victor wembanyama', wembanyama: 'victor wembanyama', luka: 'luka doncic', steph: 'stephen curry',
  ant: 'anthony edwards', 'ant man': 'anthony edwards', ja: 'ja morant', book: 'devin booker', dame: 'damian lillard', cp3: 'chris paul', kat: 'karl anthony towns',
  zion: 'zion williamson', trae: 'trae young', hali: 'tyrese haliburton', spida: 'donovan mitchell', jjj: 'jaren jackson jr', 'the greek freak': 'giannis antetokounmpo',
};
const ABBR_OK = new Set(['CON', 'LV', 'LVA', 'LA', 'LAS', 'SEA', 'GSV', 'PHO', 'NYL', 'CHI', 'IND', 'DAL', 'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GS', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NO', 'NOP', 'NY', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SA', 'SAS', 'TOR', 'UTA', 'UTAH', 'WSH', 'WAS']);
const ABBR_ALIAS = { GSW: 'GS', NOP: 'NO', NYK: 'NY', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };
const STOP = new Set(('how many much what whats who whos whose which when where did does do is was were are has have had the a an in on of for to at by with from vs versus against and or ' +
  'last night tonight today yesterday this season seasons career game games average averaging averages avg per so far score scored scoring scores ' +
  'points point pts rebounds rebound boards assists assist dimes steals steal blocks block threes three pointers pointer 3s made make makes shooting shot shots percentage percent pct ' +
  'field goal goals free throw throws minutes turnovers turnover double doubles triple triples plus minus most top best highest lowest fewest worst lead leads leader leaders leading ' +
  'league nba stats stat statline line record standings play plays playing next schedule odds spread moneyline me show tell get give his her he him their they them it its ' +
  'team teams player players compare compared vs. than better more less good doing been total totals number numbers lately recent recently right now currently ' +
  'east eastern west western conference conf rank ranked ranking where place first second seed seeds back over under o u favored favorite underdog win won lose lost beat result final ' +
  'night week month october november december january february march april monday tuesday wednesday thursday friday saturday sunday s 1st 2nd 3rd th ' +
  'about any all every some can could you please i my mine our up out off one two scorer scorers rebounder rebounders shooter shooters passer passers guy guys rebounding assisting passing blocking stealing playmaking').split(' '));

/* ---------------- parsing ---------------- */
function teamAliases() {
  if (ASK.aliases && ASK.aliasN === Object.keys(S.teams).length) return ASK.aliases;
  const list = [];
  for (const t of Object.values(S.teams)) {
    if (!t.name || !t.abbr) continue;
    list.push([nameKey(t.name), t.id]);
    if (t.short) list.push([nameKey(t.short), t.id]);
    if (t.loc && !/los angeles/i.test(t.loc)) list.push([nameKey(t.loc), t.id]);
  }
  for (const [k, ab] of Object.entries(NICKS)) { const t = Object.values(S.teams).find(x => x.abbr === ab); if (t) list.push([k, t.id]); }
  list.sort((a, b) => b[0].length - a[0].length);
  ASK.aliases = list; ASK.aliasN = Object.keys(S.teams).length;
  return list;
}
function findTeams(raw, n) {
  const found = []; let rest = n;
  for (const [k, id] of teamAliases()) {
    const re = new RegExp(`(^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
    if (re.test(rest)) { if (!found.includes(id)) found.push(id); rest = rest.replace(re, ' # '); }
  }
  for (const m of raw.matchAll(/\b([A-Z]{2,4})\b/g)) {
    const ab = ABBR_ALIAS[m[1]] || m[1];
    if (!ABBR_OK.has(m[1])) continue;
    const t = Object.values(S.teams).find(x => x.abbr === ab);
    if (t && !found.includes(t.id)) { found.push(t.id); rest = rest.replace(new RegExp(`(^| )${m[1].toLowerCase()}( |$)`), ' # '); }
  }
  return { teams: found, rest };
}
function matchPlayer(text, rows) {
  let t = nameKey(text).split(' ').filter(w => w && !STOP.has(w) && !/^\d+$/.test(w) && w !== '#').join(' ');
  if (!t || t.length < 2) return null;
  if (PNICKS[t]) t = PNICKS[t];
  else { const two = t.split(' ').slice(0, 2).join(' '); if (PNICKS[two]) t = PNICKS[two]; }
  const toks = t.split(' ');
  let best = null, bestScore = 0;
  for (const r of rows) {
    const nk = r.key, parts = nk.split(' '), last = nameKey(r.last), first = nameKey(r.first);
    let s = 0;
    if (nk === t) s = 100;
    else if (t.includes(nk)) s = 92;
    else if (toks.length >= 2 && toks.every(w => parts.some(p => p.startsWith(w)))) s = 75;
    else if (last && (t === last || toks.includes(last) || toks.some(w => last.split(' ').includes(w) && w.length >= 3))) s = 60;
    else if (first && toks.length === 1 && t === first && t.length >= 4) s = 40;
    else if (toks.some(w => w.length >= 4 && parts.some(p => p.startsWith(w)))) s = 25;
    if (!s) continue;
    s += Math.min(9, (r.pts || 0) / 4) + Math.min(3, (r.gp || 0) / 3);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return bestScore >= 30 ? best : null;
}
async function searchPlayerFallback(text) {
  const q = nameKey(text).split(' ').filter(w => !STOP.has(w) && w !== '#').join(' ');
  if (q.length < 3) return null;
  try {
    const r = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(q)}&limit=5&type=player&sport=basketball&league=${LG}`, { retries: 0, timeout: 7000 });
    const it = (r.items || []).find(i => i.league === LG && i.isActive !== false);
    if (!it) return null;
    const tn = it.teamRelationships?.[0]?.displayName, t = teamByName(tn);
    return { id: it.id, name: it.displayName, first: it.displayName.split(' ')[0], last: it.displayName.split(' ').slice(1).join(' '), teamId: t?.id, abbr: t?.abbr || '', pos: it.position?.abbreviation || '', gp: 0 };
  } catch (e) { return null; }
}
function parseTime(n) {
  let m;
  if (/\b(last night|yesterday|last nights)\b/.test(n)) return { kind: 'date', date: lastNight() };
  if (/\b(tonight|today|this evening|so far today)\b/.test(n)) return { kind: 'date', date: S.today };
  if ((m = n.match(/\blast (\d{1,2}) games?\b/)) || (m = n.match(/\bpast (\d{1,2}) games?\b/))) return { kind: 'lastN', n: Math.max(1, Math.min(82, +m[1])) };
  if (/\b(last|previous|most recent|latest) game\b/.test(n)) return { kind: 'lastN', n: 1 };
  if (/\b(lately|recently|recent games|last week)\b/.test(n)) return { kind: 'lastN', n: 5 };
  if (/\bcareer\b/.test(n)) return { kind: 'career' };
  const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if ((m = n.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const want = wd.indexOf(m[1]);
    for (let i = 0; i < 7; i++) { const d = addDays(S.today, -i); if (fromYmd(d).getUTCDay() === want) return { kind: 'date', date: d }; }
  }
  const mons = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if ((m = n.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(st|nd|rd|th)?\b/)) || (m = n.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    let mo, dy;
    if (isNaN(+m[1])) { mo = mons.indexOf(m[1].slice(0, 3)) + 1; dy = +m[2]; } else { mo = +m[1]; dy = +m[2]; }
    if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      const ty = +S.today.slice(0, 4), tm = +S.today.slice(4, 6);
      const startYear = tm >= 9 ? ty : ty - 1;
      const yr = mo >= 9 ? startYear : startYear + 1;
      return { kind: 'date', date: `${yr}${String(mo).padStart(2, '0')}${String(dy).padStart(2, '0')}` };
    }
  }
  if (/\b(this season|season|averag\w*|per game|so far)\b/.test(n)) return { kind: 'season' };
  return null;
}
function parseStat(n) { for (const [k, re] of STAT_RES) if (re.test(n)) return k; return null; }

/* ---------------- rendering helpers ---------------- */
const pRow = (p, value, sub) => `<button class="ask-li" data-player="${p.id}">${face(p.id, p.name, 'ask-face', 120)}<span class="nm"><b>${esc(p.name)}</b><small>${p.abbr ? logo(p.abbr, 32) : ''}${esc([p.abbr, sub].filter(Boolean).join(' · '))}</small></span>${value != null ? `<span class="v">${value}</span>` : ''}</button>`;
const tRow = (t, value, sub) => `<button class="ask-li" data-team="${t.id}">${logo(t.abbr, 64)}<span class="nm"><b>${esc(t.name || t.short)}</b><small>${esc(sub || '')}</small></span>${value != null ? `<span class="v">${value}</span>` : ''}</button>`;
const gRow = g => {
  const pre = g.state === 'pre', post = g.state === 'post';
  const sd = s => `<span class="gt${post && !s.winner ? ' lose' : ''}">${logo(s.abbr, 32)}${esc(s.abbr)}${pre ? '' : ` <b>${esc(s.score)}</b>`}</span>`;
  return `<button class="ask-li game-li" data-game="${g.id}">${sd(g.away)}<span class="at">@</span>${sd(g.home)}<span class="v small${g.state === 'in' ? ' live' : ''}">${esc(pre ? fmtTime(g.date) : statusText(g))}</span></button>`;
};
const table = (head, rows) => `<div class="ask-tbl-wrap"><table class="ask-tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const statWord = (k, v) => {
  const u = STAT[k]?.unit || STAT[k]?.label || '';
  if (k === 'tpm') return `${v} ${+v === 1 ? 'three' : 'threes'}`;
  if (+v === 1) return `1 ${u.replace(/s$/, '')}`;
  return `${v} ${u}`;
};
function lineSentence(r) {
  const bits = [`${r.pts} points`, `${r.reb} rebounds`, `${r.ast} assists`];
  const extra = [];
  if (r.stl >= 2) extra.push(`${r.stl} steals`);
  if (r.blk >= 2) extra.push(`${r.blk} blocks`);
  if (r.tp && r.tp[0] >= 3) extra.push(`${r.tp[0]} threes`);
  const all = [...bits, ...extra];
  return all.slice(0, -1).join(', ') + ' and ' + all.at(-1);
}

/* ---------------- intents ---------------- */
async function aPlayerSeason(p, stat, rows) {
  const r = rows.find(x => x.id === p.id) || p;
  if (!r.gp) return { text: `${esc(p.name)} hasn't played a game this season yet.`, html: card(pRow(p, null, p.pos)), ctx: { pid: p.id } };
  const g = plural(r.gp, 'game');
  let text;
  if (stat && STAT[stat] && stat !== 'pm') {
    const S1 = STAT[stat];
    if (S1.total) text = `${esc(r.name)} has ${plural(r[stat] || 0, S1.label.replace(/s$/, ''))} this season (${g}).`;
    else if (S1.pct) text = `${esc(r.name)} is shooting <b>${fpct(r[stat])}</b> ${stat === 'fgp' ? 'from the field' : stat === 'tpp' ? 'from three' : 'from the free-throw line'} this season (${g}).`;
    else text = `${esc(r.name)} is averaging <b>${f1(r[stat])} ${S1.unit}</b> per game this season (${g}).`;
    const rk = rankOf(rows, r, stat, stat === 'tov');
    if (rk && !S1.total && rk.rank <= 50) text += ` That ranks ${ordinal(rk.rank)} in the ${LGN} among regular players.`;
  } else {
    text = `${esc(r.name)} is averaging <b>${f1(r.pts)} points, ${f1(r.reb)} rebounds and ${f1(r.ast)} assists</b> in ${g} this season, shooting ${fpct(r.fgp)} from the field and ${fpct(r.tpp)} from three.`;
  }
  const html = card(pRow(r, null, `${r.pos} · ${g}`) + table(['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%'],
    [`<tr>${[r.gp, f1(r.min), f1(r.pts), f1(r.reb), f1(r.ast), f1(r.stl), f1(r.blk), f1(r.fgp), f1(r.tpp), f1(r.ftp)].map((v, i) => `<td class="${['', '', 'pts', 'reb', 'ast', 'stl', 'blk', 'fgp', 'tpp', 'ftp'][i] === stat ? 'hl' : ''}">${v}</td>`).join('')}</tr>`]));
  return { text, html, ctx: { pid: r.id, teamId: r.teamId } };
}
async function aPlayerOnDate(p, date, stat) {
  if (!p.teamId) return { text: `I couldn't find which team ${esc(p.name)} plays for.` };
  const games = await scoreboardOn(date);
  const g = games.find(x => x.home.id === p.teamId || x.away.id === p.teamId);
  const when = dayLabel(date);
  if (!g) return { text: `The ${esc(teamNick(p.teamId))} didn't play ${when}, so ${esc(p.name)} has no stats for that day.`, ctx: { pid: p.id } };
  const opp = g.home.id === p.teamId ? g.away : g.home, me = g.home.id === p.teamId ? g.home : g.away;
  if (g.state === 'pre') return { text: `The ${esc(teamNick(p.teamId))} play the ${esc(opp.name)} ${when} at ${esc(fmtTime(g.date))}. ${esc(p.name)}'s stats will show up here once the game starts.`, html: card(gRow(g)), ctx: { pid: p.id } };
  const d = await summaryOf(g.id);
  const r = boxRows(d).find(x => x.id === p.id);
  if (!r) return { text: `${esc(p.name)} isn't listed in the box score for the ${esc(teamNick(p.teamId))} game ${when}. ${HE} may be injured or inactive.`, html: card(gRow(g)), ctx: { pid: p.id } };
  if (r.dnp) return { text: `${esc(p.name)} didn't play ${when}${r.reason ? ` (${esc(r.reason.toLowerCase())})` : ''}.`, html: card(gRow(g)), ctx: { pid: p.id } };
  const live = g.state === 'in';
  const result = live ? `in the ${esc(teamNick(p.teamId))}' game against the ${esc(opp.name)} (${esc(statusText(g))}, ${me.score}–${opp.score})`
    : `in the ${esc(teamNick(p.teamId))}' ${me.score}–${opp.score} ${me.winner ? 'win over' : 'loss to'} the ${esc(opp.name)}`;
  let text;
  if (stat && stat !== 'pm' && !STAT[stat]?.pct && !STAT[stat]?.total) text = `${esc(p.name)} ${live ? 'has' : 'had'} <b>${statWord(stat, valOf(r, stat))}</b> ${when} ${result}.`;
  else if (stat === 'fgp' || stat === 'tpp' || stat === 'ftp') { const s = stat === 'fgp' ? r.fg : stat === 'tpp' ? r.tp : r.ft; text = `${esc(p.name)} ${live ? 'is' : 'went'} <b>${s[0]}-for-${s[1]}</b> ${stat === 'fgp' ? 'from the field' : stat === 'tpp' ? 'from three' : 'from the line'} ${when} ${result}.`; }
  else text = `${esc(p.name)} ${live ? 'has' : 'had'} <b>${lineSentence(r)}</b> ${when} ${result}.`;
  const html = card(pRow({ ...p, abbr: r.abbr }, null, `${r.min} min${r.starter ? ' · starter' : ''}`) + table(['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3PT', 'FT', '+/-'],
    [`<tr><td>${r.min}</td><td class="${stat === 'pts' ? 'hl' : ''}">${r.pts}</td><td class="${stat === 'reb' ? 'hl' : ''}">${r.reb}</td><td class="${stat === 'ast' ? 'hl' : ''}">${r.ast}</td><td class="${stat === 'stl' ? 'hl' : ''}">${r.stl}</td><td class="${stat === 'blk' ? 'hl' : ''}">${r.blk}</td><td>${r.tov}</td><td>${r.fg.join('/')}</td><td class="${stat === 'tpm' || stat === 'tpp' ? 'hl' : ''}">${r.tp.join('/')}</td><td>${r.ft.join('/')}</td><td>${esc(r.pm)}</td></tr>`]) + gRow(g));
  return { text, html, ctx: { pid: p.id, teamId: p.teamId } };
}
async function aPlayerLastN(p, n, stat, oppTeam) {
  let evs = await gameLog(p.id);
  if (oppTeam) evs = evs.filter(e => e.oppId === oppTeam.id || e.opp === oppTeam.abbr);
  const take = oppTeam ? evs : evs.slice(0, n);
  if (!take.length) return { text: oppTeam ? `${esc(p.name)} hasn't played the ${esc(oppTeam.short || oppTeam.name)} yet this season.` : `${esc(p.name)} hasn't played a regular-season game yet.`, ctx: { pid: p.id } };
  const avg = k => take.reduce((s, e) => s + (k === 'tpm' ? e.tp[0] : k === 'ftm' ? e.ft[0] : e[k]), 0) / take.length;
  const sum = (arr, i) => take.reduce((s, e) => s + e[arr][i], 0);
  const pct = arr => { const a = sum(arr, 1); return a ? (sum(arr, 0) / a * 100).toFixed(1) + '%' : '–'; };
  const span = oppTeam ? `against the ${esc(oppTeam.short || oppTeam.name)} this season (${plural(take.length, 'game')})`
    : take.length === 1 ? `in ${HIS} last game`
    : take.length < n ? `in all ${take.length} games ${HES} played this season` : `over ${HIS} last ${take.length} games`;
  let text;
  if (take.length === 1 && !oppTeam) {
    const e = take[0];
    text = `In ${HIS} last game (${esc(fmtShortDate(e.date))} ${esc(e.atVs)} ${esc(e.opp)}, ${esc(e.res)} ${esc(e.score)}), ${esc(p.name)} had <b>${lineSentence(e)}</b> on ${e.fg[0]}/${e.fg[1]} shooting.`;
  } else if (stat && STAT[stat] && !STAT[stat].total && stat !== 'pm') {
    if (STAT[stat].pct) text = `${esc(p.name)} is shooting <b>${pct(stat === 'fgp' ? 'fg' : stat === 'tpp' ? 'tp' : 'ft')}</b> ${stat === 'fgp' ? 'from the field' : stat === 'tpp' ? 'from three' : 'from the line'} ${span}.`;
    else text = `${esc(p.name)} is averaging <b>${f1(avg(stat))} ${STAT[stat].unit}</b> ${span}${['tpm', 'pts', 'reb', 'ast'].includes(stat) ? ` (${Math.round(avg(stat) * take.length)} total)` : ''}.`;
  } else text = `${esc(p.name)} is averaging <b>${f1(avg('pts'))} points, ${f1(avg('reb'))} rebounds and ${f1(avg('ast'))} assists</b> ${span}, shooting ${pct('fg')} from the field.`;
  const rowsH = take.slice(0, 15).map(e => `<tr data-game="${e.id}"><td>${esc(fmtShortDate(e.date))}</td><td>${esc(e.atVs)} ${esc(e.opp)}</td><td class="${e.res === 'W' ? 'w' : 'l'}">${esc(e.res)} ${esc(e.score)}</td><td>${e.min}</td><td class="${stat === 'pts' ? 'hl' : ''}">${e.pts}</td><td class="${stat === 'reb' ? 'hl' : ''}">${e.reb}</td><td class="${stat === 'ast' ? 'hl' : ''}">${e.ast}</td><td>${e.fg.join('/')}</td><td class="${stat === 'tpm' || stat === 'tpp' ? 'hl' : ''}">${e.tp.join('/')}</td></tr>`);
  const avgRow = take.length > 1 ? `<tr class="avg"><td colspan="3">Average</td><td>${f1(avg('min'))}</td><td>${f1(avg('pts'))}</td><td>${f1(avg('reb'))}</td><td>${f1(avg('ast'))}</td><td>${pct('fg')}</td><td>${pct('tp')}</td></tr>` : '';
  return { text, html: card(pRow(p, null, p.pos) + table(['Date', 'Opp', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'FG', '3PT'], [...rowsH, avgRow])), ctx: { pid: p.id, teamId: p.teamId } };
}
async function aPlayerCareer(p, stat) {
  const ov = await getJSON(`${WEB}/athletes/${p.id}/overview`);
  const st = ov.statistics, lab = st?.labels || [];
  const sp = st?.splits?.find(s => /career/i.test(s.displayName));
  if (!sp) return { text: `I couldn't find career numbers for ${esc(p.name)}.`, ctx: { pid: p.id } };
  const v = k => sp.stats[lab.indexOf(k)];
  const map = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', fgp: 'FG%', tpp: '3P%', ftp: 'FT%', min: 'MIN', tov: 'TO' };
  const text = stat && map[stat] ? `${esc(p.name)} has averaged <b>${esc(v(map[stat]))}${STAT[stat].pct ? '%' : ' ' + STAT[stat].unit}</b> per game over ${HIS} career (${esc(v('GP'))} games).`
    : `Over his career (${esc(v('GP'))} games), ${esc(p.name)} has averaged <b>${esc(v('PTS'))} points, ${esc(v('REB'))} rebounds and ${esc(v('AST'))} assists</b>, shooting ${esc(v('FG%'))}% from the field.`;
  return { text, html: card(pRow(p, null, 'Career') + table(lab, st.splits.map(s => `<tr>${s.stats.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`)) + `<p class="ask-note">Rows: ${st.splits.map(s => esc(s.displayName)).join(' · ')}</p>`), ctx: { pid: p.id } };
}
async function aCompare(a, b, stat, rows) {
  const A = rows.find(x => x.id === a.id) || a, B = rows.find(x => x.id === b.id) || b;
  const keys = ['gp', 'pts', 'reb', 'ast', 'stl', 'blk', 'fgp', 'tpp', 'ftp', 'min'];
  const lbl = { gp: 'Games', pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', fgp: 'FG%', tpp: '3P%', ftp: 'FT%', min: 'Minutes' };
  let wa = 0, wb = 0;
  const trs = keys.map(k => {
    const x = A[k], y = B[k], ok = Number.isFinite(x) && Number.isFinite(y);
    const aw = ok && x > y, bw = ok && y > x;
    if (k !== 'gp' && k !== 'min') { if (aw) wa++; if (bw) wb++; }
    const f = v => k === 'gp' ? (v ?? '–') : f1(v);
    return `<tr class="${k === stat ? 'focus' : ''}"><td class="${aw ? 'win a' : ''}">${f(x)}</td><td class="lbl">${lbl[k]}</td><td class="${bw ? 'win b' : ''}">${f(y)}</td></tr>`;
  });
  let text;
  if (stat && STAT[stat] && Number.isFinite(A[stat]) && Number.isFinite(B[stat]) && !STAT[stat].total) {
    const hi = A[stat] >= B[stat] ? A : B, lo = hi === A ? B : A;
    text = `${esc(hi.name)} has the edge in ${STAT[stat].label}: <b>${STAT[stat].pct ? fpct(hi[stat]) : f1(hi[stat])}</b> to ${STAT[stat].pct ? fpct(lo[stat]) : f1(lo[stat])} per game this season.`;
  } else text = `This season, ${esc(A.name)} wins ${wa} of 8 categories and ${esc(B.name)} wins ${wb}. ${esc(A.last || A.name)}: ${f1(A.pts)}/${f1(A.reb)}/${f1(A.ast)}. ${esc(B.last || B.name)}: ${f1(B.pts)}/${f1(B.reb)}/${f1(B.ast)}.`;
  return { text, html: card(`<div class="ask-vs">${pRow(A, null, A.pos)}${pRow(B, null, B.pos)}</div><table class="ask-cmp"><tbody>${trs.join('')}</tbody></table><button class="btn ghost" data-cmpab="${A.id},${B.id}">Open full comparison</button>`), ctx: { pid: A.id } };
}
async function aTeamRecord(t) {
  await loadStandings();
  const r = S.standings.confs.flatMap(c => c.rows).find(x => x.id === t.id);
  if (!r) return { text: `I couldn't find the ${esc(t.name)} in the standings.` };
  const conf = r.conf ? 'West' : 'East';
  const gb = r.gb === '-' || r.gb === '0' ? `leading the ${conf}` : `${r.gb} ${+r.gb === 1 ? 'game' : 'games'} back`;
  const text = `The ${esc(r.short)} are <b>${r.w}-${r.l}</b>, ${ordinal(r.seed)} in the ${conf} (${gb}). They're ${esc(r.home)} at home and ${esc(r.road)} on the road, on a ${esc(r.strk)} streak.`;
  return { text, html: card(tRow({ id: r.id, abbr: r.abbr, name: r.name }, `${r.w}-${r.l}`, `${ordinal(r.seed)} ${conf} · L10 ${r.l10} · ${r.ppg} PPG · ${r.diff > 0 ? '+' : ''}${r.diffD} diff`)), ctx: { teamId: r.id } };
}
async function aStandings(conf) {
  await loadStandings();
  const confs = conf == null ? [0, 1] : [conf];
  const parts = confs.map(c => {
    const rows = S.standings.confs[c].rows.slice(0, conf == null ? 6 : 15);
    return `<div class="ask-sub">${esc(S.standings.confs[c].name)}</div>` + rows.map(r => tRow({ id: r.id, abbr: r.abbr, name: r.name }, `${r.w}-${r.l}`, `${ordinal(r.seed)} · GB ${r.gb}`)).join('');
  });
  const top = confs.map(c => S.standings.confs[c].rows[0]).map(r => `the ${esc(r.short)} (${r.w}-${r.l}) lead the ${r.conf ? 'West' : 'East'}`);
  return { text: `Right now ${top.join(' and ')}.`, html: card(parts.join('') + `<button class="btn ghost" data-view="standings">Full standings</button>`) };
}
async function aTeamNext(t) {
  const s = await scheduleOf(t.id);
  const evs = (s.events || []).map(e => { const c = e.competitions?.[0]; const me = c?.competitors.find(x => x.team?.id === t.id), op = c?.competitors.find(x => x.team?.id !== t.id); return c && me && op ? { id: e.id, date: e.date, state: c.status?.type?.state, home: me.homeAway === 'home', op: op.team, tv: (c.broadcasts || []).map(b => b.media?.shortName).filter(Boolean).join(' · ') } : null; }).filter(Boolean);
  const up = evs.filter(e => e.state !== 'post').slice(0, 4);
  if (!up.length) return { text: `The ${esc(t.short || t.name)} have no upcoming games on the schedule.` };
  const n = up[0];
  const when = n.state === 'in' ? 'right now' : `${fmtET(n.date, { weekday: 'long', month: 'short', day: 'numeric' })} at ${fmtTime(n.date)}`;
  const text = `The ${esc(t.short || t.name)} ${n.state === 'in' ? 'are playing' : 'play next'} ${n.home ? 'at home against' : 'on the road at'} the ${esc(n.op.displayName || n.op.shortDisplayName)} ${esc(when)}${n.tv ? ` (${esc(n.tv)})` : ''}.`;
  const html = card(up.map(e => `<button class="ask-li" data-game="${e.id}">${logo(e.op.abbreviation, 64)}<span class="nm"><b>${e.home ? 'vs' : '@'} ${esc(e.op.displayName || e.op.abbreviation)}</b><small>${esc(e.tv || '')}</small></span><span class="v small">${esc(e.state === 'in' ? 'Live now' : fmtET(e.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(e.date))}</span></button>`).join(''));
  return { text, html, ctx: { teamId: t.id } };
}
async function aTeamGame(t, date) {
  let g;
  if (date) { g = (await scoreboardOn(date)).find(x => x.home.id === t.id || x.away.id === t.id); if (!g) return { text: `The ${esc(t.short || t.name)} didn't play ${dayLabel(date)}.`, ctx: { teamId: t.id } }; }
  else {
    const s = await scheduleOf(t.id);
    const last = (s.events || []).filter(e => e.competitions?.[0]?.status?.type?.state === 'post').at(-1)
      || (s.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'in');
    if (!last) return { text: `The ${esc(t.short || t.name)} haven't played yet this season.` };
    g = (await scoreboardOn(fmtET(last.date, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3$1$2'))).find(x => x.id === last.id);
    if (!g) return { text: `I couldn't load the ${esc(t.short || t.name)}' last game.` };
  }
  const me = g.home.id === t.id ? g.home : g.away, opp = me === g.home ? g.away : g.home;
  if (g.state === 'pre') return { text: `The ${esc(t.short || t.name)} play the ${esc(opp.full)} ${dayLabel(date || S.today)} at ${esc(fmtTime(g.date))}.`, html: card(gRow(g)), ctx: { teamId: t.id } };
  const d = await summaryOf(g.id);
  const top = boxRows(d).filter(r => r.teamId === t.id && !r.dnp).sort((a, b) => b.pts - a.pts)[0];
  const live = g.state === 'in';
  const text = live ? `The ${esc(t.short || t.name)} ${+me.score >= +opp.score ? 'lead' : 'trail'} the ${esc(opp.full)} <b>${me.score}–${opp.score}</b> (${esc(statusText(g))}).`
    : `The ${esc(t.short || t.name)} <b>${me.winner ? 'beat' : 'lost to'}</b> the ${esc(opp.full)} <b>${me.score}–${opp.score}</b> on ${esc(fmtET(g.date, { weekday: 'long', month: 'short', day: 'numeric' }))}.`;
  return { text: text + (top ? ` ${esc(top.name)} led them with ${top.pts} points.` : ''), html: card(gRow(g) + (top ? pRow({ id: top.id, name: top.name, abbr: top.abbr }, top.pts + ' PTS', `${top.reb} reb · ${top.ast} ast · ${top.fg.join('/')} FG`) : '')), ctx: { teamId: t.id } };
}
async function aOdds(t) {
  const days = [S.today, addDays(S.today, 1)];
  for (const day of days) {
    const games = await scoreboardOn(day);
    const list = t ? games.filter(g => g.home.id === t.id || g.away.id === t.id) : games.filter(g => g.state !== 'post');
    if (!list.length) continue;
    const withOdds = list.filter(g => g.odds);
    if (!withOdds.length) return { text: t ? `There's no betting line posted for the ${esc(t.short || t.name)}' next game yet.` : 'No lines are posted right now.', html: card(list.map(gRow).join('')) };
    const html = card(withOdds.map(g => gRow(g) + `<div class="ask-odds">${['away', 'home'].map(k => `<span>${esc(g[k].abbr)} ${mlChip(g.odds, k)}</span>`).join('')}${g.odds.details ? `<span>Spread <b>${esc(g.odds.details)}</b></span>` : ''}${g.odds.ou != null ? `<span>O/U <b>${esc(g.odds.ou)}</b></span>` : ''}</div>`).join('') + `<p class="ask-note">Odds via ${esc(withOdds[0].odds.provider || 'the sportsbook')} on ESPN. For reference only.</p>`);
    if (t) {
      const g = withOdds[0], o = g.odds, side = g.home.id === t.id ? 'home' : 'away', opp = side === 'home' ? g.away : g.home;
      const fav = o.fav === side;
      const sp = String(o.details || '').match(/-?\d+(\.\d+)?/)?.[0];
      const text = `The ${esc(t.short || t.name)} are <b>${fav ? `${sp ? Math.abs(+sp) + '-point ' : ''}favorites` : `${sp ? Math.abs(+sp) + '-point ' : ''}underdogs`}</b> against the ${esc(opp.name)} ${dayLabel(day)} (moneyline ${esc(o[side].ml || '–')}; ${esc(opp.abbr)} ${esc(o[side === 'home' ? 'away' : 'home'].ml || '–')}).${o.ou != null ? ` The over/under is ${esc(o.ou)}.` : ''}`;
      return { text, html, ctx: { teamId: t.id } };
    }
    return { text: `Here are the lines for ${dayLabel(day)}'s games.`, html };
  }
  return { text: t ? `I couldn't find an upcoming game with odds for the ${esc(t.short || t.name)} in the next two days.` : 'There are no games with lines in the next two days.' };
}
async function aDayGames(date) {
  const games = await scoreboardOn(date);
  const when = dayLabel(date);
  if (!games.length) return { text: `There are no ${LGN} games ${when}.` };
  const live = games.filter(g => g.state === 'in').length, post = games.filter(g => g.state === 'post').length;
  const first = games.filter(g => g.state === 'pre').sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  let text = `There ${games.length === 1 ? 'is' : 'are'} <b>${plural(games.length, 'game')}</b> ${when}.`;
  if (live) text += ` ${live} ${live === 1 ? 'is' : 'are'} live right now.`;
  if (post && post === games.length) text = `${plural(games.length, 'game')} ${when === 'last night' ? 'were played last night' : 'were played ' + when}. Final scores below.`;
  else if (first && !live) text += ` First tip is ${fmtTime(first.date)}.`;
  return { text, html: card(games.map(gRow).join('')) };
}
async function nightRows(date) {
  const games = (await scoreboardOn(date)).filter(g => g.state !== 'pre');
  const ds = await Promise.all(games.map(g => summaryOf(g.id).catch(() => null)));
  const rows = [];
  ds.forEach((d, i) => {
    if (!d) return;
    const g = games[i];
    boxRows(d).filter(r => !r.dnp).forEach(r => rows.push({ ...r, game: g, opp: r.teamId === g.home.id ? g.away.abbr : g.home.abbr }));
  });
  return { rows, games, anyLive: games.some(g => g.state === 'in') };
}
async function aNightLeaders(date, stat, opts) {
  const { rows, games, anyLive } = await nightRows(date);
  const when = dayLabel(date);
  if (!games.length) {
    const all = await scoreboardOn(date);
    return { text: all.length ? `None of ${when === 'tonight' ? "tonight's" : 'those'} games have started yet. First tip is ${fmtTime(all.sort((a, b) => new Date(a.date) - new Date(b.date))[0].date)}.` : `There were no games ${when}.` };
  }
  let list = rows, text;
  const k = stat || 'pts';
  const suffix = anyLive ? ' (games still in progress)' : '';
  const verb1 = anyLive || date === S.today ? 'has' : 'had', verbN = anyLive || date === S.today ? 'have' : 'had';
  if (opts.td || opts.dd) {
    const need = opts.td ? 3 : 2;
    list = rows.filter(r => dblCount(r) >= need).sort((a, b) => b.pts - a.pts);
    const w = opts.td ? 'triple-double' : 'double-double';
    text = list.length ? `<b>${plural(list.length, 'player')}</b> ${list.length === 1 ? verb1 : verbN} a ${w} ${when}${suffix}${list.length <= 3 ? ': ' + list.map(r => esc(r.name)).join(', ') : ''}.` : `Nobody had a ${w} ${when}${suffix}.`;
    return { text, html: list.length ? card(list.slice(0, 15).map(r => pRow(r, `${r.pts}/${r.reb}/${r.ast}`, `vs ${r.opp}`)).join('') + `<p class="ask-note">Points / rebounds / assists</p>`) : '' };
  }
  if (opts.min != null) {
    list = rows.filter(r => valOf(r, k) >= opts.min).sort((a, b) => valOf(b, k) - valOf(a, k));
    const names = list.length <= 4 ? ': ' + list.map(r => `${esc(r.name)} (${valOf(r, k)})`).join(', ') : '';
    text = list.length ? `<b>${plural(list.length, 'player')}</b> ${list.length === 1 ? verb1 : verbN} ${opts.min}+ ${STAT[k].unit} ${when}${suffix}${names}.` : `Nobody reached ${opts.min} ${STAT[k].unit} ${when}${suffix}.`;
  } else {
    list = rows.filter(r => Number.isFinite(valOf(r, k))).sort((a, b) => (opts.asc ? 1 : -1) * (valOf(a, k) - valOf(b, k)));
    const top = list[0];
    text = top ? `<b>${esc(top.name)}</b> ${anyLive ? 'leads' : 'led'} everyone ${when} with <b>${statWord(k, valOf(top, k))}</b> against the ${esc(S.teams[Object.values(S.teams).find(t => t.abbr === top.opp)?.id]?.short || top.opp)}${suffix}.` : `No stats yet for ${when}.`;
  }
  const n = opts.n || 10;
  return { text, html: list.length ? card(list.slice(0, n).map((r, i) => pRow(r, `${valOf(r, k)} ${STAT[k].short}`, `vs ${r.opp} · ${r.pts} pts ${r.reb} reb ${r.ast} ast`).replace('<button class="ask-li"', `<button class="ask-li" data-rank="${i + 1}"`)).join('')) : '' };
}
async function aLeaders(stat, opts, rows) {
  const k = stat || 'pts';
  const S1 = STAT[k];
  if (!S1 || k === 'pm') return { text: "I don't have season leaders for that stat." };
  const useTot = opts.total || S1.total;
  const val = r => useTot ? (r.tot?.[k] ?? r[k]) : r[k];
  let pool = useTot ? rows.filter(r => (r.gp || 0) > 0) : qualified(rows, k);
  if (opts.conf != null) { await loadStandings(); pool = pool.filter(r => S.teams[r.teamId]?.conf === opts.conf); }
  if (opts.teamId) pool = rows.filter(r => r.teamId === opts.teamId && (r.gp || 0) > 0);
  pool = pool.filter(r => Number.isFinite(val(r))).sort((a, b) => opts.asc ? val(a) - val(b) : val(b) - val(a));
  const n = Math.min(opts.n || (opts.teamId ? 5 : 10), 25);
  const list = pool.slice(0, n);
  if (!list.length) return { text: 'No one qualifies for that yet. Check back after a few more games.' };
  const top = list[0];
  const scope = opts.teamId ? `the ${esc(teamNick(opts.teamId))}` : opts.conf != null ? `the ${opts.conf ? 'West' : 'East'}` : `the ${LGN}`;
  const fmtV = r => S1.pct ? fpct(val(r)) : useTot ? String(Math.round(val(r))) : f1(val(r));
  const unit = S1.pct ? '' : useTot ? ` ${S1.label}` : ` ${S1.unit} per game`;
  const where = S1.pct ? ` ${k === 'fgp' ? 'from the field' : k === 'tpp' ? 'from three' : 'from the line'}` : '';
  const amount = S1.pct ? fmtV(top) : useTot ? `${Math.round(val(top))} ${Math.round(val(top)) === 1 ? S1.label.replace(/s$/, '') : S1.label}` : `${f1(val(top))} ${S1.unit} per game`;
  const text = opts.asc
    ? `<b>${esc(top.name)}</b> has the lowest ${S1.pct ? S1.label : useTot ? S1.label : S1.unit + ' per game'} in ${scope}: <b>${S1.pct ? fmtV(top) : useTot ? Math.round(val(top)) : f1(val(top))}</b>${where}.`
    : `<b>${esc(top.name)}</b> leads ${scope} with <b>${amount}</b>${where}.`;
  const note = !useTot && !opts.teamId ? `<p class="ask-note">Players with at least half their team's games${k === 'tpp' ? ' and 3+ three-point attempts a game' : k === 'fgp' ? ' and 6+ shots a game' : k === 'ftp' ? ' and 2.5+ free throws a game' : ''}.</p>` : '';
  return { text, html: card(list.map((r, i) => pRow(r, `${fmtV(r)}`, `${i + 1}. ${r.pos} · ${plural(r.gp, 'game')}`)).join('') + note) };
}
async function aTeamSummary(t, rows) {
  const rec = await aTeamRecord(t);
  const top = rows.filter(r => r.teamId === t.id && r.gp > 0).sort((a, b) => b.pts - a.pts)[0];
  let next = null; try { next = await aTeamNext(t); } catch (e) {}
  return { text: rec.text + (top ? ` ${esc(top.name)} leads the team with ${f1(top.pts)} points per game.` : '') + (next?.text ? ' ' + next.text : ''), html: (rec.html || '') + (next?.html || ''), ctx: { teamId: t.id } };
}

/* ---------------- router ---------------- */
async function answer(raw) {
  await loadStandings().catch(() => {});
  const n = ' ' + nameKey(raw.replace(/\+\/-/g, ' plusminus ').replace(/%/g, ' percent ').replace(/(\d)\+/g, '$1 plus ')) + ' ';
  const nn = n.replace(/ plusminus /g, ' plus minus ');
  const has = re => re.test(nn);
  const rows = await leagueTable();
  const { teams: teamIds, rest } = findTeams(raw, nn);
  const teams = teamIds.map(id => S.teams[id]).filter(Boolean);
  const stat = parseStat(nn);
  let time = parseTime(nn);
  const confM = nn.match(/ (east(ern)?|west(ern)?) /);
  const conf = confM ? (confM[1].startsWith('east') ? 0 : 1) : null;
  const topN = +(nn.match(/ top (\d{1,2}) /)?.[1] || 0) || null;
  const thr = nn.match(/ (\d{1,2}) (plus )?(or more )?(points?|pts|rebounds?|boards|assists?|dimes|threes|3s|steals?|blocks?)(?! (percent|percentage|pct|shoot|pointer))/) || nn.match(/ (scored|score) (\d{2}) /);
  let minVal = null, thrStat = null;
  if (thr) {
    if (thr[1] === 'scored' || thr[1] === 'score') { minVal = +thr[2]; thrStat = 'pts'; }
    else if (+thr[1] >= 5 || /threes|3s|steals?|blocks?/.test(thr[4])) { minVal = +thr[1]; thrStat = parseStat(' ' + thr[4] + ' '); }
    if (thrStat && STAT[thrStat]?.pct) { minVal = null; thrStat = null; }
  }
  const asc = has(/ (lowest|fewest|worst|least) /);
  const total = has(/ (total|totals|in total|overall) /);

  // split for "A vs B"
  const chunks = rest.split(/ (?:vs|versus|v|against|compared to|compare to|or|and|with) /).map(s => s.trim()).filter(Boolean);
  const players = [];
  const restNoTime = rest;
  if (chunks.length > 1) { for (const c of chunks) { const p = matchPlayer(c, rows); if (p && !players.some(x => x.id === p.id)) players.push(p); } }
  if (!players.length) { const p = matchPlayer(restNoTime, rows); if (p) players.push(p); }
  const leftover = nameKey(restNoTime).split(' ').filter(w => w && !STOP.has(w) && !/^\d+$/.test(w) && w !== '#');
  if (!players.length && leftover.join(' ').length >= 4 && !teams.length) { const p = await searchPlayerFallback(leftover.join(' ')); if (p) players.push(p); }

  // follow-up context ("what about rebounds?", "his last 5 games")
  const pronoun = has(/ (he|his|him|she|her|hers|what about|how about|and) /);
  const shortQ = nn.trim().split(' ').length <= 3;
  if (!players.length && !teams.length && (stat || time) && ASK.ctx.pid && (pronoun || (shortQ && !leftover.length)) && !has(/ (who|whos|leaders?|leads|most|top|best|highest|lowest|fewest|worst|everyone|anyone|league|nba|rank\w*) /)) {
    const p = rows.find(r => r.id === ASK.ctx.pid); if (p) players.push(p);
    if (!time && ASK.ctx.time) time = ASK.ctx.time;
  }
  if (!players.length && !teams.length && ASK.ctx.teamId && pronoun && (stat || has(/ (record|next|last game|odds|spread|schedule) /))) { const t = S.teams[ASK.ctx.teamId]; if (t) teams.push(t); }

  const dd = has(/ double ?doubles? /), td = has(/ triple ?doubles? /);
  const st = stat || thrStat;

  if (has(/ (help|what can you|what do you know|examples?) /) && !players.length && !teams.length) return { text: 'Ask about this season: players, teams, games, leaders, standings, schedules and odds. Some examples:', examples: true };

  // standings / records
  if (!players.length && has(/ (standings?|seeds?|seeded|first place|1st place|playoff picture|games back|gb|ranked|ranking|record|place|where (are|do|is) the|best team|worst team|top team) /) && !st) {
    if (teams.length) return aTeamRecord(teams[0]);
    return aStandings(conf);
  }
  // odds
  if (has(/ (odds|spread|line|lines|moneyline|money line|over under|o u|favou?red|favorites?|underdogs?|vegas|betting) /) && !players.length) return aOdds(teams[0] || null);
  // schedule
  if (has(/ (next game|play next|playing next|when (do|does|is|are)|schedule|upcoming|next opponent) /) && (teams.length || players.length)) {
    const t = teams[0] || S.teams[players[0]?.teamId]; if (t) return aTeamNext(t);
  }
  // team game results
  const scoreQ = has(/ (score|scores) /) && !has(/ (scorer|scorers|leading|leader|leaders|per game|averag\w*|most|top) /);
  if (teams.length && !players.length && (!st || scoreQ) && has(/ (last game|did|score|score of|final score|result|how did|beat|lost|won|win|lose|game last night|game tonight|play last night|doing tonight) /))
    return aTeamGame(teams[0], time?.kind === 'date' ? time.date : null);
  // day scoreboard
  if (!players.length && !teams.length && !st && !dd && !td && has(/ (games|scores?|playing|on tap|results?|who won|matchups?|slate|schedule) /))
    return aDayGames(time?.kind === 'date' ? time.date : has(/ (who won|results?) /) ? lastNight() : S.today);

  // two players
  if (players.length >= 2) return aCompare(players[0], players[1], st, rows);

  // one player
  if (players.length === 1) {
    const p = players[0];
    if (teams.length && has(/ (vs|versus|against|v) /)) return aPlayerLastN(p, 82, st, teams[0]);
    if (time?.kind === 'date') return aPlayerOnDate(p, time.date, st);
    if (time?.kind === 'lastN') { const r = await aPlayerLastN(p, time.n, st); r.ctx = { ...r.ctx, time }; return r; }
    if (time?.kind === 'career') return aPlayerCareer(p, st);
    if (has(/ (next game|play next|schedule) /) && p.teamId) return aTeamNext(S.teams[p.teamId]);
    return aPlayerSeason(p, dd ? 'dd' : td ? 'td' : st, rows);
  }

  // nightly performers
  if (time?.kind === 'date' && (st || dd || td || minVal != null || has(/ (best|top|most|lead|led|who|highest|big games?|performers?|performances?) /)))
    return aNightLeaders(time.date, st || 'pts', { dd, td, min: minVal, asc, n: topN });

  // team leaders
  if (teams.length && (st || dd || td || has(/ (leaders?|leads|leading|best|top|most) /)))
    return aLeaders(dd ? 'dd' : td ? 'td' : st || 'pts', { teamId: teams[0].id, asc, n: topN, total }, rows);

  // league leaders
  if (st || dd || td) {
    if (minVal != null) return aNightLeaders(lastNight(), st || 'pts', { min: minVal });
    return aLeaders(dd ? 'dd' : td ? 'td' : st, { conf, asc, n: topN, total }, rows);
  }
  if (has(/ (leaders?|leads|mvp|best player|top players?) /)) return aLeaders('pts', { conf, n: topN }, rows);

  if (teams.length) return aTeamSummary(teams[0], rows);
  return { text: `I couldn't match that to a player, team or stat. Try naming a player or team, a stat (points, rebounds, assists, threes…) and a time (last night, last 5 games, this season).`, examples: true, miss: true };
}

/* ---------------- chat UI ---------------- */
const ASK_EXAMPLES = IS_W ? [
  'Who scored the most points last night?',
  "A'ja Wilson last 5 games",
  'Assist leaders in the West',
  'Liberty record',
  'When do the Fever play next?',
  'Caitlin Clark vs Paige Bueckers',
  'Who had a double-double last night?',
  'Most threes per game',
  'East standings',
  'Aces leading scorer',
] : [
  'Who scored the most points last night?',
  'Jayson Tatum last 5 games',
  'Assist leaders in the West',
  'Celtics record',
  'When do the Knicks play next?',
  'Luka Doncic vs Anthony Edwards',
  'Lakers odds tonight',
  'Who had a double-double last night?',
  'Most threes per game',
  'Brunson vs the Pistons',
  'East standings',
  'Hornets leading scorer',
];
let askSheet = null;
function examplesHTML() { return `<div class="ask-ex">${ASK_EXAMPLES.map(q => `<button class="chip" data-askq="${esc(q)}">${esc(q)}</button>`).join('')}</div>`; }
function askMsgHTML(m) {
  if (m.me) return `<div class="msg me"><p>${esc(m.q)}</p></div>`;
  if (m.loading) return `<div class="msg bot loading"><p><span class="dots"><i></i><i></i><i></i></span> Looking that up…</p></div>`;
  return `<div class="msg bot${m.miss ? ' miss' : ''}"><p>${m.text}</p>${m.html || ''}${m.examples ? examplesHTML() : ''}${m.at ? `<div class="msg-meta">ESPN data · ${esc(m.at)}</div>` : ''}</div>`;
}
function renderAsk(scroll = true) {
  if (!askSheet?.alive) return;
  const log = $('.ask-log', askSheet.el);
  log.innerHTML = ASK.log.length ? ASK.log.map(askMsgHTML).join('') : `<div class="ask-empty"><b class="h-display">Ask Fullcourt</b><p>Ask about this season in plain English: players, teams, last night's games, leaders, standings, schedules and odds. It answers from live ESPN data. Deep history (past seasons) isn't available.</p>${examplesHTML()}</div>`;
  if (scroll) requestAnimationFrame(() => { askSheet.body.scrollTop = askSheet.body.scrollHeight; });
}
async function ask(q) {
  q = String(q || '').trim();
  if (!q || ASK.busy) return;
  ASK.busy = true;
  ASK.log.push({ me: true, q }, { loading: true });
  renderAsk();
  let res;
  try { res = await answer(q); }
  catch (e) { res = { text: "I couldn't reach the stats feed just now. Give it a moment and try again.", miss: true }; }
  ASK.log.pop();
  ASK.log.push({ ...res, at: fmtTime(new Date().toISOString()) });
  if (res.ctx) ASK.ctx = { ...res.ctx, time: res.ctx.time || null };
  ASK.log = ASK.log.slice(-40);
  ASK.busy = false;
  renderAsk();
}
function openAsk(q) {
  if (askSheet?.alive) { while (stack.at(-1) !== askSheet && stack.length) closeTop(); }
  else {
    askSheet = openSheet('Ask Fullcourt');
    askSheet.el.classList.add('ask-sheet');
    askSheet.body.innerHTML = '<div class="ask-log" aria-live="polite"></div>';
    const form = document.createElement('form');
    form.className = 'ask-bar';
    form.innerHTML = `<input id="askInput" type="text" autocomplete="off" spellcheck="false" placeholder="Ask about any player, team or game…" aria-label="Ask a question" enterkeyhint="send"><button class="ask-send" type="submit" aria-label="Ask">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'}</button>`;
    askSheet.el.append(form);
    form.addEventListener('submit', e => { e.preventDefault(); const i = $('#askInput'); const v = i.value; i.value = ''; ask(v); });
    askSheet.body.addEventListener('click', e => {
      const b = e.target.closest('[data-askq]'); if (b) { ask(b.dataset.askq); return; }
      const c = e.target.closest('[data-cmpab]'); if (c) { S.cmp = c.dataset.cmpab.split(','); closeAll(); go('compare'); }
    });
    renderAsk(false);
    leagueTable().catch(() => {});
  }
  setTimeout(() => $('#askInput')?.focus({ preventScroll: true }), 120);
  if (q) ask(q);
}

