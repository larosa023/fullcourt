/* Mock Draft (NBA and WNBA). draft.json is built daily on GitHub (tools/draft.mjs, branch draft-data): the draft
   order from the standings, each team's needs, and the prospect board (Fullcourt's, from college stats, until ESPN
   publishes its own). Fullcourt fills every pick (best player available, nudged toward what the team needs); any pick
   you change stays yours, and the picks after it re-flow around it. Your picks and lottery result are kept per browser. */

const DRAFT_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/draft-data/draft.json';
const DRAFT_LS = 'fc-draftdata';
let draftP = null;
function loadDraft() {
  if (draftP) return draftP;
  let c = null; try { c = JSON.parse(localStorage.getItem(DRAFT_LS) || 'null'); } catch (e) {}
  const fresh = () => fetch(`${DRAFT_URL}?t=${Math.floor(Date.now() / 3600e3)}`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => { try { localStorage.setItem(DRAFT_LS, JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; });
  if (c?.d && Date.now() - c.at < 6 * 3600e3) draftP = Promise.resolve(c.d);
  else draftP = fresh().catch(e => { draftP = null; if (c?.d) return c.d; throw e; });
  return draftP;
}
const DCOL = { nba: 'mens-college-basketball', wnba: 'womens-college-basketball' };
const DWEB = lg => `https://site.web.api.espn.com/apis/common/v3/sports/basketball/${DCOL[lg]}`;
const dHead = (lg, id, w = 200) => CDN(`/i/headshots/${DCOL[lg]}/players/full/${id}.png`, w, Math.round(w * 254 / 350));
const dSchool = (tid, s = 40) => tid ? `<img class="dr-sch" src="${CDN(`/i/teamlogos/ncaa/500/${tid}.png`, imgBucket(s), imgBucket(s))}" alt="" loading="lazy" draggable="false" onerror="this.remove()">` : '';
function dFace(lg, p, cls, w) {
  const mono = `<div class="${cls} dr-mono"${p.color ? ` style="--mc:#${p.color}"` : ''}><span>${esc(initials(p.name))}</span></div>`;
  if (!p.head) return mono;
  return `<img class="${cls}" src="${dHead(lg, p.id, w)}" alt="${esc(p.name)}" loading="lazy" draggable="false" onerror="this.outerHTML=this.dataset.fb" data-fb="${mono.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
}
const dPct = v => v == null ? '–' : (v * 100).toFixed(0) + '%';
const d1 = v => v == null ? '–' : (+v).toFixed(1);
const TAG_NAME = { shooter: 'Shooter', playmaker: 'Playmaker', rebounder: 'Rebounder', rim: 'Rim protector', defender: 'Disruptor' };
const NEED_TAG = { Shooting: 'shooter', Rebounding: 'rebounder', Playmaking: 'playmaker', 'Rim protection': 'rim', Defense: 'defender', 'Ball security': 'playmaker' };
const NEED_POS = { 'Guard depth': 'G', 'Wing depth': 'F', 'Big depth': 'C' };
const fits = (need, p) => NEED_TAG[need] ? (p.tags || []).includes(NEED_TAG[need]) : NEED_POS[need] ? String(p.pos || '').includes(NEED_POS[need]) : false;
const DS = { round: 1, q: '', pos: 'all' };
const dKey = (lg, y) => `fc-mock:${lg}:${y}`;
function dSaved(lg, y) { try { return JSON.parse(localStorage.getItem(dKey(lg, y)) || 'null') || { locks: {}, lot: null }; } catch (e) { return { locks: {}, lot: null }; } }
function dSave(lg, y, st) { try { localStorage.setItem(dKey(lg, y), JSON.stringify(st)); } catch (e) {} }

// the order after the lottery (if one's been run): the drawn teams take picks 1-4, the rest of the lottery keeps its order
function dOrder(L, lot) {
  const o = L.order.map(x => ({ ...x }));
  if (!lot) return o;
  const lotSet = new Set(L.lottery), r1 = o.filter(x => x.round === 1);
  const rest = L.lottery.filter(a => !lot.includes(a));
  [...lot, ...rest].forEach((a, i) => { r1[i].team = a; });
  void lotSet; return o;
}
// fill every pick: yours first where you've set one, otherwise the best player left, nudged toward the team's needs
function dFill(L, st) {
  const order = dOrder(L, st.lot), taken = new Set(Object.values(st.locks)), byId = Object.fromEntries(L.prospects.map(p => [p.id, p]));
  let avail = L.prospects.filter(p => !taken.has(p.id));
  return order.map(x => {
    const lockId = st.locks[x.pick];
    if (lockId && byId[lockId]) return { ...x, p: byId[lockId], mine: true };
    const need = L.needs[x.team] || [];
    const cand = avail.slice(0, 6).map((p, i) => ({ p, v: p.score + need.filter(n => fits(n, p)).length * 1.1 - i * .2 }));
    const best = cand.sort((a, b) => b.v - a.v)[0]?.p;
    if (best) avail = avail.filter(p => p !== best);
    return { ...x, p: best || null, mine: false };
  });
}
function runLottery(L) {
  const teams = L.lottery.slice(), w = L.odds.slice(0, teams.length), drawn = [];
  for (let k = 0; k < Math.min(4, teams.length); k++) {
    const tot = teams.reduce((s, t, i) => s + (drawn.includes(t) ? 0 : w[i]), 0);
    let r = Math.random() * tot;
    for (let i = 0; i < teams.length; i++) { if (drawn.includes(teams[i])) continue; r -= w[i]; if (r <= 0) { drawn.push(teams[i]); break; } }
  }
  return drawn;
}

async function renderDraft() {
  const root = $('#draftBody'); if (!root) return;
  if (!root._wired) { root._wired = true; wireDraft(root); }
  const lg = LGK === 'wnba' ? 'wnba' : LGK === 'nba' ? 'nba' : null;
  if (!lg) { root.innerHTML = `<div class="empty"><b>Mock drafts are for the NBA and WNBA</b><span>College players are the prospects. Pick a league to see its mock draft.</span><div class="dr-pick2"><button class="btn" data-lg="nba">NBA mock draft</button><button class="btn ghost" data-lg="wnba">WNBA mock draft</button></div></div>`; return; }
  if (!root.querySelector('.dr-wrap')) root.innerHTML = '<div class="sk" style="height:520px;border-radius:16px"></div>';
  let D; try { D = await loadDraft(); } catch (e) { root.innerHTML = `<div class="empty"><b>The mock draft didn't load</b><button class="btn" data-dretry>Try again</button></div>`; return; }
  const L = D[lg]; if (!L) { root.innerHTML = '<div class="empty"><b>No mock draft yet</b></div>'; return; }
  const st = dSaved(lg, L.year), picks = dFill(L, st);
  const rounds = [...new Set(L.order.map(x => x.round))], round = Math.min(DS.round, rounds.length);
  const tn = a => L.teams[a] || { short: a, name: a, w: 0, l: 0 };
  const lotIdx = a => L.lottery.indexOf(a);
  const pickOf = Object.fromEntries(picks.filter(x => x.p).map(x => [x.p.id, x]));
  const mine = Object.keys(st.locks).length;
  const srcNote = L.source === 'espn' ? 'Prospect rankings: ESPN\'s big board' : `Prospect rankings: Fullcourt's board from college stats${lg === 'wnba' ? ' (seniors and grad students, the draft-eligible)' : ''}. Early in the season it moves a lot; it switches to ESPN's big board once ESPN publishes one.`;
  const orderNote = lg === 'nba' ? `Order from this season's standings (${L.lottery.length} lottery teams). Traded picks aren't shown.` : `Order from the ${L.standingsSeason} final standings (${L.lottery.length} lottery teams). Traded picks aren't shown.`;
  const lotNote = st.lot ? (() => { const moves = st.lot.map((a, i) => ({ a, from: lotIdx(a) + 1, to: i + 1 })).filter(m => m.from !== m.to); return `<div class="dr-lot"><b>Lottery result</b>${moves.length ? moves.map(m => `<span>${logo(m.a, 40)}${esc(tn(m.a).short)} <em class="${m.to < m.from ? 'up' : 'dn'}">${m.from} → ${m.to}</em></span>`).join('') : '<span>Chalk: the top four held their spots.</span>'}<button class="link-btn" data-dlot="undo">Back to standings order</button></div>`; })() : '';
  const row = x => {
    const t = tn(x.team), p = x.p, need = L.needs[x.team] || [], li = lotIdx(x.team);
    const od = x.round === 1 && li >= 0 && L.odds[li] && !st.lot ? `<span class="dr-odds" title="Chance at the #1 pick">${(L.odds[li] / 10).toFixed(1)}% at #1</span>` : '';
    return `<div class="dr-row${x.mine ? ' mine' : ''}" style="--tc:${t.color ? '#' + t.color : teamColor(x.team)}">
      <span class="dr-no">${x.pick}</span>
      <div class="dr-tm">${logo(x.team, 64)}<span><b>${esc(t.short || t.name)}</b><small>${t.w}-${t.l}${od ? ' · ' : ''}${od}</small><span class="dr-needs">${need.map(n => `<i class="${p && fits(n, p) ? 'hit' : ''}">${esc(n)}</i>`).join('')}</span></span></div>
      ${p ? `<button class="dr-pl" data-dpro="${esc(p.id)}">${dFace(lg, p, 'dr-pf', 200)}<span><b>${esc(p.name)}</b><small>${esc([p.pos, p.ht, p.cls].filter(Boolean).join(' · '))}</small><small class="dr-schl">${dSchool(p.tid, 32)}${esc(p.school || '')}</small></span><span class="dr-ln"><span><strong>${d1(p.pts)}</strong>PTS</span><span><strong>${d1(p.reb)}</strong>REB</span><span><strong>${d1(p.ast)}</strong>AST</span><span><strong>${p.tpa >= .5 ? dPct(p.tp) : '–'}</strong>3P</span></span></button>` : '<span class="dr-pl empty">–</span>'}
      <div class="dr-act">${x.mine ? `<span class="dr-mine">Your pick</span><button class="icon-btn dr-unl" data-dunlock="${x.pick}" aria-label="Let Fullcourt pick" title="Let Fullcourt pick">${ICON.close}</button>` : ''}<button class="btn ghost dr-chg" data-dchange="${x.pick}">Change</button></div>
    </div>`;
  };
  const board = L.prospects.filter(p => (DS.pos === 'all' || String(p.pos).includes(DS.pos)) && (!DS.q || p.name.toLowerCase().includes(DS.q.toLowerCase()) || String(p.school).toLowerCase().includes(DS.q.toLowerCase())));
  root.innerHTML = `<div class="dr-wrap">
    <div class="dr-head">
      <div class="seg dr-lg"><span class="knob"></span><button data-lg="nba" aria-pressed="${lg === 'nba'}">NBA</button><button data-lg="wnba" aria-pressed="${lg === 'wnba'}">WNBA</button></div>
      <div class="dr-acts">
        <button class="btn" data-dlot="run">${st.lot ? 'Run the lottery again' : 'Run the lottery'}</button>
        ${mine || st.lot ? `<button class="btn ghost" data-dreset>Reset${mine ? ` (${mine} pick${mine === 1 ? '' : 's'})` : ''}</button>` : ''}
        <button class="btn ghost dr-share" data-dshare aria-label="Share as an image">${SHARE_ICON}Share</button>
      </div>
    </div>
    <p class="dr-meta">${esc(L.year)} ${lg.toUpperCase()} Draft · ${esc(orderNote)} Updated ${esc(new Date(D.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}.</p>
    ${lotNote}
    <div class="dr-grid">
      <section class="dr-board">
        <div class="seg dr-rd"><span class="knob"></span>${rounds.map(r => `<button data-dround="${r}" aria-pressed="${r === round}">Round ${r}</button>`).join('')}</div>
        <div class="dr-list">${picks.filter(x => x.round === round).map(row).join('')}</div>
        <p class="hy-src dr-src">${esc(srcNote)} Fullcourt takes the best player left, leaning toward what each team needs. Change any pick and the rest re-flow around it.</p>
      </section>
      <aside class="dr-big">
        <div class="dr-bh"><h3>Big board</h3><span>${L.source === 'espn' ? 'ESPN' : 'Fullcourt'}</span></div>
        <input class="hy-q dr-q" type="search" data-dq placeholder="Search prospects or schools" value="${esc(DS.q)}" aria-label="Search prospects">
        <div class="chips dr-pos">${[['all', 'All'], ['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']].map(([k, t]) => `<button class="chip" data-dpos="${k}" aria-pressed="${DS.pos === k}">${t}</button>`).join('')}</div>
        <ol class="dr-bl">${board.map(p => { const pk = pickOf[p.id]; return `<li><button class="dr-bi${pk ? ' gone' : ''}" data-dpro="${esc(p.id)}"><span class="dr-rk">${p.rk}</span>${dFace(lg, p, 'dr-bf', 80)}<span class="dr-bn"><b>${esc(p.name)}</b><small>${esc([p.pos, p.school].filter(Boolean).join(' · '))}</small></span>${pk ? `<em>#${pk.pick} ${esc(pk.team)}</em>` : ''}</button></li>`; }).join('') || '<li class="hy-note">No prospects match.</li>'}</ol>
      </aside>
    </div></div>`;
  $$('.seg', root).forEach(s => requestAnimationFrame(() => placeKnob(s)));
}

function dPicker(lg, L, pickNo) {
  const st = dSaved(lg, L.year), picks = dFill(L, st), x = picks.find(y => y.pick === pickNo), t = L.teams[x.team] || {};
  const taken = new Map(picks.filter(y => y.p && y.pick < pickNo).map(y => [y.p.id, y.pick]));
  const need = L.needs[x.team] || [];
  const sheet = openSheet(`Pick ${pickNo}: ${t.short || x.team}`); sheet.el.classList.add('dr-sheet');
  const draw = q => {
    const list = L.prospects.filter(p => !taken.has(p.id) && (!q || p.name.toLowerCase().includes(q) || String(p.school).toLowerCase().includes(q)));
    $('.dr-plist', sheet.body).innerHTML = list.slice(0, 80).map(p => { const hit = need.filter(n => fits(n, p)); return `<button class="dr-opt${x.p?.id === p.id ? ' cur' : ''}" data-dset="${esc(p.id)}"><span class="dr-rk">${p.rk}</span>${dFace(lg, p, 'dr-bf', 80)}<span class="dr-bn"><b>${esc(p.name)}</b><small>${esc([p.pos, p.ht, p.cls, p.school].filter(Boolean).join(' · '))}</small>${hit.length ? `<span class="dr-needs">${hit.map(n => `<i class="hit">${esc(n)}</i>`).join('')}</span>` : ''}</span><span class="dr-ln"><span><strong>${d1(p.pts)}</strong>PTS</span><span><strong>${d1(p.reb)}</strong>REB</span><span><strong>${d1(p.ast)}</strong>AST</span></span></button>`; }).join('') || '<p class="hy-note">No one left matches.</p>';
  };
  sheet.body.innerHTML = `<p class="dr-meta">${logo(x.team, 40)} ${esc(t.name || x.team)}${need.length ? ` need${need.length === 1 ? 's' : ''}: <b>${esc(need.join(', '))}</b>` : ''}. Players already taken before this pick aren't listed.</p>
    <input class="hy-q dr-q" type="search" placeholder="Search prospects or schools" aria-label="Search prospects"><div class="dr-plist"></div>`;
  draw('');
  $('.dr-q', sheet.body).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  sheet.body.addEventListener('click', e => {
    const b = e.target.closest('[data-dset]'); if (!b) return;
    const s = dSaved(lg, L.year);
    for (const [k, v] of Object.entries(s.locks)) if (v === b.dataset.dset) delete s.locks[k]; // a player can only go once
    s.locks[pickNo] = b.dataset.dset; dSave(lg, L.year, s);
    closeTop(); renderDraft();
  });
}

async function dProfile(lg, L, id) {
  const p = L.prospects.find(x => x.id === id) || { id, name: 'Prospect', tags: [] };
  const sheet = openSheet(p.name); sheet.el.classList.add('dr-sheet');
  sheet.body.innerHTML = '<div class="sk" style="height:420px;border-radius:16px"></div>';
  const [a, s] = await Promise.all([getJSON(`${DWEB(lg)}/athletes/${id}`).catch(() => null), getJSON(`${DWEB(lg)}/athletes/${id}/stats`).catch(() => null)]);
  const A = a?.athlete || {};
  const cat = s?.categories?.find(c => c.name === 'averages') || s?.categories?.[0], lab = cat?.labels || [];
  const col = k => lab.indexOf(k);
  const want = ['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%'].filter(k => col(k) >= 0);
  const pk = dFill(L, dSaved(lg, L.year)).find(x => x.p?.id === id);
  const tc = A.team?.color ? '#' + A.team.color : p.color ? '#' + p.color : 'var(--accent)';
  sheet.body.innerHTML = `<div class="hy-hero dr-hero" style="--tc:${tc}">${dFace(lg, { ...p, head: p.head ?? true }, 'hy-hf', 400)}<div>
      <span class="eyebrow">${esc([A.position?.displayName || p.pos, A.displayHeight || p.ht, A.displayWeight || p.wt].filter(Boolean).join(' · '))}</span>
      <h2>${esc(A.displayName || p.name)}</h2>
      <p class="dr-schl">${dSchool(p.tid || A.team?.id, 40)}${esc(A.team?.displayName || p.school || '')}${p.conf ? ` · ${esc(p.conf)}` : ''}</p>
      <p>${esc([A.displayExperience || p.cls, A.age ? `${A.age} years old` : '', A.displayBirthPlace ? `from ${A.displayBirthPlace}` : ''].filter(Boolean).join(' · '))}</p></div></div>
    <div class="hy-big">${[['PTS', p.pts], ['REB', p.reb], ['AST', p.ast], ['STL', p.stl], ['BLK', p.blk]].map(([l, v]) => `<div><b>${d1(v)}</b><span>${l}</span></div>`).join('')}<div><b>${dPct(p.ts)}</b><span>TS%</span></div></div>
    <div class="dr-chips">${p.rk ? `<span class="rk">#${p.rk} on the board</span>` : ''}${pk ? `<span class="pk">${logo(pk.team, 40)}#${pk.pick} to ${esc(L.teams[pk.team]?.short || pk.team)} in your mock</span>` : ''}${(p.tags || []).map(t => `<span>${esc(TAG_NAME[t] || t)}</span>`).join('')}</div>
    ${cat?.statistics?.length ? `<section class="hy-sec"><h3>College stats <span>per game</span></h3><div class="box-wrap drag-x" data-drag><table class="box hy-tbl hy-ptbl"><thead><tr><th>Season</th>${want.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${cat.statistics.map(r => `<tr><td>${esc(r.season?.displayName || '')}</td>${want.map(k => `<td>${esc(r.stats?.[col(k)] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
    <p class="hy-src">Stats from ESPN. The averages up top blend last season and this one, with this season's games counting a bit more.</p>`;
  wireDrag(sheet.body);
}

async function dShare(lg, L) {
  const st = dSaved(lg, L.year), picks = dFill(L, st).filter(x => x.round === 1);
  const sh = await lazy('share'), K = await sh.canvasKit(), { x, C, font, text, fit } = K;
  text('MOCK DRAFT', 72, 132, font(800, 92), C.ink);
  text(`${L.year} ${lg.toUpperCase()} · ROUND 1${st.lot ? ' · AFTER THE LOTTERY' : ''}`, 72, 176, font(500, 24, 'mono'), C.muted);
  const logos = await Promise.all(picks.map(p => sh.loadImg(logoSrc(p.team, 80))));
  const cols = picks.length > 16 ? 2 : 1, per = Math.ceil(picks.length / cols), top = 210, h = Math.min(66, (950 - top) / per), cw = (936 - (cols - 1) * 24) / cols;
  picks.forEach((p, i) => {
    const c = Math.floor(i / per), r = i % per, l = 72 + c * (cw + 24), y = top + r * h;
    if (r % 2 === 0) { x.fillStyle = C.surface; x.beginPath(); x.roundRect(l, y, cw, h - 4, 12); x.fill(); }
    text(String(p.pick), l + 34, y + h * .62, font(800, Math.min(30, h * .5)), C.accent, 'center');
    const ls = h * .62; if (logos[i]) x.drawImage(logos[i], l + 62, y + (h - 4 - ls) / 2, ls, ls);
    const nx = l + 62 + ls + 14, fs = Math.min(26, h * .4);
    text(fit(p.p?.name || '–', font(700, fs, 'body'), cw - (nx - l) - 12), nx, y + h * .45, font(700, fs, 'body'), C.ink);
    text(fit(`${p.p?.pos || ''} · ${p.p?.school || ''}`, font(500, fs * .7, 'mono'), cw - (nx - l) - 12), nx, y + h * .78, font(500, fs * .7, 'mono'), C.muted);
  });
  K.foot();
  return { canvas: K.c, name: `mock-draft-${lg}-${L.year}.png`, title: `${L.year} ${lg.toUpperCase()} mock draft` };
}

function wireDraft(root) {
  const ctx = async () => { const D = await loadDraft(); const lg = LGK === 'wnba' ? 'wnba' : 'nba'; return { lg, L: D[lg] }; };
  root.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-dretry]')) { draftP = null; renderDraft(); return; }
    const rd = t.closest('[data-dround]'); if (rd) { DS.round = +rd.dataset.dround; renderDraft(); return; }
    const ps = t.closest('[data-dpos]'); if (ps) { DS.pos = ps.dataset.dpos; renderDraft(); return; }
    const lot = t.closest('[data-dlot]'); if (lot) { const { lg, L } = await ctx(); const s = dSaved(lg, L.year); s.lot = lot.dataset.dlot === 'run' ? runLottery(L) : null; dSave(lg, L.year, s); DS.round = 1; renderDraft(); return; }
    if (t.closest('[data-dreset]')) { const { lg, L } = await ctx(); dSave(lg, L.year, { locks: {}, lot: null }); renderDraft(); return; }
    const ul = t.closest('[data-dunlock]'); if (ul) { const { lg, L } = await ctx(); const s = dSaved(lg, L.year); delete s.locks[ul.dataset.dunlock]; dSave(lg, L.year, s); renderDraft(); return; }
    const ch = t.closest('[data-dchange]'); if (ch) { const { lg, L } = await ctx(); dPicker(lg, L, +ch.dataset.dchange); return; }
    const sh = t.closest('[data-dshare]'); if (sh) { const { lg, L } = await ctx(); runShare(() => dShare(lg, L), sh); return; }
  });
  root.addEventListener('input', e => { if (!e.target.matches('[data-dq]')) return; DS.q = e.target.value; clearTimeout(root._qt); root._qt = setTimeout(async () => { const pos = e.target.selectionStart; await renderDraft(); const q = $('[data-dq]', root); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} } }, 200); });
}
// prospect profiles open from the board, the picks and the picker
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-dpro]'); if (!b) return;
  e.preventDefault(); const D = await loadDraft(); const lg = LGK === 'wnba' ? 'wnba' : 'nba'; dProfile(lg, D[lg], b.dataset.dpro);
});
