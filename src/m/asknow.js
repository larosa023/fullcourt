/* Ask, this season, beyond the stat lines: who a player is (height, age, college, number, contract, injury), who is on
   a team (roster, coach, injuries, schedule, last ten), the league's team superlatives (streaks, offense, defense,
   pace), playoff and title chances, the coming draft, and what the terms mean. Each answer reads the same feeds the
   rest of Fullcourt uses. nowAnswer() returns null when the question isn't one of these, and Ask carries on. */
const AN = { rost: null, rostP: null };
// a team's name for a sentence with a plural verb: "the Knicks", and in college the full name ("the Duke Blue Devils")
const anT = t => (IS_C ? S.teams[t.id]?.name || t.name || t.short : t.short || t.name);
const anThe = t => `the ${esc(anT(t))}`;
const anSub = x => `The ${esc(anT(x))}`;
const anFt = inch => (inch ? `${Math.floor(inch / 12)}'${Math.round(inch % 12)}"` : '');
const anPool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; };
const anList = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const anBorn = iso => { const d = new Date(iso); return Number.isFinite(+d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''; };
const anPlace = b => [b?.city, b?.state || (b?.country && b.country !== 'USA' ? b.country : '')].filter(Boolean).join(', ') || b?.country || '';

// every roster in the league: one request a team, kept for an hour (pro leagues only; college has 360 teams)
function anRosters() {
  if (IS_C) return Promise.resolve([]);
  if (AN.rost && Date.now() - AN.rost.t < 3600e3) return Promise.resolve(AN.rost.list);
  if (AN.rostP) return AN.rostP;
  AN.rostP = (async () => {
    await loadStandings().catch(() => {});
    const ids = (S.standings?.confs || []).flatMap(c => c.rows.map(r => r.id));
    const list = [], coach = {};
    const got = await anPool(ids, 8, id => getJSON(`${API}/teams/${id}/roster`, { retries: 0, timeout: 15000 }));
    got.forEach((d, i) => {
      if (!d) return;
      const tid = ids[i], t = S.teams[tid] || {};
      const c = d.coach?.[0]; if (c) coach[tid] = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      for (const a of d.athletes || []) list.push({ id: a.id, name: a.displayName, short: a.shortName, teamId: tid, abbr: t.abbr || '', h: a.height || 0, w: a.weight || 0, age: a.age ?? null, dob: a.dateOfBirth || '',
        college: a.college?.name || '', from: a.birthPlace || null, jersey: a.jersey ?? '', pos: a.position?.abbreviation || '', posName: a.position?.displayName || '', exp: a.experience?.years ?? null,
        inj: a.injuries?.[0] ? (a.injuries[0].status || '') : '', sal: a.contracts?.[0]?.salary || a.contract?.salary || 0 });
    });
    if (list.length < 100) throw new Error('rosters unavailable');
    AN.rost = { t: Date.now(), list, coach };
    return list;
  })().finally(() => { AN.rostP = null; });
  return AN.rostP;
}
const anBio = id => getJSON(`${WEB}/athletes/${id}`).then(d => d?.athlete || null).catch(() => null);
const anFacts = rows => card(`<dl class="ask-facts">${rows.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`);

/* ---------------- one player: who he is ---------------- */
const AN_BIO = [
  ['height', / (how tall|height|tall|how big) /], ['weight', / (weigh|weighs|weight|how heavy|heavy) /],
  ['age', / (how old|age|birthday|birthdate|date of birth|when was|born) /], ['from', / (where is|where s|hometown|from|nationality|country|born in|born) /],
  ['college', / (college|school|university|alma mater|where did) /], ['number', / (number|jersey|wears?|wearing) /],
  ['position', / (position|play (pg|sg|sf|pf|c|guard|forward|center)|a (guard|forward|center|big|wing)|what does) /],
  ['draft', / (draft\w*|what pick|which pick|picked|selected|taken) /], ['exp', / (experience|how long|years in the league|how many (years|seasons)|year pro|rookie|veteran|what year|class) /],
  ['team', / (what team|which team|who does|team does|plays for|play for|playing for|traded) /],
];
async function anPlayerBio(p, Q) {
  const { nn } = Q, hits = AN_BIO.filter(([, re]) => re.test(nn)).map(x => x[0]);
  const about = / (who is|who s|whos|tell me about|bio|profile|info|facts) /.test(nn);
  if (!hits.length && !about) return null;
  const b = await anBio(p.id); if (!b) return null;
  const t = S.teams[b.team?.id || p.teamId], tn = t ? (IS_C ? esc(t.name) : `the ${esc(t.name)}`) : '';
  const name = esc(b.displayName || p.name), he = IS_F ? 'She' : 'He', his = IS_F ? 'her' : 'his';
  const dob = b.dateOfBirth || (b.displayDOB || '').replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m, d, mo, y) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`);
  const born = dob ? anBorn(dob) : '', place = b.displayBirthPlace || anPlace(b.birthPlace);
  const exp = b.displayExperience || (b.experience?.years != null ? (b.experience.years ? `${ordinal(b.experience.years + 1)} season` : 'Rookie') : '');
  const facts = anFacts([['Height', esc(b.displayHeight || '')], ['Weight', esc(b.displayWeight || '')], ['Age', b.age != null ? `${b.age}${born ? ` · ${esc(born)}` : ''}` : esc(born)], ['From', esc(place)],
    [IS_C ? 'Class' : 'College', esc(IS_C ? exp : b.college?.name || '')], ['Number', b.jersey ? `#${esc(b.jersey)}` : ''], ['Position', esc(b.position?.displayName || '')],
    IS_C ? null : ['Draft', esc(b.displayDraft || '')], IS_C ? null : ['Experience', esc(exp)], ['Team', t ? esc(t.name) : '']].filter(Boolean));
  const say = {
    height: b.displayHeight ? `${name} is <b>${esc(b.displayHeight)}</b>${b.displayWeight ? ` and ${esc(b.displayWeight)}` : ''}.` : '',
    weight: b.displayWeight ? `${name} is listed at <b>${esc(b.displayWeight)}</b>${b.displayHeight ? ` (${esc(b.displayHeight)})` : ''}.` : '',
    age: / (born|birthday|birthdate|date of birth) /.test(nn) && born ? `${name} was born <b>${esc(born)}</b>${place ? ` in ${esc(place)}` : ''}${b.age != null ? ` (age ${b.age})` : ''}.` : b.age != null ? `${name} is <b>${b.age}</b>${born ? `, born ${esc(born)}` : ''}.` : '',
    from: place ? `${name} is from <b>${esc(place)}</b>.` : '',
    college: IS_C ? (t ? `${name} plays for <b>${esc(t.name)}</b>${exp ? ` (${esc(exp.toLowerCase())})` : ''}.` : '') : b.college?.name ? `${name} went to <b>${esc(b.college.name)}</b>.` : `${name} has no college listed${b.displayDraft ? ` (${esc(b.displayDraft)})` : ''}.`,
    number: b.jersey ? `${name} wears <b>#${esc(b.jersey)}</b>${tn ? ` for ${tn}` : ''}.` : '',
    position: b.position?.displayName ? `${name} is a <b>${esc(b.position.displayName.toLowerCase())}</b>${tn ? ` for ${tn}` : ''}.` : '',
    draft: IS_C ? '' : b.displayDraft ? `${name} was drafted <b>${esc(b.displayDraft)}</b>.` : `${name} wasn't drafted.`,
    exp: exp ? (IS_C ? `${name} is a <b>${esc(exp.toLowerCase())}</b>.` : `${name} is ${/rookie/i.test(exp) ? 'a <b>rookie</b>' : `in ${his} <b>${esc(exp.toLowerCase())}</b>`}${b.displayDraft ? ` (drafted ${esc(b.displayDraft)})` : ''}.`) : '',
    team: t ? `${name} plays for <b>${IS_C ? '' : 'the '}${esc(t.name)}</b>${b.jersey ? `, wearing #${esc(b.jersey)}` : ''}.` : `${name} isn't on a team right now.`,
  };
  let text = hits.map(k => say[k]).filter(Boolean)[0];
  if (!text) {
    if (!about && hits.length) return null;
    const line = Number.isFinite(p.pts) && p.gp ? ` ${he}'s averaging ${p.pts.toFixed(1)} points, ${p.reb.toFixed(1)} rebounds and ${p.ast.toFixed(1)} assists in ${plural(p.gp, 'game')} this season.` : '';
    text = `${name} is a ${esc([b.displayHeight, (b.position?.displayName || '').toLowerCase()].filter(Boolean).join(' '))}${tn ? ` for ${tn}` : ''}${b.age != null ? `, ${b.age} years old` : ''}${place ? `, from ${esc(place)}` : ''}.${line}`;
  }
  return { text, html: Q.ui.pRow({ id: p.id, name: b.displayName || p.name, abbr: t?.abbr || p.abbr }, null, [b.position?.abbreviation, b.jersey ? `#${b.jersey}` : ''].filter(Boolean).join(' · ')).replace(/^/, '<div class="ask-card">').concat('</div>') + facts, ctx: { pid: p.id } };
}

