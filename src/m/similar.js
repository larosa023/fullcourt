/* ---------------- player page: similar players ----------------
   "Who's most like him?" Each season since 1946-47 is described by 13 numbers (scoring, rebounding, passing, steals,
   blocks, turnovers, shooting efficiency, how often he shoots threes and gets to the line, usage, box plus-minus,
   Win Shares per 48 and minutes), each measured against that season's league, so a 1965 season and a 2020 one can be
   compared. Pick one of his seasons or his whole career; the closest seasons (or careers) in history come back, one per
   player, with a side-by-side view. Built weekly on GitHub by tools/careers.mjs from the era data. */
const SM_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt';
const SM_FEAT = [['pts', 'Scoring', 1.6], ['trb', 'Rebounding', 1.3], ['ast', 'Passing', 1.3], ['stl36', 'Steals', .6], ['blk36', 'Blocks', .7], ['tov36', 'Turnovers', .4], ['ts', 'Shooting efficiency (TS%)', .8], ['tpar', 'How often he shoots threes', .9], ['ftr', 'Getting to the line', .5], ['usg', 'Usage', .8], ['bpm', 'Box plus-minus', .9], ['ws48', 'Win Shares per 48', .6], ['mp', 'Minutes', .5]];
let SM_VEC = null; const smMemo = new Map();
const smJSON = (path, hours) => {
  if (smMemo.has(path)) return smMemo.get(path);
  const p = (async () => {
    const url = `${SM_RAW}/${path}?t=${Math.floor(Date.now() / (hours * 36e5))}`, key = `${location.origin}/__fc-sm/${encodeURIComponent(path)}`;
    try { if (self.caches) { const c = await caches.open('fc-keep-sm-v1'), hit = await c.match(key); if (hit && Date.now() - (+hit.headers.get('x-t') || 0) < hours * 36e5) return await hit.json(); const r = await fetch(url); if (!r.ok) throw new Error(r.status); const t = await r.text(); c.put(key, new Response(t, { headers: { 'content-type': 'application/json', 'x-t': String(Date.now()) } })).catch(() => {}); return JSON.parse(t); } } catch (e) { if (/^\d+$/.test(e.message)) throw e; }
    const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json();
  })();
  p.catch(() => smMemo.delete(path)); smMemo.set(path, p); return p;
};
const smYear = y => `${y - 1}-${String(y).slice(2)}`;
const smFold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').replace(/[^a-z ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

