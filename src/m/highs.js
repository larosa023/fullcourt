/* ---------------- career highs ----------------
   ESPN doesn't publish career highs, so they're worked out from the player's game log, one season at a time.
   Finished seasons never change, so each one's summary is kept on this device; only the newest season is fetched again. */
const CH_STATS = [['pts', 'Points', 'PTS'], ['reb', 'Rebounds', 'REB'], ['ast', 'Assists', 'AST'], ['tpm', '3-pointers', '3PT'], ['stl', 'Steals', 'STL'], ['blk', 'Blocks', 'BLK']];
const CH_VER = 2, CH_FRESH = 2 * 3600e3, CH_KEEP = 120;

const chKey = id => lsKey(`fc-ch${CH_VER}:${id}`);
function chLoad(id) { try { return JSON.parse(lsGet(chKey(id)) || 'null'); } catch (e) { return null; } }
function chSave(id, c) {
  try { lsSet(chKey(id), JSON.stringify(c)); }
  catch (e) { chTrim(30); try { lsSet(chKey(id), JSON.stringify(c)); } catch (e2) {} }
  chTrim(CH_KEEP);
}
// keep the most recently viewed players only
function chTrim(keep) {
  try {
    const ks = Object.keys(localStorage).filter(k => k.includes(`fc-ch${CH_VER}:`));
    if (ks.length <= keep) return;
    ks.map(k => { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).seen || 0; } catch (e) {} return [k, t]; })
      .sort((a, b) => a[1] - b[1]).slice(0, ks.length - keep).forEach(([k]) => localStorage.removeItem(k));
  } catch (e) {}
}

// one season's game log → the best game for each stat (regular season and playoffs apart), plus milestone counts
function chSummarize(d) {
  const lab = d.labels || [];
  const out = {};
  for (const st of d.seasonTypes || []) {
    const nm = st.displayName || '';
    if (/preseason|play-?in|all-?star/i.test(nm)) continue;
    const type = !IS_C && /post|playoff/i.test(nm) ? 'post' : 'reg'; // college: tournament games count with the rest
    const T = out[type] = out[type] || { g: 0, best: {}, n: { p30: 0, p40: 0, p50: 0, dd: 0, td: 0 } };
    for (const c of st.categories || []) for (const e of c.events || []) {
      const m = d.events?.[e.eventId] || {};
      if ((LGK === 'nba' && +m.opponent?.id > 30) || /^(team |world$|usa|rising|all-?star)/i.test(m.opponent?.displayName || '')) continue;
      const v = k => e.stats?.[lab.indexOf(k)];
      if (!(+v('MIN') > 0) && !(+v('PTS') > 0)) continue;
      const s = { pts: +v('PTS') || 0, reb: +v('REB') || 0, ast: +v('AST') || 0, stl: +v('STL') || 0, blk: +v('BLK') || 0, tpm: +String(v('3PT') || '0').split('-')[0] || 0 };
      T.g++;
      const ten = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => s[k] >= 10).length;
      if (s.pts >= 30) T.n.p30++; if (s.pts >= 40) T.n.p40++; if (s.pts >= 50) T.n.p50++;
      if (ten >= 2) T.n.dd++; if (ten >= 3) T.n.td++;
      const game = { id: e.eventId, d: m.gameDate || '', o: m.opponent?.abbreviation || '', at: m.atVs || '', r: m.gameResult || '', sc: m.score || '' };
      for (const [k] of CH_STATS) {
        const b = T.best[k];
        if (!b || s[k] > b.v) T.best[k] = { v: s[k], n: 1, ...game };
        else if (s[k] === b.v) { b.n++; if (game.d > b.d) Object.assign(b, game); } // ties: show the latest, count the rest
      }
    }
  }
  return out;
}