/* ---------------- contracts (NBA) ---------------- */
const AN_MONEY = / (contracts?|salary|salaries|earns?|earning|get paid|gets paid|paid|money|cap hit|free agent|free agency|extension|payroll|cap space|cap room|luxury tax|over the cap|under the cap|apron|highest paid|best paid|lowest paid|richest|max contract|how much (does|do|is|will|did) .* (make|makes|making|worth)|makes the most|net worth) /;
async function anContract(Q) {
  if (LGK !== 'nba' || !AN_MONEY.test(Q.nn) || / (points?|rebounds?|assists?|score[ds]?|per game|average[ds]?|weigh\w*|tall|old|playoffs?) /.test(Q.nn)) return null;
  const C = await lazy('cap'), d = C.capIndex(await C.loadCap());
  const yr = d.seasons[0];
  const p = Q.players[0];
  if (p) {
    const c = d.players.filter(x => !x.dead).find(x => String(x.espn) === String(p.id)) || d.players.filter(x => !x.dead).find(x => nameKey(x.name) === p.key);
    if (!c) return { text: `I don't have a contract on file for ${esc(p.name)}.`, ctx: { pid: p.id } };
    const yrs = c.sal.map((v, i) => (v ? [d.seasons[i], v, c.opt[i]] : null)).filter(Boolean);
    const opt = { P: 'player option', T: 'team option', ETO: 'early termination option' };
    const fa = c.thru ? `${he(p)} can be a free agent in the summer of ${+c.thru.slice(0, 4) + 1}.` : '';
    const text = `${esc(p.name)} makes <b>${C.moneyFull(c.sal[0])}</b> this season${c.twoWay ? ' on a two-way deal' : ''}. ${yrs.length > 1 ? `${he(p)} is owed ${C.money(c.left)} through ${esc(c.thru)}. ` : fa ? '' : ''}${c.signed ? `${esc(c.signed.replace(/^(\d)/, 'Signed a $1').replace(/^Signed a (\d+)-yr/, 'Signed a $1-year'))}.` : ''}${yrs.length <= 1 ? ` ${fa}` : ''}`;
    return { text, html: card(Q.ui.table(['Season', 'Salary', ''], yrs.map(([s, v, o]) => `<tr><td>${esc(s)}</td><td>${esc(C.moneyFull(v))}</td><td>${esc(opt[o] || '')}</td></tr>`)) + `<button class="btn ghost" data-view="cap">Open Capsheet</button>`), ctx: { pid: p.id }, src: 'Basketball-Reference' };
  }
  const t = Q.teams[0];
  if (t) {
    const T = d.teams[t.abbr] || d.teams[Object.keys(d.teams).find(a => S.teams[t.id]?.abbr === a)]; if (!T) return null;
    const pay = T.pay[0], [, lab] = C.capStatus(pay, d.cap), room = d.cap.cap - pay, tax = d.cap.tax - pay;
    const text = `${anThe(t).replace(/^t/, 'T')} have <b>${C.money(pay)}</b> on the books for ${esc(yr)} (${esc(lab.toLowerCase())}): ${room >= 0 ? `${C.money(room)} under the cap` : `${C.money(-room)} over the cap`} and ${tax >= 0 ? `${C.money(tax)} below` : `${C.money(-tax)} above`} the tax line. ${esc(T.roster[0].name)} is the highest paid at ${C.money(T.roster[0].sal[0])}.`;
    return { text, html: card(T.roster.slice(0, 8).map(x => Q.ui.pRow({ id: x.espn || '', name: x.name, abbr: t.abbr }, C.money(x.sal[0]), x.thru ? `through ${x.thru}` : '')).join('') + `<button class="btn ghost" data-view="cap">Open Capsheet</button>`), ctx: { teamId: t.id }, src: 'Basketball-Reference' };
  }
  if (/ (highest paid|best paid|richest|biggest contracts?|most money|largest contracts?|top salar\w*|highest salar\w*|max contract|makes the most|paid the most|lowest paid) /.test(Q.nn)) {
    const low = / lowest /.test(Q.nn), total = / (biggest|largest|total|contracts?) /.test(Q.nn) && !/ salar/.test(Q.nn);
    const L = d.players.filter(x => !x.dead && !x.twoWay && x.sal[0]).sort((a, b) => (low ? -1 : 1) * ((total ? b.left - a.left : b.sal[0] - a.sal[0])));
    const top = L.slice(0, Q.topN || 10), v = x => (total ? x.left : x.sal[0]);
    return { text: `${esc(top[0].name)} ${low ? 'has the smallest full contract' : total ? 'is owed the most money' : 'is the highest paid player'} in the NBA at <b>${C.money(v(top[0]))}</b>${total ? ` through ${esc(top[0].thru)}` : ` for ${esc(yr)}`}. Next: ${anList(top.slice(1, 3).map(x => `${esc(x.name)} (${C.money(v(x))})`))}.`,
      html: card(top.map((x, i) => Q.ui.pRow({ id: x.espn || '', name: x.name, abbr: x.cur }, C.money(v(x)), `#${i + 1}${total ? ` · through ${x.thru}` : ''}`)).join('') + `<button class="btn ghost" data-view="cap">Open Capsheet</button>`), src: 'Basketball-Reference' };
  }
  if (/ (payrolls?|cap space|cap room|luxury tax|over the cap|apron|spend\w*) /.test(Q.nn)) {
    const room = / (cap space|cap room|most room|under the cap) /.test(Q.nn);
    const L = Object.values(d.teams).filter(x => x.roster.length).sort((a, b) => (room ? a.pay[0] - b.pay[0] : b.pay[0] - a.pay[0])).slice(0, Q.topN || 8);
    const tm = a => Object.values(S.teams).find(x => x.abbr === a) || { abbr: a, name: a };
    return { text: room ? `The ${esc(tm(L[0].abbr).name)} have the smallest payroll (${C.money(L[0].pay[0])}), ${C.money(d.cap.cap - L[0].pay[0])} ${d.cap.cap >= L[0].pay[0] ? 'under' : 'from'} the ${C.money(d.cap.cap)} cap.` : `The ${esc(tm(L[0].abbr).name)} have the biggest payroll at <b>${C.money(L[0].pay[0])}</b>. The cap is ${C.money(d.cap.cap)} and the tax line ${C.money(d.cap.tax)}.`,
      html: card(L.map(x => Q.ui.tRow(tm(x.abbr), C.money(x.pay[0]), C.capStatus(x.pay[0], d.cap)[1])).join('') + `<button class="btn ghost" data-view="cap">Open Capsheet</button>`), src: 'Basketball-Reference' };
  }
  return null;
}
const he = () => (IS_F ? 'She' : 'He');

/* ---------------- injuries ---------------- */
const AN_INJ = / (injur\w*|hurt|banged up|status|questionable|doubtful|probable|healthy|available|out tonight|out for|is out|playing tonight|playing today|playing tomorrow|play tonight|play today|play tomorrow|suit up|return\w*|back from|coming back|sidelined|injury report|who s out|whos out|who is out|out for the) /;
async function anInjuries(Q) {
  if (!AN_INJ.test(Q.nn) || / (without|when .* (sits|is out|out)|record|averag\w*) /.test(Q.nn)) return null;
  const all = await leagueInjuries(); if (!all) return { text: 'The injury report is unavailable right now.' };
  const entries = all.injuries || all.teams || [];
  const forTeam = t => (entries.find(e => e.id === t.id || e.team?.id === t.id || e.displayName === t.name || e.team?.displayName === t.name)?.injuries || []).map(normInjury);
  const p = Q.players[0];
  if (p) {
    const t = S.teams[p.teamId]; if (!t) return null;
    const mine = forTeam(t).find(x => String(x.id) === String(p.id) || nameKey(x.name) === p.key);
    if (!mine) return { text: `${esc(p.name)} isn't on the injury report, so ${IS_F ? 'she' : 'he'} should be available. ${anThe(t).replace(/^t/, 'T')} list ${forTeam(t).length ? plural(forTeam(t).length, 'other player') : 'nobody'} as hurt.`, html: card(Q.ui.pRow(p, 'Available', '')), ctx: { pid: p.id } };
    const bits = [mine.what || mine.detail, mine.ret ? `expected back ${fmtShortDate(mine.ret)}` : ''].filter(Boolean).join(', ');
    return { text: `${esc(p.name)} is listed as <b>${esc(mine.status.toLowerCase())}</b>${bits ? ` (${esc(bits)})` : ''}.${mine.note ? ` ${esc(mine.note)}` : ''}`, html: card(Q.ui.pRow(p, esc(mine.status), mine.what || '')), ctx: { pid: p.id } };
  }
  const t = Q.teams[0];
  if (t && !/ (injur\w*|hurt|banged up|healthy|sidelined|who s out|whos out|who is out|is out|out for|out tonight|available|questionable|doubtful) /.test(Q.nn)) return null;
  if (t) {
    const L = forTeam(t);
    if (!L.length) return { text: `${anThe(t).replace(/^t/, 'T')} have a clean injury report right now.`, ctx: { teamId: t.id } };
    const outs = L.filter(x => /^out/i.test(x.status));
    const rest = L.filter(x => !/^out/i.test(x.status));
    return { text: `${anThe(t).replace(/^t/, 'T')} list ${plural(L.length, 'player')} on the injury report${outs.length ? `. Out: ${anList(outs.slice(0, 5).map(x => esc(x.name)))}${outs.length > 5 ? ' and others' : ''}` : ''}${rest.length ? `. ${outs.length ? 'Also listed' : 'Listed'}: ${anList(rest.slice(0, 4).map(x => `${esc(x.name)} (${esc(x.status.toLowerCase())})`))}` : ''}.`,
      html: card(L.map(x => Q.ui.pRow({ id: x.id, name: x.name, abbr: t.abbr }, esc(x.status), [x.what, x.ret ? `back ${fmtShortDate(x.ret)}` : ''].filter(Boolean).join(' · '))).join('')), ctx: { teamId: t.id } };
  }
  if (IS_C || !/ (injur\w*|hurt|who s out|whos out|who is out|injury report) /.test(Q.nn)) return null;
  // league-wide: the best players who are out
  const out = [];
  for (const e of entries) for (const i of e.injuries || []) { const n = normInjury(i); if (/^out/i.test(n.status)) { const r = Q.rows.find(x => String(x.id) === String(n.id)); out.push({ n, r, t: e }); } }
  const stars = out.filter(x => x.r && x.r.gp).sort((a, b) => (b.r.pts || 0) - (a.r.pts || 0)).slice(0, 10);
  return { text: `${plural(out.length, 'player')} across the league are listed as out. The biggest names: ${anList(stars.slice(0, 4).map(x => esc(x.r.name)))}.`, html: card(stars.map(x => Q.ui.pRow(x.r, 'Out', [x.n.what, `${x.r.pts.toFixed(1)} PPG`].filter(Boolean).join(' · '))).join('')) };
}