// the data, read once: rows by player, and each player's career (the average of his qualified seasons)
async function smData() {
  if (SM_VEC) return SM_VEC;
  const d = await smJSON('careers-data/vec.json', 24);
  const zf = d.zFrom, C = {}; d.cols.forEach((k, i) => { if (!(k in C)) C[k] = i; }); const fi = SM_FEAT.map(([k]) => d.cols.indexOf(k, zf));
  const rows = d.rows.map(r => ({ p: r[0], y: r[1], age: r[2], pos: r[3], tm: r[4], ppg: r[C.ppg], rpg: r[C.rpg], apg: r[C.apg], ts: r[C.ts], z: fi.map(i => r[i]) }));
  const byP = new Map(); for (const r of rows) (byP.get(r.p) || byP.set(r.p, []).get(r.p)).push(r);
  const careers = new Map();
  for (const [p, rs] of byP) {
    const z = SM_FEAT.map((_, j) => { const v = rs.map(r => r.z[j]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    const avg = k => rs.reduce((a, r) => a + (r[k] || 0), 0) / rs.length;
    careers.set(p, { p, y: rs[0].y, y1: rs.at(-1).y, n: rs.length, pos: rs.reduce((a, r) => a + r.pos, 0) / rs.length, tm: [...new Set(rs.map(r => String(r.tm).split('/')[0]))].join(', '), ppg: avg('ppg'), rpg: avg('rpg'), apg: avg('apg'), ts: avg('ts'), z });
  }
  const byBr = new Map(d.names.map((n, i) => [n[0], i]));
  return SM_VEC = { names: d.names, rows, byP, careers, byBr };
}
// distance between two players' numbers: weighted, over the numbers both have (older seasons lack some), with a
// small penalty for each number one of them is missing and for playing a different position
function smDist(a, b) {
  let s = 0, w = 0, miss = 0, all = 0;
  SM_FEAT.forEach(([, , wt], j) => { all += wt; const x = a.z[j], y = b.z[j]; if (x == null || y == null) { miss += wt; return; } s += wt * ((x - y) / 10) ** 2; w += wt; });
  if (!w) return 99;
  return Math.sqrt(s / w * all) * (1 + 0.15 * miss / all) + Math.abs(a.pos - b.pos) * 0.35;
}
const smScore = d => Math.max(0, Math.min(99, Math.round(100 - 16 * d)));

async function smBr(id, name, D) {
  const ids = await smJSON('careers-data/ids.json', 24).catch(() => null);
  if (ids?.espn?.[id] && D.byBr.has(ids.espn[id])) return ids.espn[id];
  const f = smFold(name), hits = D.names.filter(n => smFold(n[1]) === f).sort((a, b) => (b[4] || 0) - (a[4] || 0));
  return hits[0]?.[0] || null;
}

async function fillSimilar(car, id) {
  const box = $('.career-in', car), name = car.dataset.name || '';
  let D, br;
  try { D = await smData(); br = await smBr(id, name, D); }
  catch (e) { car._loaded = false; box.innerHTML = '<p class="car-none">Similar players didn\'t load. Close and reopen to try again.</p>'; return; }
  const me = br != null ? D.byBr.get(br) : null, mine = me != null ? D.byP.get(me) || [] : [];
  if (!mine.length) { box.innerHTML = '<p class="car-none">Not enough minutes on record yet to compare him (a season needs 20 games at 12+ minutes; this season, 5).</p>'; return; }
  let pick = lsGet('fc-sim-pick') === 'season' ? String(mine.reduce((a, r) => (r.z[10] ?? -99) > (a.z[10] ?? -99) ? r : a).y) : 'career', era = lsGet('fc-sim-era') || 'all';
  const draw = () => {
    const target = pick === 'career' ? D.careers.get(me) : mine.find(r => String(r.y) === pick) || D.careers.get(me);
    let list;
    if (pick === 'career') {
      list = [...D.careers.values()].filter(c => c.p !== me && c.n >= Math.min(3, mine.length) && (era === 'all' || c.y >= 1980)).map(c => ({ c, d: smDist(target, c) }));
    } else {
      const best = new Map();
      for (const r of D.rows) { if (r.p === me || (era !== 'all' && r.y < 1980)) continue; const d = smDist(target, r), b = best.get(r.p); if (!b || d < b.d) best.set(r.p, { c: r, d }); }
      list = [...best.values()];
    }
    list.sort((a, b) => a.d - b.d); list = list.slice(0, 10);
    const nm = p => D.names[p];
    const line = c => `${c.ppg?.toFixed(1)} pts · ${c.rpg?.toFixed(1)} reb · ${c.apg?.toFixed(1)} ast${c.ts ? ` · ${(c.ts * 100).toFixed(0)}% TS` : ''}`;
    const when = c => pick === 'career' ? `${smYear(c.y)} to ${smYear(c.y1)} · ${c.n} season${c.n === 1 ? '' : 's'}` : `${smYear(c.y)} · ${esc(c.tm)} · age ${c.age}`;
    box.innerHTML = `<div class="sm-wrap">
      <div class="sm-ctl">
        <label class="sm-pick"><span>Compare</span><select class="sm-sel" data-smpick aria-label="Which of his seasons"><option value="career"${pick === 'career' ? ' selected' : ''}>His whole career</option>${mine.slice().reverse().map(r => `<option value="${r.y}"${String(r.y) === pick ? ' selected' : ''}>${smYear(r.y)} · ${esc(r.tm)} · ${r.ppg?.toFixed(1)} pts</option>`).join('')}</select></label>
        <button class="icon-btn sm-share" data-smshare aria-label="${smShareLabel()}" title="${smShareLabel()}">${SHARE_ICON}</button>
        <div class="seg sm" data-smera><span class="knob"></span><button data-smera="all" aria-pressed="${era === 'all'}">All eras</button><button data-smera="1980" aria-pressed="${era !== 'all'}">Since 1980</button></div>
      </div>
      <div class="sm-me"><b>${esc(name)}</b><span>${when(target)}</span><span>${line(target)}</span></div>
      <ol class="sm-list">${list.map(({ c, d }, i) => { const n = nm(c.p), e = n[2];
        return `<li><button class="sm-r" data-smi="${i}"><span class="sm-n">${i + 1}</span>${face(e, n[1], 'sm-f', 80)}<span class="sm-t"><b>${esc(n[1])}</b><small>${when(c)}</small><small>${line(c)}</small></span><span class="sm-s" title="How close, out of 100"><b>${smScore(d)}</b><small>match</small></span></button></li>`; }).join('')}</ol>
      <p class="sm-note">Each season is measured against its own league (so eras compare fairly) on 13 numbers: scoring, rebounding, passing, steals, blocks, turnovers, shooting efficiency, three-point and free-throw rates, usage, box plus-minus, Win Shares per 48 and minutes. A season counts with 20+ games at 12+ minutes. Tap a player for a side by side. From Basketball-Reference, updated weekly.</p>
    </div>`;
    $$('.seg', box).forEach(placeKnob);
    box._list = list; box._target = target;
  };
  box.addEventListener('click', e => {
    const er = e.target.closest('button[data-smera]'); if (er) { e.stopPropagation(); era = er.dataset.smera; lsSet('fc-sim-era', era === 'all' ? null : era); draw(); return; }
    const sh = e.target.closest('[data-smshare]');
    if (sh) { e.stopPropagation(); const L = box._list || [], t = box._target, wh = c => pick === 'career' ? `${smYear(c.y)} to ${smYear(c.y1)}` : `${smYear(c.y)} · ${c.tm}`;
      runShare(() => lazy('share').then(m => m.shareSimilar({ name, espn: id, what: pick === 'career' ? `Whole career · ${wh(t)}${era !== 'all' ? ' · since 1980' : ''}` : `${wh(t)} season${era !== 'all' ? ' · since 1980' : ''}`,
        matches: L.slice(0, 6).map(({ c, d }) => { const n = D.names[c.p]; return { name: n[1], espn: n[2], when: wh(c), line: `${c.ppg?.toFixed(1)} PTS · ${c.rpg?.toFixed(1)} REB · ${c.apg?.toFixed(1)} AST`, score: smScore(d) }; }) })), sh); return; }
    const r = e.target.closest('[data-smi]'); if (r) { e.stopPropagation(); const x = box._list[+r.dataset.smi]; smSide(D, me, box._target, x.c, x.d, pick === 'career', name); }
  });
  box.addEventListener('change', e => { if (e.target.matches('[data-smpick]')) { pick = e.target.value; lsSet('fc-sim-pick', pick === 'career' ? null : 'season'); draw(); } });
  draw();
}

// side by side: the two seasons (or careers), number by number, each against its league
function smSide(D, me, a, b, d, career, myName) {
  const na = D.names[me], nb = D.names[b.p], title = `${myName || na[1]} and ${nb[1]}`;
  const sheet = openSheet(title);
  const lab = (c, n) => career ? `${esc(n[1])}<small>${smYear(c.y)} to ${smYear(c.y1)}</small>` : `${esc(n[1])}<small>${smYear(c.y)} · ${esc(c.tm)}</small>`;
  const bar = z => z == null ? '<i class="na"></i>' : `<i style="--w:${Math.min(50, Math.abs(z) / 30 * 50)}%;--l:${z >= 0 ? 50 : 50 - Math.min(50, Math.abs(z) / 30 * 50)}%" class="${z >= 0 ? 'up' : 'dn'}"></i>`;
  const sd = z => z == null ? '–' : `${z > 0 ? '+' : ''}${(z / 10).toFixed(1)}`;
  const rows = SM_FEAT.map(([k, l], j) => {
    const za = a.z[j], zb = b.z[j], close = za != null && zb != null && Math.abs(za - zb) <= 4;
    return `<tr class="${close ? 'close' : ''}"><th>${esc(l)}</th><td class="sm-v">${sd(za)}</td><td class="sm-b">${bar(za)}</td><td class="sm-b">${bar(zb)}</td><td class="sm-v">${sd(zb)}</td></tr>`;
  }).join('');
  const per = c => [['Points', c.ppg?.toFixed(1)], ['Rebounds', c.rpg?.toFixed(1)], ['Assists', c.apg?.toFixed(1)], ['True shooting', c.ts ? (c.ts * 100).toFixed(1) + '%' : '–']];
  const pa = per(a), pb = per(b);
  sheet.body.innerHTML = `<div class="sm-side">
    <div class="sm-hd"><div>${face(na[2], na[1], 'sm-hf', 160)}<b>${lab(a, na)}</b></div><div class="sm-big"><b>${smScore(d)}</b><small>match</small></div><div>${face(nb[2], nb[1], 'sm-hf', 160)}<b>${lab(b, nb)}</b></div></div>
    <table class="sm-pg"><tbody>${pa.map(([l, v], i) => `<tr><td>${v ?? '–'}</td><th>${l}${i < 3 ? ' a game' : ''}</th><td>${pb[i][1] ?? '–'}</td></tr>`).join('')}</tbody></table>
    <h4 class="sm-h4">Against his league that year</h4>
    <table class="sm-z"><thead><tr><th></th><th colspan="2">${esc(na[1])}</th><th colspan="2">${esc(nb[1])}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="sm-note">Numbers are how far above or below that season's average player he was, in standard deviations (+1.0 is well above average, +2.0 among the league's best). Rows in bold are where the two are closest.${career ? ' Careers are the average of each player\'s seasons.' : ''}</p>
    <div class="btn-row">${na[2] ? `<button class="btn ghost" data-player="${na[2]}">${esc(na[1])}'s page</button>` : ''}${nb[2] ? `<button class="btn" data-player="${nb[2]}">${esc(nb[1])}'s page</button>` : ''}</div>
  </div>`;
}

const smShareLabel = () => (!isTouch && navigator.clipboard?.write && 'ClipboardItem' in window) ? 'Copy as image' : 'Share as image';
