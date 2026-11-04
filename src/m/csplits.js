/* College player splits, built from each season's game log: home/away, wins/losses, conference vs
   non-conference, against AP-ranked opponents (rank at the time of the game), month by month, and career highs. */

const CSP = new Map(); // player id -> { seasons, sel, logs: Map(year -> games) }
async function seasonsOf(id) {
  const d = await getJSON(`${WEB}/athletes/${id}/stats`).catch(() => null);
  const rows = d?.categories?.find(c => c.name === 'averages')?.statistics || [];
  const seen = new Map();
  for (const r of rows) if (r.season?.year && !seen.has(r.season.year)) seen.set(r.season.year, { year: r.season.year, label: r.season.displayName, teamId: String(r.teamId || '') });
  return [...seen.values()].sort((a, b) => b.year - a.year);
}
const cspSum = (gs, f) => gs.reduce((s, g) => s + f(g), 0);
function cspLine(gs) {
  const n = gs.length; if (!n) return null;
  const t = k => cspSum(gs, g => g[k]), fgm = cspSum(gs, g => g.fg[0]), fga = cspSum(gs, g => g.fg[1]), tpm = cspSum(gs, g => g.tp[0]), tpa = cspSum(gs, g => g.tp[1]), ftm = cspSum(gs, g => g.ft[0]), fta = cspSum(gs, g => g.ft[1]);
  const pg = k => (t(k) / n).toFixed(1), pct = (a, b) => b ? (a / b * 100).toFixed(1) : '–';
  const w = gs.filter(g => g.res === 'W').length;
  if (!advOn) return [n, `${w}-${n - w}`, pg('min'), pg('pts'), pg('reb'), pg('ast'), pg('stl'), pg('blk'), pct(fgm, fga), pct(tpm, tpa), pct(ftm, fta)];
  const min = t('min'), per = k => min ? (t(k) * 36 / min).toFixed(1) : '–';
  return [n, `${w}-${n - w}`, advPct(tsPct(t('pts'), fga, fta)), advPct(efgPct(fgm, tpm, fga)), fga ? advPct(tpa / fga) : '–', fga ? advPct(fta / fga) : '–', advNum(astTo(t('ast'), t('tov'))), per('pts'), per('reb'), per('ast')];
}
const cspCols = () => advOn ? ['GP', 'W-L', 'TS%', 'eFG%', '3PA rate', 'FT rate', 'AST/TO', 'PTS/36', 'REB/36', 'AST/36'] : ['GP', 'W-L', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%'];
const CSP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function drawCollegeSplits(card, id) {
  let st = CSP.get(id);
  if (!st) {
    card.innerHTML = `<div class="card-h"><h4>Splits</h4></div><div class="sk" style="height:180px;border-radius:12px"></div>`;
    const [seasons] = await Promise.all([seasonsOf(id), loadStandings().catch(() => null)]);
    st = { seasons, sel: seasons[0]?.year, logs: new Map() }; CSP.set(id, st);
  }
  if (!st.seasons.length) { card.remove(); return; }
  const cur = st.seasons.find(x => x.year === st.sel) || st.seasons[0];
  if (!st.logs.has(cur.year)) {
    const isNow = cur === st.seasons[0];
    st.logs.set(cur.year, await gameLog(id, isNow ? undefined : cur.year).catch(() => []));
  }
  if (!card.isConnected) return;
  const gs = (st.logs.get(cur.year) || []).filter(g => g.min > 0);
  const myConf = S.teams[cur.teamId]?.confId, confName = S.teams[cur.teamId]?.confShort || 'Conference';
  const oppConf = g => S.teams[g.oppId]?.confId;
  const rows = [
    ['All games', gs], ['Home & neutral', gs.filter(g => g.atVs !== '@')], ['Away', gs.filter(g => g.atVs === '@')],
    ['Wins', gs.filter(g => g.res === 'W')], ['Losses', gs.filter(g => g.res === 'L')],
    ...(myConf ? [[`${confName} games`, gs.filter(g => oppConf(g) === myConf)], ['Non-conference', gs.filter(g => oppConf(g) && oppConf(g) !== myConf)]] : []),
    ['vs AP Top 25', gs.filter(g => g.oppRank && g.oppRank <= 25)],
  ];
  const months = []; for (const g of [...gs].reverse()) { const m = new Date(g.date).getMonth(), k = CSP_MONTHS[m]; if (!months.includes(k)) months.push(k); }
  const monthRows = months.map(k => [k, gs.filter(g => CSP_MONTHS[new Date(g.date).getMonth()] === k)]);
  const cols = cspCols();
  const tr = ([name, list], sub) => { const v = cspLine(list); return v ? `<tr${sub ? ' class="csp-sub"' : ''}><td><b>${esc(name)}</b></td>${v.map(x => `<td>${esc(x)}</td>`).join('')}</tr>` : ''; };
  const chips = st.seasons.length > 1 ? `<div class="chips csp-yrs">${st.seasons.map(x => `<button class="chip sm" data-cspy="${x.year}" aria-pressed="${x.year === cur.year}">${esc(x.label)}${S.teams[x.teamId] && x.teamId !== st.seasons[0].teamId ? ` · ${esc(S.teams[x.teamId].abbr)}` : ''}</button>`).join('')}</div>` : '';
  card.innerHTML = `<div class="card-h"><h4>Splits</h4>${advBtn()}</div>${chips}
    ${advOn ? '<p class="adv-note">TS% true shooting · eFG% effective FG · 3PA and FT rate per shot · per 36 minutes</p>' : ''}
    ${gs.length ? `<div class="box-wrap drag-x" data-drag><table class="split-tbl csp-tbl"><thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => tr(r)).join('')}${monthRows.length > 1 ? `<tr class="csp-h"><td colspan="${cols.length + 1}">By month</td></tr>${monthRows.map(r => tr(r, true)).join('')}` : ''}</tbody></table></div>
      <p class="csp-note">vs AP Top 25 uses each opponent's ranking on the day of the game.</p>` : '<p class="csp-note">No games yet this season.</p>'}
    <div class="csp-highs"><div class="csp-hh"><b>Career highs</b><span>${esc(st.seasons.length > 1 ? `${st.seasons.at(-1).label} to now` : cur.label)}</span></div><div class="csp-hg"><div class="sk" style="height:58px;border-radius:12px"></div></div></div>`;
  wireDrag(card);
  card.onclick = e => { const b = e.target.closest('[data-cspy]'); if (b) { e.stopPropagation(); st.sel = +b.dataset.cspy; drawCollegeSplits(card, id); } };
  if (!card._adv) { card._adv = () => { if (!card.isConnected) { document.removeEventListener('fcadv', card._adv); return; } drawCollegeSplits(card, id); }; document.addEventListener('fcadv', card._adv); }
  // career highs across every college season
  const all = (await Promise.all(st.seasons.map(async (x, i) => { if (!st.logs.has(x.year)) st.logs.set(x.year, await gameLog(id, i === 0 ? undefined : x.year).catch(() => [])); return st.logs.get(x.year); }))).flat().filter(g => g.min > 0);
  const hg = $('.csp-hg', card); if (!hg || !card.isConnected) return;
  const best = (k, f = g => g[k]) => all.reduce((b, g) => (f(g) > (b ? f(b) : -1) ? g : b), null);
  const H = [['Points', 'pts'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['3-pointers', 'tpm', g => g.tp[0]], ['Steals', 'stl'], ['Blocks', 'blk']].map(([l, k, f]) => { const g = best(k, f); return g ? { l, v: f ? f(g) : g[k], g } : null; }).filter(x => x && x.v > 0);
  hg.innerHTML = H.map(h => `<button class="csp-hi" data-game="${esc(h.g.id)}"><span>${esc(h.l)}</span><b>${h.v}</b><small>${esc(h.g.atVs === '@' ? '@' : 'vs')} ${esc(h.g.opp)}${h.g.oppRank && h.g.oppRank <= 25 ? ` <i>#${h.g.oppRank}</i>` : ''} · ${esc(fmtShortDate(h.g.date))}, ${new Date(h.g.date).getFullYear()}</small></button>`).join('') || '<p class="csp-note">No games yet.</p>';
}