async function chSeasons(id, cache) {
  // the newest season (no ?season=) also tells us which seasons exist
  const first = await getJSON(`${WEB}/athletes/${id}/gamelog`);
  const opts = (first.filters || []).find(f => f.name === 'season')?.options?.map(o => String(o.value)) || [];
  const cur = String(first.filters?.find(f => f.name === 'season')?.value || opts[0] || '');
  const seasons = { ...(cache?.seasons || {}) };
  if (cur) seasons[cur] = chSummarize(first);
  const todo = opts.filter(s => s !== cur && !seasons[s]);
  let i = 0, failed = 0;
  const worker = async () => {
    while (i < todo.length) {
      const s = todo[i++];
      try { seasons[s] = chSummarize(await getJSON(`${WEB}/athletes/${id}/gamelog?season=${s}`)); }
      catch (e) { failed++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { cur, seasons, t: Date.now(), complete: !failed };
}

function chCombine(c, type) {
  const best = {}, n = { p30: 0, p40: 0, p50: 0, dd: 0, td: 0 };
  let g = 0;
  for (const [season, S] of Object.entries(c.seasons)) {
    const T = S[type]; if (!T) continue;
    g += T.g; for (const k in n) n[k] += T.n[k] || 0;
    for (const [k] of CH_STATS) {
      const x = T.best[k], b = best[k]; if (!x) continue;
      if (!b || x.v > b.v) best[k] = { ...x, season };
      else if (x.v === b.v) { const tot = b.n + x.n; if (x.d > b.d) best[k] = { ...x, season }; best[k].n = tot; }
    }
  }
  return { g, best, n };
}

async function fillHighs(card, id) {
  const box = $('.career-in', card);
  // wait until the section is near the screen before fetching every season
  await new Promise(res => {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); res(); } }, { rootMargin: '400px 0px' });
    io.observe(card);
  });
  let c = chLoad(id);
  const draw0 = c => { if (c) chDraw(card, box, c); };
  if (c) draw0(c);
  if (!c || !c.complete || Date.now() - c.t > CH_FRESH) {
    try { c = await chSeasons(id, c); c.seen = Date.now(); chSave(id, c); }
    catch (e) { if (!c) { card._loaded = false; box.innerHTML = '<p class="car-none">Career highs didn\'t load. Close and reopen to try again.</p>'; } return; }
  } else { c.seen = Date.now(); chSave(id, c); }
  if (card.isConnected) chDraw(card, box, c);
}

function chDraw(card, box, c) {
  const types = [['reg', IS_C ? 'All games' : 'Regular season'], ['post', IS_C ? '' : 'Playoffs']].map(([k, l]) => [k, l, chCombine(c, k)]).filter(([, , d]) => d.g);
  if (!types.length) { box.innerHTML = '<p class="car-none">No games yet.</p>'; return; }
  if (!types.some(t => t[0] === box._chMode)) box._chMode = types[0][0];
  const curSeason = c.cur;
  const draw = () => {
    const mode = box._chMode;
    const [, , d] = types.find(t => t[0] === mode);
    const sub = $('.career-h small', card);
    if (sub) sub.textContent = `Best single games · ${plural(types[0][2].g, 'game')}${types[1] ? ` + ${plural(types[1][2].g, 'playoff game')}` : ''}`;
    const tile = ([k, label]) => {
      const b = d.best[k]; if (!b) return '';
      const when = b.d ? new Date(b.d).toLocaleDateString('en-US', { timeZone: UTZ, month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const recent = b.season === curSeason && b.v > 0;
      return `<button class="hx-t" ${b.id ? `data-game="${esc(b.id)}"` : ''} title="Open this game">
        <span class="hx-l">${label}${recent ? '<em>This season</em>' : ''}</span>
        <b class="num">${b.v}</b>
        ${b.v > 0 ? `<span class="hx-g">${esc(b.at === '@' ? '@' : 'vs')} ${b.o ? logo(b.o, 32) : ''}${esc(b.o)}</span>
        <span class="hx-r">${b.r ? `<span class="hx-wl ${b.r === 'W' ? 'strk-w' : 'strk-l'}">${esc(b.r)}</span> ${esc(b.sc)} · ` : ''}${esc(when)}</span>
        ${b.n > 1 ? `<small class="hx-n">${b.n - 1 === 1 ? '+1 other game' : `+${b.n - 1} other games`}</small>` : ''}` : '<span class="hx-g">—</span>'}
      </button>`;
    };
    const ms = [['p30', '30-point game'], ['p40', '40-point game'], ['p50', '50-point game'], ['dd', 'Double-double'], ['td', 'Triple-double']].filter(([k]) => d.n[k] > 0);
    box.innerHTML = `
      ${types.length > 1 ? `<div class="car-top"><div class="seg car-seg hx-seg"><span class="knob"></span>${types.map(([k, l]) => `<button data-chmode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>` : ''}
      <div class="hx-grid">${CH_STATS.map(tile).join('')}</div>
      ${ms.length ? `<div class="hx-ms">${ms.map(([k, l]) => `<span><b class="num">${d.n[k]}</b>${l}${d.n[k] === 1 ? '' : 's'}</span>`).join('')}</div>` : ''}
      ${c.complete ? '' : '<p class="hx-note">Some seasons didn\'t load, so these may be missing a game. Reopen to finish.</p>'}`;
    const seg = $('.hx-seg', box); if (seg) requestAnimationFrame(() => placeKnob(seg));
  };
  box._chRedraw = draw;
  if (!box._chWired) {
    box._chWired = true;
    box.addEventListener('click', e => { const m = e.target.closest('[data-chmode]'); if (m) { box._chMode = m.dataset.chmode; box._chRedraw(); } });
  }
  draw();
}
