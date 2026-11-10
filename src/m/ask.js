/* =====================================================================
   ASK FULLCOURT — rule-based question answering over ESPN's live feeds
   ===================================================================== */
const ASK = { ctx: {}, log: [], busy: false };
const lastNight = () => etNow().hour < ROLLOVER_HOUR ? S.today : addDays(S.today, -1);
const dayLabel = d => d === S.today ? 'tonight' : d === lastNight() || d === addDays(S.today, -1) ? 'last night' : 'on ' + fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' });
// "the Knicks" in the NBA; in college the mascot reads the same way ("the Gamecocks"), where the school name ("the South Carolina") wouldn't
const teamNick = id => { const t = S.teams[id]; if (IS_C && t?.name && t?.loc && t.name.startsWith(t.loc) && t.name.length > t.loc.length) return t.name.slice(t.loc.length).trim(); return t?.short || t?.abbr || 'Team'; };
const LGTHE = IS_C ? 'Division I' : `the ${LGN}`; // "leads the NBA" / "leads Division I"
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
  'since home road away wins losses victories defeats playoff playoffs postseason regular facing during may june july august september only when ' +
  'without sits sat sitting missing misses injured inactive history meetings series close clutch possession conference after rest backs b2b b2bs teams ' +
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
    if (rk && !S1.total && rk.rank <= 50) text += ` That ranks ${ordinal(rk.rank)} in ${LGTHE} among regular players.`;
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
  // the side-by-side card (with a share image); the plain table if the card can't be built
  const ec = !A.gp || !B.gp ? null : await lazy('eras').then(m => m.eraNowCard([A.name, B.name], { rows })).catch(() => null);
  return { text, html: card(`${ec || `<div class="ask-vs">${pRow(A, null, A.pos)}${pRow(B, null, B.pos)}</div><table class="ask-cmp"><tbody>${trs.join('')}</tbody></table>`}<button class="btn ghost" data-cmpab="${A.id},${B.id}">Open full comparison</button>`), ctx: { pid: A.id } };
}
async function aTeamRecord(t) {
  await loadStandings();
  const r = S.standings.confs.flatMap(c => c.rows).find(x => x.id === t.id);
  if (!r) return { text: `I couldn't find the ${esc(t.name)} in the standings.` };
  if (IS_C) { const cs = S.teams[r.id]?.confShort || 'conference', rk = S.apRank?.get(String(r.id));
    return { text: `${rk ? `No. ${rk} ` : ''}${esc(r.loc)} is <b>${r.w}-${r.l}</b> (${esc(r.conf)} in the ${esc(cs)}), ${esc(r.home)} at home and ${esc(r.road)} on the road${r.strk && r.strk !== '–' ? `, on a ${esc(r.strk)} streak` : ''}.`, html: card(tRow({ id: r.id, abbr: r.abbr, name: r.name }, `${r.w}-${r.l}`, `${esc(cs)} ${esc(r.conf)} · vs AP ${esc(r.vsAP)} · ${r.ppg} PPG`)), ctx: { teamId: r.id } }; }
  const conf = r.conf ? 'West' : 'East';
  const gb = r.gb === '-' || r.gb === '0' ? `leading the ${conf}` : `${r.gb} ${+r.gb === 1 ? 'game' : 'games'} back`;
  const text = `The ${esc(r.short)} are <b>${r.w}-${r.l}</b>, ${ordinal(r.seed)} in the ${conf} (${gb}). They're ${esc(r.home)} at home and ${esc(r.road)} on the road, on a ${esc(r.strk)} streak.`;
  return { text, html: card(tRow({ id: r.id, abbr: r.abbr, name: r.name }, `${r.w}-${r.l}`, `${ordinal(r.seed)} ${conf} · L10 ${r.l10} · ${r.ppg} PPG · ${r.diff > 0 && !String(r.diffD).startsWith('+') ? '+' : ''}${r.diffD} diff`)), ctx: { teamId: r.id } };
}
async function aStandings(conf) {
  await loadStandings();
  if (IS_C) { const p = (await lazy('college').then(m => m.loadPolls()).catch(() => null))?.[0];
    return p ? { text: `The ${esc(p.name)} (${esc(p.when)}) has ${esc(p.ranks[0].name)} at No. 1.`, html: card(p.ranks.slice(0, 10).map(r => tRow({ id: r.id, abbr: r.abbr, name: r.name }, `#${r.rank}`, `${esc(r.rec || '')} · ${r.pts} pts`)).join('') + `<button class="btn ghost" data-view="standings">Full rankings</button>`) } : { text: 'The poll isn\'t available right now.' }; }
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
  if (!up.length) return { text: `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} have no upcoming games on the schedule.` };
  const n = up[0];
  const when = n.state === 'in' ? 'right now' : `${fmtLocal(n.date, { weekday: 'long', month: 'short', day: 'numeric' })} at ${fmtTime(n.date)}`;
  const text = `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} ${n.state === 'in' ? 'are playing' : 'play next'} ${n.home ? 'at home against' : 'on the road at'} the ${esc(n.op.displayName || n.op.shortDisplayName)} ${esc(when)}${n.tv ? ` (${esc(n.tv)})` : ''}.`;
  const html = card(up.map(e => `<button class="ask-li" data-game="${e.id}">${logo(e.op.abbreviation, 64)}<span class="nm"><b>${e.home ? 'vs' : '@'} ${esc(e.op.displayName || e.op.abbreviation)}</b><small>${esc(e.tv || '')}</small></span><span class="v small">${esc(e.state === 'in' ? 'Live now' : fmtET(e.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(e.date))}</span></button>`).join(''));
  return { text, html, ctx: { teamId: t.id } };
}
async function aTeamGame(t, date) {
  let g;
  if (date) { g = (await scoreboardOn(date)).find(x => x.home.id === t.id || x.away.id === t.id); if (!g) return { text: `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} didn't play ${dayLabel(date)}.`, ctx: { teamId: t.id } }; }
  else {
    const s = await scheduleOf(t.id);
    const last = (s.events || []).filter(e => e.competitions?.[0]?.status?.type?.state === 'post').at(-1)
      || (s.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'in');
    if (!last) return { text: `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} haven't played yet this season.` };
    g = (await scoreboardOn(fmtET(last.date, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3$1$2'))).find(x => x.id === last.id);
    if (!g) return { text: `I couldn't load the ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))}' last game.` };
  }
  const me = g.home.id === t.id ? g.home : g.away, opp = me === g.home ? g.away : g.home;
  if (g.state === 'pre') return { text: `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} play the ${esc(opp.full)} ${dayLabel(date || S.today)} at ${esc(fmtTime(g.date))}.`, html: card(gRow(g)), ctx: { teamId: t.id } };
  const d = await summaryOf(g.id);
  const top = boxRows(d).filter(r => r.teamId === t.id && !r.dnp).sort((a, b) => b.pts - a.pts)[0];
  const live = g.state === 'in';
  const text = live ? `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} ${+me.score >= +opp.score ? 'lead' : 'trail'} the ${esc(opp.full)} <b>${me.score}–${opp.score}</b> (${esc(statusText(g))}).`
    : `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} <b>${me.winner ? 'beat' : 'lost to'}</b> the ${esc(opp.full)} <b>${me.score}–${opp.score}</b> on ${esc(fmtET(g.date, { weekday: 'long', month: 'short', day: 'numeric' }))}.`;
  return { text: text + (top ? ` ${esc(top.name)} led them with ${top.pts} points.` : ''), html: card(gRow(g) + (top ? pRow({ id: top.id, name: top.name, abbr: top.abbr }, top.pts + ' PTS', `${top.reb} reb · ${top.ast} ast · ${top.fg.join('/')} FG`) : '')), ctx: { teamId: t.id } };
}
async function aOdds(t) {
  const days = [S.today, addDays(S.today, 1)];
  for (const day of days) {
    const games = await scoreboardOn(day);
    const list = t ? games.filter(g => g.home.id === t.id || g.away.id === t.id) : games.filter(g => g.state !== 'post');
    if (!list.length) continue;
    const withOdds = list.filter(g => g.odds);
    if (!withOdds.length) return { text: t ? `There's no betting line posted for the ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))}' next game yet.` : 'No lines are posted right now.', html: card(list.map(gRow).join('')) };
    const html = card(withOdds.map(g => gRow(g) + `<div class="ask-odds">${['away', 'home'].map(k => `<span>${esc(g[k].abbr)} ${mlChip(g.odds, k)}</span>`).join('')}${g.odds.details ? `<span>Spread <b>${esc(g.odds.details)}</b></span>` : ''}${g.odds.ou != null ? `<span>O/U <b>${esc(g.odds.ou)}</b></span>` : ''}</div>`).join('') + `<p class="ask-note">Odds via ${esc(withOdds[0].odds.provider || 'the sportsbook')} on ESPN. For reference only.</p>`);
    if (t) {
      const g = withOdds[0], o = g.odds, side = g.home.id === t.id ? 'home' : 'away', opp = side === 'home' ? g.away : g.home;
      const fav = o.fav === side;
      const sp = String(o.details || '').match(/-?\d+(\.\d+)?/)?.[0];
      const text = `The ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} are <b>${fav ? `${sp ? Math.abs(+sp) + '-point ' : ''}favorites` : `${sp ? Math.abs(+sp) + '-point ' : ''}underdogs`}</b> against the ${esc(opp.name)} ${dayLabel(day)} (moneyline ${esc(o[side].ml || '–')}; ${esc(opp.abbr)} ${esc(o[side === 'home' ? 'away' : 'home'].ml || '–')}).${o.ou != null ? ` The over/under is ${esc(o.ou)}.` : ''}`;
      return { text, html, ctx: { teamId: t.id } };
    }
    return { text: `Here are the lines for ${dayLabel(day)}'s games.`, html };
  }
  return { text: t ? `I couldn't find an upcoming game with odds for the ${esc(IS_C ? teamNick(t.id) : (t.short || t.name))} in the next two days.` : 'There are no games with lines in the next two days.' };
}
async function aDayGames(date) {
  const games = await scoreboardOn(date);
  const when = dayLabel(date);
  if (!games.length) return { text: `There are no ${IS_C ? LGN.toLowerCase() + ' basketball' : LGN} games ${when}.` };
  const live = games.filter(g => g.state === 'in').length, post = games.filter(g => g.state === 'post').length;
  const first = games.filter(g => g.state === 'pre').sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  let text = `There ${games.length === 1 ? 'is' : 'are'} <b>${plural(games.length, 'game')}</b> ${when}.`;
  if (live) text += ` ${live} ${live === 1 ? 'is' : 'are'} live right now.`;
  if (post && post === games.length) text = `${plural(games.length, 'game')} ${when === 'last night' ? 'were played last night' : 'were played ' + when}. Final scores below.`;
  else if (first && !live) text += ` First tip is ${fmtTime(first.date)}.`;
  return { text, html: card(games.map(gRow).join('')) };
}
async function nightRows(date) {
  let games = (await scoreboardOn(date)).filter(g => g.state !== 'pre'), top25 = false;
  // college nights can have 150 games: read the box scores of the Top 25 games instead of all of them
  if (IS_C && games.length > 30) { const t = games.filter(g => g.home.rank || g.away.rank); if (t.length) { games = t; top25 = true; } }
  const ds = await Promise.all(games.map(g => summaryOf(g.id).catch(() => null)));
  const rows = [];
  ds.forEach((d, i) => {
    if (!d) return;
    const g = games[i];
    boxRows(d).filter(r => !r.dnp).forEach(r => rows.push({ ...r, game: g, opp: r.teamId === g.home.id ? g.away.abbr : g.home.abbr }));
  });
  return { rows, games, top25, anyLive: games.some(g => g.state === 'in') };
}
async function aNightLeaders(date, stat, opts) {
  const { rows, games, anyLive, top25 } = await nightRows(date);
  const when = dayLabel(date);
  if (!games.length) {
    const all = await scoreboardOn(date);
    return { text: all.length ? `None of ${when === 'tonight' ? "tonight's" : 'those'} games have started yet. First tip is ${fmtTime(all.sort((a, b) => new Date(a.date) - new Date(b.date))[0].date)}.` : `There were no games ${when}.` };
  }
  let list = rows, text;
  const k = stat || 'pts';
  const suffix = (top25 ? ' in Top 25 games' : '') + (anyLive ? ' (games still in progress)' : '');
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
    text = top ? `<b>${esc(top.name)}</b> ${anyLive ? 'leads' : 'led'} everyone ${when} with <b>${statWord(k, valOf(top, k))}</b> against ${IS_C ? '' : 'the '}${esc(S.teams[Object.values(S.teams).find(t => t.abbr === top.opp)?.id]?.[IS_C ? 'loc' : 'short'] || top.opp)}${suffix}.` : `No stats yet for ${when}.`;
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
  const scope = opts.teamId ? `the ${esc(teamNick(opts.teamId))}` : opts.conf != null && !IS_C ? `the ${opts.conf ? 'West' : 'East'}` : LGTHE;
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

/* ---------------- any era (NBA) ----------------
   Past seasons, award races, all-time lists and retired players are answered by the eras part ("1962 MVP race",
   "top scorers 1987", "Wilt 1962 vs Jordan 1987", "1996 Bulls"). It loads only when a question looks like one of
   those, and hands the question back (null) when it isn't. */
const ERA_AW = '(mvps?|most valuable( player)?|rookie of the year|roy|roty|dpoy|defensive player( of the year)?|sixth man( of the year)?|6th man|6moy|smoy|most improved( player)?|mip|clutch player( of the year)?)';
const ERA_HINT = new RegExp(' (19[4-9]\\d|20[0-2]\\d)s? | \\d0s | (ever|all time|in history|of all time|in a season|in a single season|careers?|rookie (season|year)s?|as rookies?|primes?|peak|graphic|image|card|picture) ' +
  `| ${ERA_AW} .*(race|voting|votes?|voted|won|win|winner|finish\\w*|seasons?|years?|ladder|results?) | (who won|winner of|how many|won the) .*${ERA_AW} ` +
  '| (michael jordan|jordan|wilt|chamberlain|kareem|abdul jabbar|magic johnson|larry bird|bird|kobe|bryant|shaq|shaquille|bill russell|hakeem|olajuwon|tim duncan|iverson|barkley|karl malone|stockton|ewing|pippen|isiah|dr j|erving|jerry west|oscar robertson|baylor|garnett|nowitzki|dirk|steve nash|wade|carmelo|mcgrady|t mac|vince carter|payton|jason kidd|david robinson|drexler|dominique|mchale|worthy|moses malone|gervin|maravich|havlicek|cousy|mikan|pettit|walton|rodman|reggie miller|ray allen|paul pierce|bosh|mj) ');
const eraTry = async (raw, rows, loose) => { if (IS_C || IS_W) return null; try { return await (await lazy('eras')).eraAnswer(raw, { rows, loose }); } catch (e) { console.error(e); return null; } };
// this season's award race, as the side-by-side card ("MVP race", "who's winning Rookie of the Year")
const NOW_AW = [['mvp', / (mvp|most valuable( player)?) /, 'MVP'], ['roy', / (roy|roty|rookie of the year) /, 'Rookie of the Year'], ['dpoy', / (dpoy|defensive player( of the year)?) /, 'Defensive Player of the Year'], ['smoy', / (6moy|smoy|sixth man( of the year)?|6th man( of the year)?) /, 'Sixth Man of the Year']];
async function aAwardNow(kind, title, n, rows, past) {
  const race = await (await lazy('awards')).awardRace(kind);
  if (!race?.list?.length) return { text: `It's too early to call the ${title} race. It fills in once players have a few games in.`, miss: true };
  const top = race.list.slice(0, 5);
  const html = await (await lazy('eras')).eraNowAward(title, kind, race, { rows, n }).catch(() => null);
  const text = `${past ? 'Award history is NBA only for now, so here is this season. ' : ''}Fullcourt's ${title} ladder right now: ${top.slice(0, 3).map((x, i) => `${i ? '' : '<b>'}${i + 1}. ${esc(x.r.name)}${i ? '' : '</b>'}`).join(', ')}. It blends the media's rankings and betting odds with a stats model; the full race is on the Leaders page.`;
  return { text, html: card((html || '') + top.map((x, i) => pRow(x.r, `#${i + 1}`, [x.r.abbr, x.rec, `${f1(x.r.pts)} / ${f1(x.r.reb)} / ${f1(x.r.ast)}`].filter(Boolean).join(' · '))).join('')), ctx: { pid: top[0].r.id } };
}

/* ---------------- router ---------------- */
async function answer(raw) {
  await loadStandings().catch(() => {});
  const n = ' ' + nameKey(raw.replace(/\+\/-/g, ' plusminus ').replace(/%/g, ' percent ').replace(/(\d)\+/g, '$1 plus ')) + ' ';
  const nn = n.replace(/ plusminus /g, ' plus minus ');
  const has = re => re.test(nn);
  const rows = await leagueTable();
  if (ERA_HINT.test(nn) || /'\d\d\b/.test(raw)) { const r = await eraTry(raw, rows, false); if (r) return r; }
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
  const chunks = rest.split(/ (?:vs|versus|v|against|compared to|compare to|or|and|with|without|when|w o) /).map(s => s.trim()).filter(Boolean);
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

  if (has(/ (help|what can you|what do you know|examples?) /) && !players.length && !teams.length) return { text: `Ask about this season: players, teams, games, leaders, standings, schedules and odds.${IS_C || IS_W ? '' : ' Or any NBA season back to 1947: award races, leaders, old teams, and players side by side.'} Some examples:`, examples: true };

  // prop ideas
  if (has(/ (props?|prop bets?|player props|best bets?|locks?|good bets?|bets? (for |to make )?(tonight|today|tomorrow)|what should i bet|who should i bet|what to bet|parlay ideas?|sgp ideas?|suggest\w*|recommend\w*|picks?|leans?|best overs?|best unders?) /) && !has(/ (draft|lottery|first|1st|no 1|number one|top \d+) picks? /) && !has(/ over under /))
    return aProps({ pid: players[0]?.id, teamId: !players.length ? teams[0]?.id : null });

  // college: the polls
  if (IS_C && !players.length && has(/ (top 25|top twenty[- ]five|ap poll|coaches poll|poll|rankings?|ranked|number one|no\.? ?1|#1) /) && !st) {
    if (teams.length) return aTeamRecord(teams[0]);
    return aStandings(null);
  }
  // team splits ("Knicks in back-to-backs", "Celtics at home vs the West", "Knicks vs Celtics history")
  if (teams.length && !players.length && !has(/ (next game|play next|schedule|odds|spread|line|tonight|today) /)) {
    if (teams.length >= 2) { const at = t => Math.min(...[t.name, t.short, teamNick(t.id), t.loc, t.abbr].filter(Boolean).map(x => { const i = nn.indexOf(' ' + nameKey(x) + ' '); return i < 0 ? 1e9 : i; })); teams.sort((x, y) => at(x) - at(y)); }
    const two = teams.length >= 2 && has(/ (record|history|head to head|h2h|series|meetings?|all time|vs|versus|against) /) && has(/ (record|history|head to head|h2h|series|meetings?|all time|since|last season|playoffs?) /);
    const tf = tFilters(nn, has, two ? teams[1] : null);
    const { season, ...rest2 } = tf;
    if (two || Object.keys(rest2).length || (season && season !== 'cur')) return aTeamSplits(teams[0], tf);
  }
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

  // two players: with/without ("Tatum when Brown is out"), otherwise a comparison
  if (players.length >= 2 && OUT_RE.test(nn)) return aPlayerWithout(players[0], players[1], gfFilters(nn, has, null));
  if (players.length >= 2) return aCompare(players[0], players[1], st, rows);

  // one player
  if (players.length === 1) {
    const p = players[0];
    // the team with and without him ("Knicks without Brunson", "Lakers when LeBron sits")
    if (teams.length && OUT_RE.test(nn) && !has(/ (vs|versus|against) /)) { const t = teams.find(x => x.id === p.teamId) || teams[0]; return aTeamWithout(t, p, tFilters(nn, has, null)); }
    // game finder ("Luka 40-point games", "Jokic 30 and 10", "Brunson triple-doubles in his career", "Tatum best scoring games")
    if (time?.kind !== 'date' && time?.kind !== 'lastN') {
      const q = gfParse(nn, dd, td);
      const ddAsk = (q.dd || q.td) && (time?.kind === 'career' || has(/ (games|career|ever|all time|list|show|times|playoffs?|postseason|this season|this year) /));
      const opp = teams.find(t => t.id !== p.teamId) && has(/ (vs|versus|against|v|facing|playing|when playing) /) ? teams.find(t => t.id !== p.teamId) : null;
      const f = gfFilters(nn, has, opp);
      // "Knicks when Brunson scores 30+": only his games for that team
      const own = !opp && teams.find(t => String(t.id) === String(p.teamId)); if (own) f.team = own;
      if (q.conds.length || q.best || ddAsk) return aGameFinder(p, q, { f, stat: st });
      // a split: opponent, home/road, wins/losses, a past season, the playoffs, a month ("this season" alone is the normal season answer)
      const { season, ...rest } = f;
      if (gfAny(rest) || (season && season !== 'cur')) return aSplits(p, f);
    }
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
  if (!IS_C) { const aw = NOW_AW.find(a => a[1].test(nn)); if (aw && !(IS_W && aw[0] === 'smoy')) return aAwardNow(aw[0], aw[2], Math.min(5, topN || 3), rows, IS_W && / (19[4-9]\d|20[0-2]\d) /.test(nn)); }
  if (has(/ (leaders?|leads|mvp|best player|top players?) /)) return aLeaders('pts', { conf, n: topN }, rows);

  if (teams.length) return aTeamSummary(teams[0], rows);
  { const r = await eraTry(raw, rows, true); if (r) return r; } // a retired player, or a season Ask itself doesn't know
  return { text: `I couldn't match that to a player, team or stat. Try naming a player or team, a stat (points, rebounds, assists, threes…) and a time (last night, last 5 games, this season).`, examples: true, miss: true };
}

/* ---------------- game finder: "Luka 40-point games", "Jokic 30 and 10", "Wemby 5+ blocks in the playoffs" ----------------
   Every season of the player's game log, filtered by the conditions in the question. */
const GF_WORDS = [['pts', 'points?|pts|pt'], ['reb', 'rebounds?|rebs?|boards'], ['ast', 'assists?|asts?|dimes'], ['tpm', 'threes|three pointers?|3 pointers?|3s|3pm|treys'],
  ['stl', 'steals?|stls?'], ['blk', 'blocks?|blks?|rejections'], ['tov', 'turnovers?|tovs?']];
const GF_LABEL = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'threes', stl: 'steals', blk: 'blocks', tov: 'turnovers' };
const gfLogs = new Map();
// what the question asks for: conditions ("40 plus points"), double/triple-doubles, or a player's best games
function gfParse(nn, dd, td) {
  const conds = [];
  const used = new Set();
  const add = (k, v) => { if (!used.has(k) && v > 0 && v < 100) { used.add(k); conds.push([k, v]); } };
  for (const [k, w] of GF_WORDS) {
    const re = new RegExp(` (?:at least |over |more than )?(\\d{1,2}) (?:plus |or more )?(?:${w})(?: or more)?(?= |$)`, 'g');
    for (const m of nn.matchAll(re)) add(k, +m[1] + (/^ (over|more than) /.test(m[0]) ? 1 : 0)); // "over 30" means 31+
  }
  { const sc = nn.match(/ scor(?:es|ed|ing|e)? (?:at least |over |more than )?(\d{1,2})(?: plus| or more)?(?= |$)/); if (sc) add('pts', +sc[1] + (/ (over|more than) \d/.test(sc[0]) ? 1 : 0)); }
  // bare numbers: "30 and 10", "30 10 10" (from 30/10/10) → points, rebounds, assists
  const bare = nn.match(/ (\d{2}) (?:and )?(\d{1,2})(?: (?:and )?(\d{1,2}))?(?! (?:plus |or more )?(?:points?|pts|pt|rebounds?|rebs?|boards|assists?|asts?|dimes|threes|3s|steals?|blocks?|games?|seasons?|minutes))(?= |$)/);
  if (bare && !conds.length) ['pts', 'reb', 'ast'].forEach((k, i) => bare[i + 1] && add(k, +bare[i + 1]));
  else if (bare && conds.length === 1 && conds[0][0] !== 'pts' && +bare[1] >= 10) add('pts', +bare[1]);
  const best = / (best|biggest|highest|top) (scoring )?games? | career highs? | most (points|rebounds|assists|threes|steals|blocks|boards|dimes) in a (single )?game | (single )?game highs? /.test(nn);
  return { conds, dd: dd && !conds.length, td: td && !conds.length, best: best && !conds.length };
}
async function gfLog(pid) {
  if (gfLogs.has(pid)) return gfLogs.get(pid);
  const pr = (async () => {
    const first = await getJSON(`${WEB}/athletes/${pid}/gamelog`);
    const f = (first.filters || []).find(x => x.name === 'season');
    const cur = String(f?.value || f?.options?.[0]?.value || '');
    const seasons = (f?.options || []).map(o => String(o.value)).filter(x => x && x !== cur);
    const logs = [[cur, first]];
    let i = 0, failed = 0;
    await Promise.all([0, 1, 2, 3].map(async () => { while (i < seasons.length) { const y = seasons[i++]; try { logs.push([y, await getJSON(`${WEB}/athletes/${pid}/gamelog?season=${y}`)]); } catch (e) { failed++; } } }));
    const games = [];
    for (const [season, d] of logs) {
      const lab = d.labels || [];
      for (const st of d.seasonTypes || []) {
        const nm = st.displayName || '';
        if (/preseason|play-?in|all-?star/i.test(nm)) continue;
        const type = !IS_C && /post|playoff/i.test(nm) ? 'post' : 'reg';
        for (const c of st.categories || []) for (const e of c.events || []) {
          const m = d.events?.[e.eventId] || {};
          if (/^(team |world$|usa|rising|all-?star)/i.test(m.opponent?.displayName || '')) continue;
          const v = k => e.stats?.[lab.indexOf(k)];
          const sp = k => String(v(k) || '0-0').split('-').map(Number);
          const g = { id: e.eventId, d: m.gameDate || '', season, type, tid: String(m.team?.id || ''), o: m.opponent?.abbreviation || '', oid: m.opponent?.id, at: m.atVs || 'vs', r: m.gameResult || '', sc: m.score || '',
            min: +v('MIN') || 0, pts: +v('PTS') || 0, reb: +v('REB') || 0, ast: +v('AST') || 0, stl: +v('STL') || 0, blk: +v('BLK') || 0, tov: +v('TO') || 0, fg: sp('FG'), tp: sp('3PT'), ft: sp('FT') };
          g.tpm = g.tp[0];
          if (!(g.min > 0) && !(g.pts > 0)) continue;
          games.push(g);
        }
      }
    }
    games.sort((a, b) => b.d.localeCompare(a.d));
    return { games, cur, failed };
  })();
  gfLogs.set(pid, pr);
  pr.catch(() => gfLogs.delete(pid));
  return pr;
}
const gfTen = g => ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => g[k] >= 10).length;
const MONTHS_L = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// ESPN's season value is the year a season ends (2027 = 2026-27); the WNBA's is its calendar year
const seasonName = y => IS_W ? String(y) : `${+y - 1}-${String(+y % 100).padStart(2, '0')}`;
// the split a question asks for: opponent, home/road, wins/losses, a season, the playoffs, a month, "since 2024"
function gfFilters(nn, has, opp) {
  const f = {};
  if (opp) f.opp = opp;
  if (has(/ (at home|home games?|in home games) /)) f.loc = 'home';
  else if (has(/ (on the road|road games?|away games?|away from home|when away) /)) f.loc = 'away';
  if (has(/ (in wins|wins only|when (they|the \w+) win|in victories) /)) f.res = 'W';
  else if (has(/ (in losses|losses only|when (they|the \w+) lose|in defeats) /)) f.res = 'L';
  if (has(/ (playoffs?|postseason) /)) f.scope = 'post';
  else if (has(/ regular season /)) f.scope = 'reg';
  if (has(/ last (season|year) /)) f.season = 'prev';
  else if (has(/ (this season|this year|so far) /)) f.season = 'cur';
  const sy = nn.match(/ (?:in |during |the )?(20\d\d|19\d\d) (\d\d) (?:season )?/);
  if (sy) f.season = String(+sy[1] + 1);
  else if (IS_W) { const w = nn.match(/ (?:in |the )?(20\d\d) season /); if (w) f.season = w[1]; }
  const since = nn.match(/ since (20\d\d|19\d\d) /); if (since) f.since = since[1];
  const mo = nn.match(new RegExp(` in (${MONTHS_L.join('|')}) `)); if (mo) f.month = MONTHS_L.indexOf(mo[1]);
  return f;
}
const gfAny = f => Object.keys(f).length > 0;
function gfApply(games, f, cur) {
  const prev = String(+cur - 1);
  return games.filter(g => (!f.opp || g.oid === f.opp.id || g.o === f.opp.abbr)
    && (!f.team || g.tid === String(f.team.id))
    && (!f.loc || (f.loc === 'away') === (g.at === '@'))
    && (!f.res || g.r === f.res)
    && (!f.scope || g.type === f.scope)
    && (!f.season || g.season === (f.season === 'cur' ? cur : f.season === 'prev' ? prev : f.season))
    && (!f.since || g.d.slice(0, 4) >= f.since)
    && (f.month == null || new Date(g.d).getMonth() === f.month));
}
function gfWhere(f) {
  const bits = [];
  if (f.team) bits.push(`with the ${esc(teamNick(f.team.id))}`);
  if (f.opp) bits.push(`against the ${esc(f.opp.short || f.opp.name)}`);
  if (f.loc) bits.push(f.loc === 'home' ? 'at home' : 'on the road');
  if (f.res) bits.push(f.res === 'W' ? 'in wins' : 'in losses');
  if (f.scope === 'post') bits.push('in the playoffs'); else if (f.scope === 'reg') bits.push('in the regular season');
  if (f.season) bits.push(f.season === 'cur' ? 'this season' : f.season === 'prev' ? 'last season' : `in ${seasonName(f.season)}`);
  if (f.month != null) bits.push(`in ${MONTHS_L[f.month][0].toUpperCase() + MONTHS_L[f.month].slice(1)}`);
  if (f.since) bits.push(`since ${f.since}`);
  return bits.length ? ' ' + bits.join(' ') : '';
}
// averages over a set of games
function gfAvg(gs) {
  const n = gs.length, sum = k => gs.reduce((a, g) => a + g[k], 0), mk = (k, i) => gs.reduce((a, g) => a + g[k][i], 0);
  const pct = k => { const a = mk(k, 1); return a ? (mk(k, 0) / a * 100).toFixed(1) : '–'; };
  const w = gs.filter(g => g.r === 'W').length, l = gs.filter(g => g.r === 'L').length;
  return { n, rec: `${w}-${l}`, w, l, min: f1(sum('min') / n), pts: f1(sum('pts') / n), reb: f1(sum('reb') / n), ast: f1(sum('ast') / n), stl: f1(sum('stl') / n), blk: f1(sum('blk') / n), tov: f1(sum('tov') / n), tpm: f1(sum('tpm') / n), fgp: pct('fg'), tpp: pct('tp'), ftp: pct('ft') };
}
const gfAvgRow = (label, a) => `<tr><td>${esc(label)}</td><td>${a.n}</td><td>${a.rec}</td><td>${a.min}</td><td>${a.pts}</td><td>${a.reb}</td><td>${a.ast}</td><td>${a.stl}</td><td>${a.blk}</td><td>${a.tov}</td><td>${a.fgp}</td><td>${a.tpp}</td><td>${a.ftp}</td></tr>`;
const GF_AVG_HEAD = ['', 'GP', 'W-L', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%'];
const gfDay = g => g.d ? dfmt('en-US', { timeZone: UTZ, month: 'short', day: 'numeric', year: 'numeric' }, new Date(g.d)) : '';
const gfLogRows = (gs, hl = () => '') => gs.map(g => `<tr data-game="${g.id}"><td>${esc(gfDay(g))}${g.type === 'post' ? ' <small>PO</small>' : ''}</td><td>${g.at === '@' ? '@' : 'vs'} ${esc(g.o)}</td><td class="${g.r === 'W' ? 'w' : 'l'}">${esc(g.r)} ${esc(g.sc)}</td><td>${g.min}</td><td class="${hl('pts')}">${g.pts}</td><td class="${hl('reb')}">${g.reb}</td><td class="${hl('ast')}">${g.ast}</td><td class="${hl('stl')}">${g.stl}</td><td class="${hl('blk')}">${g.blk}</td><td>${g.fg[0]}-${g.fg[1]}</td><td class="${hl('tpm')}">${g.tp[0]}-${g.tp[1]}</td></tr>`);
const GF_LOG_HEAD = ['Date', 'Opp', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT'];

// a player's averages and game log for a split: "Brunson stats vs the Spurs", "Luka at home in November", "Tatum in losses last season"
async function aSplits(p, f) {
  const { games, cur, failed } = await gfLog(p.id);
  const pool = gfApply(games, f, cur);
  const where = gfWhere(f);
  if (!pool.length) return { text: `${esc(p.name)} has no games${where}${f.season || f.scope ? '' : IS_C ? ' in college' : ` in ${HIS} career`}.`, ctx: { pid: p.id } };
  const a = gfAvg(pool);
  const team = teamNick(p.teamId);
  const reg = pool.filter(g => g.type === 'reg'), post = pool.filter(g => g.type === 'post'), thisS = pool.filter(g => g.season === cur);
  const span = f.season || f.scope || f.since ? '' : IS_C ? ' in college' : ` in ${HIS} career`;
  let text = `${esc(p.name)}${where}: <b>${plural(a.n, 'game')}</b>${span}${!f.scope && reg.length && post.length ? ` (${reg.length} regular season, ${plural(post.length, 'playoff game')})` : ''}, averaging <b>${a.pts} points, ${a.reb} rebounds and ${a.ast} assists</b> on ${a.fgp}% shooting and ${a.tpp}% from three.`;
  if (!f.res && (a.w + a.l)) text += ` ${f.opp ? `${HIS[0].toUpperCase() + HIS.slice(1)} teams went` : 'Record in those games:'} ${a.rec}${f.opp ? ' in those games' : ''}.`;
  const last = pool[0];
  text += ` Most recent: ${last.pts}-${last.reb}-${last.ast} ${last.at === '@' ? 'at' : 'vs'} ${esc(last.o)} on ${esc(gfDay(last))} (${esc(last.r)} ${esc(last.sc)}).`;
  if (failed) text += ' (Some seasons didn\'t load, so this may be missing a few games.)';
  // averages: the whole split, then its parts
  const avgRows = [gfAvgRow(f.season || f.scope ? 'Average' : IS_C ? 'College' : 'All games', a)];
  if (!f.scope && reg.length && post.length) { avgRows.push(gfAvgRow('Regular season', gfAvg(reg)), gfAvgRow('Playoffs', gfAvg(post))); }
  if (!f.season && thisS.length && thisS.length < pool.length) avgRows.push(gfAvgRow('This season', gfAvg(thisS)));
  const L5 = pool.slice(0, 5); if (pool.length > 8) avgRows.push(gfAvgRow('Last 5', gfAvg(L5)));
  // by season, when the split runs over several
  const bySeason = [...new Set(pool.map(g => g.season))];
  const seasonT = !f.season && bySeason.length > 1 ? `<p class="ask-note">By season</p>` + table(GF_AVG_HEAD, bySeason.slice(0, 12).map(y => gfAvgRow(seasonName(y), gfAvg(pool.filter(g => g.season === y))))) : '';
  const show = pool.slice(0, 40);
  const html = card(pRow(p, null, `${team ? team + ' · ' : ''}${plural(a.n, 'game')}`)
    + table(GF_AVG_HEAD, avgRows) + seasonT
    + `<p class="ask-note">Game log${pool.length > show.length ? ` (latest ${show.length} of ${pool.length})` : ''}</p>` + table(GF_LOG_HEAD, gfLogRows(show)));
  return { text, html, ctx: { pid: p.id, teamId: p.teamId } };
}
async function aGameFinder(p, q, opts = {}) {
  const { games, cur, failed } = await gfLog(p.id);
  const f = opts.f || {};
  const scope = f.season === 'cur' ? 'season' : f.scope;
  const pool = gfApply(games, f, cur);
  const where = gfWhere(f) + (f.season || f.scope || f.since ? '' : IS_C ? ' in college' : ' in ' + HIS + ' career');
  if (!pool.length) return { text: `I couldn't find any games for ${esc(p.name)}${where}.`, ctx: { pid: p.id } };
  let hits, what, sortK = null;
  if (q.best) {
    sortK = opts.stat && GF_LABEL[opts.stat] ? opts.stat : 'pts';
    hits = [...pool].sort((a, b) => b[sortK] - a[sortK] || b.d.localeCompare(a.d)).slice(0, 10);
    what = `best ${sortK === 'pts' ? 'scoring' : GF_LABEL[sortK].replace(/s$/, '')} games`;
  } else {
    const test = q.td ? g => gfTen(g) >= 3 : q.dd ? g => gfTen(g) >= 2 : g => q.conds.every(([k, v]) => g[k] >= v);
    hits = pool.filter(test);
    const parts = q.conds.map(([k, v]) => `${v}+ ${GF_LABEL[k]}`);
    what = q.td ? 'triple-doubles' : q.dd ? 'double-doubles' : parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join(' and ');
  }
  const regN = hits.filter(g => g.type === 'reg').length, postN = hits.length - regN;
  const split = !q.best && !scope && postN && regN ? ` (${regN} regular season, ${postN} playoff${postN === 1 ? '' : 's'})` : '';
  const curN = !q.best && scope !== 'season' ? hits.filter(g => g.season === cur && g.type === 'reg').length : 0;
  const day = gfDay;
  const line = g => `${q.conds.length ? q.conds.map(([k]) => `${g[k]} ${GF_LABEL[k]}`).join(', ') : sortK ? `${g[sortK]} ${GF_LABEL[sortK]}` : `${g.pts}-${g.reb}-${g.ast}`} ${g.at === '@' ? 'at' : 'vs'} ${esc(g.o)} on ${day(g)}`;
  let text;
  if (q.best) text = `${esc(p.name)}'s ${what}${where}: the top one is <b>${line(hits[0])}</b>.`;
  else if (!hits.length) {
    const near = q.conds.length === 1 ? Math.max(...pool.map(g => g[q.conds[0][0]])) : null;
    text = `${esc(p.name)} has ${q.td || q.dd ? `no ${what}` : `no games with ${what}`}${where}${near != null ? `. ${HIS[0].toUpperCase() + HIS.slice(1)} best is ${near} ${GF_LABEL[q.conds[0][0]]}` : ''} (${plural(pool.length, 'game')} checked).`;
  } else {
    text = q.td || q.dd ? `${esc(p.name)} has <b>${plural(hits.length, q.td ? 'triple-double' : 'double-double')}</b>${where}${split}.` : `${esc(p.name)} has <b>${plural(hits.length, 'game')} with ${what}</b>${where}${split}.`;
    if (curN && scope !== 'season') text += ` ${curN} of them came this season.`;
    { const w = hits.filter(g => g.r === 'W').length, l = hits.filter(g => g.r === 'L').length; if (w + l) text += ` ${HIS[0].toUpperCase() + HIS.slice(1)} team${hits.some(g => g.tid !== hits[0].tid) ? 's' : ''} went ${w}-${l} in them.`; }
    text += ` The latest: ${line(hits[0])}.`;
  }
  if (failed) text += ` (Some seasons didn't load, so this may be missing a few games.)`;
  const show = q.best ? hits : hits.slice(0, 30);
  const hl = k => (q.conds.some(([c]) => c === k) || sortK === k) ? 'hl' : '';
  const rowsH = show.map(g => `<tr data-game="${g.id}"><td>${esc(day(g))}${g.type === 'post' ? ' <small>PO</small>' : ''}</td><td>${g.at === '@' ? '@' : 'vs'} ${esc(g.o)}</td><td class="${g.r === 'W' ? 'w' : 'l'}">${esc(g.r)} ${esc(g.sc)}</td><td>${g.min}</td><td class="${hl('pts')}">${g.pts}</td><td class="${hl('reb')}">${g.reb}</td><td class="${hl('ast')}">${g.ast}</td><td class="${hl('stl')}">${g.stl}</td><td class="${hl('blk')}">${g.blk}</td><td class="${hl('tpm')}">${g.tp[0]}-${g.tp[1]}</td></tr>`);
  const note = !q.best && hits.length > show.length ? `<p class="ask-note">Showing the ${show.length} most recent of ${hits.length}.</p>` : '';
  return {
    text,
    html: hits.length ? card(pRow(p, null, `${plural(pool.length, 'game')} checked`) + table(['Date', 'Opp', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', '3PT'], rowsH) + note) : card(pRow(p, null, `${plural(pool.length, 'game')} checked`)),
    ctx: { pid: p.id, teamId: p.teamId },
  };
}

/* ---------------- team splits and with/without ----------------
   "Knicks in back-to-backs", "Celtics at home vs the West", "Knicks without Brunson", "Tatum when Brown is out" */
const HIM = IS_F ? 'her' : 'him';
const OUT_RE = / (without|w o|sits|sat|sitting|is out|was out|are out|out|missing|misses|injured|inactive|doesn t play|didn t play|does not play|did not play|not playing|with and without|with or without|on off) /;
function tFilters(nn, has, opp) {
  const f = gfFilters(nn, has, opp);
  delete f.res; // a team's record already shows wins and losses
  if (has(/ (back to backs?|b2bs?|second night|second game of a back to back|on no rest|zero days rest) /)) f.b2b = true;
  const cm = nn.match(/ (?:vs|versus|against) (?:the )?(east|west)(?:ern)?(?: conference)? (?:teams? )?/); if (cm && !IS_C) f.oconf = cm[1] === 'east' ? 0 : 1;
  if (has(/ (close games?|one possession games?|clutch games?|games decided by 5 or less) /)) f.close = true;
  if (has(/ after (a )?loss(es)? /)) f.after = 'L'; else if (has(/ after (a )?wins? /)) f.after = 'W';
  return f;
}
function tApply(games, f, cur) {
  const prev = String(+cur - 1);
  const older = [...games].sort((a, b) => a.d.localeCompare(b.d));
  const before = new Map(older.map((g, i) => [g.id, older[i - 1]]));
  return games.filter(g => (!f.opp || g.oid === String(f.opp.id))
    && (!f.loc || (f.loc === 'home') === g.home)
    && (!f.scope || g.type === f.scope)
    && (!f.season || g.season === (f.season === 'cur' ? cur : f.season === 'prev' ? prev : f.season))
    && (!f.since || g.d.slice(0, 4) >= f.since)
    && (f.month == null || new Date(g.d).getMonth() === f.month)
    && (!f.b2b || g.b2b)
    && (f.oconf == null || S.teams[g.oid]?.conf === f.oconf)
    && (!f.close || Math.abs(g.pf - g.pa) <= 5)
    && (!f.after || before.get(g.id)?.r === f.after));
}
function tWhere(f) {
  let w = gfWhere({ ...f, opp: null });
  const bits = [];
  if (f.opp) bits.push(`against the ${esc(f.opp.short || f.opp.name)}`);
  if (f.b2b) bits.push('on the second night of back-to-backs');
  if (f.oconf != null) bits.push(`against the ${f.oconf === 0 ? 'East' : 'West'}`);
  if (f.close) bits.push('in games decided by 5 or fewer');
  if (f.after) bits.push(f.after === 'L' ? 'after a loss' : 'after a win');
  return (bits.length ? ' ' + bits.join(' ') : '') + w;
}
// which seasons a team question needs
async function tSeasonsFor(H, teamId, f) {
  const cur = await H.tlSeasonNow(teamId);
  let ys = [cur];
  if (f.season === 'prev') ys = [String(+cur - 1)];
  else if (f.season && f.season !== 'cur') ys = [f.season];
  else if (f.since) { const from = +f.since + (IS_W ? 0 : 1); ys = []; for (let y = +cur; y >= from && ys.length < 6; y--) ys.push(String(y)); }
  else if (f.opp && !f.season) ys = [cur, String(+cur - 1), String(+cur - 2)];
  const logs = await Promise.all(ys.map(y => H.tLog(teamId, y)));
  return { cur, games: H.tlMarkB2B(logs.flat().sort((a, b) => b.d.localeCompare(a.d))) };
}
function tAvg(gs) {
  const n = gs.length, w = gs.filter(g => g.r === 'W').length;
  const pf = gs.reduce((a, g) => a + g.pf, 0) / n, pa = gs.reduce((a, g) => a + g.pa, 0) / n;
  return { n, w, l: n - w, rec: `${w}-${n - w}`, pf: pf.toFixed(1), pa: pa.toFixed(1), diff: (pf - pa >= 0 ? '+' : '') + (pf - pa).toFixed(1) };
}
const tAvgRow = (label, a) => `<tr><td>${esc(label)}</td><td>${a.n}</td><td>${a.rec}</td><td>${a.pf}</td><td>${a.pa}</td><td class="${+a.diff >= 0 ? 'w' : 'l'}">${a.diff}</td></tr>`;
const T_AVG_HEAD = ['', 'GP', 'W-L', 'PTS', 'OPP', '+/-'];
const tLogRows = gs => gs.map(g => `<tr data-game="${g.id}"><td>${esc(gfDay(g))}${g.type === 'post' ? ' <small>PO</small>' : ''}</td><td>${g.home ? 'vs' : '@'} ${esc(g.o)}</td><td class="${g.r === 'W' ? 'w' : 'l'}">${g.r} ${g.pf}-${g.pa}</td><td>${g.pf - g.pa > 0 ? '+' : ''}${g.pf - g.pa}</td></tr>`);
const T_LOG_HEAD = ['Date', 'Opp', 'Result', '+/-'];
const tName = t => `the ${esc(teamNick(t.id))}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

async function aTeamSplits(t, f) {
  const H = await lazy('h2h');
  const { cur, games } = await tSeasonsFor(H, t.id, f);
  const base = tApply(games, { season: f.season, scope: f.scope, since: f.since, teamId: t.id }, cur);
  f.teamId = t.id;
  const pool = tApply(games, f, cur);
  const where = tWhere(f) + (!f.season && !f.since && !f.opp ? ' this season' : '');
  const past = (f.season && f.season !== 'cur') || f.since || f.opp;
  if (!pool.length) return { text: `${cap(tName(t))} haven't played a game${where}.`, html: card(tRow(t, null, t.rec || '')), ctx: { teamId: t.id } };
  const a = tAvg(pool);
  let text = `${cap(tName(t))} ${past ? 'went' : 'are'} <b>${a.rec}</b>${where}, scoring ${a.pf} and allowing ${a.pa} per game (${a.diff}).`;
  if (f.opp) { const last = pool[0]; text += ` Last meeting: ${last.r === 'W' ? 'won' : 'lost'} ${last.pf}-${last.pa} on ${esc(gfDay(last))}.`; }
  const rows = [tAvgRow('This split', a)];
  if (base.length > pool.length) rows.push(tAvgRow(f.opp ? 'All games in those seasons' : 'All games', tAvg(base)));
  const show = pool.slice(0, 40);
  return {
    text,
    html: card(tRow(t, null, `${a.rec}${where}`) + table(T_AVG_HEAD, rows) + `<p class="ask-note">Games${pool.length > show.length ? ` (latest ${show.length} of ${pool.length})` : ''}</p>` + table(T_LOG_HEAD, tLogRows(show))),
    ctx: { teamId: t.id },
  };
}
// the team with and without a player
async function aTeamWithout(t, p, f) {
  const H = await lazy('h2h');
  const [{ cur, games }, plog] = await Promise.all([tSeasonsFor(H, t.id, f), gfLog(p.id)]);
  f.teamId = t.id;
  const pool = tApply(games, f, cur);
  const played = new Set(plog.games.filter(g => g.min > 0 && g.tid === String(t.id)).map(g => String(g.id)));
  const withG = pool.filter(g => played.has(g.id)), without = pool.filter(g => !played.has(g.id));
  const where = tWhere(f) + (!f.season && !f.since ? ' this season' : '');
  const last = p.name.split(' ').slice(1).join(' ') || p.name;
  if (!pool.length) return { text: `${cap(tName(t))} haven't played a game${where}.`, ctx: { teamId: t.id, pid: p.id } };
  const aw = withG.length ? tAvg(withG) : null, ao = without.length ? tAvg(without) : null;
  if (!aw && String(p.teamId) !== String(t.id)) return { text: `${esc(p.name)} hasn't played for ${tName(t)}${where}${S.teams[p.teamId] ? ` (${HES} with the ${esc(teamNick(p.teamId))} now)` : ''}.`, ctx: { teamId: t.id, pid: p.id } };
  const past = (f.season && f.season !== 'cur') || f.since;
  let text;
  if (!ao) { // he's played every game: say so first instead of "0-0 without him"
    text = `${esc(p.name)} hasn't missed a game${where}. ${cap(tName(t))} ${past ? 'went' : 'are'} <b>${aw.rec} with ${HIM}</b>: ${aw.pf} scored, ${aw.pa} allowed (${aw.diff}).`;
  } else {
    text = `${cap(tName(t))} ${past ? 'went' : 'are'} <b>${aw ? aw.rec : '0-0'} with ${esc(p.name)}</b> and <b>${ao.rec} without ${HIM}</b>${where}.`;
    if (aw) text += ` With ${HIM}: ${aw.pf} scored, ${aw.pa} allowed (${aw.diff}).`;
    text += ` Without: ${ao.pf} scored, ${ao.pa} allowed (${ao.diff}).`;
  }
  const rows = [aw && tAvgRow(`With ${last}`, aw), ao && tAvgRow(`Without ${last}`, ao)].filter(Boolean);
  return {
    text,
    html: card(tRow(t, null, `with and without ${p.name}`) + table(T_AVG_HEAD, rows) + (without.length ? `<p class="ask-note">Games without ${esc(last)}</p>` + table(T_LOG_HEAD, tLogRows(without.slice(0, 40))) : '')),
    ctx: { teamId: t.id, pid: p.id },
  };
}
// a player's numbers with and without a teammate
async function aPlayerWithout(a, b, f) {
  const [la, lb] = await Promise.all([gfLog(a.id), gfLog(b.id)]);
  const cur = la.cur;
  const scoped = !f.season && !f.since && !f.scope ? { ...f, season: 'cur' } : f;
  const pool = gfApply(la.games, scoped, cur);
  // only seasons and teams where the two were teammates
  const mates = new Set(lb.games.map(g => `${g.season}|${g.tid}`));
  const together = pool.filter(g => mates.has(`${g.season}|${g.tid}`));
  const bPlayed = new Set(lb.games.filter(g => g.min > 0).map(g => String(g.id)));
  const withG = together.filter(g => bPlayed.has(String(g.id))), without = together.filter(g => !bPlayed.has(String(g.id)));
  const where = gfWhere(scoped);
  const bl = b.name.split(' ').slice(1).join(' ') || b.name;
  if (!together.length) return { text: `${esc(a.name)} and ${esc(b.name)} haven't been teammates${where}${S.teams[b.teamId] && String(a.teamId) !== String(b.teamId) ? ` (${esc(b.name.split(' ').slice(1).join(' ') || b.name)} plays for the ${esc(teamNick(b.teamId))})` : ''}.`, ctx: { pid: a.id } };
  if (!without.length) return { text: `${esc(b.name)} has played in all ${plural(together.length, 'game')} ${esc(a.name)} has played${where}, so there's nothing to compare yet.`, html: card(pRow(a, null, `with ${b.name}`) + table(GF_AVG_HEAD, [gfAvgRow(`With ${bl}`, gfAvg(withG))])), ctx: { pid: a.id } };
  const aw = withG.length ? gfAvg(withG) : null, ao = gfAvg(without);
  let text = `Without ${esc(b.name)}${where}, ${esc(a.name)} is averaging <b>${ao.pts} points, ${ao.reb} rebounds and ${ao.ast} assists</b> in ${plural(ao.n, 'game')} on ${ao.fgp}% shooting (team ${ao.rec}).`;
  if (aw) text += ` With ${esc(bl)}: ${aw.pts} / ${aw.reb} / ${aw.ast} in ${plural(aw.n, 'game')} (${aw.rec}).`;
  return {
    text,
    html: card(pRow(a, null, `with and without ${b.name}`) + table(GF_AVG_HEAD, [aw && gfAvgRow(`With ${bl}`, aw), gfAvgRow(`Without ${bl}`, ao)].filter(Boolean))
      + `<p class="ask-note">Games without ${esc(bl)}</p>` + table(GF_LOG_HEAD, gfLogRows(without.slice(0, 40)))),
    ctx: { pid: a.id, teamId: a.teamId },
  };
}

/* ---------------- voice: ask out loud ----------------
   The browser's speech recognition (Chrome, Edge, Safari on iPhone): words show in the box as you talk and the
   question sends when you stop. The Windows app's browser engine has none, so there the mic points to Windows'
   own dictation (Windows key + H), which types into the box. */
const ASK_SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const askMicBtn = () => ASK_SR || IS_APP ? `<button class="ask-img ask-mic" type="button" data-askmic title="Ask by voice" aria-label="Ask by voice" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg></button>` : '';
function wireMic(form, inp, fit) {
  const btn = $('[data-askmic]', form); if (!btn) return;
  let rec = null, sent = false, ph = inp.placeholder;
  const dictate = () => { inp.focus(); toast('Press Windows key + H to talk. Windows types what you say into the box.'); };
  const stop = () => { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); inp.placeholder = ph; rec = null; };
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    if (!ASK_SR) { dictate(); return; }
    try { rec = new ASK_SR(); } catch (e) { dictate(); return; }
    rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    sent = false;
    rec.onresult = e => {
      const text = [...e.results].map(r => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
      inp.value = text; fit();
      if ([...e.results].every(r => r.isFinal) && text && !sent) { sent = true; setTimeout(() => form.requestSubmit(), 350); }
    };
    rec.onerror = e => {
      const er = e.error;
      if (er === 'not-allowed' || er === 'service-not-allowed') toast(IS_APP ? 'Voice isn\'t available here. Press Windows key + H to dictate instead.' : 'Microphone access is blocked. Allow it for this site to ask by voice.');
      else if (er === 'no-speech') toast('Didn\'t catch that. Tap the mic and try again.');
      else if (er === 'network' || er === 'language-not-supported' || er === 'audio-capture') { if (IS_APP) dictate(); else toast(er === 'audio-capture' ? 'No microphone found.' : 'Voice isn\'t available right now. Try typing instead.'); }
    };
    rec.onend = stop;
    try { rec.start(); btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); inp.value = ''; fit(); inp.placeholder = 'Listening…'; } catch (e) { stop(); dictate(); }
  });
}

/* ---------------- chat UI ---------------- */
const ASK_EXAMPLES = IS_C ? [
  'Who scored the most points last night?',
  'Top 25',
  LGK === 'ncaaw' ? 'UConn record' : 'Duke record',
  LGK === 'ncaaw' ? 'When does South Carolina play next?' : 'When does Kentucky play next?',
  LGK === 'ncaaw' ? 'JuJu Watkins last 5 games' : 'Florida leading scorer',
  LGK === 'ncaaw' ? 'JuJu Watkins 30-point games' : 'Who scored 30 last night?',
  'Who had a double-double last night?',
  'Most threes per game',
  'Points leaders',
  LGK === 'ncaaw' ? 'LSU leading scorer' : 'Kansas record',
] : IS_W ? [
  'Who scored the most points last night?',
  "A'ja Wilson last 5 games",
  'Assist leaders in the West',
  'Liberty record',
  'When do the Fever play next?',
  'Caitlin Clark vs Paige Bueckers',
  "A'ja Wilson vs the Liberty",
  "A'ja Wilson 30-point games",
  'Who had a double-double last night?',
  'Most threes per game',
  'East standings',
  'Aces leading scorer',
  "Track: A'ja Wilson over 22.5 points",
] : [
  'Who scored the most points last night?',
  'Jayson Tatum last 5 games',
  'Assist leaders in the West',
  'Celtics record',
  'When do the Knicks play next?',
  'Luka Doncic vs Anthony Edwards',
  '1962 MVP race',
  'Wilt 1962 vs Jordan 1988',
  'Top scorers 1987',
  'Best scoring seasons ever',
  '1996 Bulls',
  'Lakers odds tonight',
  'Who had a double-double last night?',
  'Most threes per game',
  'Brunson stats vs the Spurs',
  'Luka at home this season',
  'Knicks in back-to-backs',
  'Lakers without LeBron',
  'Tatum when Brown is out',
  'Knicks vs Celtics history',
  'Tatum in the playoffs',
  'Luka 40-point games',
  'Jokic 30 and 10 this season',
  'East standings',
  'Hornets leading scorer',
  'Best props tonight',
  'Track: Jayson Tatum over 26.5 points',
];
let askSheet = null;
function examplesHTML() { return `<div class="ask-ex">${ASK_EXAMPLES.map(q => `<button class="chip" data-askq="${esc(q)}">${esc(q)}</button>`).join('')}</div>`; }
function askMsgHTML(m) {
  if (m.me) return m.img ? `<div class="msg me img"><img src="${m.img}" alt="Bet slip"></div>` : `<div class="msg me"><p>${esc(m.q).replace(/\n/g, '<br>')}</p></div>`;
  if (m.loading) return `<div class="msg bot loading"><p><span class="dots"><i></i><i></i><i></i></span> <span class="ld-t">${esc(m.loading === true ? 'Looking that up…' : m.loading)}</span></p></div>`;
  return `<div class="msg bot${m.miss ? ' miss' : ''}"><p>${m.text}</p>${m.html || ''}${m.examples ? examplesHTML() : ''}${m.at ? `<div class="msg-meta">${esc(m.src || 'ESPN')} data · ${esc(m.at)}</div>` : ''}</div>`;
}
function renderAsk(scroll = true) {
  if (!askSheet?.alive) return;
  const log = $('.ask-log', askSheet.el);
  log.innerHTML = ASK.log.length ? ASK.log.map(askMsgHTML).join('') : `<div class="ask-empty"><b class="h-display">Ask Fullcourt</b><p>Ask about this season in plain English: players, teams, last night's games, leaders, standings, schedules and odds. It answers from live ESPN data.${IS_C || IS_W ? " Deep history (past seasons) isn't available." : ' It also knows every NBA season back to 1947: award races, leaders, old teams and any two players side by side, each with a picture you can share.'}</p><p class="ask-bet-tip"><b>Track a bet:</b> type it out, one leg per line, or paste a screenshot of your slip. It shows up under My bets on Scores and updates live.</p>${examplesHTML()}</div>`;
  if (scroll) requestAnimationFrame(() => { askSheet.body.scrollTop = askSheet.body.scrollHeight; });
}
async function ask(q) {
  q = String(q || '').trim();
  if (!q || ASK.busy) return;
  ASK.busy = true;
  ASK.log.push({ me: true, q }, { loading: true });
  renderAsk();
  let res;
  try {
    if (/^\s*(show |see |check )?(my|all my) (bets|parlays?|slips?)\b|^\s*(bets|my bets)\s*\??$/i.test(q)) res = await (await lazy('bets')).betsAnswer();
    else if (looksLikeBet(q)) res = await answerSlip(q, false);
    else res = await answer(q);
  }
  catch (e) { res = { text: "I couldn't reach the stats feed just now. Give it a moment and try again.", miss: true }; }
  ASK.log.pop();
  ASK.log.push({ ...res, at: fmtTime(new Date().toISOString()) });
  if (res.ctx) ASK.ctx = { ...res.ctx, time: res.ctx.time || null };
  ASK.log = ASK.log.slice(-40);
  ASK.busy = false;
  renderAsk();
}
async function askImage(file) {
  if (ASK.busy) return;
  ASK.busy = true;
  const url = URL.createObjectURL(file);
  ASK.log.push({ me: true, img: url }, { loading: 'Getting the slip reader ready…' });
  renderAsk();
  const say = t => { const el = askSheet?.alive && $('.msg.loading .ld-t', askSheet.el); if (el) el.textContent = t; ASK.log.at(-1).loading = t; };
  let res;
  try {
    const text = await readImage(file, p => say(p < 0.32 ? 'Getting the slip reader ready…' : `Reading your slip… ${Math.round(p * 100)}%`));
    say('Matching players and games…');
    res = await answerSlip(text, true);
  } catch (e) {
    console.error(e);
    res = { text: "I couldn't read that image. Check your connection, or type the bet out, one leg per line.", miss: true };
  }
  ASK.log.pop();
  ASK.log.push({ ...res, at: fmtTime(new Date().toISOString()) });
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
    form.innerHTML = `<button class="ask-img" type="button" data-askimg title="Add a bet slip screenshot (or just paste one)" aria-label="Add a bet slip screenshot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-4.8-4.8a1.5 1.5 0 0 0-2.1 0L5 19.5"/></svg></button><input type="file" accept="image/*" hidden id="askFile"><textarea id="askInput" rows="1" autocomplete="off" spellcheck="false" placeholder="Ask anything, or add a bet…" aria-label="Ask a question or add a bet" enterkeyhint="send"></textarea>${askMicBtn()}<button class="ask-send" type="submit" aria-label="Ask">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'}</button>`;
    askSheet.el.append(form);
    const inp = $('#askInput', form);
    if (matchMedia('(max-width: 420px)').matches) inp.placeholder = 'Ask anything…'; // the full hint doesn't fit beside four buttons
    const fit = () => { inp.style.height = ''; if (inp.value) inp.style.height = Math.min(160, inp.scrollHeight + 2) + 'px'; };
    form.addEventListener('submit', e => { e.preventDefault(); const v = inp.value; inp.value = ''; fit(); ask(v); });
    inp.addEventListener('input', fit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    // ↑ in an empty box brings back your earlier questions, newest first (↓ steps forward again)
    let recall = -1;
    inp.addEventListener('input', () => { recall = -1; });
    form.addEventListener('submit', () => { recall = -1; });
    inp.addEventListener('keydown', e => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      const qs = [...new Set(ASK.log.filter(m => m.me && m.q).map(m => m.q).reverse())];
      if (!qs.length || (inp.value && inp.value !== qs[recall])) return;
      const n = recall + (e.key === 'ArrowUp' ? 1 : -1);
      if (n >= qs.length || n < -1) return;
      e.preventDefault();
      recall = n; inp.value = n < 0 ? '' : qs[n]; fit();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    });
    // bet slip screenshots: paste, drop, or pick a file
    const takeImage = f => { if (f && /^image\//.test(f.type)) askImage(f); };
    inp.addEventListener('paste', e => { const f = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && /^image\//.test(i.type))?.getAsFile(); if (f) { e.preventDefault(); takeImage(f); } });
    $('[data-askimg]', form).addEventListener('click', () => $('#askFile', form).click());
    wireMic(form, inp, fit);
    $('#askFile', form).addEventListener('change', e => { takeImage(e.target.files?.[0]); e.target.value = ''; });
    askSheet.el.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); askSheet.el.classList.add('drop'); } });
    askSheet.el.addEventListener('dragleave', e => { if (!askSheet.el.contains(e.relatedTarget)) askSheet.el.classList.remove('drop'); });
    askSheet.el.addEventListener('drop', e => { e.preventDefault(); askSheet.el.classList.remove('drop'); takeImage([...(e.dataTransfer?.files || [])][0]); });
    askSheet.body.addEventListener('click', e => {
      const b = e.target.closest('[data-askq]'); if (b) { ask(b.dataset.askq); return; }
      const pd = e.target.closest('[data-propd]'); if (pd) { const [pid, k, m] = pd.dataset.propd.split('|'); openPropDetail(pid, k, +m); return; }
      const tk = e.target.closest('[data-bettrack]');
      if (tk) { tk.disabled = true; trackSlip(tk.dataset.bettrack).then(bet => { if (!bet) return; tk.closest('.bs-act').innerHTML = '<span class="bs-done">Tracking · find it under <b>My bets</b> on Scores</span>'; }); return; }
      const ed = e.target.closest('[data-betedit]');
      if (ed) {
        // edit right in the card: the slip as plain text, one leg per line, then read it again in place
        const tok = ed.dataset.betedit, r = ASK.slips?.[tok], cardEl = ed.closest('.bs-card') || ed.closest('.msg');
        if (!r || !cardEl) return;
        cardEl.querySelector('.bs-editor')?.remove();
        const box = document.createElement('div'); box.className = 'bs-editor';
        box.innerHTML = `<textarea class="bs-edit" spellcheck="false" aria-label="Edit the bet, one leg per line">${esc(r.typed)}</textarea><div class="bs-act"><button class="btn" data-betreread="${tok}">Update</button><button class="btn ghost" data-betcancel>Cancel</button></div>`;
        const act = cardEl.querySelector(':scope > .bs-act'); if (act) act.hidden = true;
        cardEl.append(box);
        const ta = box.querySelector('textarea'); const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(320, ta.scrollHeight + 2) + 'px'; };
        ta.addEventListener('input', grow); grow(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        return;
      }
      const cx = e.target.closest('[data-betcancel]');
      if (cx) { const cardEl = cx.closest('.bs-card') || cx.closest('.msg'); cx.closest('.bs-editor').remove(); const act = cardEl?.querySelector(':scope > .bs-act'); if (act) act.hidden = false; return; }
      const rr = e.target.closest('[data-betreread]');
      if (rr) {
        const tok = rr.dataset.betreread, ta = rr.closest('.bs-editor')?.querySelector('textarea'); if (!ta || ASK.busy) return;
        rr.disabled = true; rr.textContent = 'Reading…';
        const i = ASK.log.findIndex(m => m.token === tok);
        answerSlip(ta.value, false).then(res => { if (i >= 0) ASK.log[i] = { ...res, at: fmtTime(new Date().toISOString()) }; renderAsk(false); })
          .catch(() => { rr.disabled = false; rr.textContent = 'Update'; });
        return;
      }
      const c = e.target.closest('[data-cmpab]'); if (c) { S.cmp = c.dataset.cmpab.split(','); closeAll(); go('compare'); }
    });
    renderAsk(false);
    leagueTable().catch(() => {});
  }
  setTimeout(() => $('#askInput')?.focus({ preventScroll: true }), 120);
  if (q) ask(q);
}

/* =====================================================================
   BET SLIPS IN ASK — read a typed or pasted (screenshot) bet, match each
   leg to a player/team and game, then hand it to "My bets" to track live.
   This module only loads the first time someone types or pastes a bet.
   ===================================================================== */
const BET_STATS = [
  // combos first so "points + rebounds + assists" isn't read as just points
  [['pts', 'reb', 'ast'], /\b(pra|p ?\+ ?r ?\+ ?a|pts ?\+ ?rebs? ?\+ ?asts?|points,? (\+|and|plus)? ?rebounds,? (\+|and|plus)? ?(and |plus )?assists)\b/],
  [['pts', 'reb'], /\b(p ?\+ ?r|pts ?\+ ?rebs?|points ?(\+|and|plus) ?rebounds|pr)\b/],
  [['pts', 'ast'], /\b(p ?\+ ?a|pts ?\+ ?asts?|points ?(\+|and|plus) ?assists|pa)\b/],
  [['reb', 'ast'], /\b(r ?\+ ?a|rebs? ?\+ ?asts?|rebounds ?(\+|and|plus) ?assists|ra)\b/],
  [['stl', 'blk'], /\b(stocks|steals ?(\+|and|plus) ?blocks|stl ?\+ ?blk|s ?\+ ?b)\b/],
  [['fpts'], /\b(fantasy( score| points| pts)?|fpts|fs)\b/],
  [['stl', 'blk'], /\b(blks? ?\+ ?stls?|blocks ?(\+|and|plus) ?steals)\b/],
  [['oreb'], /\b(offensive rebounds?|off(ensive)? rebs?|oreb)\b/],
  [['dreb'], /\b(defensive rebounds?|def(ensive)? rebs?|dreb)\b/],
  // attempts first, so "two pointers attempted" isn't read as made
  [['fg2a'], /\b((two|2)[ -]?point(ers?)? (field goals? |fg )?attempt(ed|s)?|(two|2)[ -]?pt (fg )?attempt(ed|s)?|2pa|2pt att|two point attempts)\b/],
  [['fg2'], /\b(two[ -]point(ers?)?( made| fg made)?|2[ -]?pt( made| fg made)?|2pm|2-pointers? made)\b/],
  [['pf'], /\b(personal fouls?|fouls?|pf)\b/],
  // attempts and makes before the plain stats, so "three pointers attempted" isn't read as made threes
  [['tpa'], /\b((threes|three[ -]?point(ers?)?|3[ -]?point(ers?)?|3[ -]?pt|3p) (field goals? )?attempt(ed|s)?|3pa|three point attempts)\b/],
  [['fta'], /\b(free[ -]throws? attempt(ed|s)?|fta)\b/],
  [['fga'], /\b(field[ -]goals? attempt(ed|s)?|fga|shot attempts|shots attempted)\b/],
  [['fgm'], /\b(field[ -]goals? made|fgm|made field goals)\b/],
  [['ftm'], /\b(free[ -]throws? made|ftm|made free throws)\b/],
  [['tpm'], /\b(threes|three[ -]?pointers?( made)?|3[ -]?pointers?( made)?|3[ -]?pt( made|m)?|3pm|made threes|3s)\b/],
  [['pts'], /\b(points?|pts)\b/],
  [['reb'], /\b(rebounds?|rebs?|boards)\b/],
  [['ast'], /\b(assists?|asts?|dimes)\b/],
  [['stl'], /\b(steals?|stls?)\b/],
  [['blk'], /\b(blocks?|blks?|blocked shots)\b/],
  [['tov'], /\b(turnovers?|tovs?)\b/],
];
const STAT_SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', tov: 'TO', tpa: '3PA', fga: 'FGA', fgm: 'FGM', fta: 'FTA', ftm: 'FTM', fpts: 'FPTS', oreb: 'OREB', dreb: 'DREB', fg2: '2PM', fg2a: '2PA', pf: 'PF' };
const statsShort = st => st.map(k => STAT_SHORT[k]).join('+');
const BET_STOP = new Set('wager wagered stake risk payout pay paid potential returns return win wins winning to cash out cashout sgp sgpx parlay parlays leg legs alt alternate spread moneyline ml total totals game line lines odds bet bets placed place boost boosted profit fanduel draftkings dk fd betmgm mgm caesars espnbet espn bet365 fanatics hard rock fliff prizepicks underdog same id receipt share pending open settled live player props prop over under o u yes no any time anytime first half quarter q1 1h 1q reg regulation incl ot overtime str more or less at least'.split(' '));

const cleanSlip = s => String(s || '')
  .replace(/[−–—]/g, '-').replace(/½/g, '.5').replace(/[‘’]/g, "'")
  .replace(/\b([ou])(\d)/gi, '$1 $2').replace(/\s+/g, ' ').trim();

// does a message look like a bet rather than a question?
function looksLikeBet(q) {
  const s = ' ' + cleanSlip(q).toLowerCase() + ' ';
  if (/^\s*(track|add|log|save)\b.*\b(bet|parlay|slip|leg)s?\b/.test(s) || /^\s*(bet|parlay|my slip)\s*[:\-]/.test(s)) return true;
  if (/^\s*(who|what|whats|how|when|where|why|did|does|do|is|are|was|were|will|can|should|which)\b/.test(s) || /\?\s*$/.test(s)) return false;
  // a game-finder question ("Wemby games with 5+ blocks", "Luka 40+ point games in his career"), not a bet
  if (String(q).split(/\n/).filter(l => l.trim()).length === 1 && /\b(games?|times|career|ever|all[ -]time|in a game|single game|this season|playoffs?|when|without|with)\b/.test(s)) return false;
  const lines = String(q).split(/\n/).filter(l => l.trim()).length;
  const prop = /\b(over|under|o|u|more|less|higher|lower) \d+(\.\d)?\b|\b\d+(\.\d)?\+ |\b\d+(\.\d)? [a-z+ ]{2,30} (more|less|higher|lower)\b/.test(s);
  const spread = /(^|\s)[+-]\d{1,2}(\.5)?(\s|$)/.test(s) && !/(^|\s)[+-]\d{3,4}(\s|$)/.test(s.replace(/(^|\s)[+-]\d{1,2}(\.5)?(\s|$)/g, ' '));
  const ml = /\b(ml|moneyline|money line|to win)\b/.test(s);
  return prop || ml || (spread && lines >= 1 && /[a-z]{3}/.test(s)) || lines >= 3 && /\d/.test(s);
}

// pull money/odds details that belong to the whole slip
function slipMeta(text) {
  const t = cleanSlip(text).replace(/,(?=\d{3})/g, '');
  const num = re => { const m = t.match(re); return m ? +m[1] : null; };
  let stake = num(/(?:wager(?:ed)?|stake|risk|bet amount|total wager|entry(?: fee)?|bet)\s*:?\s*\$\s?(\d+(?:\.\d{1,2})?)/i) ?? num(/\$\s?(\d+(?:\.\d{1,2})?)\s*(?:to win|to pay|bet|wager|stake|risk|entry|on)/i) ?? num(/(?:^|\s)(\d+(?:\.\d{1,2})?)\s*(?:u|units?)\b/i);
  let toWin = num(/(?:to win|potential win(?:nings)?|profit)\s*:?\s*\$\s?(\d+(?:\.\d{1,2})?)/i);
  // "payout"/"returns" include the stake
  const back = num(/(?:payout|potential payout|to pay|total payout|returns?|potential return)\s*:?\s*\$\s?(\d+(?:\.\d{1,2})?)/i);
  if (toWin == null && back != null && stake != null && back > stake) toWin = Math.round((back - stake) * 100) / 100;
  let odds = null;
  const tl = String(text || '').split('\n').map(cleanSlip).filter(Boolean);
  const head = tl.find(l => /\b(parlay|sgp|same game|\d+\s*-?\s*legs?|\d+-pick)\b/i.test(l) && /(^|\s)[+-]\d{3,5}\b/.test(l));
  if (head) odds = +head.match(/(?:^|\s)([+-]\d{3,5})\b/)[1];
  // "Wager  Payout" on one line, the amounts on the next (struck-out pre-boost amounts are smaller, so take the biggest)
  const lab = tl.findIndex(l => /\bwager\b/i.test(l) && /\bpayout\b/i.test(l) && !/\$/.test(l));
  if (lab >= 0 && tl[lab + 1]) {
    let amts = [...tl[lab + 1].replace(/,(?=\d{3})/g, '').matchAll(/\$\s?(\d+(\.\d{1,2})?)/g)].map(m => ({ v: +m[1], c: !!m[2] }));
    if (amts.some(a => a.c)) amts = amts.filter(a => a.c); // "$7747" is a misread "$77.47"
    amts = amts.map(a => a.v);
    if (amts.length >= 2) {
      stake = amts[0];
      const rest = amts.slice(1).filter(v => v > stake);
      // with the slip's odds we know roughly what the payout should be; otherwise take the biggest (boosted) amount
      const expect = odds ? stake * (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds) : null;
      const pay = rest.length ? (expect ? rest.reduce((a, b) => Math.abs(b - expect) < Math.abs(a - expect) ? b : a) : Math.max(...rest)) : null;
      if (pay) toWin = Math.round((pay - stake) * 100) / 100;
    }
  }
  const dfs = /\b(prizepicks|underdog|power play|flex play|pick'?em|\d+[- ]pick|sleeper|pick6|more|less|higher|lower)\b/i.test(t) && !/\b(parlay|sgp)\b/i.test(t);
  return { stake, toWin, odds, dfs };
}

// split typed text / OCR text into pieces that each hold one leg
function splitLegs(text, fromImage, rows) {
  const raw = String(text || '').replace(/\r/g, '');
  if (!fromImage) {
    let parts = raw.split(/\n|;|\s\|\s|\s&\s|,(?!\d)(?=\s*[a-z])/i).map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) parts = parts[0].split(/\s+(?:and|plus)\s+(?=[A-Za-z][a-z]+ [A-Za-z])/).map(s => s.trim()).filter(Boolean);
    return parts.map(s => s.replace(/^\s*(track|add|log|save)( (this|my))?( bet| parlay| slip)?\s*:?\s*/i, '').replace(/^\s*(bet|parlay)\s*:\s*/i, '')).filter(s => /\w/.test(s));
  }
  // screenshots: find "anchor" lines that carry a bet line, then gather the text around each one
  // common misreads: a lone "O" before a line comes out as a zero ("010.5")
  const lines = raw.split('\n').map(l => cleanSlip(l.replace(/(^|\s)[0Q](\d{1,2}\.5)\b/g, '$1O $2'))).filter(l => l && l.length > 1);
  // Pick'em apps (PrizePicks, Underdog, Sleeper, Pick6): each pick is a block that starts with the player's name,
  // then the line ("25.5 Points") and More/Less (or Higher/Lower). Split on the names.
  if (rows && /\b(more|less|higher|lower|prizepicks|underdog|power play|flex play|pick'?em|demon|goblin|fantasy score|sleeper|pick6)\b/i.test(raw)) {
    const keys = rows.map(r => [r, nameKey(r.name).replace(/ (jr|sr|ii|iii|iv)$/, '')]).filter(([, k]) => k.includes(' '));
    const strong = l => { const k = ' ' + nameKey(l).replace(/ (jr|sr|ii|iii|iv)( |$)/g, ' ').trim() + ' '; return keys.find(([, rk]) => k.includes(' ' + rk + ' '))?.[0] || null; };
    // arrow icons fuse onto the word ("↑ More" reads as "MMore", "↓ Less" as "Vless")
    for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/(^|\s)[^\s]{0,2}?(more|less|higher|lower)\b/gi, (m, a, w) => `${a}${w}`);
    const starts = lines.map((l, i) => strong(l) ? i : -1).filter(i => i >= 0);
    const isLine = l => /(^|\s)\d{1,3}(\.\d)?(\s|$)/.test(l) && !/\d{1,2}:\d{2}|\$|%/.test(l) && (STAT_TEST(' ' + l.toLowerCase() + ' ') || /^\W*\d{1,3}(\.\d)?\W*$/.test(l) || /\b(more|less|higher|lower)\b/i.test(l));
    if (starts.length) {
      const out = [];
      starts.forEach((st, k) => {
        const end = k < starts.length - 1 ? starts[k + 1] - 1 : Math.min(lines.length - 1, st + 7);
        const blk = lines.slice(st, end + 1);
        let li = blk.findIndex((l, j) => j > 0 && isLine(l));
        if (li < 0 && isLine(blk[0])) li = 0;
        if (li < 0) return;
        const near = blk.filter((_, j) => j !== li);
        // both More and Less printed (the pick screen, not a placed entry): can't tell which was picked
        const both = /\b(more|higher)\b/i.test(blk.join(' ')) && /\b(less|lower)\b/i.test(blk.join(' '));
        out.push({ text: blk[li], near, ctx: [blk[li], ...near].join(' \n '), both });
      });
      if (out.length) return out;
    }
  }
  const isAnchor = l => /\b(over|under|o|u) \d+(\.\d)?\b/i.test(l) || /\b\d+(\.\d)?\+ /i.test(l + ' ') || /\b\d+\+?\s*(points|pts|rebounds|assists|threes|made threes)\b/i.test(l)
    || /(^|\s)[+-]\d{1,2}(\.5)?(\s|$)/.test(l) && /[a-z]{3}/i.test(l) || /^[+-]\d{1,2}(\.5)?(\s+[+-]\d{3,4})?$/.test(l) || /\b(moneyline|money line|to win)\b/i.test(l) && !/to win\s*\$/i.test(l) || /\bdouble[ -]double\b|\btriple[ -]double\b/i.test(l);
  const idx = lines.map((l, i) => isAnchor(l) ? i : -1).filter(i => i >= 0);
  const skip = l => /\b(wager|payout|to win \$|cash ?out|bet id|placed|share|receipt)\b/i.test(l);
  // Books differ: some print the player above the line (FanDuel, DraftKings), some below (Fanatics,
  // and FanDuel's "Name - Points" footnote). Vote on which side the "Name - Stat" text sits.
  const isAnc = new Set(idx);
  const desc = l => l && (STAT_TEST(' ' + l.toLowerCase() + ' ') || / - [a-z]/i.test(l)) && !skip(l);
  let up = 0, down = 0;
  for (const i of idx) { if (!isAnc.has(i - 1) && desc(lines[i - 1])) up++; if (!isAnc.has(i + 1) && desc(lines[i + 1])) down++; }
  const dir = down > up ? 1 : -1;
  const out = [];
  idx.forEach(i => {
    const near = [];
    // the anchor's own side first (up to 3 lines, stopping at the next bet line)...
    for (let d = 1; d <= 3; d++) { const j = i + dir * d; if (j < 0 || j >= lines.length || isAnc.has(j)) break; if (!skip(lines[j])) near.push(lines[j]); }
    // ...then one or two lines on the other side, unless they clearly belong to the neighbouring bet
    for (let d = 1; d <= 2; d++) { const j = i - dir * d; if (j < 0 || j >= lines.length || isAnc.has(j)) break; if (skip(lines[j])) continue; if (desc(lines[j]) && isAnc.has(j - dir)) break; near.push(lines[j]); }
    out.push({ text: lines[i], near, ctx: [lines[i], ...near].join(' \n ') });
  });
  return out;
}

// read one leg
function parseLeg(piece, rows) {
  const text = typeof piece === 'string' ? piece : piece.text;
  const ctx = typeof piece === 'string' ? piece : piece.ctx;
  const all = cleanSlip(ctx);
  const s = ' ' + all.toLowerCase().replace(/\s*\n\s*/g, ' ') + ' ';
  const leg = { src: cleanSlip(text) };
  const oddsRe = /(?:^|[\s(])([+-]\d{3,5})(?=[\s)]|$)/;
  const om = (' ' + cleanSlip(text) + ' ').match(oddsRe) || (typeof piece === 'string' ? null : (piece.near || []).filter(l => !/parlay|sgp|\bleg|wager|payout|win/i.test(l)).map(l => (' ' + l + ' ').match(oddsRe)).find(Boolean));
  if (om) leg.odds = +om[1];
  const noOdds = s.replace(/(^|[\s(])[+-]\d{3,5}(?=[\s)]|$)/g, ' ');
  // who: the player or team written closest to the bet line
  const order = typeof piece === 'string' ? [text] : [text, ...(piece.near || [])];
  const nk = nameKey(all.replace(/\n/g, ' '));
  let player = null;
  for (const l of order) {
    const w = nameKey(l).split(' ').filter(x => x && !BET_STOP.has(x) && !/^\d/.test(x));
    if (w.join(' ').length >= 4 && (player = matchPlayer(w.join(' '), rows))) break;
  }
  let teams = [];
  const tl = order.map(l => findTeams(l, ' ' + nameKey(l) + ' ').teams);
  teams = tl.find(f => f.length === 1) || tl.find(f => f.length) || [];
  if (teams.length === 1) { const both = tl.find(f => f.length > 1 && f.includes(teams[0])); if (both) teams = [teams[0], ...both.filter(x => x !== teams[0])]; }
  if (!teams.length) teams = findTeams(all.replace(/\n/g, ' '), ' ' + nk + ' ').teams;
  // a "player" match that's really just a team name isn't a player
  if (player && teams.length && !STAT_TEST(noOdds) && !/\b(over|under|o|u) \d/.test(noOdds) && !/\d\+/.test(noOdds)) player = null;
  const statLine = order.map(l => ' ' + cleanSlip(l).toLowerCase() + ' ').find(l => STAT_TEST(l)) || noOdds;

  // double / triple double
  if (player && /\btriple[ -]?double\b/.test(s)) return { ...leg, k: 'td', pid: player.id, name: player.name, teamId: player.teamId, abbr: player.abbr, side: /\bno\b/.test(s) ? 'u' : 'o' };
  if (player && /\bdouble[ -]?double\b/.test(s)) return { ...leg, k: 'dd', pid: player.id, name: player.name, teamId: player.teamId, abbr: player.abbr, side: /\bno\b/.test(s) ? 'u' : 'o' };

  // player prop
  const st = BET_STATS.find(([, re]) => re.test(statLine))?.[0];
  const lineSrc = ' ' + cleanSlip(text).toLowerCase().replace(/(^|[\s(])[+-]\d{3,5}(?=[\s)]|$)/g, ' ') + ' ';
  let side = null, line = null, m;
  const src2 = /\b(over|under|o|u) \d|\d\+|at least|or more|fewer|less|more|higher|lower/.test(lineSrc) ? lineSrc : noOdds;
  const dfsSide = w => /^(more|higher|over|o)$/.test(w) ? 'o' : 'u';
  if ((m = src2.match(/\b(over|under|o|u) (\d+(?:\.\d)?)\b/))) { side = m[1][0]; line = +m[2]; }
  else if ((m = src2.match(/\b(more|higher|less|lower) (?:than )?(\d+(?:\.\d)?)\b/))) { side = dfsSide(m[1]); line = +m[2]; }
  else if ((m = src2.match(/\b(\d+(?:\.\d)?) (?:[a-z+\- ]{0,40} )?(more|higher|less|lower)\b/))) { side = dfsSide(m[2]); line = +m[1]; }
  else if ((m = src2.match(/\b(\d+(?:\.\d)?)\+/)) || (m = src2.match(/\b(?:at least|to (?:score|record|get|have|make)) (\d+)\b/)) || (m = src2.match(/\b(\d+) (?:or more)\b/))) { side = 'o'; line = +m[1] - 0.5; }
  else if ((m = src2.match(/\b(\d+(?:\.\d)?) (over|under)\b/))) { side = m[2][0]; line = +m[1]; }
  else if ((m = src2.match(/\b(\d+(?:\.\d)?) (?:or )?(fewer|less)\b/))) { side = 'u'; line = +m[1] + 0.5; }
  if (player && st && line == null) {
    const nm = (' ' + cleanSlip(text).toLowerCase() + ' ').match(/(?:^|\s)(\d{1,3}(?:\.\d)?)(?=\s|$)/) || statLine.match(/(?:^|\s)(\d{1,3}\.\d)(?=\s|$)/);
    if (nm) {
      line = +nm[1];
      const sw = order.map(l => ' ' + cleanSlip(l).toLowerCase() + ' ').map(l => l.match(/\b(more|higher|less|lower|over|under)\b/)).find(Boolean);
      side = sw ? dfsSide(sw[1]) : 'o';
      if (!sw || piece.both) leg.sideGuess = true;
    }
  }
  if (player && st && line != null && line < 400) return { ...leg, k: 'prop', pid: player.id, name: player.name, teamId: player.teamId, abbr: player.abbr, stats: st, side, line };
  if (player && line != null && line < 120 && !teams.length) return { ...leg, k: 'prop', pid: player.id, name: player.name, teamId: player.teamId, abbr: player.abbr, stats: ['pts'], side, line, guessed: true };

  // team bets
  if (teams.length) {
    const t = S.teams[teams[0]];
    const isTotal = /\b(total|o\/u|over\/under)\b/.test(noOdds) || (line != null && line >= (IS_W ? 120 : 160)) || (line != null && teams.length >= 2 && line >= 60);
    if (side && line != null && isTotal) {
      const teamTotal = /\bteam total\b/.test(noOdds) || (teams.length === 1 && line < (IS_W ? 120 : 160));
      return { ...leg, k: teamTotal ? 'ttotal' : 'total', teamId: t.id, abbr: t.abbr, side, line };
    }
    if (/\b(ml|moneyline|money line|to win|win|winner)\b/.test(noOdds) && !/(^|\s)[+-]\d{1,2}(\.5)?(\s|$)/.test(noOdds)) return { ...leg, k: 'ml', teamId: t.id, abbr: t.abbr };
    // spread: the number right after the team, or any small +/- number
    const sm = noOdds.match(/(?:^|\s)([+-]\d{1,2}(?:\.5)?)(?=\s|$)/) || noOdds.match(/(?:^|\s)(pk|pick|pick ?em|even)(?=\s|$)/);
    if (sm) {
      // when two teams are named, the spread belongs to the team written closest before it
      let teamId = t.id;
      if (teams.length > 1) {
        const pos = noOdds.indexOf(sm[0].trim());
        let best = -1;
        for (const id of teams) { const tm = S.teams[id]; for (const key of [tm.abbr, tm.short, tm.name, tm.loc].filter(Boolean)) { const i = noOdds.lastIndexOf(' ' + nameKey(key) + ' ', pos); if (i > best && i <= pos) { best = i; teamId = id; } } }
      }
      const tm = S.teams[teamId];
      return { ...leg, k: 'spread', teamId, abbr: tm.abbr, line: /^[+-]/.test(sm[1]) ? +sm[1] : 0 };
    }
    if (teams.length === 1 && om && !side) return { ...leg, k: 'ml', teamId: t.id, abbr: t.abbr };
  }
  return { ...leg, k: null };
}
const STAT_TEST = s => BET_STATS.some(([, re]) => re.test(s));

// which game is this leg about? today first, then the next couple of days, then last night
async function gameFor(teamId, pref) {
  const days = pref ? [pref] : [S.today, addDays(S.today, 1), addDays(S.today, 2), addDays(S.today, -1)];
  for (const d of days) {
    let games = d === S.date ? S.games : null;
    if (!games) { ASK.sb = ASK.sb || {}; games = ASK.sb[d] || (ASK.sb[d] = await scoreboardOn(d).catch(() => [])); }
    const g = games.find(x => x.home.id === teamId || x.away.id === teamId);
    if (g) return { g, date: d };
  }
  return null;
}

const legLabel = l => {
  const side = l.side === 'u' ? 'Under' : 'Over';
  if (l.k === 'prop') return `${l.name} ${side} ${l.line} ${statsShort(l.stats)}`;
  if (l.k === 'dd') return `${l.name} ${l.side === 'u' ? 'no ' : ''}double-double`;
  if (l.k === 'td') return `${l.name} ${l.side === 'u' ? 'no ' : ''}triple-double`;
  if (l.k === 'spread') return `${l.abbr} ${l.line > 0 ? '+' + l.line : l.line === 0 ? 'PK' : l.line}`;
  if (l.k === 'ml') return `${l.abbr} moneyline`;
  if (l.k === 'total') return `${l.game || l.abbr} ${side} ${l.line}`;
  if (l.k === 'ttotal') return `${l.abbr} team total ${side} ${l.line}`;
  return l.src;
};
const legTyped = (l, dfs) => {
  const side = dfs ? (l.side === 'u' ? 'less' : 'more') : l.side === 'u' ? 'under' : 'over';
  const o = l.odds ? ` ${l.odds > 0 ? '+' : ''}${l.odds}` : '';
  if (l.k === 'prop') return `${l.name} ${side} ${l.line} ${l.stats.map(k => ({ pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tpm: 'threes', tov: 'turnovers', tpa: 'three pointers attempted', fga: 'field goals attempted', fgm: 'field goals made', fta: 'free throws attempted', ftm: 'free throws made', fpts: 'fantasy score', oreb: 'offensive rebounds', dreb: 'defensive rebounds', fg2: 'two pointers made', fg2a: 'two pointers attempted', pf: 'fouls' })[k]).join(' + ')}${o}`;
  if (l.k === 'dd' || l.k === 'td') return `${l.name} ${l.side === 'u' ? 'no ' : ''}${l.k === 'dd' ? 'double' : 'triple'}-double${o}`;
  if (l.k === 'spread') return `${l.abbr} ${l.line > 0 ? '+' + l.line : l.line}${o}`;
  if (l.k === 'ml') return `${l.abbr} moneyline${o}`;
  if (l.k === 'total') return `${l.game ? l.game.replace(' @ ', '/') : l.abbr} total ${side} ${l.line}${o}`;
  if (l.k === 'ttotal') return `${l.abbr} team total ${side} ${l.line}${o}`;
  return l.src;
};

async function readSlip(text, fromImage) {
  const rows = await leagueTable();
  await loadStandings().catch(() => {});
  const meta = slipMeta(text);
  const pieces = splitLegs(text, fromImage, rows);
  const legs = [], missed = [];
  const seen = new Set();
  for (const p of pieces) {
    const l = parseLeg(p, rows);
    if (!l.k) { const src = typeof p === 'string' ? p : p.text; if (/^\W*(\$|wager|stake|risk|to win|payout|bet amount|odds|parlay|sgp|\d+\s*(u|units?)\b|[+-]\d{3,5}\W*$)/i.test(src.trim()) || /^\s*\$?\d+(\.\d+)?\s*(stake|to win|wager|bet)/i.test(src)) continue; if (!fromImage || /[a-z]{3}/i.test(src)) missed.push(src); continue; }
    const key = [l.k, l.pid || l.teamId, (l.stats || []).join(), l.side, l.line].join('|');
    if (seen.has(key)) continue; seen.add(key);
    if (l.k === 'prop') {
      const r = rows.find(x => String(x.id) === String(l.pid));
      const avg = r && l.stats.reduce((s, k) => s + (({ pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tpm: r.tpm, tov: r.tov, tpa: r.tpa, fga: r.fga, fta: r.fta, ftm: r.ftm, fgm: r.fga * r.fgp / 100, fg2: r.fga * r.fgp / 100 - r.tpm, fg2a: r.fga - r.tpa })[k] || 0), 0);
      if (avg && Number.isFinite(avg) && avg >= 3 && (l.line < avg * 0.3 || l.line > avg * 3)) l.odd = `averages ${avg.toFixed(1)}, so double-check this line`;
    }
    const found = l.teamId ? await gameFor(l.teamId) : null;
    if (found) {
      const { g, date } = found;
      l.gid = g.id; l.date = date; l.game = `${g.away.abbr} @ ${g.home.abbr}`; l.when = g.state === 'pre' ? `${date === S.today ? 'Tonight' : fmtDay(date, { weekday: 'short' })} ${fmtTime(g.date)}` : statusText(g);
    } else l.noGame = true;
    legs.push(l);
  }
  return { legs, missed, meta };
}

// the confirmation card shown in Ask
function slipCard(r, token) {
  const ok = r.legs.filter(l => !l.noGame);
  const rows = r.legs.map(l => `<div class="bs-leg${l.noGame ? ' warn' : ''}">
      ${l.pid ? face(l.pid, l.name, 'bs-face', 120) : logo(l.abbr, 48, 'lg bs-face')}
      <span class="bs-t"><b>${esc(legLabel(l))}</b><small>${l.noGame ? 'No game found in the next few days' : `${esc(l.game)} · ${esc(l.when)}`}${l.guessed ? ' · stat guessed as points' : ''}${l.sideGuess ? ' · <em class="bs-odd">check More/Less</em>' : ''}${l.odd ? ` · <em class="bs-odd">${esc(l.odd)}</em>` : ''}${l.odds ? ` · ${l.odds > 0 ? '+' : ''}${l.odds}` : ''}</small></span>
    </div>`).join('');
  const m = r.meta, money = [m.stake != null ? `$${m.stake} ${m.dfs ? 'entry' : 'stake'}` : '', m.toWin != null ? `to win $${m.toWin}` : '', m.odds ? `${m.odds > 0 ? '+' : ''}${m.odds}` : ''].filter(Boolean).join(' · ');
  return `<div class="bs-card">
    <div class="bs-h"><b>${r.meta.dfs ? `${ok.length}-pick entry` : ok.length > 1 ? `${ok.length}-leg parlay` : 'Single bet'}</b>${money ? `<span>${esc(money)}</span>` : ''}</div>
    ${rows}
    ${r.missed.length ? `<p class="bs-miss">Couldn't read: ${r.missed.slice(0, 4).map(x => `<i>${esc(x.slice(0, 60))}</i>`).join(', ')}</p>` : ''}
    <div class="bs-act">${ok.length ? `<button class="btn" data-bettrack="${token}">Track this bet</button>` : ''}<button class="btn ghost" data-betedit="${token}">Edit as text</button></div>
  </div>`;
}

async function answerSlip(text, fromImage) {
  const r = await readSlip(text, fromImage);
  const token = 'b' + Date.now().toString(36);
  ASK.slips = ASK.slips || {};
  const m = r.meta, money = [m.stake != null ? `$${m.stake} ${m.dfs ? 'entry' : 'stake'}` : '', m.toWin != null ? `to win $${m.toWin}` : '', m.odds ? `parlay odds ${m.odds > 0 ? '+' : ''}${m.odds}` : ''].filter(Boolean).join(' ');
  ASK.slips[token] = { ...r, typed: r.legs.length ? r.legs.map(l => legTyped(l, r.meta.dfs)).concat(r.missed).join('\n') + (money ? `\n${money}` : '') : fromImage ? '' : String(text).trim() };
  if (!r.legs.length) return { text: fromImage ? "I couldn't find a bet on that image. Try a closer crop of the slip, or type it out, one leg per line, like <b>Tatum over 26.5 points</b> or <b>Celtics -4.5</b>." : "I couldn't read that as a bet. Write one leg per line, like <b>Tatum over 26.5 points</b>, <b>Celtics -4.5</b>, <b>Lakers ML</b> or <b>Knicks/Heat under 218.5</b>.", miss: true, token, html: `${fromImage && text.trim() ? `<details class="bs-raw"><summary>What I read</summary><pre>${esc(text.trim().slice(0, 1200))}</pre></details>` : ''}<div class="bs-act"><button class="btn ghost" data-betedit="${token}">${fromImage ? 'Type it out instead' : 'Edit'}</button></div>` };
  const all = r.legs.every(l => !l.noGame);
  return { token, text: `${fromImage ? "Here's what I read from your slip." : "Here's your bet."} ${all ? 'Look right? Track it and it shows up under <b>My bets</b> on Scores, updating live.' : 'Some legs need a fix: tap <b>Edit as text</b>.'}`, html: slipCard(r, token) + (fromImage ? `<details class="bs-raw"><summary>What I read</summary><pre>${esc(text.trim().slice(0, 1200))}</pre></details>` : '') };
}

async function trackSlip(token) {
  const r = ASK.slips?.[token]; if (!r) return null;
  const legs = r.legs.filter(l => !l.noGame).map(({ src, guessed, noGame, when, odd, sideGuess, ...l }) => l);
  if (!legs.length) return null;
  const bet = { id: token, at: Date.now(), legs, stake: r.meta.stake, toWin: r.meta.toWin, odds: r.meta.odds, ...(r.meta.dfs ? { dfs: true } : {}) };
  const m = await lazy('bets');
  m.addBet(bet);
  delete ASK.slips[token];
  return bet;
}

/* ---------------- reading screenshots ---------------- */
let ocrP = null;
function loadOCR() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return ocrP || (ocrP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = new URL('ocr/tesseract.min.js', ASSET_BASE).href; s.async = true;
    s.onload = () => res(window.Tesseract); s.onerror = () => { ocrP = null; rej(new Error('ocr')); };
    document.head.append(s);
  }));
}
// sharpen a screenshot for reading: scale up small text, greyscale, and flip dark-mode slips to dark-on-light
async function prepImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1.5, 2000 / bmp.width));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), p = d.data;
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; sum += g; }
  const dark = sum / (p.length / 4) < 128;
  for (let i = 0; i < p.length; i += 4) { let g = p[i]; if (dark) g = 255 - g; g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); p[i] = p[i + 1] = p[i + 2] = g; }
  x.putImageData(d, 0, 0);
  return c;
}
let ocrWorker = null;
// In the Windows app the page and the site live at different addresses, and a worker can't start straight from another
// address, so it starts from a tiny local stub that loads the reader from the site.
async function readImage(file, onProgress) {
  const T = await loadOCR();
  if (!ocrWorker) {
    ocrWorker = await T.createWorker('eng', 1, {
      workerPath: new URL('ocr/worker.min.js', ASSET_BASE).href, corePath: new URL('ocr/', ASSET_BASE).href, langPath: new URL('ocr/', ASSET_BASE).href, workerBlobURL: new URL(ASSET_BASE).origin !== location.origin, gzip: true,
      logger: m => { if (m.status === 'recognizing text') onProgress?.(0.35 + 0.65 * (m.progress || 0)); else if (/loading|initializ/.test(m.status)) onProgress?.(0.3 * (m.progress || 0)); },
    });
  }
  const canvas = await prepImage(file);
  const { data } = await ocrWorker.recognize(canvas);
  return data.text || '';
}


/* ---------------- prop ideas: who's been clearing what, and how tonight's lines compare to the teams' scoring ---------------- */
const PROP_STATS = [
  ['pts', 'PTS', 'points', [10, 15, 20, 25, 30, 35, 40]],
  ['reb', 'REB', 'rebounds', [4, 6, 8, 10, 12, 14]],
  ['ast', 'AST', 'assists', [3, 4, 6, 8, 10, 12]],
  ['tpm', '3PM', 'threes', [1, 2, 3, 4, 5, 6]],
  ['pra', 'PRA', 'points + rebounds + assists', [20, 25, 30, 35, 40, 45, 50]],
];
// combo markets the Bet desk shows (not used for prop ideas)
const PROP_MORE = [
  ['pr', 'P+R', 'points + rebounds', [15, 20, 25, 30, 35, 40]],
  ['pa', 'P+A', 'points + assists', [15, 20, 25, 30, 35, 40]],
  ['ra', 'R+A', 'rebounds + assists', [6, 8, 10, 12, 15, 20]],
  ['fga', 'FGA', 'field goals attempted', [8, 10, 12, 15, 18, 20, 25]],
  ['tpa', '3PA', 'three pointers attempted', [3, 4, 5, 6, 8, 10, 12]],
  ['fg2', '2PM', 'two pointers made', [2, 3, 4, 5, 6, 8, 10]],
  ['fg2a', '2PA', 'two pointers attempted', [4, 6, 8, 10, 12, 15]],
  ['stl', 'STL', 'steals', [1, 2, 3, 4]],
  ['blk', 'BLK', 'blocks', [1, 2, 3, 4]],
  ['sb', 'STL+BLK', 'steals + blocks', [1, 2, 3, 4, 5]],
];
const propVal = (g, k) => k === 'fga' ? g.fg[1] : k === 'tpa' ? g.tp[1] : k === 'fg2' ? g.fg[0] - g.tp[0] : k === 'fg2a' ? g.fg[1] - g.tp[1] : k === 'pra' ? g.pts + g.reb + g.ast : k === 'pr' ? g.pts + g.reb : k === 'pa' ? g.pts + g.ast : k === 'ra' ? g.reb + g.ast : k === 'sb' ? g.stl + g.blk : k === 'tpm' ? g.tp[0] : g[k];
async function poolMap(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }));
  return out;
}
// the next slate with games still to tip: tonight if any haven't started, otherwise the next day that has games.
// For one team or player, their next game (up to a few days out).
async function propSlate(teamId) {
  for (let i = 0; i <= (teamId ? 4 : 3); i++) {
    const d = addDays(S.today, i);
    const games = d === S.date && S.games.length ? S.games : await scoreboardOn(d).catch(() => []);
    let open = games.filter(g => g.state === 'pre');
    if (teamId) open = games.filter(g => g.state !== 'post' && (g.home.id === teamId || g.away.id === teamId));
    if (open.length) return { date: d, games: open };
  }
  return { date: S.today, games: [] };
}
function defRank(teamId) {
  const all = (S.standings?.confs || []).flatMap(c => c.rows).filter(r => parseFloat(r.opp));
  const sorted = [...all].sort((a, b) => parseFloat(a.opp) - parseFloat(b.opp));
  const i = sorted.findIndex(r => r.id === teamId);
  return i < 0 ? null : { rank: i + 1, of: sorted.length, opp: parseFloat(sorted[i].opp) };
}
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
// who's out on each team tonight (only players who matter: 12+ a game)
async function outStars(rows) {
  const all = await leagueInjuries();
  const m = new Map();
  for (const e of all?.injuries || all?.teams || []) {
    const tid = e.id || e.team?.id;
    for (const n of (e.injuries || []).map(normInjury)) {
      if (!/^out/i.test(n.status)) continue;
      const r = rows.find(x => String(x.id) === String(n.id)) || rows.find(x => x.name === n.name);
      if (r && r.pts >= 12) { if (!m.has(String(tid || r.teamId))) m.set(String(tid || r.teamId), []); m.get(String(tid || r.teamId)).push(r); }
    }
  }
  return m;
}
// the best "clears it most nights" mark for one player and stat
function bestMark(log, k, marks, seasonAvg) {
  const L = log.slice(0, 10), n = L.length;
  if (n < 4) return null;
  const vals = L.map(g => propVal(g, k)), avg = vals.reduce((a, b) => a + b, 0) / n;
  let best = null;
  for (const m of marks) {
    const hits = vals.filter(v => v >= m).length, rate = hits / n;
    if (rate < 0.7 || m < avg * 0.75 || (seasonAvg != null && seasonAvg < m * 0.9)) continue;
    const score = rate * 1.5 + Math.min(0.6, (avg - m) / m) + m / (marks.at(-1) * 3);
    if (!best || m > best.m) best = { k, m, hits, n, rate, avg, vals, score };
  }
  return best;
}
const sparks = (vals, m) => `<span class="pp-spark" title="Last ${vals.length} games, oldest to newest">${[...vals].reverse().map(v => `<i class="${v >= m ? 'y' : 'n'}" style="height:${Math.max(12, Math.min(100, v / (m * 1.6) * 100)).toFixed(0)}%"></i>`).join('')}</span>`;

async function aProps(opts = {}) {
  const [rows] = await Promise.all([leagueTable(), loadStandings().catch(() => {})]);
  const focusTeam = opts.teamId || (opts.pid ? rows.find(r => String(r.id) === String(opts.pid))?.teamId : null);
  const { date, games } = await propSlate(focusTeam);
  if (!games.length) return { text: opts.pid || opts.teamId ? 'No game for them on the next slate, so no prop ideas yet.' : 'No games left on the slate to look at.', miss: true };
  const when = date === S.today ? 'tonight' : date === addDays(S.today, 1) ? 'tomorrow' : fmtDay(date, { weekday: 'long' });
  const gameOf = tid => games.find(g => g.home.id === tid || g.away.id === tid);
  const out = await outStars(rows).catch(() => new Map());

  // players worth a look: regular minutes, a few games in, not on the injury report as out
  const outIds = new Set([...out.values()].flat().map(r => String(r.id)));
  let cands = rows.filter(r => gameOf(r.teamId) && r.gp >= 3 && (r.min || 0) >= 20 && !outIds.has(String(r.id)));
  if (opts.pid) cands = rows.filter(r => String(r.id) === String(opts.pid));
  else { const by = new Map(); for (const r of cands.sort((a, b) => (b.min || 0) - (a.min || 0))) { const t = String(r.teamId); if ((by.get(t) || 0) < (opts.teamId ? 6 : 4)) { by.set(t, (by.get(t) || 0) + 1); } else r._skip = true; } cands = cands.filter(r => !r._skip); }
  const logs = await poolMap(cands, 8, r => gameLog(r.id));
  const ideas = [];
  cands.forEach((r, i) => {
    const log = (logs[i] || []).filter(g => g.min > 0);
    const g = gameOf(r.teamId), opp = g.home.id === r.teamId ? g.away : g.home, dr = defRank(opp.id);
    const mates = (out.get(String(r.teamId)) || []).filter(x => String(x.id) !== String(r.id));
    const seasonOf = { pts: r.pts, reb: r.reb, ast: r.ast, tpm: r.tpm, pra: (r.pts || 0) + (r.reb || 0) + (r.ast || 0) };
    ASK.pctx[r.id] = { r, g, opp, dr, mates, log };
    const picks = PROP_STATS.map(([k, , , marks]) => bestMark(log, k, marks, seasonOf[k])).filter(Boolean);
    for (const p of picks) {
      let score = p.score;
      if (dr && ['pts', 'pra', 'tpm'].includes(p.k)) score += (dr.rank - dr.of / 2) / dr.of * 0.4; // weak defenses help scoring props
      if (mates.length && ['pts', 'pra', 'ast'].includes(p.k)) score += 0.15;
      ideas.push({ r, g, opp, dr, mates, ...p, score });
    }
  });
  // two ideas per player at most, best first
  ideas.sort((a, b) => b.score - a.score);
  const per = new Map(), top = [];
  for (const x of ideas) { const c = per.get(x.r.id) || 0; if (c >= (opts.pid ? 5 : 2)) continue; per.set(x.r.id, c + 1); top.push(x); if (top.length >= (opts.pid ? 5 : opts.teamId ? 8 : 10)) break; }

  // game lines vs how these teams have actually scored
  const std = new Map((S.standings?.confs || []).flatMap(c => c.rows).map(r => [r.id, r]));
  const leans = opts.pid ? [] : games.filter(g => g.odds && (g.odds.ou != null || g.odds.home.spread)).map(g => {
    const H = std.get(g.home.id), A = std.get(g.away.id); if (!H || !A) return null;
    const hp = parseFloat(H.ppg), ho = parseFloat(H.opp), ap = parseFloat(A.ppg), ao = parseFloat(A.opp);
    if (![hp, ho, ap, ao].every(Number.isFinite)) return null;
    const proj = (hp + ao) / 2 + (ap + ho) / 2, margin = ((hp - ho) - (ap - ao)) / 2 + 1.5; // home court is worth about 1.5
    const L = [];
    if (g.odds.ou != null) { const d = proj - g.odds.ou; L.push({ kind: 'total', line: g.odds.ou, proj, d, lean: Math.abs(d) >= 3 ? (d > 0 ? 'Over' : 'Under') : null }); }
    const hs = parseFloat(g.odds.home.spread);
    if (Number.isFinite(hs)) { const d = margin + hs; L.push({ kind: 'spread', hs, margin, d, lean: Math.abs(d) >= 2.5 ? (d > 0 ? `${g.home.abbr} ${hs > 0 ? '+' : ''}${hs}` : `${g.away.abbr} ${-hs > 0 ? '+' : ''}${-hs}`) : null }); }
    return { g, L };
  }).filter(Boolean);

  // one player: a hit-rate table for each stat at the marks around his recent average
  if (opts.pid && cands[0]) {
    const r = cands[0], full = (logs[0] || []).filter(g => g.min > 0), log = full.slice(0, 10), g = gameOf(r.teamId);
    if (!g || log.length < 3) return { text: `Not enough games from ${r.name} yet to show trends.`, miss: true };
    const opp = g.home.id === r.teamId ? g.away : g.home, dr = defRank(opp.id);
    const hurt = [...out.values()].flat().some(x => String(x.id) === String(r.id));
    const mates = (out.get(String(r.teamId)) || []).filter(x => String(x.id) !== String(r.id));
    ASK.pctx[r.id] = { r, g, opp, dr, mates, log: full };
    const tbl = PROP_STATS.map(([k, short, word, marks]) => {
      const vals = log.map(x => propVal(x, k)), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      let i = marks.findIndex(m => m > avg); if (i < 0) i = marks.length; const pick = marks.slice(Math.max(0, i - 2), Math.max(0, i - 2) + 3);
      return `<tr><td><b>${short}</b><small>avg ${avg.toFixed(1)}</small></td>${pick.map(m => { const h = vals.filter(v => v >= m).length; return `<td class="${h / vals.length >= 0.7 ? 'hot' : h / vals.length <= 0.3 ? 'cold' : ''}"><button class="pp-cell" data-propd="${r.id}|${k}|${m}" title="See ${m}+ ${short} up close">${m}+<small>${h}/${vals.length}</small></button></td>`; }).join('')}<td>${sparks(vals, pick[1] ?? pick[0])}</td></tr>`;
    }).join('');
    rememberPlayer({ id: r.id, displayName: r.name, shortName: r.short }, r.teamId);
    const notes = [`${g.away.id === r.teamId ? '@' : 'vs'} ${opp.abbr} ${when === 'tonight' ? 'tonight' : when}`, dr ? `${opp.abbr} allow ${dr.opp.toFixed(1)} a game (${ord(dr.rank)} of ${dr.of} on D)` : '', mates.length ? `${mates.slice(0, 2).map(m => m.name).join(' and ')} out` : ''].filter(Boolean);
    return { text: `${esc(r.name)}: how often he's cleared each mark in his last ${log.length} games.${hurt ? ' <b>He is listed as out.</b>' : ''}`, html: `<p class="pp-sub">${esc(notes.join(' · '))}</p><div class="pp-tbl-wrap"><table class="pp-tbl"><tbody>${tbl}</tbody></table></div><p class="pp-note">Green: cleared it at least 70% of the time. Tap a mark for the full breakdown. Trends, not guarantees, and not betting advice.</p>`, ctx: { pid: r.id } };
  }
  top.forEach(x => rememberPlayer({ id: x.r.id, displayName: x.r.name, shortName: x.r.short }, x.r.teamId));
  const row = x => {
    const [, short, word] = PROP_STATS.find(s => s[0] === x.k);
    const notes = [`${x.hits} of last ${x.n}`, `L${x.n} avg ${x.avg.toFixed(1)}`, `${x.g.away.id === x.r.teamId ? '@' : 'vs'} ${x.opp.abbr}${x.dr && ['pts', 'pra', 'tpm'].includes(x.k) ? ` (${ord(x.dr.rank)} of ${x.dr.of} on D)` : ''}`];
    if (x.mates.length && ['pts', 'pra', 'ast'].includes(x.k)) notes.push(`${x.mates.slice(0, 2).map(m => m.last || m.name).join(' & ')} out`);
    return `<div class="pp-row">
      <button class="pp-who" data-propd="${x.r.id}|${x.k}|${x.m}" title="See this prop up close">${face(x.r.id, x.r.name, 'ask-face', 120)}<span class="nm"><b>${esc(x.r.name)} <em>${x.m}+ ${short}</em></b><small>${esc(notes.join(' · '))}</small></span></button>
      <button class="pp-sp" data-propd="${x.r.id}|${x.k}|${x.m}" tabindex="-1" aria-hidden="true">${sparks(x.vals, x.m)}</button>
      <button class="pp-add" data-askq="${esc(`Track: ${x.r.name} over ${x.m - 0.5} ${word}`)}" title="Track this as a bet" aria-label="Track ${esc(x.r.name)} ${x.m}+ ${short}">+</button>
    </div>`;
  };
  const leanRow = ({ g, L }) => `<div class="pp-game"><button class="pp-gt" data-game="${g.id}">${logo(g.away.abbr, 32)}${esc(g.away.abbr)} <i>@</i> ${logo(g.home.abbr, 32)}${esc(g.home.abbr)}<small>${esc(g.state === 'pre' ? fmtTime(g.date) : statusText(g))}</small></button>
    ${L.map(l => l.kind === 'total'
      ? `<span class="pp-ln${l.lean ? ' on' : ''}"><small>Total ${l.line}</small><b>${l.lean ? `Lean ${l.lean}` : 'No lean'}</b><small>They project ${Math.round(l.proj)}</small>${l.lean ? `<button class="pp-add sm" data-askq="${esc(`Track: ${g.away.abbr}/${g.home.abbr} ${l.lean.toLowerCase()} ${l.line}`)}" title="Track this">+</button>` : ''}</span>`
      : `<span class="pp-ln${l.lean ? ' on' : ''}"><small>${esc(g.home.abbr)} ${l.hs > 0 ? '+' : ''}${l.hs}</small><b>${l.lean ? `Lean ${esc(l.lean)}` : 'No lean'}</b><small>Project ${l.margin >= 0 ? g.home.abbr : g.away.abbr} by ${Math.abs(l.margin).toFixed(1)}</small>${l.lean ? `<button class="pp-add sm" data-askq="${esc(`Track: ${l.lean}`)}" title="Track this">+</button>` : ''}</span>`).join('')}</div>`;
  const early = Math.min(...games.map(g => { const H = std.get(g.home.id); return H ? (+H.w || 0) + (+H.l || 0) : 0; })) < 10;
  const html = `${top.length ? `<div class="pp-h">Player trends ${when}</div><div class="pp-list">${top.map(row).join('')}</div>` : ''}
    ${leans.length ? `<div class="pp-h">Game lines</div><div class="pp-games">${leans.map(leanRow).join('')}</div>` : ''}
    <p class="pp-note">Built from each player's last 10 games, how many points the opponent allows, who's ruled out, and each team's scoring this season${early ? ' (still a small sample this early)' : ''}. Trends, not guarantees, and not betting advice. Tap a player for the full breakdown, or + to track it.</p>`;
  const lead = opts.pid ? `${top[0]?.r.name || 'He'}'s marks he's been clearing ${when}:` : top.length ? `Here's who's been clearing their numbers, for ${games.length === 1 ? `${games[0].away.abbr} @ ${games[0].home.abbr}` : `${when}'s ${games.length} games`}:` : 'Nobody on this slate has been clearing a mark often enough to stand out yet.';
  return { text: lead, html, ctx: opts.pid ? { pid: opts.pid } : {} };
}

/* ---------------- one prop up close ---------------- */
ASK.pctx = ASK.pctx || {};
const hitLine = (vals, m) => vals.length ? `${vals.filter(v => v >= m).length}/${vals.length}` : '–';
const hitPct = (vals, m) => vals.length ? Math.round(vals.filter(v => v >= m).length / vals.length * 100) : null;
function propChart(log, k, m) {
  const L = log.slice(0, 15).reverse(), n = L.length;
  if (!n) return '';
  const vals = L.map(g => propVal(g, k)), top = Math.max(m * 1.5, ...vals) * 1.08;
  const W = 640, H = 200, padB = 34, padT = 18, bw = Math.min(34, (W - 10) / n - 6), gap = (W - n * bw) / (n + 1);
  const y = v => padT + (H - padT - padB) * (1 - v / top), lineY = y(m - 0.5);
  return `<svg class="pd-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Last ${n} games against the ${m}+ mark">
    ${L.map((g, i) => { const v = vals[i], x = gap + i * (bw + gap), hit = v >= m; return `<g><rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, H - padB - y(v)).toFixed(1)}" rx="4" class="${hit ? 'y' : 'n'}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" class="v">${v}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 18}" class="o">${esc(g.opp)}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" class="d">${esc(g.date ? fmtET(g.date, { month: 'numeric', day: 'numeric' }) : '')}</text></g>`; }).join('')}
    <line x1="0" x2="${W}" y1="${lineY.toFixed(1)}" y2="${lineY.toFixed(1)}" class="ln"/><text x="${W - 4}" y="${(lineY - 5).toFixed(1)}" class="lt">${m}+</text>
  </svg>`;
}
/* PBPStats (free, public): offensive/defensive rebound split, rebounds available while he's on the floor,
   and assist detail, matched to ESPN's games by date. NBA only. */
const PBP = 'https://api.pbpstats.com';
const etYmd = d => dfmt('en-CA', { timeZone: 'America/New_York' }, new Date(d));
let pbpIdx = null;
async function pbpPlayerId(name) {
  if (!pbpIdx) pbpIdx = (async () => {
    let m = null; try { const c = JSON.parse(lsGet('fc-pbp-players') || 'null'); if (c && Date.now() - c.t < 7 * 864e5) m = c.p; } catch (e) {}
    if (!m) { m = (await getJSON(`${PBP}/get-all-players-for-league/nba`, { retries: 0, timeout: 12000 })).players; try { lsSet('fc-pbp-players', JSON.stringify({ t: Date.now(), p: m })); } catch (e) {} }
    const idx = new Map(); for (const [id, n] of Object.entries(m || {})) if (n) { const k = nameKey(n); if (!idx.has(k) || +id > +idx.get(k)) idx.set(k, id); }
    return idx;
  })().catch(e => { pbpIdx = null; throw e; });
  const idx = await pbpIdx, k = nameKey(name);
  return idx.get(k) || idx.get(k.replace(/ (jr|sr|ii|iii|iv)$/, '')) || [...idx].find(([n]) => n.replace(/ (jr|sr|ii|iii|iv)$/, '') === k.replace(/ (jr|sr|ii|iii|iv)$/, ''))?.[1] || null;
}
const pbpCache = new Map();
function pbpLog(name) {
  if (IS_W) return Promise.resolve(null);
  if (pbpCache.has(name)) return pbpCache.get(name);
  const p = (async () => {
    const id = await pbpPlayerId(name); if (!id) return null;
    const now = new Date(), y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const j = await getJSON(`${PBP}/get-game-logs/nba?Season=${y}-${String(y + 1).slice(2)}&SeasonType=Regular%20Season&EntityId=${id}&EntityType=Player`, { retries: 0, timeout: 15000 });
    const out = new Map();
    for (const g of j.multi_row_table_data || []) {
      const offFG = (g.OffTwoPtRebounds || 0) + (g.OffThreePtRebounds || 0), defFG = (g.DefTwoPtRebounds || 0) + (g.DefThreePtRebounds || 0);
      const oAv = g.OffFGReboundPct ? offFG / g.OffFGReboundPct : null, dAv = g.DefFGReboundPct ? defFG / g.DefFGReboundPct : null;
      out.set(g.Date, { oreb: g.OffRebounds || 0, dreb: g.DefRebounds || 0, avail: oAv != null || dAv != null ? Math.round((oAv || 0) + (dAv || 0)) : null, fgReb: offFG + defFG,
        astPts: g.AssistPoints || 0, ast3: g.ThreePtAssists || 0, ast2: g.TwoPtAssists || 0, rim: g.AtRimAssists || 0,
        z: { AtRim: g.AtRimFGA || 0, ShortMidRange: g.ShortMidRangeFGA || 0, LongMidRange: g.LongMidRangeFGA || 0, Corner3: g.Corner3FGA || 0, Arc3: g.Arc3FGA || 0 } });
    }
    return out;
  })().catch(() => null);
  pbpCache.set(name, p);
  return p;
}
// key teammates ruled out tonight (12+ a game)
async function matesOut(r) {
  try {
    const [inj, rows] = await Promise.all([leagueInjuries(), leagueTable()]);
    const out = [];
    for (const e of inj?.injuries || inj?.teams || []) for (const x of (e.injuries || []).map(normInjury)) {
      if (!/^out/i.test(x.status)) continue; const t = rows.find(y => String(y.id) === String(x.id));
      if (t && String(t.teamId) === String(r.teamId) && String(t.id) !== String(r.id) && t.pts >= 12 && t.gp >= 1) out.push(t);
    }
    return out.sort((a, b) => b.pts - a.pts).slice(0, 3);
  } catch (e) { return []; }
}
// with/without: his numbers per 36 with that teammate on the floor vs off it (PBPStats, this season, or last if thin)
const WOWY_STAT = { pts: r => r.Points, reb: r => r.Rebounds, ast: r => r.Assists, tpm: r => r.FG3M, pra: r => r.Points + r.Rebounds + r.Assists, pr: r => r.Points + r.Rebounds, pa: r => r.Points + r.Assists, ra: r => r.Rebounds + r.Assists, fga: r => (r.FG2A || 0) + (r.FG3A || 0), tpa: r => r.FG3A, stl: r => r.Steals, blk: r => r.Blocks, sb: r => (r.Steals || 0) + (r.Blocks || 0) };
async function wowy(r, mate, k) {
  const P = await pbpTeams(); const tid = P?.tid?.[pbpAbbr(r.abbr)]; if (!tid) return null;
  const [me, them] = await Promise.all([pbpPlayerId(r.name), pbpPlayerId(mate.name)]); if (!me || !them) return null;
  for (const back of [0, 1]) {
    const q = on => getJSON(`${PBP}/get-wowy-stats/nba?Season=${pbpSeason(back)}&SeasonType=Regular%20Season&TeamId=${tid}&Type=Player&0Exactly${on}OnFloor=${them}`, { retries: 0, timeout: 15000 });
    const [w, wo] = await Promise.all([q(1), q(0)]).catch(() => [null, null]);
    const row = d => (d?.multi_row_table_data || []).find(x => String(x.EntityId) === String(me));
    const a = row(w), b = row(wo), f = WOWY_STAT[k]; if (!f) return null;
    if (b && b.Minutes >= 60 && a && a.Minutes >= 60) return { mate, back, with: f(a) / a.Minutes * 36, without: f(b) / b.Minutes * 36, minWith: Math.round(a.Minutes), minWithout: Math.round(b.Minutes) };
  }
  return null;
}
// games his team played that he sat out (completed games missing from his log)
async function dnpGames(teamId, log) {
  try {
    const d = await scheduleOf(teamId), have = new Set(log.map(g => String(g.id)));
    return (d.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed && !have.has(String(e.id)) && !/pre/i.test(e.seasonType?.name || '')).map(e => {
      const c = e.competitions[0], me = c.competitors.find(x => x.team?.id === teamId), op = c.competitors.find(x => x.team?.id !== teamId);
      return { id: e.id, date: e.date, opp: op?.team?.abbreviation || '', oppId: op?.team?.id, atVs: me?.homeAway === 'away' ? '@' : 'vs', dnp: true };
    }).filter(g => !log.length || new Date(g.date) >= new Date(log.at(-1).date));
  } catch (e) { return []; }
}
// PropDesk-style chart: oldest to newest, bar height = the stat, green when it cleared the mark, red when not,
// rebounds split offensive (bottom) / defensive (top), dotted DNP bars, dashed line at the line
function barChart(games, k, m, pbp, showMin, side = 'o') {
  const n = games.length; if (!n) return '<p class="pp-note">No games match these filters.</p>';
  const vals = games.map(g => g.dnp ? null : propVal(g, k)), top = Math.max(m * 1.35, ...vals.filter(v => v != null), 1) * 1.12;
  const pct = v => (v / top * 100).toFixed(2), split = k === 'reb' && pbp;
  return `<div class="pc${n > 12 ? ' tight' : ''}${showMin ? ' min' : ''}"><div class="pc-plot">
    <div class="pc-line" style="bottom:${pct(m - 0.5)}%"><span>${m - 0.5}</span></div>
    ${games.map((g, i) => {
      if (g.dnp) return `<div class="pc-col"><div class="pc-bar dnp" style="height:${pct(Math.max(m, top * 0.55))}%"><span>DNP</span></div></div>`;
      const v = vals[i], hit = side === 'u' ? v < m - 0.5 : v >= m, P = split ? pbp.get(etYmd(g.date)) : null;
      let segs = '';
      if (P && P.oreb + P.dreb === v && v > 0) {
        const seg = (c, x, lab) => x ? `<i class="pcs ${c}" style="flex:${x}"><b>${x}</b>${x / top > 0.09 ? `<small>${lab}</small>` : ''}</i>` : '';
        segs = seg('d', P.dreb, 'DREB') + seg('o', P.oreb, 'OREB');
      }
      const share = split && P?.avail ? Math.round(P.fgReb / P.avail * 100) : null;
      return `<div class="pc-col${g.prev ? ' prev' : ''}" title="${esc(fmtET(g.date, { month: 'short', day: 'numeric' }))} ${g.atVs === '@' ? '@' : 'vs'} ${esc(g.opp)}: ${v}${P?.avail ? ` · ${P.fgReb} of ${P.avail} available rebounds (${share}%)` : ''}">
        <em class="pc-v ${hit ? 'y' : 'n'}" style="bottom:${pct(v)}%">${v}</em>
        <div class="pc-bar ${hit ? 'y' : 'n'}${segs ? ' st' : ''}" style="height:${v ? pct(v) : 1.2}%">${segs}</div>
        ${share != null ? `<small class="pc-sh">${share}%</small>` : ''}
      </div>`;
    }).join('')}
  ${showMin ? (() => { const pts = games.map((g, i) => { if (g.dnp) return null; const up = Math.min(48, g.min) / 48 * 100, lab = +pct(vals[i]) + 5; // keep the badge off his number
      const by = Math.abs(up - lab) < 13 ? (up > lab ? lab + 11 : lab - 12) : up; return [((i + 0.5) / n * 100).toFixed(2), (100 - up).toFixed(2), g.min, (100 - Math.max(4, Math.min(98, by))).toFixed(2)]; }).filter(Boolean);
    return `<svg class="pc-mline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/></svg>${pts.map(p => `<i class="pc-mn" style="left:${p[0]}%;top:${p[3]}%"><b>${Math.round(p[2])}</b></i>`).join('')}`; })() : ''}
  </div>
  <div class="pc-x">${games.map(g => `<span class="${g.prev ? 'prev' : ''}"><b>${g.atVs === '@' ? '@' : ''}${esc(g.opp)}</b><small>${esc(fmtET(g.date, { month: 'numeric', day: 'numeric' }))}</small></span>`).join('')}</div></div>`;
}

// reuse: switching markets from inside the detail redraws the same sheet (fresh body, no stacked listeners)
async function openPropDetail(pid, k, m0, extra, reuse) {
  if (extra) ASK.pctx[pid] = { ...(ASK.pctx[pid] || {}), ...extra };
  const c = ASK.pctx[pid], keep = (reuse && extra?.keep) || null;
  const sheet = reuse || openSheet('Prop detail');
  if (reuse) { const nb = reuse.body.cloneNode(false); reuse.body.replaceWith(nb); reuse.body = nb; }
  const tok = sheet.pdTok = (sheet.pdTok || 0) + 1; // late loads from a previous market's view stop drawing
  sheet.el.classList.add('pd-sheet');
  let log = c?.log, r = c?.r;
  try {
    if (!log) log = (await gameLog(pid)).filter(g => g.min > 0);
    if (!r) r = (await leagueTable()).find(x => String(x.id) === String(pid));
  } catch (e) { sheet.body.innerHTML = `<div class="empty"><b>Couldn't load his games</b>Try again in a moment.</div>`; return; }
  if (!r || !log?.length) { sheet.body.innerHTML = `<div class="empty"><b>No games yet</b></div>`; return; }
  const ctx = c || {};
  let { g, opp, dr, mates } = ctx;
  if (!g) { const s = await propSlate(r.teamId); g = s.games[0]; if (g) { opp = g.home.id === r.teamId ? g.away : g.home; dr = defRank(opp.id); } mates = []; }
  const [, short, word] = [...PROP_STATS, ...PROP_MORE].find(s => s[0] === k);
  let side = (keep?.side || ctx.side) === 'u' ? 'u' : 'o';
  let m = m0, cmp = null, rng = keep?.rng || 'L10', ha = keep?.ha || 'all', oppF = keep?.oppF || 'all', dnps = [], pbp = null, showMin = keep ? !!keep.showMin : lsGet('fc-pd-min') === '1', pT = null, rest = null, wo = [];
  // matchup extras: pace, rest, blowout risk, shot zones vs this defense, and with/without teammates who are out
  if (!IS_W) {
    pbpTeams().then(d => { pT = d; if (d) draw(); });
    if (g) restOf(r.teamId, etYmd(g.date).replace(/-/g, '')).then(x => { rest = x; draw(); });
    matesOut(r).then(async ms => { if (!mates?.length && ms.length) mates = ms; if (!ms.length) return; ms.forEach(x => loadMate(String(x.id))); wo = ms.map(x => ({ mate: x, loading: true })); draw(); wo = (await Promise.all(ms.map(x => wowy(r, x, k).catch(() => null)))).map((w, i) => w || { mate: ms[i], none: true }); draw(); });
  }
  if (r.teamId) dnpGames(r.teamId, log).then(d => { dnps = d; draw(); });
  // teammate on/off filter: which games each picked teammate played (same game, same side, any minutes)
  const mf = new Map(keep?.mf || []), mlog = keep?.mlog || new Map(); let mateList = [];
  leagueTable().then(rows => { mateList = rows.filter(x => String(x.teamId) === String(r.teamId) && String(x.id) !== String(r.id) && x.gp >= 1).sort((a, b) => (b.min || 0) * (b.gp || 0) - (a.min || 0) * (a.gp || 0)).slice(0, 12); draw(); }).catch(() => {});
  const loadMate = id => {
    if (mlog.has(id)) return; mlog.set(id, null);
    const now = new Date(), cur = IS_W ? now.getFullYear() : now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0);
    Promise.all([gameLog(id).catch(() => []), prev.length ? gameLog(id, cur - 1).catch(() => []) : []]).then(([a, b]) => {
      const M = new Map(); for (const x of [...a, ...b]) if (x.min > 0) M.set(String(x.id), x.opp); mlog.set(id, M); keepDraw();
    });
  };
  for (const id of [...mf.keys()]) if (!mlog.get(id)) { mlog.delete(id); loadMate(id); } // carried over mid-load: fetch again for this view
  // a game passes when every picked teammate is in (played for his team) or out (didn't), as asked
  // "without" only counts seasons he played at least one game for this team, so a newcomer's old team doesn't count
  const onTeam = (M, isPrev) => (isPrev ? prev : log).some(x => M.get(String(x.id)) === x.opp);
  const mateOk = g => { for (const [id, want] of mf) { const M = mlog.get(id); if (!M) return false; const played = M.get(String(g.id)) === g.opp; if (want === 'in' ? !played : played || !onTeam(M, !!g.prev)) return false; } return true; };
  const mateName = id => { const x = mateList.find(y => String(y.id) === id) || (mates || []).find(y => String(y.id) === id); return x ? (x.short || x.name) : 'Teammate'; };
  // tonight's minutes: weighted recent minutes, then rest, blowout risk and teammates ruled out
  const projMin = () => {
    if (!g || g.state === 'post') return null;
    const games = [...log, ...prev].filter(x => x.min > 0).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (games.length < 3) return null;
    const am = a => a.reduce((t, x) => t + x.min, 0) / a.length;
    const L5 = games.slice(0, 5), L10 = games.slice(0, 10), seas = log.length >= 5 ? log : games.slice(0, 20);
    const base = am(L5) * 0.5 + am(L10) * 0.3 + am(seas) * 0.2, f = [['Recent minutes', base, `${am(L5).toFixed(1)} last 5 · ${am(L10).toFixed(1)} last 10`]];
    let adj = 0;
    if (rest?.b2b && base >= 22) { f.push(['Back-to-back', -1.5]); adj -= 1.5; }
    else if (rest?.three4 && base >= 22) { f.push(['3 games in 4 nights', -0.5]); adj -= 0.5; }
    const sp = Math.abs(parseFloat(g.odds?.home?.spread));
    if (sp >= 10 && base >= 26) { const v = sp >= 14 ? -2.5 : -1.5; f.push([`Blowout risk (${sp}-pt spread)`, v]); adj += v; }
    let mateAdj = 0;
    for (const x of mates || []) {
      const M = mlog.get(String(x.id)); if (!M) continue;
      const shared = y => M.get(String(y.id)) === y.opp, seasons = new Set(games.filter(shared).map(y => !!y.prev));
      const w = games.filter(shared), wo = games.filter(y => !shared(y) && seasons.has(!!y.prev));
      if (wo.length >= 3 && w.length >= 3) { const d = (am(wo) - am(w)) * 0.7; if (Math.abs(d) >= 0.3) { f.push([`${x.short || x.name} out`, d, `${am(wo).toFixed(1)} min in ${wo.length} games without him`]); mateAdj += d; } }
    }
    adj += Math.max(-5, Math.min(5, mateAdj));
    const cap = RULES.per * REG_PERIODS / 60 - 2, min = Math.max(0, Math.min(cap, base + adj));
    const sd = Math.sqrt(L10.reduce((t, x) => t + (x.min - am(L10)) ** 2, 0) / L10.length);
    const P = L10.filter(x => propVal(x, k) != null), rate = P.reduce((t, x) => t + propVal(x, k), 0) / (P.reduce((t, x) => t + x.min, 0) || 1);
    return { min, lo: Math.max(0, min - sd), hi: Math.min(cap + 2, min + sd), f, stat: rate * min, loading: (mates || []).some(x => mlog.get(String(x.id)) === null) };
  };
  const keepDraw = () => { const y = sheet.body.scrollTop; draw(); sheet.body.scrollTop = y; };
  // last season's games, so L10 / L15 still mean ten and fifteen games early in a new season
  let prev = [];
  if (log.length < 15) { const now = new Date(), cur = IS_W ? now.getFullYear() : now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0); gameLog(pid, cur - 1).then(l => { const have = new Set(log.map(g => String(g.id))); prev = l.filter(g => g.min > 0 && !have.has(String(g.id))).map(g => ({ ...g, prev: true })); if (prev.length) draw(); }).catch(() => {}); }
  if (['reb', 'ast', 'pr', 'ra', 'pa', 'pra', 'pts', 'tpm', 'fga', 'tpa'].includes(k)) pbpLog(r.name).then(d => { pbp = d; if (d) draw(); });
  const alts = (ctx.alts || []).filter(a => Number.isFinite(a.o)), peers = (ctx.peers || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const imp = o => o > 0 ? 100 / (o + 100) : -o / (-o + 100);
  const BKN = { draftkings: 'DraftKings', fanduel: 'FanDuel', espnbet: 'ESPN BET', betmgm: 'BetMGM', caesars: 'Caesars', fanatics: 'Fanatics', hardrockbet: 'Hard Rock', bet365: 'bet365', bovada: 'Bovada', unibet: 'Unibet', pointsbet: 'PointsBet', williamhill: 'William Hill', betrivers: 'BetRivers' };
  const bookCard = () => {
    const P = (ctx.prices || []).filter(p => Number.isFinite(p.l)); if (P.length < 2) return '';
    const dec = o => o > 0 ? 1 + o / 100 : 1 + 100 / -o, am = v => Number.isFinite(v) ? (v > 0 ? '+' + v : String(v)) : '–';
    const bestO = [...P].filter(p => Number.isFinite(p.o)).sort((a, b) => a.l - b.l || dec(b.o) - dec(a.o))[0], bestU = [...P].filter(p => Number.isFinite(p.u)).sort((a, b) => b.l - a.l || dec(b.u) - dec(a.u))[0];
    return `<div class="card pd-card"><div class="card-h"><h4>By book</h4><span class="eyebrow">Best over and under highlighted</span></div>
      <div class="pd-books"><div class="pb hd"><span>Book</span><span>Line</span><span>Over</span><span>Under</span></div>${P.sort((a, b) => a.l - b.l).map(p => `<button class="pb${p.l === m - 0.5 ? ' on' : ''}" data-pdmark="${Math.floor(p.l) + 1}" title="Use ${p.l}"><span>${esc(BKN[p.b] || p.b)}</span><span><b>${p.l}</b></span><span class="${p === bestO ? 'best' : ''}">${am(p.o)}</span><span class="${p === bestU ? 'best' : ''}">${am(p.u)}</span></button>`).join('')}</div>
      <p class="pp-note">Tap a book to chart its line. Lines from DraftKings via ESPN and other books via SportsGameOdds, refreshed a few times a day.</p></div>`;
  };
  const altCard = all => {
    if (!alts.length) return '';
    const L10 = all.slice(0, 10);
    return `<div class="card pd-card"><div class="card-h"><h4>Alt lines</h4><span class="eyebrow">DraftKings ladder · tap one to use it</span></div>
      <div class="pd-alts"><div class="pd-alt hd"><span>Mark</span><span>Odds</span><span>Book %</span><span>L10</span><span>Edge</span></div>${alts.map(a => { const ip = imp(a.o), h = L10.length ? L10.filter(v => v >= a.t).length / L10.length : null, ed = h == null ? null : h - ip;
        return `<button class="pd-alt${a.t === m ? ' on' : ''}${ed != null && ed >= 0.1 ? ' good' : ''}" data-pdmark="${a.t}"><span><b>${a.t}+</b></span><span>${a.o > 0 ? '+' + a.o : a.o}</span><span>${Math.round(ip * 100)}%</span><span>${h == null ? '–' : Math.round(h * 100) + '%'}</span><span class="${ed == null ? '' : ed >= 0.1 ? 'pos' : ed <= -0.1 ? 'neg' : ''}">${ed == null ? '–' : (ed >= 0 ? '+' : '−') + Math.abs(Math.round(ed * 100))}</span></button>`; }).join('')}</div>
      <p class="pp-note">Book % is the chance the odds imply. Edge is his last-10 hit rate minus that, so green rungs have been cashing more often than the price says.</p></div>`;
  };
  const cmpCard = () => {
    if (!peers.length) return '';
    const P = cmp && peers.find(x => x.pid === cmp);
    let body = '';
    if (P) {
      const a = log.slice(0, 10), b = P.log.slice(0, 10), n = Math.max(a.length, b.length), pl = Number.isFinite(+P.line) ? +P.line : null;
      const cell = (g, line) => { if (!g) return '<td></td><td></td>'; const v = propVal(g, k); return `<td class="o">${esc(g.opp)}</td><td class="${line == null ? '' : v > line ? 'y' : 'n'}">${v}</td>`; };
      const av = (L) => L.length ? (L.reduce((s, g) => s + propVal(g, k), 0) / L.length).toFixed(1) : '–';
      const hr = (L, line) => line == null || !L.length ? '–' : `${L.filter(g => propVal(g, k) > line).length}/${L.length}`;
      body = `<table class="pd-cmp"><thead><tr><th colspan="2">${esc(r.last || r.name)} · ${m - 0.5}</th><th colspan="2">${esc(P.name.split(' ').slice(-1)[0])} · ${pl ?? '–'}</th></tr></thead><tbody>
        ${Array.from({ length: n }, (_, i) => `<tr>${cell(a[i], m - 0.5)}${cell(b[i], pl)}</tr>`).join('')}
        <tr class="tot"><td>Avg</td><td>${av(a)}</td><td>Avg</td><td>${av(b)}</td></tr><tr class="tot"><td>Hit</td><td>${hr(a, m - 0.5)}</td><td>Hit</td><td>${hr(b, pl)}</td></tr></tbody></table>`;
    }
    return `<div class="card pd-card"><div class="card-h"><h4>Compare</h4><select class="bd-sel pd-csel" data-pdcmp aria-label="Compare with"><option value="">Pick a player…</option>${peers.map(x => `<option value="${x.pid}" ${x.pid === cmp ? 'selected' : ''}>${esc(x.name)} (${esc(x.abbr)}) ${x.line ?? ''}</option>`).join('')}</select></div>${body || '<p class="pp-note">Last 10 games side by side against each player\'s own line, same market.</p>'}</div>`;
  };
  // odds for the line he's set: the book's when it matches, the alt ladder for overs, otherwise -110 to edit in the slip
  const slipOdds = () => {
    const ln = m - 0.5, B = ctx.book, a = (ctx.alts || []).find(x => x.t === m);
    return { o: B && B.line === ln && Number.isFinite(B.over) ? B.over : a && Number.isFinite(a.o) ? a.o : null, u: B && B.line === ln && Number.isFinite(B.under) ? B.under : null };
  };
  const matchupCard = () => {
    if (IS_W || !g) return '';
    const rows = [];
    const pc = pT && paceOf(pT, g.home.abbr, g.away.abbr);
    if (pc) rows.push(`<li><b class="${pc.diff >= 2 ? 'up' : pc.diff <= -2 ? 'dn' : ''}">${pc.diff >= 2 ? 'Fast' : pc.diff <= -2 ? 'Slow' : 'Average'} pace</b> ${esc(g.away.abbr)} and ${esc(g.home.abbr)} project about ${pc.pace.toFixed(1)} possessions, ${pc.diff >= 0 ? '+' : ''}${pc.diff.toFixed(1)} vs the league${pT.back ? ' (last season\'s pace, this early)' : ''}. More possessions, more counting stats.</li>`);
    if (rest?.b2b) rows.push(`<li><b class="dn">Back-to-back</b> ${esc(r.abbr)} played last night. Minutes and efficiency often dip.</li>`);
    else if (rest?.three4) rows.push(`<li><b class="dn">3 games in 4 nights</b> A heavy stretch for ${esc(r.abbr)}.</li>`);
    else if (rest) rows.push(`<li><b>Rested</b> ${esc(r.abbr)} didn't play last night.</li>`);
    const sp = parseFloat(g.odds?.home?.spread);
    if (Math.abs(sp) >= 10) rows.push(`<li><b class="dn">Blowout risk</b> ${esc(sp < 0 ? g.home.abbr : g.away.abbr)} favored by ${Math.abs(sp)}. Starters can sit the 4th quarter in lopsided games${(r.min || 0) >= 26 ? ', which caps his minutes' : ''}.</li>`);
    else if (Number.isFinite(sp)) rows.push(`<li><b>Spread ${esc(g.home.abbr)} ${sp > 0 ? '+' : ''}${sp}</b> Close enough that starters should play their normal minutes.</li>`);
    // shot zones: his shot mix vs what this defense allows there
    let zones = '';
    if (pT && pbp && ['pts', 'tpm', 'pra', 'pr', 'pa', 'fga', 'tpa'].includes(k)) {
      const tot = {}; for (const x of pbp.values()) for (const [z, v] of Object.entries(x.z || {})) tot[z] = (tot[z] || 0) + v;
      const all = Object.values(tot).reduce((a, b) => a + b, 0), D = pT.opp[pbpAbbr(opp.abbr)];
      if (all >= 20 && D) zones = `<div class="pd-zones"><div class="pz hd"><span>Zone</span><span>His shots</span><span>${esc(opp.abbr)} allow</span><span>League</span></div>${pT.zones.filter(([z]) => tot[z]).map(([z, lab]) => { const a = D[z], l = pT.lgZone[z], d = a != null && l != null ? a - l : null; return `<div class="pz"><span>${lab}</span><span><b>${Math.round(tot[z] / all * 100)}%</b><i style="width:${Math.round(tot[z] / all * 100)}%"></i></span><span class="${d == null ? '' : d >= 0.02 ? 'pos' : d <= -0.02 ? 'neg' : ''}">${a != null ? (a * 100).toFixed(1) + '%' : '–'}</span><span>${l != null ? (l * 100).toFixed(1) + '%' : '–'}</span></div>`; }).join('')}<p class="pp-note">His share of shots from each zone this season, and the FG% ${esc(opp.abbr)} allow there${pT.back ? ' (last season)' : ''}. Green: softer than the league in a zone he uses.</p></div>`;
    }
    const wrows = wo.map(w => w.loading ? `<li><b>Without ${esc(w.mate.name)}</b> <span class="bd-ld"></span></li>` : w.none ? `<li><b>Without ${esc(w.mate.name)}</b> Not enough minutes apart to compare yet.</li>` : (() => { const d = w.without - w.with; return `<li><b class="${d >= 0.5 ? 'up' : d <= -0.5 ? 'dn' : ''}">Without ${esc(w.mate.name)}</b> ${w.without.toFixed(1)} ${short} per 36 with him off the floor vs ${w.with.toFixed(1)} with him on (${w.minWithout} vs ${w.minWith} minutes${w.back ? ', last season' : ''}).</li>`; })());
    if (!rows.length && !zones && !wrows.length) return '';
    return `<div class="card pd-card"><div class="card-h"><h4>Matchup</h4><span class="eyebrow">PBPStats · ESPN</span></div>
      ${wrows.length ? `<ul class="pd-mu">${wrows.join('')}</ul>` : ''}${rows.length ? `<ul class="pd-mu">${rows.join('')}</ul>` : ''}${zones}</div>`;
  };
  const minCard = () => {
    const p = projMin(); if (!p) return '';
    const d = p.stat - (m - 0.5), sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    return `<div class="card pd-card pd-min"><div class="card-h"><h4>Minutes tonight</h4><span class="eyebrow">Projection</span></div>
      <div class="pm-top"><div><b>${p.min.toFixed(1)}</b><span>min · likely ${Math.round(p.lo)}–${Math.round(p.hi)}</span></div>
        <div><b>${p.stat.toFixed(1)}</b><span>${short} at his last-10 rate · <em class="${d >= 0 ? 'up' : 'dn'}">${sgn(d)} vs ${m - 0.5}</em></span></div></div>
      <ul class="pm-f">${p.f.map(([l, v, sub], i) => `<li><span>${esc(l)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><b class="${i === 0 ? '' : v >= 0 ? 'up' : 'dn'}">${i === 0 ? v.toFixed(1) : sgn(v)}</b></li>`).join('')}${p.loading ? '<li><span>Checking teammates ruled out tonight</span><b><span class="bd-ld"></span></b></li>' : ''}</ul>
      <p class="pp-note">A simple estimate: half his last 5 games, 30% his last 10, 20% the season, then adjusted for rest, the spread and anyone ruled out tonight. Not a guarantee.</p></div>`;
  };
  // markets for the picker: the ones the bet desk has a line for first (with that line), then the rest
  const MK_ALL = [...PROP_STATS, ...PROP_MORE].filter(s => s[0] !== 'pts1' && log.some(x => propVal(x, s[0]) != null));
  const mkLine = k2 => { const f = ctx.forK?.(k2); return f ? `${f.m - 0.5}${f.tag ? ` ${f.tag}` : ''}` : null; };
  const mkOpts = () => { const w = MK_ALL.map(s => ({ s, l: mkLine(s[0]) })); const a = w.filter(x => x.l != null || x.s[0] === k), b = w.filter(x => x.l == null && x.s[0] !== k);
    const o = x => `<option value="${x.s[0]}"${x.s[0] === k ? ' selected' : ''}>${esc(x.s[1])}${x.l != null ? ` · ${x.l}` : ''}</option>`;
    return a.length && b.length ? `<optgroup label="Lines tonight">${a.map(o).join('')}</optgroup><optgroup label="Other stats">${b.map(o).join('')}</optgroup>` : w.map(o).join(''); };
  const switchMk = k2 => {
    if (k2 === k) return;
    const f = ctx.forK?.(k2), vals = [...log, ...prev].map(x => propVal(x, k2)).filter(v => v != null).slice(0, 10);
    const m2 = f?.m ?? Math.max(1, Math.floor(vals.reduce((a, b) => a + b, 0) / (vals.length || 1)) + 1);
    const y = sheet.body.scrollTop;
    openPropDetail(pid, k2, m2, { ...(f?.extra || { book: null, alts: null, prices: null, peers: null }), keep: { side, rng, ha, oppF, showMin, mf: [...mf], mlog, scroll: y } }, sheet);
  };
  const draw = () => {
    if (sheet.pdTok !== tok) return;
    const all = log.map(x => propVal(x, k)), L5 = all.slice(0, 5), L10 = all.slice(0, 10);
    const home = log.filter(x => x.atVs !== '@').map(x => propVal(x, k)), away = log.filter(x => x.atVs === '@').map(x => propVal(x, k));
    const vsOpp = opp ? log.filter(x => String(x.oppId) === String(opp.id) || x.opp === opp.abbr).map(x => propVal(x, k)) : [];
    const avg = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : '–';
    const med = a => { if (!a.length) return '–'; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return (s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2).toFixed(1); };
    const mins = log.slice(0, 5).map(x => x.min), minAvg = log.length ? log.reduce((s, x) => s + x.min, 0) / log.length : 0, min5 = mins.reduce((s, v) => s + v, 0) / (mins.length || 1);
    const per36 = L10.length ? (L10.reduce((s, v) => s + v, 0) / log.slice(0, 10).reduce((s, x) => s + x.min, 0) * 36).toFixed(1) : '–';
    const tile = (lab, vals, sub) => { const p = hitPct(vals, m); return `<div class="pd-tile${p == null ? ' na' : p >= 70 ? ' hot' : p <= 30 ? ' cold' : ''}"><span>${lab}</span><b>${p == null ? '–' : p + '%'}</b><small>${vals.length ? hitLine(vals, m) : 'no games'}${sub ? ' · ' + sub : ''}</small></div>`; };
    const at = g ? (g.away.id === r.teamId ? '@' : 'vs') : '';
    const notes = [];
    if (dr) notes.push(`${opp.abbr} allow ${dr.opp.toFixed(1)} points a game, ${ord(dr.rank)} of ${dr.of} on defense.`);
    if (mates?.length) notes.push(`${mates.map(x => x.name).join(', ')} ${mates.length > 1 ? 'are' : 'is'} out, which usually means more shots and touches.`);
    if (min5 - minAvg >= 2) notes.push(`Minutes are up lately: ${min5.toFixed(1)} over his last 5 vs ${minAvg.toFixed(1)} for the season.`);
    else if (minAvg - min5 >= 2) notes.push(`Minutes are down lately: ${min5.toFixed(1)} over his last 5 vs ${minAvg.toFixed(1)} for the season.`);
    if (g?.odds?.ou != null) notes.push(`Game total ${g.odds.ou}${g.odds.details ? `, ${g.odds.details}` : ''}.`);
    const close = (+avg(L10) - (m - 0.5));
    notes.push(close >= 0 ? `He's averaging ${avg(L10)} over his last ${L10.length}, ${close.toFixed(1)} above the line.` : `He's averaging ${avg(L10)} over his last ${L10.length}, ${(-close).toFixed(1)} below the line.`);
    sheet.body.innerHTML = `<div class="pd">
      <div class="pd-head" style="--tc:${teamColor(r.teamId || r.abbr)}">
        ${face(r.id, r.name, 'pd-face', 260)}
        <div class="pd-ttl"><span class="eyebrow">${g ? `${at} ${esc(opp.abbr)} · ${esc(g.state === 'pre' ? `${fmtLocal(g.date, { weekday: 'short' })} ${fmtTime(g.date)}` : statusText(g))}` : 'No game scheduled'}</span>
          <h3>${esc(r.name)}</h3>
          <div class="pd-mark"><button class="pd-step" data-pdstep="-1" aria-label="Lower the mark" ${m <= 1 ? 'disabled' : ''}>−</button><b>${m}+ <em>${short}</em></b><button class="pd-step" data-pdstep="1" aria-label="Raise the mark">+</button></div>
          <small>${side === 'u' ? 'Under' : 'Over'} ${m - 0.5} ${word}${(() => {
            // from the Bet Desk: Fullcourt's projection and its chance at this mark; otherwise the minutes-based projection
            const pj = ctx.pj && ctx.pj.mean != null && ctx.pjk === k ? ctx.pj : null;
            if (pj && g?.state !== 'post') { const po = 1 - nCdf((m - 0.5 - pj.mean) / pj.sd), ch = side === 'u' ? 1 - po : po; return ` · <span class="pd-proj" title="Fullcourt's projection: his per-minute rate times expected minutes, adjusted for the matchup, pace, home court and rest">Proj ${pj.mean.toFixed(1)} · ${Math.round(ch * 100)}% ${side === 'u' ? 'under' : 'over'}</span>`; }
            const p = projMin(); return p ? ` · <span class="pd-proj">Proj ${p.stat.toFixed(1)} in ${Math.round(p.min)} min</span>` : ''; })()}</small>
          ${g && !IS_W && ['pts', 'reb', 'ast', 'tpm', 'pra', 'pr', 'pa', 'ra', 'fga', 'tpa', 'fg2', 'fg2a', 'stl', 'blk', 'sb'].includes(k) ? (() => { const o = slipOdds(), od = v => v != null ? `<em>${v > 0 ? '+' + v : v}</em>` : ''; return `<div class="pd-hslip"><div class="pd-side" role="group" aria-label="Over or under"><button data-pdside="o" aria-pressed="${side === 'o'}">Over ${od(o.o)}</button><button data-pdside="u" aria-pressed="${side === 'u'}">Under ${od(o.u)}</button></div><button class="pd-add" data-pdslip="${side}" title="Add ${side === 'u' ? 'under' : 'over'} ${m - 0.5} to your parlay">+ Add<span class="lgx"> to slip</span></button></div>`; })() : ''}
        </div>
      </div>
      ${(() => {
        // filters first, then the range strip and the chart both read from the filtered games
        const pool = [...log, ...dnps, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)).filter(g => (ha === 'all' || (ha === 'home' ? g.atVs !== '@' : g.atVs === '@')) && (oppF === 'all' || g.opp === oppF) && (!mf.size || mateOk(g)));
        const mLoading = [...mf.keys()].some(id => !mlog.get(id));
        const outTonight = (mates || []).filter(x => !mf.has(String(x.id)));
        const mateRow = mateList.length || mf.size ? `<div class="pd-mates">
          <select class="bd-sel" data-pdmate aria-label="Filter by a teammate in or out"><option value="">+ Teammate in / out</option>${mateList.filter(x => !mf.has(String(x.id))).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
          ${[...mf].map(([id, w]) => `<span class="pd-mc ${w}"><button data-pdmt="${id}" title="Switch between games he played and games he missed"><em>${w === 'out' ? 'Without' : 'With'}</em> ${esc(mateName(id))}</button><button data-pdmx="${id}" aria-label="Remove">×</button></span>`).join('')}
          ${outTonight.map(x => `<button class="pd-mc sug" data-pdmsug="${x.id}" title="He's out tonight. See only games he missed">+ Without ${esc(x.short || x.name)} <small>out tonight</small></button>`).join('')}
        </div>${mf.size && !mLoading ? `<p class="pp-note pd-mnote2">${pool.filter(g => !g.dnp).length} game${pool.filter(g => !g.dnp).length === 1 ? '' : 's'} ${[...mf].map(([id, w]) => `${w === 'out' ? 'without' : 'with'} ${esc(mateName(id))}`).join(' and ')}${prev.length ? ', this season and last' : ''}. Hit rates above use only these games.</p>` : ''}` : '';
        const played = pool.filter(g => !g.dnp), vv = a => a.map(g => propVal(g, k));
        const H2H = opp ? played.filter(g => String(g.oppId) === String(opp.id) || g.opp === opp.abbr) : [];
        const cur = played.filter(g => !g.prev);
        const R = { L5: played.slice(0, 5), L10: played.slice(0, 10), L15: played.slice(0, 15), Season: cur, ...(opp ? { H2H } : {}) };
        if (!R[rng]) rng = 'L10';
        const cell = (key, games) => { const v = vv(games), p = v.length ? Math.round(v.filter(x => side === 'u' ? x < m - 0.5 : x >= m).length / v.length * 100) : null; return `<button class="pr-c${key === rng ? ' on' : ''}" data-pdrng="${key}"><span>${key === 'H2H' ? `vs ${esc(opp.abbr)}` : key === 'Season' ? 'Season' : key}</span><b class="${p == null ? '' : p >= 70 ? 'hot' : p >= 50 ? 'warm' : 'cold'}">${p == null ? '–' : `HR ${p}%`}</b><small>${v.length ? `Avg ${avg(v)}${key === 'H2H' ? ` · ${v.length}G` : ''}` : 'no games'}</small></button>`; };
        const shown = rng === 'Season' ? pool.filter(g => !g.prev) : rng === 'H2H' ? pool.filter(g => String(g.oppId) === String(opp.id) || g.opp === opp.abbr) : (() => { const lim = R[rng].length, last = R[rng].at(-1); return last ? pool.filter(g => new Date(g.date) >= new Date(last.date)) : []; })();
        const opps = [...new Set(log.map(g => g.opp))].sort();
        // PBPStats extras for the shown games
        let extra = '';
        if (pbp) {
          const P = played.filter(g => shown.includes(g)).map(g => pbp.get(etYmd(g.date))).filter(Boolean);
          const sum = f => P.reduce((a, x) => a + (x[f] || 0), 0), av = f => P.length ? (sum(f) / P.length).toFixed(1) : '–';
          if (P.length && ['reb', 'pr', 'ra', 'pra'].includes(k)) { const A = P.filter(x => x.avail); const sh = A.length ? Math.round(A.reduce((a, x) => a + x.fgReb, 0) / A.reduce((a, x) => a + x.avail, 0) * 100) : null; extra += `<div><span>OREB / DREB</span><b>${av('oreb')} / ${av('dreb')}</b></div><div><span>Available boards</span><b>${A.length ? (A.reduce((a, x) => a + x.avail, 0) / A.length).toFixed(1) : '–'}</b></div><div><span>Reb share</span><b>${sh != null ? sh + '%' : '–'}</b></div>`; }
          if (P.length && ['ast', 'pa', 'ra', 'pra'].includes(k)) extra += `<div><span>Assist points</span><b>${av('astPts')}</b></div><div><span>3PT assists</span><b>${av('ast3')}</b></div><div><span>At-rim assists</span><b>${av('rim')}</b></div>`;
        }
        return `<div class="pd-rng">${Object.entries(R).map(([key, g]) => cell(key, g)).join('')}</div>
      <div class="card pd-card"><div class="card-h"><h4>Game by game</h4><div class="pd-flt">
          ${MK_ALL.length > 1 ? `<select class="bd-sel pd-mk" data-pdmk aria-label="Switch market" title="Switch to another market for this player">${mkOpts()}</select>` : ''}
          <button class="pd-mtg${showMin ? ' on' : ''}" data-pdmin aria-pressed="${showMin}" title="Overlay his minutes in each game">MIN</button>
          <select class="bd-sel" data-pdha aria-label="Home or away"><option value="all">Home/Away</option><option value="home" ${ha === 'home' ? 'selected' : ''}>Home</option><option value="away" ${ha === 'away' ? 'selected' : ''}>Away</option></select>
          <select class="bd-sel" data-pdopp aria-label="Opponent"><option value="all">All opponents</option>${opps.map(o => `<option ${oppF === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        </div></div>
        ${mateRow}
        ${mLoading ? '<div class="sk" style="height:200px;border-radius:12px;margin-top:10px"></div>' : barChart([...shown].reverse(), k, m, k === 'reb' ? pbp : null, showMin, side)}
        ${showMin ? '<p class="pp-note pd-mnote"><i></i> Minutes played (0–48 scale)</p>' : ''}
        ${extra ? `<div class="pd-stats pd-pbp">${extra}</div><p class="pp-note">${k === 'reb' ? 'Bars split offensive (bottom) and defensive boards. Reb share is the % of rebounds available while he was on the floor that he grabbed; hover a bar for each game. ' : ''}Rebound and assist detail from PBPStats play-by-play.${prev.length ? ' Faded bars are from last season.' : ''}</p>` : ''}
      </div>${minCard()}${matchupCard()}`;
      })()}
      <div class="pd-stats"><div><span>Avg (L10)</span><b>${avg(L10)}</b></div><div><span>Median (L10)</span><b>${med(L10)}</b></div><div><span>Per 36 (L10)</span><b>${per36}</b></div><div><span>Minutes (L5)</span><b>${min5.toFixed(1)}</b></div><div><span>High</span><b>${all.length ? Math.max(...all) : '–'}</b></div><div><span>Low</span><b>${all.length ? Math.min(...all) : '–'}</b></div></div>
      <div class="card pd-card"><div class="card-h"><h4>What to know</h4></div><ul class="pd-notes">${notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      ${bookCard()}${altCard(all)}${cmpCard()}
      <div class="btn-row"><button class="btn" data-pdtrack>Track over ${m - 0.5} ${short}</button><button class="btn ghost" data-player="${r.id}">Open ${esc(r.last || r.name)}'s profile</button>${g ? `<button class="btn ghost" data-game="${g.id}">Open the game</button>` : ''}</div>
      <p class="pp-note">Trends from his games this season, not a guarantee and not betting advice. Your book's line may differ.</p>
    </div>`;
  };
  draw();
  if (keep?.scroll) sheet.body.scrollTop = keep.scroll;
  sheet.body.addEventListener('click', e => {
    const st = e.target.closest('[data-pdstep]');
    if (st) {
      m = Math.max(1, m + +st.dataset.pdstep);
      draw(); return;
    }
    const mt = e.target.closest('[data-pdmt]'); if (mt) { const id = mt.dataset.pdmt; mf.set(id, mf.get(id) === 'out' ? 'in' : 'out'); keepDraw(); return; }
    const mx = e.target.closest('[data-pdmx]'); if (mx) { mf.delete(mx.dataset.pdmx); keepDraw(); return; }
    const ms = e.target.closest('[data-pdmsug]'); if (ms) { const id = ms.dataset.pdmsug; mf.set(id, 'out'); loadMate(id); keepDraw(); return; }
    const rg = e.target.closest('[data-pdrng]'); if (rg) { rng = rg.dataset.pdrng; draw(); return; }
    if (e.target.closest('[data-pdmin]')) { showMin = !showMin; lsSet('fc-pd-min', showMin ? '1' : null); draw(); return; }
    const sd = e.target.closest('[data-pdside]'); if (sd) { side = sd.dataset.pdside; draw(); return; }
    const ps = e.target.closest('[data-pdslip]');
    if (ps) { const side = ps.dataset.pdslip, o = slipOdds(), odds = (side === 'u' ? o.u : o.o) ?? -110;
      lazy('betdesk').then(b => b.addSlipLeg({ pid: String(r.id), k, side, line: m - 0.5, odds, est: (side === 'u' ? o.u : o.o) == null, name: r.name, teamId: r.teamId, abbr: r.abbr, gid: g.id, game: ctx.gameLabel || `${g.away.abbr} @ ${g.home.abbr}`, date: (g.date || '').slice(0, 10).replace(/-/g, ''), time: g.state === 'pre' ? fmtTime(g.date) : statusText(g) })); return; }
    const am = e.target.closest('[data-pdmark]');
    if (am) { m = +am.dataset.pdmark; draw(); return; }
    if (e.target.closest('[data-pdtrack]')) { closeTop(); ask(`Track: ${r.name} over ${m - 0.5} ${word}`); }
  });
  sheet.body.addEventListener('change', e => { const mk = e.target.closest('[data-pdmk]'); if (mk) switchMk(mk.value); });
  sheet.body.addEventListener('change', e => {
    const mp = e.target.closest('[data-pdmate]'); if (mp) { if (mp.value) { mf.set(mp.value, 'out'); loadMate(mp.value); } keepDraw(); return; }
    const h = e.target.closest('[data-pdha]'), o = e.target.closest('[data-pdopp]');
    if (h || o) { if (h) ha = h.value; if (o) oppF = o.value; const y = sheet.body.scrollTop; draw(); sheet.body.scrollTop = y; return; }
  });
  sheet.body.addEventListener('change', e => { const c2 = e.target.closest('[data-pdcmp]'); if (c2) { cmp = c2.value || null; const y = sheet.body.scrollTop; draw(); sheet.body.scrollTop = y; } });
}