/* ---------------- one team: coach, roster, schedule, last ten ---------------- */
async function anCoach(t, Q) {
  if (IS_C) { const d = await getJSON(`${API}/teams/${t.id}/roster`).catch(() => null), c = d?.coach?.[0], n = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : ''; return n ? { text: `<b>${esc(n)}</b> coaches ${anThe(t)}${c.experience ? `, in year ${c.experience + 1} there` : ''}.`, html: card(Q.ui.tRow(t, null, `${n} · head coach`)), ctx: { teamId: t.id } } : null; }
  let d = null; try { d = (await (await lazy('coach')).loadCoaches())?.[LGK]?.teams?.[t.abbr]; } catch (e) {}
  const gm = / (gm|general manager|president|front office|owner|runs the) /.test(Q.nn);
  if (d?.coach?.name) {
    const c = d.coach, w = c.seasons.reduce((a, s) => a + (s.w || 0), 0), l = c.seasons.reduce((a, s) => a + (s.l || 0), 0), here = c.seasons.filter(s => s.team === t.abbr || s.team === c.team);
    const fo = (d.fo || d.front || d.frontOffice || []);
    const exec = Array.isArray(fo) ? fo[0] : null;
    if (gm && exec?.name) return { text: `${esc(exec.name)} runs ${anThe(t)} front office${exec.title ? ` as ${esc(exec.title.toLowerCase())}` : ''}. ${esc(c.name)} is the head coach.`, html: card(Q.ui.tRow(t, null, `${exec.name}${exec.title ? ` · ${exec.title}` : ''}`) + `<button class="btn ghost" data-coach="${esc(t.abbr)}">Coach and front office</button>`), ctx: { teamId: t.id }, src: 'Basketball-Reference' };
    return { text: `<b>${esc(c.name)}</b> coaches ${anThe(t)}${here.length ? `, in ${IS_F ? 'her' : 'his'} ${ordinal(here.length)} season with them` : ''}.${w + l ? ` Career record as a head coach: ${w}-${l}.` : ''}`, html: card(Q.ui.tRow(t, w + l ? `${w}-${l}` : null, `${c.name} · head coach`) + `<button class="btn ghost" data-coach="${esc(t.abbr)}">Coach and front office</button>`), ctx: { teamId: t.id }, src: 'Basketball-Reference' };
  }
  await anRosters().catch(() => {});
  const n = AN.rost?.coach?.[t.id]; if (!n) return null;
  return { text: `<b>${esc(n)}</b> coaches ${anThe(t)}.`, html: card(Q.ui.tRow(t, null, `${n} · head coach`)), ctx: { teamId: t.id } };
}
async function anRoster(t, Q) {
  const d = await getJSON(`${API}/teams/${t.id}/roster`).catch(() => null); if (!d?.athletes?.length) return null;
  const A = d.athletes.map(a => ({ id: a.id, name: a.displayName, abbr: t.abbr, pos: a.position?.abbreviation || '', jersey: a.jersey ?? '', h: a.displayHeight || '', age: a.age, exp: a.experience?.years, r: Q.rows.find(x => String(x.id) === String(a.id)) }));
  const starters = / (start\w*|lineup|line up|first five|starting five) /.test(Q.nn);
  if (starters) {
    // the five who started the team's last game
    let five = null;
    try {
      const sch = await scheduleOf(t.id), last = (sch.events || []).filter(e => e.competitions?.[0]?.status?.type?.state === 'post').at(-1);
      const sum = last && await summaryCached(last.id, 3600e3);
      const side = sum?.boxscore?.players?.find(x => String(x.team?.id) === String(t.id));
      five = (side?.statistics?.[0]?.athletes || []).filter(a => a.starter).map(a => ({ id: a.athlete.id, name: a.athlete.displayName, abbr: t.abbr, pos: a.athlete.position?.abbreviation || '' }));
      if (five?.length >= 4) return { text: `${anThe(t).replace(/^t/, 'T')} started ${anList(five.map(x => esc(x.name)))} in their last game (${fmtShortDate(last.date)}).`, html: card(five.map(x => Q.ui.pRow(x, esc(x.pos), (() => { const r = Q.rows.find(y => String(y.id) === String(x.id)); return r?.gp ? `${r.pts.toFixed(1)} PTS · ${r.reb.toFixed(1)} REB · ${r.ast.toFixed(1)} AST` : ''; })())).join('') + `<button class="btn ghost" data-team="${t.id}">Open ${esc(anT(t))}</button>`), ctx: { teamId: t.id } };
    } catch (e) {}
  }
  A.sort((a, b) => (b.r?.min || 0) - (a.r?.min || 0));
  const lead = A.filter(a => a.r?.gp).slice(0, 3);
  return { text: `${anThe(t).replace(/^t/, 'T')} have ${plural(A.length, 'player')} on the roster${lead.length ? `, led in minutes by ${anList(lead.map(a => esc(a.name)))}` : ''}.`,
    html: card(Q.ui.table(['Player', 'Pos', '#', 'Ht', 'Age', 'PTS'], A.map(a => `<tr data-player="${esc(a.id)}" style="cursor:pointer"><td>${esc(a.name)}</td><td>${esc(a.pos)}</td><td>${esc(a.jersey)}</td><td>${esc(a.h)}</td><td>${a.age ?? ''}</td><td>${a.r?.gp ? a.r.pts.toFixed(1) : '–'}</td></tr>`)) + `<button class="btn ghost" data-team="${t.id}">Open ${esc(anT(t))}</button>`), ctx: { teamId: t.id } };
}
const anEvents = async t => ((await scheduleOf(t.id)).events || []).map(e => { const c = e.competitions?.[0]; const me = c?.competitors.find(x => x.team?.id === t.id), op = c?.competitors.find(x => x.team?.id !== t.id); return c && me && op ? { id: e.id, date: e.date, state: c.status?.type?.state, home: me.homeAway === 'home', op: op.team, won: me.winner, ms: +(me.score?.value ?? me.score?.displayValue ?? me.score), os: +(op.score?.value ?? op.score?.displayValue ?? op.score), tv: (c.broadcasts || []).map(b => b.media?.shortName).filter(Boolean).join(' · ') } : null; }).filter(Boolean);
const anEvRow = e => `<button class="ask-li" data-game="${e.id}">${logo(e.op.abbreviation, 64)}<span class="nm"><b>${e.home ? 'vs' : '@'} ${esc(e.op.displayName || e.op.abbreviation)}</b><small>${esc(e.state === 'post' ? fmtShortDate(e.date) : e.tv || '')}</small></span><span class="v small">${e.state === 'post' ? `<b class="${e.won ? 'strk-w' : 'strk-l'}">${e.won ? 'W' : 'L'}</b> ${e.ms}-${e.os}` : esc(e.state === 'in' ? 'Live now' : `${fmtET(e.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(e.date)}`)}</span></button>`;
async function anMeet(a, b) {
  const evs = (await anEvents(a)).filter(e => String(e.op.id) === String(b.id));
  if (!evs.length) return { text: `${anThe(a).replace(/^t/, 'T')} and ${anThe(b)} don't play each other this season.`, ctx: { teamId: a.id } };
  const up = evs.find(e => e.state !== 'post'), done = evs.filter(e => e.state === 'post'), w = done.filter(e => e.won).length;
  const text = `${up ? `${anThe(a).replace(/^t/, 'T')} ${up.state === 'in' ? 'are playing' : 'next play'} ${anThe(b)} ${up.state === 'in' ? 'right now' : `on <b>${esc(fmtLocal(up.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</b> at ${esc(fmtTime(up.date))}, ${up.home ? 'at home' : 'on the road'}${up.tv ? ` (${esc(up.tv)})` : ''}`}.` : `${anThe(a).replace(/^t/, 'T')} and ${anThe(b)} have no games left against each other this season.`}${done.length ? ` ${anThe(a).replace(/^t/, 'T')} ${done.length === w || !w ? `${w ? 'won' : 'lost'} ${done.length === 1 ? 'the one meeting so far' : `all ${done.length} meetings so far`}` : `are ${w}-${done.length - w} against them this season`}.` : ''}`;
  return { text, html: card(evs.map(anEvRow).join('')), ctx: { teamId: a.id } };
}
async function anLastN(t, n, Q) {
  const done = (await anEvents(t)).filter(e => e.state === 'post').slice(-n); if (!done.length) return { text: `${anThe(t).replace(/^t/, 'T')} haven't played yet this season.`, ctx: { teamId: t.id } };
  const w = done.filter(e => e.won).length, pf = done.reduce((a, e) => a + e.ms, 0) / done.length, pa = done.reduce((a, e) => a + e.os, 0) / done.length;
  let run = 0; for (let i = done.length - 1; i >= 0 && done[i].won === done.at(-1).won; i--) run++;
  return { text: `${anThe(t).replace(/^t/, 'T')} are <b>${w}-${done.length - w}</b> in their last ${done.length === 1 ? 'game' : `${done.length} games`}, scoring ${pf.toFixed(1)} and allowing ${pa.toFixed(1)}. They've ${done.at(-1).won ? 'won' : 'lost'} ${run === 1 ? 'their last one' : `${run} in a row`}.`, html: card(done.slice().reverse().map(anEvRow).join('')), ctx: { teamId: t.id } };
}

/* ---------------- the league's teams: streaks, records, offense and defense ---------------- */
const AN_TSTAT = [
  ['ortg', / (best offen[cs]e|top offen[cs]e|offensive rating|most efficient offen[cs]e|offen[cs]e) /, 'offensive rating', 1, 1], ['drtg', / (best defen[cs]e|top defen[cs]e|defensive rating|stingiest|defen[cs]e) /, 'defensive rating', -1, 1],
  ['net', / (net rating|point differential per|most dominant) /, 'net rating', 1, 1], ['pace', / (pace|fastest|slowest|tempo|possessions) /, 'possessions per game', 1, 1],
  ['ppg', / (scores? the most|scoring teams?|most points|points per game|highest scoring|lowest scoring|scores? the (fewest|least)|fewest points) /, 'points per game', 1, 1], ['opp', / (allows?|gives? up|points allowed|opponent points) /, 'points allowed per game', -1, 1],
  ['reb', / (rebound\w*|boards|on the glass) /, 'rebounds per game', 1, 1], ['ast', / (assists?|passing|ball movement|shares? the ball) /, 'assists per game', 1, 1], ['stl', / (steals?) /, 'steals per game', 1, 1], ['blk', / (blocks?|blocked shots|rim protection) /, 'blocks per game', 1, 1],
  ['tov', / (turnovers?|turns? it over|takes? care of the ball|sloppiest) /, 'turnovers per game', -1, 1], ['tpm', / (threes|three pointers|3s|3 pointers|from deep) /, 'threes per game', 1, 1],
  ['tpp', / (three point (shooting|percent\w*)|3 point (shooting|percent\w*)|shoots? .*from three|shooting from three|3pt percent\w*) /, 'three-point percentage', 1, 1], ['fgp', / (field goal percent\w*|fg percent\w*|shooting percent\w*|shoots? the best|best shooting) /, 'field goal percentage', 1, 1],
  ['ftp', / (free throw\w*|foul line|ft percent\w*) /, 'free throw percentage', 1, 1], ['ts', / (true shooting|ts percent\w*) /, 'true shooting', 1, 1], ['efg', / (effective field goal|efg) /, 'effective field goal percentage', 1, 1],
];
async function anTeamStats(Q) {
  const { nn } = Q;
  const teamish = / (teams?|offen[cs]e|defen[cs]e|pace|net rating|offensive rating|defensive rating|franchise|squads?|clubs?|allows?|gives? up|points allowed) /.test(nn) || (Q.teams.length && / (rank\w*|rating|where do|how good) /.test(nn));
  if (!teamish || Q.players.length) return null;
  // match the three-point percentage and "allows" phrasings before the broader ones
  const hit = AN_TSTAT.filter(s => s[1].test(nn)).sort((a, b) => ['tpp', 'opp', 'ortg', 'drtg', 'net'].includes(b[0]) - ['tpp', 'opp', 'ortg', 'drtg', 'net'].includes(a[0]))[0];
  if (!hit) return null;
  const [k, , label, dir] = hit;
  const R = await (await lazy('ranks')).loadRankings().catch(() => null); if (!R?.length) return null;
  // "worst" depends on which way the stat runs: fewest points scored is bad, fewest points allowed is good
  const worst = dir > 0 ? / (worst|lowest|fewest|least|slowest|bottom|last|weakest) /.test(nn) : / (worst|most|highest|sloppiest|weakest|bottom|last) /.test(nn) && !/ (fewest|least|lowest|takes? care) /.test(nn);
  const L = R.filter(r => Number.isFinite(r[k])).sort((a, b) => (worst ? -1 : 1) * dir * (b[k] - a[k]));
  const f = v => (['tpp', 'fgp', 'ftp', 'ts', 'efg'].includes(k) ? `${v.toFixed(1)}%` : v.toFixed(1));
  const good = R.filter(r => Number.isFinite(r[k])).sort((a, b) => dir * (b[k] - a[k]));
  const t = Q.teams[0];
  if (t) {
    const r = R.find(x => String(x.id) === String(t.id)); if (!r || !Number.isFinite(r[k])) return null;
    const rk = good.indexOf(r) + 1;
    return { text: `${anThe(t).replace(/^t/, 'T')} rank <b>${ordinal(rk)}</b> in ${esc(label)} at ${f(r[k])}. ${esc(good[0].short)} lead${IS_C ? '' : ' the league'} (${f(good[0][k])}).`, html: card(good.slice(Math.max(0, Math.min(rk - 3, good.length - 5)), Math.max(5, rk + 2)).map(x => Q.ui.tRow(x, f(x[k]), `${ordinal(good.indexOf(x) + 1)} in ${label}`)).join('') + `<button class="btn ghost" data-view="teams">Team rankings</button>`), ctx: { teamId: t.id } };
  }
  const top = L.slice(0, Q.topN || 5);
  const adj = worst ? (k === 'pace' ? 'slowest' : 'worst') : k === 'pace' ? 'fastest' : 'best';
  const say = k === 'opp' ? `allow the ${worst ? 'most' : 'fewest'} points, ${f(top[0][k])} a game` : k === 'tov' ? `commit the ${worst ? 'most' : 'fewest'} turnovers, ${f(top[0][k])} a game` : k === 'ortg' || k === 'drtg' ? `have the ${adj} ${k === 'ortg' ? 'offense' : 'defense'} at ${f(top[0][k])} points ${k === 'ortg' ? 'scored' : 'allowed'} per 100 possessions` : k === 'pace' ? `play at the ${adj} pace, ${f(top[0][k])} possessions a game` : k === 'net' ? `have the ${adj} net rating at ${top[0][k] > 0 ? '+' : ''}${f(top[0][k])} per 100 possessions` : `${worst === (dir > 0) ? 'are last' : 'lead'} ${IS_C ? 'Division I' : 'the league'} in ${esc(label)} at ${f(top[0][k])}`;
  return { text: `${anSub(top[0])} ${say}. Next: ${anList(top.slice(1, 3).map(x => `${esc(x.short)} (${f(x[k])})`))}.`, html: card(top.map((x, i) => Q.ui.tRow(x, f(x[k]), `${ordinal(good.indexOf(x) + 1)} in ${label}`)).join('') + `<button class="btn ghost" data-view="teams">Team rankings</button>`) };
}
async function anStandingsSuper(Q) {
  const { nn } = Q; if (Q.players.length || Q.teams.length) return null;
  await loadStandings().catch(() => {});
  let R = (S.standings?.confs || []).flatMap(c => c.rows); if (!R.length) return null;
  if (Q.conf != null) R = R.filter(r => r.conf === Q.conf);
  const where = Q.conf == null ? (IS_C ? '' : ' in the league') : ` in the ${Q.conf ? 'West' : 'East'}`;
  const wl = s => { const m = String(s || '').match(/(\d+)-(\d+)/); return m ? [+m[1], +m[2]] : null; }, pct = s => { const x = wl(s); return x && x[0] + x[1] ? x[0] / (x[0] + x[1]) : -1; };
  const strk = r => { const m = String(r.strk || '').match(/^([WL])(\d+)/); return m ? (m[1] === 'W' ? 1 : -1) * +m[2] : 0; };
  const out = (L, v, sub, text) => ({ text, html: card(L.slice(0, Q.topN || 5).map(r => Q.ui.tRow(r, v(r), sub(r))).join('') + `<button class="btn ghost" data-view="standings">Full standings</button>`) });
  const worst = / (worst|losing|lost|cold\w*|longest losing|bottom|fewest wins|most losses|last place|tanking) /.test(nn);
  if (/ (streaks?|in a row|straight|hottest teams?|coldest teams?|hot teams?|cold teams?|on fire) /.test(nn) && !/ (points?|scor\w*|games? with) /.test(nn)) {
    const L = R.slice().sort((a, b) => (worst ? strk(a) - strk(b) : strk(b) - strk(a))), t = L[0], n = Math.abs(strk(t));
    if (!n) return null;
    return out(L, r => esc(r.strk), r => `${r.w}-${r.l} · L10 ${r.l10}`, `${anSub(t)} have ${worst ? 'lost' : 'won'} <b>${n} in a row</b>, the longest ${worst ? 'losing' : 'winning'} streak${where} right now. ${L[1] && Math.abs(strk(L[1])) ? `${anSub(L[1])} are next at ${esc(L[1].strk)}.` : ''}`);
  }
  const split = / (home|at home) /.test(nn) ? 'home' : / (road|away|on the road) /.test(nn) ? 'road' : / (last (10|ten)|l10|lately|recently|past (10|ten)) /.test(nn) ? 'l10' : null;
  if (split && / (record|best|worst|team|teams|who) /.test(nn)) {
    const L = R.filter(r => wl(r[split])).sort((a, b) => (worst ? pct(a[split]) - pct(b[split]) || wl(b[split])[1] - wl(a[split])[1] : pct(b[split]) - pct(a[split]) || wl(b[split])[0] - wl(a[split])[0])), t = L[0]; if (!t) return null;
    const lab = { home: 'at home', road: 'on the road', l10: 'over the last 10 games' }[split];
    return out(L, r => esc(r[split]), r => `${r.w}-${r.l} overall`, `${anSub(t)} have the ${worst ? 'worst' : 'best'} record ${lab}${where}: <b>${esc(t[split])}</b>.`);
  }
  if (/ (point differential|margin|outscor\w*|plus minus) /.test(nn) && / (teams?|best|worst) /.test(nn)) {
    const L = R.slice().sort((a, b) => (worst ? a.diff - b.diff : b.diff - a.diff)), t = L[0];
    return out(L, r => esc(r.diffD), r => `${r.w}-${r.l}`, `${anSub(t)} have the ${worst ? 'worst' : 'best'} point differential${where}: <b>${esc(t.diffD)}</b> a game.`);
  }
  if (/ (best|worst|top|bottom|last place|most wins|fewest wins|most losses|fewest losses|tanking) /.test(nn) && / (teams?|record|wins|losses|last place) /.test(nn) && !/ (ever|all time|history|19\d\d|20[01]\d) /.test(nn)) {
    const p = r => (r.w + r.l ? r.w / (r.w + r.l) : 0), L = R.slice().sort((a, b) => (worst ? p(a) - p(b) || b.l - a.l : p(b) - p(a) || b.w - a.w)), t = L[0];
    return out(L, r => `${r.w}-${r.l}`, r => `${IS_C ? '' : `${ordinal(r.seed)} ${r.conf ? 'West' : 'East'} · `}${r.strk}`, `${anSub(t)} have the ${worst ? 'worst' : 'best'} record${where} at <b>${t.w}-${t.l}</b>${L[1] ? `, ${worst ? 'behind' : 'ahead of'} ${anThe(L[1])} (${L[1].w}-${L[1].l})` : ''}.`);
  }
  return null;
}

/* ---------------- playoff and title chances (the season sim) ---------------- */
async function anOdds(Q) {
  const { nn } = Q;
  if (IS_C || !/ (playoffs?|title|championship|champions?|finals|win it all|make the|play in|top seed|1 seed|first seed|contenders?|favorites? to win|favou?red to win|win the (east|west)|projected|projection|how many (games|wins) will|win total|tank\w*|lottery) /.test(nn)) return null;
  if (/ (19\d\d|20[01]\d|202[0-5]) /.test(nn) || / (stats|averag\w*|points?|rebounds?|assists?|scor\w*|leaders?|when|start|starts|begin|format|how do|in the playoffs|playoff (stats|games|career)|last (year|season)|ever|all time|history|won the|how many (titles|championships|rings)) /.test(nn) || Q.players.length) return null;
  let M, X; try { M = await lazy('sim'); ({ X } = await M.simData(M.sxLg())); } catch (e) { return null; }
  const O = X.odds?.teams; if (!O) return null;
  const tm = a => Object.values(S.teams).find(x => x.abbr === a) || X.teams.find(x => x.abbr === a) || { abbr: a, name: a };
  const pc = v => (v >= 99.5 ? '>99%' : v < 0.5 ? '<1%' : `${Math.round(v)}%`);
  const t = Q.teams[0];
  if (t) {
    const o = O[t.abbr]; if (!o) return null;
    const w = Math.round(o.w);
    return { text: `Fullcourt's season sim has ${anThe(t)} finishing around <b>${w}-${X.total - w}</b>, with a <b>${pc(o.po)}</b> chance to make the playoffs${o.fin != null ? `, ${pc(o.fin)} to reach the Finals` : ''} and <b>${pc(o.title)}</b> to win the title.`,
      html: card(Q.ui.tRow(t, pc(o.po), `Projected ${w}-${X.total - w} · Finals ${pc(o.fin)} · Title ${pc(o.title)}`) + `<button class="btn ghost" data-sxopen="${esc(t.abbr)}">Open ${esc(anT(t))} odds</button>`), ctx: { teamId: t.id }, src: 'Fullcourt sim' };
  }
  const k = / (finals) /.test(nn) && !/ (win the finals|finals winner) /.test(nn) ? 'fin' : / (make the playoffs|playoff (odds|chances|picture|race|teams)|in the playoffs|playoffs?) /.test(nn) && !/ (title|champion\w*|win it all|favou?r\w*|contenders?) /.test(nn) ? 'po' : / (lottery|tank\w*|worst projected|fewest projected) /.test(nn) ? 'tank' : / (projected|projection|win total|how many) /.test(nn) ? 'w' : 'title';
  let L = Object.entries(O).map(([a, o]) => ({ a, o }));
  if (Q.conf != null) { const cn = Q.conf ? 'West' : 'East'; L = L.filter(x => (X.teams.find(y => y.abbr === x.a)?.conf || '').startsWith(cn)); }
  const val = x => (k === 'tank' ? -x.o.w : k === 'w' ? x.o.w : x.o[k]);
  L.sort((a, b) => val(b) - val(a));
  const top = L.slice(0, Q.topN || 6), f = x => (k === 'w' || k === 'tank' ? `${Math.round(x.o.w)}-${X.total - Math.round(x.o.w)}` : pc(x.o[k]));
  const lead = { title: `The ${esc(tm(top[0].a).name)} are the title favorite in Fullcourt's season sim at <b>${f(top[0])}</b>`, fin: `The ${esc(tm(top[0].a).name)} are the likeliest Finals team at <b>${f(top[0])}</b>`, po: `The ${esc(tm(top[0].a).name)} are the surest playoff team at <b>${f(top[0])}</b>`, w: `The ${esc(tm(top[0].a).name)} project to the best record at <b>${f(top[0])}</b>`, tank: `The ${esc(tm(top[0].a).name)} project to the worst record at <b>${f(top[0])}</b>` }[k];
  return { text: `${lead}, then ${anList(top.slice(1, 3).map(x => `${esc(tm(x.a).short || tm(x.a).name)} (${f(x)})`))}.`, html: card(top.map(x => Q.ui.tRow(tm(x.a), f(x), `Projected ${Math.round(x.o.w)}-${X.total - Math.round(x.o.w)} · Playoffs ${pc(x.o.po)} · Title ${pc(x.o.title)}`)).join('') + `<button class="btn ghost" data-view="standings">Playoff odds</button>`), src: 'Fullcourt sim' };
}

/* ---------------- the coming draft ---------------- */
async function anDraft(Q) {
  const { nn } = Q;
  if (IS_C || !/ (draft\w*|lottery|prospects?|first pick|1st pick|no 1 pick|number one pick|top pick|# ?1 pick) /.test(nn)) return null;
  if (/ (19\d\d|20[01]\d|202[0-6]) /.test(nn) || / (was|were|did|drafted|went|got) /.test(nn) || Q.players.length) return null; // a past draft: the history answers
  let D; try { D = (await (await lazy('draft')).loadDraft())?.[LGK]; } catch (e) { return null; } if (!D?.order?.length) return null;
  const tm = a => Object.values(S.teams).find(x => x.abbr === a) || { abbr: a, name: D.teams?.[a]?.name || a, short: D.teams?.[a]?.short || a };
  const btn = `<button class="btn ghost" data-view="draft">Open the Mock Draft</button>`;
  const P = D.prospects || [];
  if (/ (prospects?|big board|best players|who will go|who goes|top of the draft|projected (no|number|#) ?(1|one)|go first|go number one|mock) /.test(nn) && !Q.teams.length) {
    const pos = nn.match(/ (guards?|forwards?|centers?|wings?|bigs?|point guards?) /)?.[1];
    const want = !pos ? null : /^(center|big)/.test(pos) ? /C/ : /^forward|^wing/.test(pos) ? /F/ : /G/;
    const L = P.filter(p => !want || want.test(p.pos)).slice(0, Q.topN || 8); if (!L.length) return null;
    return { text: `<b>${esc(L[0].name)}</b> (${esc(L[0].pos)}, ${esc(L[0].school)}) tops Fullcourt's ${D.year} big board${pos ? ` among ${esc(pos.replace(/s?$/, 's'))}` : ''}, averaging ${L[0].pts.toFixed(1)} points and ${L[0].reb.toFixed(1)} rebounds. Next: ${anList(L.slice(1, 3).map(p => `${esc(p.name)} (${esc(p.school)})`))}.`,
      html: card(Q.ui.table(['#', 'Prospect', 'Pos', 'School', 'PTS', 'REB', 'AST'], L.map(p => `<tr><td>${p.rk}</td><td>${esc(p.name)}</td><td>${esc(p.pos)}</td><td>${esc(p.schoolAbbr || p.school)}</td><td>${p.pts.toFixed(1)}</td><td>${p.reb.toFixed(1)}</td><td>${p.ast.toFixed(1)}</td></tr>`)) + btn), src: 'Fullcourt draft board' };
  }
  const t = Q.teams[0];
  if (t) {
    const mine = D.order.filter(o => o.team === t.abbr);
    if (!mine.length) return { text: `${anThe(t).replace(/^t/, 'T')} don't own a pick in the ${D.year} draft as things stand.`, html: card(btn), ctx: { teamId: t.id }, src: 'Fullcourt draft board' };
    return { text: `${anThe(t).replace(/^t/, 'T')} hold ${plural(mine.length, 'pick')} in the ${D.year} draft as the standings sit: ${anList(mine.map(o => `<b>No. ${o.pick}</b>${o.via ? ` (from ${esc(o.via)})` : ''}`))}. The order moves with the standings and the lottery.`, html: card(mine.map(o => Q.ui.tRow(t, `#${o.pick}`, `Round ${o.round}${o.via ? ` · from ${o.via}` : ''}`)).join('') + btn), ctx: { teamId: t.id }, src: 'Fullcourt draft board' };
  }
  const top = D.order.slice(0, Q.topN || (/ lottery /.test(nn) ? 14 : 5));
  const odds = D.odds ? ` The three worst records each get a ${(D.odds[0] / 10).toFixed(0)}% shot at No. 1 in the lottery.` : '';
  return { text: `If the season ended today, the ${esc(tm(top[0].team).name)} would pick first in the ${D.year} draft, then ${anList(top.slice(1, 3).map(o => esc(tm(o.team).short || tm(o.team).name)))}.${LGK === 'nba' ? odds : ''}`, html: card(top.map(o => Q.ui.tRow(tm(o.team), `#${o.pick}`, D.teams?.[o.team] ? `${D.teams[o.team].w}-${D.teams[o.team].l}${o.via ? ` · from ${o.via}` : ''}` : '')).join('') + btn), src: 'Fullcourt draft board' };
}

/* ---------------- the day's games: blowouts, nail-biters, overtime ---------------- */
async function anDay(Q) {
  const { nn } = Q;
  const kind = / (blowouts?|biggest win|largest margin|most lopsided|biggest margin|beat\w* by the most) /.test(nn) ? 'blow' : / (closest|nail ?biters?|tightest|one possession|best game|most exciting|buzzer) /.test(nn) ? 'close' : / (highest scoring game|most points in a game (last night|tonight|today|yesterday)|highest total|shootout) /.test(nn) ? 'high' : / (lowest scoring game|lowest total|defensive battle) /.test(nn) ? 'low' : / (overtime|ot games?|double overtime|extra time) /.test(nn) ? 'ot' : / (upsets?) /.test(nn) ? 'upset' : null;
  if (!kind || Q.players.length || / (ever|all time|history|this season|this year|season) /.test(nn)) return null;
  const date = Q.time?.kind === 'date' ? Q.time.date : Q.f.lastNight();
  let G = (await scoreboardOn(date)).filter(g => g.state === 'post');
  let label = date === S.today ? 'tonight' : date === addDays(S.today, -1) ? 'last night' : `on ${fmtShortDate(fromYmd(date).toISOString())}`;
  if (!G.length && Q.time?.kind !== 'date') { const d2 = addDays(date, date === S.today ? -1 : 1 - 1); G = (await scoreboardOn(addDays(S.today, -1))).filter(g => g.state === 'post'); label = 'last night'; if (!G.length) return { text: `No games have finished ${esc(label)}.` }; void d2; }
  if (!G.length) return { text: `No games finished ${esc(label)}.` };
  const m = g => Math.abs(+g.home.score - +g.away.score), tot = g => +g.home.score + +g.away.score, win = g => (+g.home.score > +g.away.score ? g.home : g.away), lose = g => (win(g) === g.home ? g.away : g.home);
  const nm = s => esc(S.teams[s.id]?.short || s.short || s.abbr);
  const line = g => `the ${nm(win(g))} beat the ${nm(lose(g))} ${win(g).score}-${lose(g).score}`;
  let L, text;
  if (kind === 'blow') { L = G.slice().sort((a, b) => m(b) - m(a)); text = `The biggest blowout ${label}: ${line(L[0])}, a <b>${m(L[0])}-point</b> margin.`; }
  else if (kind === 'close') { L = G.slice().sort((a, b) => m(a) - m(b)); text = `The closest game ${label}: ${line(L[0])}, decided by <b>${plural(m(L[0]), 'point')}</b>${/OT/i.test(statusText(L[0])) ? ' in overtime' : ''}.`; }
  else if (kind === 'high') { L = G.slice().sort((a, b) => tot(b) - tot(a)); text = `The highest-scoring game ${label}: ${line(L[0])}, <b>${tot(L[0])} points</b> in all.`; }
  else if (kind === 'low') { L = G.slice().sort((a, b) => tot(a) - tot(b)); text = `The lowest-scoring game ${label}: ${line(L[0])}, <b>${tot(L[0])} points</b> in all.`; }
  else if (kind === 'ot') { L = G.filter(g => /OT/i.test(statusText(g))); if (!L.length) return { text: `No games went to overtime ${esc(label)}.`, html: card(G.slice(0, 6).map(Q.ui.gRow).join('')) }; text = `${plural(L.length, 'game')} went to overtime ${label}: ${anList(L.map(line))}.`; }
  else { L = G.filter(g => upsetOf(g)); if (!L.length) return { text: `No upsets ${esc(label)} by Fullcourt's count: every favorite won.`, html: card(G.slice(0, 6).map(Q.ui.gRow).join('')) }; text = `${plural(L.length, 'upset')} ${label}: ${anList(L.map(line))}.`; }
  return { text, html: card(L.slice(0, 6).map(Q.ui.gRow).join('')) };
}

/* ---------------- league-wide: tallest, oldest, numbers, colleges, rookies ---------------- */
async function anLeagueBio(Q) {
  const { nn } = Q; if (IS_C || Q.players.length) return null;
  if (/ (ever|all time|history|in history|19\d\d|20[01]\d) /.test(nn)) return null;
  const sup = / (tallest|biggest player|highest player) /.test(nn) ? ['h', -1, 'tallest'] : / (shortest|smallest player) /.test(nn) ? ['h', 1, 'shortest'] : / (oldest) /.test(nn) ? ['age', -1, 'oldest'] : / (youngest) /.test(nn) ? ['age', 1, 'youngest'] : / (heaviest) /.test(nn) ? ['w', -1, 'heaviest'] : / (lightest|skinniest) /.test(nn) ? ['w', 1, 'lightest'] : / (most experienced|longest tenured|most seasons|most years) /.test(nn) ? ['exp', -1, 'most experienced'] : null;
  const num = nn.match(/ (?:wears?|wearing|number|jersey|no|#) ?(?:number |no |# ?)?(\d{1,2}) /)?.[1] ?? (/ (wears?|jersey|number) /.test(nn) ? nn.match(/ (\d{1,2}) /)?.[1] : null);
  const fromM = nn.match(/ (?:players?|guys|anyone|who|everyone|nba players) (?:are |is |that are |who are |that |who )?(?:from|went to|out of|attended|played (?:at|for)|born in) ([a-z .&']{3,30}?) (?:in the (?:nba|wnba|league) )?$/) || nn.match(/ ([a-z .&']{3,30}?) (?:players|alumni|alums|products) (?:in the (?:nba|wnba|league) )?$/) || nn.match(/ how many (?:players|guys) (?:are )?(?:from|went to|out of) ([a-z .&']{3,30}?) (?:in the (?:nba|wnba|league) )?$/);
  const rook = / (rookies?|first year players?) /.test(nn) && !/ (of the year|roy|roty) /.test(nn);
  if (!sup && num == null && !fromM && !rook) return null;
  let L = await anRosters().catch(() => null); if (!L?.length) return null;
  const t = Q.teams[0]; if (t) L = L.filter(x => String(x.teamId) === String(t.id));
  const on = t ? ` on ${anThe(t)}` : ` in the ${LGN}`;
  const stat = x => { const r = Q.rows.find(y => String(y.id) === String(x.id)); return r?.gp ? `${r.pts.toFixed(1)} PPG` : ''; };
  if (sup) {
    const [k, dir, word] = sup, f = x => (k === 'h' ? anFt(x.h) : k === 'w' ? `${x.w} lbs` : k === 'exp' ? plural(x.exp + 1, 'season') : `${x.age}`);
    const R = L.filter(x => x[k] != null && x[k] !== 0 || (k === 'exp' && x.exp === 0)).sort((a, b) => dir * (a[k] - b[k]) || (k === 'age' ? dir * (Date.parse(b.dob) - Date.parse(a.dob)) : 0)), top = R.slice(0, Q.topN || 5); if (!top.length) return null;
    const tie = R.filter(x => x[k] === top[0][k] && k !== 'age').length;
    return { text: `${esc(top[0].name)} is the ${word} player${on}${k === 'age' ? ` at <b>${top[0].age}</b>${top[0].dob ? ` (born ${esc(anBorn(top[0].dob))})` : ''}` : ` at <b>${esc(f(top[0]))}</b>`}${tie > 1 ? `, tied with ${tie - 1 === 1 ? esc(R[1].name) : `${tie - 1} others`}` : ''}.`, html: card(top.map(x => Q.ui.pRow(x, esc(f(x)), [x.pos, stat(x)].filter(Boolean).join(' · '))).join('')) };
  }
  if (num != null) {
    const R = L.filter(x => String(x.jersey) === String(+num)).sort((a, b) => (Q.rows.find(y => String(y.id) === String(b.id))?.pts || 0) - (Q.rows.find(y => String(y.id) === String(a.id))?.pts || 0));
    if (!R.length) return { text: `Nobody${on} wears #${+num} right now.` };
    return { text: `${plural(R.length, 'player')}${on} ${R.length === 1 ? 'wears' : 'wear'} <b>#${+num}</b>: ${anList(R.slice(0, 5).map(x => esc(x.name)))}${R.length > 5 ? ' and others' : ''}.`, html: card(R.slice(0, 12).map(x => Q.ui.pRow(x, `#${esc(x.jersey)}`, [x.pos, stat(x)].filter(Boolean).join(' · '))).join('')) };
  }
  if (rook) {
    const R = L.filter(x => x.exp === 0).map(x => ({ x, r: Q.rows.find(y => String(y.id) === String(x.id)) })).filter(o => o.r?.gp);
    const k = Q.stat && R[0].r[Q.stat] != null ? Q.stat : 'pts', lab = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tpm: 'threes', min: 'minutes' }[k] || k;
    R.sort((a, b) => (b.r[k] || 0) - (a.r[k] || 0)); const top = R.slice(0, Q.topN || 6); if (!top.length) return null;
    return { text: `${esc(top[0].r.name)} leads all rookies${t ? on : ''} with <b>${top[0].r[k].toFixed(1)}</b> ${lab} per game, ahead of ${anList(top.slice(1, 3).map(o => `${esc(o.r.name)} (${o.r[k].toFixed(1)})`))}.`, html: card(top.map(o => Q.ui.pRow(o.r, o.r[k].toFixed(1), `${o.r.pts.toFixed(1)} PTS · ${o.r.reb.toFixed(1)} REB · ${o.r.ast.toFixed(1)} AST`)).join('') + `<button class="btn ghost" data-view="leaders">Award races</button>`) };
  }
  const want = nameKey(fromM[1]).replace(/^(the|a) /, ''); if (want.length < 3 || /^(the nba|nba|the league|this|that)$/.test(want)) return null;
  const R = L.filter(x => { const c = nameKey(x.college), f = x.from || {}; return c === want || c.split(' ').includes(want) && want.length > 3 || [f.city, f.state, f.country].some(v => v && nameKey(v) === want) || (want === 'usa' && f.country === 'USA'); })
    .sort((a, b) => (Q.rows.find(y => String(y.id) === String(b.id))?.pts || 0) - (Q.rows.find(y => String(y.id) === String(a.id))?.pts || 0));
  if (!R.length) return null;
  const byCollege = R.filter(x => nameKey(x.college).includes(want)).length >= R.length / 2;
  return { text: `${plural(R.length, 'player')}${on} ${byCollege ? `went to ${esc(R.find(x => nameKey(x.college).includes(want)).college)}` : `${R.length === 1 ? 'is' : 'are'} from ${esc(fromM[1].replace(/\b\w/g, c => c.toUpperCase()))}`}. The top scorers: ${anList(R.slice(0, 3).map(x => esc(x.name)))}.`, html: card(R.slice(0, 15).map(x => Q.ui.pRow(x, esc(stat(x) || x.pos), byCollege ? x.college : anPlace(x.from))).join('')) };
}

/* ---------------- what the words mean, and the rules ---------------- */
const AN_TERMS = [
  [/ (true shooting|ts percent\w*|ts) /, 'True shooting percentage', 'Scoring efficiency that counts twos, threes and free throws together: points divided by twice the shots used, where a shot is a field goal attempt or 0.44 of a free throw attempt. Around 58% is league average in the NBA today; 65% is elite.'],
  [/ (effective field goal|efg) /, 'Effective field goal percentage', 'Field goal percentage with threes counted as one and a half makes, since they are worth one and a half times a two: (FGM + 0.5 × 3PM) ÷ FGA.'],
  [/ (per|player efficiency rating) /, 'PER (player efficiency rating)', 'John Hollinger\'s one-number summary of a box score, per minute and adjusted for pace. The league average is always 15. A season of 25 is MVP level, and 30 has only been reached a handful of times.'],
  [/ (win shares?|ws) /, 'Win shares', 'An estimate of how many of his team\'s wins a player produced, split into offense and defense. A 10-win-share season is an All-Star year; 15 or more is an MVP candidate.'],
  [/ (bpm|box plus minus) /, 'Box plus/minus', 'An estimate, from the box score, of the points per 100 possessions a player adds over an average player. Zero is average, +5 is an All-NBA level season, +10 is historic.'],
  [/ (vorp|value over replacement) /, 'VORP', 'Value over replacement player: box plus/minus turned into a running total, measured against a bench-level player and scaled by minutes played.'],
  [/ (usage rate|usage|usg) /, 'Usage rate', 'The share of his team\'s possessions a player finishes (with a shot, a trip to the line or a turnover) while he is on the floor. 20% is an even share; the highest-usage stars run 33% to 38%.'],
  [/ (net rating) /, 'Net rating', 'Points scored minus points allowed per 100 possessions. +5 is a very good team, +10 a historically great one.'],
  [/ (offensive rating|ortg) /, 'Offensive rating', 'Points scored per 100 possessions, which takes pace out of the comparison.'],
  [/ (defensive rating|drtg) /, 'Defensive rating', 'Points allowed per 100 possessions. Lower is better.'],
  [/ (pace) /, 'Pace', 'Possessions per 48 minutes. A faster pace means more shots and more counting stats for everyone, which is why per-100-possession numbers compare teams better.'],
  [/ (plus minus) /, 'Plus/minus', 'The score margin while a player is on the floor: +8 means his team outscored the opponent by eight in his minutes.'],
  [/ (triple double) /, 'Triple-double', 'Ten or more in three of the five main categories in one game, almost always points, rebounds and assists.'],
  [/ (double double) /, 'Double-double', 'Ten or more in two of the five main categories in one game, usually points and rebounds or points and assists.'],
  [/ (quadruple double) /, 'Quadruple-double', 'Ten or more in four categories in one game. It has been done four times in NBA history.'],
  [/ (50 40 90|fifty forty ninety) /, '50-40-90', 'A season shooting at least 50% from the field, 40% from three and 90% from the line while qualifying for all three leaderboards.'],
  [/ (pick and roll|pick n roll|pnr|screen and roll) /, 'Pick and roll', 'A teammate sets a screen (the pick) on the ball handler\'s defender, then cuts to the basket (the roll). The defense has to choose between the ball handler and the roller.'],
  [/ (pick and pop) /, 'Pick and pop', 'A pick and roll where the screener steps out for a jump shot instead of rolling to the rim.'],
  [/ (play in) /, 'Play-in tournament', 'Seeds 7 through 10 in each conference play for the last two playoff spots. 7 hosts 8 and the winner is the 7 seed; the loser hosts the winner of 9 against 10 for the 8 seed.'],
  [/ (two way|2 way) /, 'Two-way contract', 'A deal that lets a player split time between an NBA team and its G League affiliate. Each team can carry three, and they don\'t count against the cap.'],
  [/ (supermax) /, 'Supermax', 'The designated veteran extension: up to 35% of the cap for a player who makes All-NBA or wins MVP or Defensive Player of the Year with the team that drafted him (or traded for him on his rookie deal).'],
  [/ (luxury tax) /, 'Luxury tax', 'Teams whose payroll passes the tax line pay the league a penalty on every dollar over it, at rates that climb the further over they go.'],
  [/ (second apron|2nd apron|first apron|1st apron|apron) /, 'The aprons', 'Two payroll lines above the luxury tax. Teams over the first apron lose some ways to add players; teams over the second lose most of them, including combining salaries in trades.'],
  [/ (salary cap) /, 'Salary cap', 'The limit on team payroll. It is a soft cap: teams can go over it to keep their own players and with certain exceptions.'],
  [/ (flagrant) /, 'Flagrant foul', 'Unnecessary contact (flagrant 1) or unnecessary and excessive contact (flagrant 2, an ejection). The fouled team gets two free throws and the ball.'],
  [/ (technical foul|technical|tech) /, 'Technical foul', 'A foul for unsportsmanlike conduct or a procedural violation: one free throw for the other team. Two in a game is an ejection.'],
  [/ (goaltend\w*) /, 'Goaltending', 'Touching a shot on its way down toward the basket, or while it is on the rim. The basket counts.'],
  [/ (bonus|penalty situation) /, 'The bonus', IS_C ? 'Once a team commits five fouls in a quarter (women) or seven in a half (men), the other team shoots free throws on every foul.' : 'Once a team commits its fifth foul of a quarter, every foul after that sends the other team to the line for two shots.'],
  [/ (clutch time|clutch) /, 'Clutch time', 'The last five minutes of the fourth quarter or overtime with the score within five points.'],
  [/ (sixth man|6th man) /, 'Sixth man', 'A team\'s best reserve, the first player off the bench. The award goes to a player who came off the bench in more games than he started.'],
  [/ (and one|and 1) /, 'And-one', 'A made basket while being fouled, plus the one free throw that comes with it.'],
  [/ (heat check) /, 'Heat check', 'A difficult shot taken by a player who has made several in a row, to see whether he is still hot.'],
  [/ (srs|simple rating) /, 'SRS', 'Simple Rating System: a team\'s average point margin adjusted for the strength of its schedule. Zero is average.'],
  [/ (rotation) /, 'Rotation', 'The players a coach actually uses in a game and the order they sub in, usually eight to ten.'],
];
const AN_RULES = [
  [/ how many games .*(season|play|schedule)|games in (a|the|an nba) season|length of the season /, IS_C ? 'Division I teams play about 30 regular-season games, then conference tournaments and the NCAA tournament.' : IS_W ? 'Each WNBA team plays a 44-game regular season.' : 'Each NBA team plays <b>82 games</b> in the regular season: 41 at home and 41 on the road.'],
  [/ how long is (a|an|the) (nba |wnba |college )?(game|quarter|half)|minutes in (a|an) (game|quarter|half)|length of (a|the) (game|quarter) /, IS_C ? (LGK === 'ncaam' ? 'Men\'s college games are two 20-minute halves (40 minutes).' : 'Women\'s college games are four 10-minute quarters (40 minutes).') : IS_W ? 'WNBA games are four 10-minute quarters (40 minutes). Overtime is five minutes.' : 'NBA games are four 12-minute quarters (<b>48 minutes</b>). Overtime periods are five minutes.'],
  [/ how many fouls|foul out|fouls? to foul out|fouls? (until|before) /, IS_C ? 'A college player fouls out on a fifth personal foul.' : IS_W ? 'A WNBA player fouls out on a sixth personal foul.' : 'An NBA player fouls out on a <b>sixth</b> personal foul. Two technicals or one flagrant 2 is an ejection.'],
  [/ shot clock /, IS_C ? 'The college shot clock is 30 seconds, resetting to 20 after an offensive rebound.' : 'The shot clock is <b>24 seconds</b>, resetting to 14 after an offensive rebound.'],
  [/ (three point line|3 point line|how far is (a|the) (three|3)|distance of (a|the) (three|3)) /, IS_C ? 'The college three-point line is 22 feet 1¾ inches at the top and 21 feet 8 inches in the corners.' : IS_W ? 'The WNBA three-point line is 22 feet 1¾ inches at the top and 22 feet in the corners.' : 'The NBA three-point line is <b>23 feet 9 inches</b> at the top of the arc and 22 feet in the corners.'],
  [/ (how high|height of) .*(rim|hoop|basket) /, 'The rim is <b>10 feet</b> off the floor at every level.'],
  [/ how (big|long|wide) is (a|an|the) (nba )?court|court (size|dimensions) /, 'An NBA court is 94 feet long and 50 feet wide.'],
  [/ how many teams (make|are in) the playoffs|playoff format|how do the playoffs work /, IS_C ? 'The NCAA tournament takes 68 teams: 31 conference champions and 37 at-large picks, in a single-elimination bracket.' : IS_W ? 'Eight WNBA teams make the playoffs, seeded by record regardless of conference.' : 'Sixteen teams make the NBA playoffs, eight from each conference. The top six seeds qualify directly; seeds 7 to 10 go through the play-in for the last two spots. Every series is best of seven.'],
  [/ how many teams (are )?(in the|does the) (nba|wnba|league) /, IS_W ? `There are ${Object.keys(S.teams).length || 15} WNBA teams.` : IS_C ? 'About 360 schools play Division I basketball.' : 'There are <b>30</b> NBA teams, 15 in each conference.'],
  [/ how many players (are )?(on|in) (a|an|the) (nba )?(team|roster)|roster size /, IS_W ? 'A WNBA roster holds 12 players.' : IS_C ? 'A Division I team can carry 15 scholarship players.' : 'An NBA roster holds up to <b>15</b> players on standard contracts plus three on two-way deals. Thirteen can be active for a game.'],
  [/ how many (timeouts|time outs) /, IS_C ? 'College teams get four timeouts a game (three 30-second and one 60-second), plus media timeouts.' : 'Each NBA team gets <b>seven</b> timeouts a game, with no more than four in the fourth quarter and two in the last three minutes.'],
  [/ how many players (are )?on the (court|floor) /, 'Five players a side: ten on the floor.'],
];
function anGlossary(Q) {
  const { nn } = Q;
  for (const [re, text] of AN_RULES) if (re.test(nn)) return { text, src: 'Rule book' };
  const asking = / (what is|what s|whats|what are|what does|what do|define|definition|meaning|mean|means|explain|how is|how are|how do you (calculate|figure|get)|calculated|stand for|stands for) /.test(nn);
  if (!asking || Q.players.length || Q.teams.length) return null;
  if (/ (record|score|leader|leading|best|most|highest|schedule|standings?|odds|the (nba|wnba) (cup|draft)) /.test(nn)) return null;
  const hit = AN_TERMS.find(([re]) => re.test(nn)); if (!hit) return null;
  return { text: `<b>${esc(hit[1])}.</b> ${esc(hit[2])}`, src: 'Fullcourt glossary' };
}

/* ---------------- efficiency leaders, worked out from the player table ---------------- */
const AN_ADV = [
  ['ts', / (true shooting|ts percent\w*|most efficient|efficient scorers?|scoring efficiency) /, 'true shooting', '%'], ['efg', / (effective field goal|efg) /, 'effective field goal percentage', '%'],
  ['p36', / (per 36|per thirty six) /, 'points per 36 minutes', ''], ['ato', / (assist to turnover|assist turnover|assists? per turnover) /, 'assist-to-turnover ratio', ''], ['stocks', / (stocks|steals and blocks|steals plus blocks) /, 'steals plus blocks per game', ''],
];
function anAdv(Q) {
  const { nn, rows } = Q, hit = AN_ADV.find(a => a[1].test(nn)); if (!hit || Q.teams.length || / (teams?|what is|what s|whats|mean|define|explain) /.test(nn)) return null;
  const [k, , label, unit] = hit;
  const maxGp = Math.max(1, ...rows.map(r => r.gp || 0)), enough = r => (r.gp || 0) >= Math.max(1, Math.floor(maxGp * 0.5)) && (r.min || 0) >= 15;
  const fgm = r => (r.fga || 0) * (r.fgp || 0) / 100;
  const calc = { ts: r => ((r.fga || 0) >= 8 ? 100 * tsPct(r.pts, r.fga, r.fta || 0) : NaN), efg: r => ((r.fga || 0) >= 8 ? 100 * efgPct(fgm(r), r.tpm || 0, r.fga) : NaN), p36: r => ((r.min || 0) >= 20 ? r.pts * 36 / r.min : NaN), ato: r => ((r.ast || 0) >= 3 ? astTo(r.ast, r.tov || 0) : NaN), stocks: r => (r.stl || 0) + (r.blk || 0) }[k];
  const worst = / (worst|lowest|least) /.test(nn);
  const L = rows.filter(enough).map(r => ({ r, v: calc(r) })).filter(x => Number.isFinite(x.v)).sort((a, b) => (worst ? a.v - b.v : b.v - a.v)); if (!L.length) return null;
  const f = v => `${v.toFixed(k === 'ato' ? 2 : 1)}${unit}`, p = Q.players[0];
  if (p) {
    const i = L.findIndex(x => String(x.r.id) === String(p.id)); const v = calc(p);
    if (!Number.isFinite(v)) return null;
    return { text: `${esc(p.name)}'s ${esc(label)} is <b>${f(v)}</b>${i >= 0 ? `, ${ordinal(i + 1)} among ${L.length} regulars` : ''}. ${esc(L[0].r.name)} leads at ${f(L[0].v)}.`, html: card(Q.ui.pRow(p, f(v), i >= 0 ? `${ordinal(i + 1)} in ${label}` : label)), ctx: { pid: p.id } };
  }
  const top = L.slice(0, Q.topN || 5);
  return { text: `${esc(top[0].r.name)} ${worst ? 'has the lowest' : `leads ${IS_C ? 'Division I' : `the ${LGN}`} in`} ${esc(label)} at <b>${f(top[0].v)}</b>, ${worst ? 'then' : 'ahead of'} ${anList(top.slice(1, 3).map(x => `${esc(x.r.name)} (${f(x.v)})`))}. Regulars only: half the team's games and 15 minutes a night.`, html: card(top.map((x, i) => Q.ui.pRow(x.r, f(x.v), `#${i + 1} · ${x.r.pts.toFixed(1)} PPG`)).join('') + `<button class="btn ghost" data-view="leaders">All leaders</button>`) };
}

/* ---------------- the calendar: the All-Star break, the trade deadline, the end of the season ---------------- */
function anCalendar(Q) {
  const { nn } = Q; if (IS_C) return null;
  const what = / all ?star (game |break |weekend )?/.test(nn) && / (when|what day|date) /.test(nn) ? 'as' : / trade deadline /.test(nn) ? 'td' : / (when|what day|date|how long until) /.test(nn) && / (playoffs?|postseason|play in|regular season|season) /.test(nn) && / (start|starts|begin|begins|end|ends|over|tip off) /.test(nn) ? 'end' : null;
  if (!what || !S.calendar?.length) return null;
  const days = S.calendar.slice().sort(), D = s => fromYmd(s), fmt = s => fmtDay(s, { weekday: 'long', month: 'long', day: 'numeric' });
  const feb = days.filter(d => d.slice(4, 6) === '02'); if (IS_W || feb.length < 5) return null;
  // the longest run of February days without a regular game is the All-Star break; the game is the Sunday inside it
  let gap = null;
  for (let i = 1; i < feb.length; i++) { const n = Math.round((D(feb[i]) - D(feb[i - 1])) / 864e5); if (!gap || n > gap.n) gap = { n, a: feb[i - 1], b: feb[i] }; }
  if (!gap || gap.n < 3) return null;
  let sun = addDays(gap.a, 1); while (D(sun).getUTCDay() !== 0 && sun < gap.b) sun = addDays(sun, 1);
  const lone = days.find(d => d > gap.a && d < gap.b && D(d).getUTCDay() === 0); if (lone) sun = lone;
  if (what === 'as') return { text: `The All-Star Game is <b>${esc(fmt(sun))}</b>. The league is off from ${esc(fmtDay(addDays(gap.a, 1), { month: 'short', day: 'numeric' }))} and plays again ${esc(fmt(gap.b))}.`, src: 'ESPN schedule' };
  if (what === 'end') {
    const last = days.at(-1); if (last.slice(4, 6) !== '04') return null; // the feed lists the regular season only
    return { text: `The regular season ends <b>${esc(fmt(last))}</b>. The play-in tournament is played that week, and the playoffs start the weekend after.`, src: 'ESPN schedule' };
  }
  if (what === 'td') return { text: `The trade deadline is normally the Thursday ten days before the All-Star Game, which this season is <b>${esc(fmt(addDays(sun, -10)))}</b> at 3 PM ET. I can't confirm the league's official date from the schedule feed.`, src: 'ESPN schedule' };
  return null;
}

/* ---------------- the router ---------------- */
async function nowAnswer(Q) {
  const { nn, players, teams } = Q;
  const has = re => re.test(nn);
  const past = has(/ (19\d\d|20[01]\d|202[0-5]) /) || has(/ (ever|all time|in history|of all time|career) /);
  let r = anGlossary(Q) || (!past && anCalendar(Q)); if (r) return r;
  if (!past) { r = await anContract(Q); if (r) return r; }
  if (!past) { r = await anInjuries(Q); if (r) return r; }
  if (!past) { r = await anDay(Q); if (r) return r; }
  if (players.length === 1 && !past && !has(/ (stats|averag\w*|points?|rebounds?|assists?|last \d+|games?|tonight|last night|yesterday|vs|against|career|season high|playoffs?) /)) { r = await anPlayerBio(players[0], Q); if (r) return r; }
  if (!past) { r = await anDraft(Q); if (r) return r; }
  if (!past) { r = await anLeagueBio(Q); if (r) return r; }
  if (teams.length === 1 && !players.length && !past) {
    const t = teams[0];
    if (has(/ (coach\w*|head coach|gm|general manager|front office|owner|president|runs the) /) && !has(/ (history|all time|ever|coach of the year) /)) { r = await anCoach(t, Q); if (r) return r; }
    if (has(/ (roster|players|lineup|line up|starters?|starting|start for|first five|depth chart|who plays for|who is on|who s on|plays? on|team members) /) && !has(/ (best|leading|top|most|leaders?|stats|averag\w*|injur\w*|draft\w*) /)) { r = await anRoster(t, Q); if (r) return r; }
    const ln = nn.match(/ (?:last|past|previous) (\d{1,2}|five|ten|three)(?: games?)? /);
    if (ln && !has(/ (points?|rebounds?|assists?|scor\w*|averag\w*) /)) return anLastN(t, { five: 5, ten: 10, three: 3 }[ln[1]] || +ln[1], Q);
    if (has(/ (channel|tv|televised|streaming|stream|watch|what time|tip ?off|tips? off|who do the|who does|who are the|playing (tonight|today|tomorrow)|play (tonight|today|tomorrow|on)|opponent|have a game|game (tonight|today|tomorrow)) /) && !has(/ (score|won|win|lost|beat|result|last night|yesterday|odds|spread|line) /)) return Q.f.aTeamNext(t);
  }
  if (teams.length === 2 && !players.length && !past && has(/ (when|next|play again|play each other|meet|face|rematch|schedule|what time|channel) /) && !has(/ (history|all time|record|last season|series|playoffs?|h2h|head to head) /)) return anMeet(teams[0], teams[1]);
  if (!past) { r = await anOdds(Q); if (r) return r; }
  if (!past) { r = await anTeamStats(Q); if (r) return r; }
  if (!past) { r = anAdv(Q); if (r) return r; }
  if (!past) { r = await anStandingsSuper(Q); if (r) return r; }
  return null;
}
