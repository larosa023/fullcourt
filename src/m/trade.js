/* Deadline: the trade machine, built on Capsheet's contracts (d from loadCap, see m/cap.js).
   Checks each team against the 2026-27 trade rules (2023 CBA):
   - Over the cap and below the 1st apron after the deal: incoming salary up to 200% + $250K of outgoing (outgoing
     under $9.1M), outgoing + $9.1M ($9.1M–$35.2M), or 125% + $250K (over $35.2M).
   - Over the 1st apron after the deal: incoming up to 100% of outgoing.
   - Over the 2nd apron after the deal: can't combine (aggregate) salaries to take a player back.
   - A team that ends under the cap (plus $100K) can absorb salary into room.
   - Roster: 15 standard contracts at most (14 minimum, with two weeks to fill a spot).
   - Free agents signed this offseason can't be traded until Dec 15 (or 3 months after signing, if later).
   Trade kickers count for the team receiving the player (ESPN's incoming trade value). */

let K = null; // Capsheet's helpers (money, capStatus, capBar, shortSeason), handed over by renderTrade
const TR = { teams: ['BOS', 'NY'], out: new Map(), picks: [], pickForm: null };
const TR_LS = 'fc-trades';
const TODAY = () => new Date();
const MONTHS = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };

// when a recently signed free agent becomes tradeable (null if he already is)
function tradeableOn(p) {
  const m = (p.signed || '').match(/^(?!.*(?:extension|rookie scale|two-way)).*contract (January|February|March|April|May|June|July|August|September|October|November|December) (\d+), (\d{4})/i);
  if (!m) return null;
  const signed = new Date(+m[3], MONTHS[m[1]], +m[2]);
  const season0 = new Date(+m[3], 6, 1); if (signed < season0) return null; // signed before this offseason
  const dec15 = new Date(+m[3], 11, 15), plus3 = new Date(signed); plus3.setMonth(plus3.getMonth() + 3);
  const on = plus3 > dec15 ? plus3 : dec15;
  return TODAY() < on ? on : null;
}
const fmtD = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const inVal = p => p.tradeIn || p.sal[0] || 0; // what he counts as for the team getting him (trade kicker)
const outVal = p => p.sal[0] || 0;

function allowedIn(out, M) { return out <= M.low ? out * 2 + M.cushion : out <= M.high ? out + M.mid : out * 1.25 + M.cushion; }
function evaluate(d) {
  const c = d.cap, M = d.match, R = {};
  const pl = br => d.players.find(p => p.br === br);
  for (const a of TR.teams) R[a] = { abbr: a, before: d.teams[a]?.pay[0] || 0, outP: [], inP: [], outPk: [], inPk: [], out: 0, inn: 0, fails: [], warns: [] };
  for (const [br, to] of TR.out) { const p = pl(br); if (!p || !R[p.cur] || !R[to]) continue; R[p.cur].outP.push(p); R[p.cur].out += outVal(p); R[to].inP.push(p); R[to].inn += inVal(p); }
  for (const k of TR.picks) { if (R[k.from]) R[k.from].outPk.push(k); if (R[k.to]) R[k.to].inPk.push(k); }
  for (const t of Object.values(R)) {
    const team = d.teams[t.abbr];
    t.after = t.before - t.out + t.inn;
    const nOut = t.outP.length, nIn = t.inP.length;
    if (!nOut && !nIn && !t.outPk.length && !t.inPk.length) { t.fails.push(`${t.abbr} isn't sending or getting anything. Add a player or pick for them, or remove the team.`); continue; }
    // salary matching
    if (t.inn > t.out) {
      const underCap = t.after <= c.cap + M.roomExtra;
      if (underCap) t.how = `Fits under the cap (${K.money(t.after)} after, cap ${K.money(c.cap)}).`;
      else if (t.after > c.apron1) t.fails.push(`${t.abbr} ends up over the 1st apron (${K.money(t.after)}), so it can take back at most what it sends out. It sends ${K.money(t.out)} and takes in ${K.money(t.inn)}, ${K.money(t.inn - t.out)} too much.`);
      else {
        let allow = allowedIn(t.out, M);
        if (t.before - t.out < c.cap) allow = Math.max(allow, c.cap + M.roomExtra - (t.before - t.out)); // room absorbs part of it
        if (t.inn > allow) t.fails.push(`${t.abbr} sends out ${K.money(t.out)}, so it can take back up to ${K.money(allow)}${t.out ? ` (${t.out <= M.low ? '200% + $250K' : t.out <= M.high ? 'outgoing + $9.1M' : '125% + $250K'})` : ''}. This brings in ${K.money(t.inn)}, ${K.money(t.inn - allow)} over. Add salary going out or take less back.`);
        else t.how = t.out ? `Takes back ${K.money(t.inn)} for ${K.money(t.out)} out (allowed up to ${K.money(allow)}).` : '';
      }
    } else if (nIn || t.out) t.how = nIn ? `Takes back ${K.money(t.inn)} for ${K.money(t.out)} out.` : `Sends out ${K.money(t.out)} and takes no salary back.`;
    if (t.after > c.apron2 && nOut >= 2 && nIn >= 1) t.fails.push(`${t.abbr} would be over the 2nd apron (${K.money(t.after)}), and teams there can't combine salaries in a trade. Send one player for one, or shed more salary.`);
    // roster size
    const std = (team?.roster.length || 0) - nOut + nIn;
    t.std = std;
    if (std > 15) t.fails.push(`${t.abbr} would have ${std} players on standard contracts. The limit is 15, so it has to send out ${std - 15} more or waive someone first.`);
    else if (std < 14) t.warns.push(`${t.abbr} would have ${std} standard players, under the 14 minimum. It'd have two weeks to sign someone.`);
    // trade restrictions
    for (const p of t.outP) { const on = tradeableOn(p); if (on) t.fails.push(`${p.name} signed with ${t.abbr} as a free agent this offseason, so he can't be traded until ${fmtD(on)}.`); }
    for (const p of t.inP) if (p.kicker) t.warns.push(`${p.name} has a ${p.kicker}% trade kicker, so he counts as ${K.money(inVal(p))} for ${t.abbr}.`);
  }
  const fails = Object.values(R).flatMap(t => t.fails);
  return { R, ok: TR.teams.length >= 2 && !fails.length && (TR.out.size || TR.picks.length), fails };
}

function renderTrade(pane, d, kit) {
  if (kit) K = kit;
  const teams = Object.keys(d.teams).sort();
  TR.teams = TR.teams.filter(a => d.teams[a]);
  for (const [br] of TR.out) { const p = d.players.find(x => x.br === br); if (!p || !TR.teams.includes(p.cur)) TR.out.delete(br); }
  TR.picks = TR.picks.filter(k => TR.teams.includes(k.from) && TR.teams.includes(k.to));
  const E = evaluate(d), c = d.cap;
  const tname = a => (Object.values(S.teams).find(x => x.abbr === a) || {}).name || a;
  const col = a => {
    const t = d.teams[a], r = E.R[a], [k, l] = K.capStatus(r.after, c);
    const others = TR.teams.filter(x => x !== a);
    const prow = p => {
      const dest = TR.out.get(p.br), lock = tradeableOn(p);
      return `<div class="dl-p${dest ? ' on' : ''}${lock ? ' lock' : ''}"><button class="dl-pb" data-trp="${esc(p.br)}" aria-pressed="${!!dest}">${p.espn ? face(p.espn, p.name, 'cp-f', 80) : '<span class="cp-f"></span>'}<span><b>${esc(p.name)}</b><small>${K.money(outVal(p))}${p.thru ? ` · through ${esc(K.shortSeason(p.thru))}` : ''}${lock ? ` · tradeable ${fmtD(lock)}` : ''}</small></span><i class="dl-tick" aria-hidden="true"></i></button>
        ${dest && others.length > 1 ? `<label class="dl-dest">to <select data-trdest="${esc(p.br)}">${others.map(o => `<option value="${o}"${o === dest ? ' selected' : ''}>${o}</option>`).join('')}</select></label>` : dest ? `<span class="dl-dest">to ${dest}</span>` : ''}</div>`;
    };
    const pk = TR.picks.filter(x => x.from === a);
    return `<section class="dl-col"><header>${logo(a, 64)}<div><b>${esc(tname(a))}</b><small>${K.money(r.before)} · <span class="cp-chip ${K.capStatus(r.before, c)[0]}">${K.capStatus(r.before, c)[1]}</span></small></div>${TR.teams.length > 2 ? `<button class="dl-x" data-trrm="${a}" aria-label="Remove ${a}">×</button>` : ''}</header>
      <div class="dl-list">${t.roster.map(prow).join('')}</div>
      <div class="dl-picks">${pk.map(x => `<span class="dl-pk">${x.year} ${x.round === 1 ? '1st' : '2nd'} → ${x.to}<button data-trpkrm="${TR.picks.indexOf(x)}" aria-label="Remove pick">×</button></span>`).join('')}
        ${TR.pickForm === a ? `<span class="dl-pkf"><select data-pky>${[2027, 2028, 2029, 2030, 2031, 2032, 2033].map(y => `<option>${y}</option>`).join('')}</select><select data-pkr><option value="1">1st</option><option value="2">2nd</option></select><select data-pkto>${others.map(o => `<option>${o}</option>`).join('')}</select><button class="btn sm" data-pkadd="${a}">Add</button></span>` : `<button class="link-btn" data-pkform="${a}">+ Draft pick</button>`}</div>
    </section>`;
  };
  const sum = a => {
    const r = E.R[a], items = (ps, pks) => [...ps.map(p => `${esc(p.name)} <em>${K.money(p.sal[0])}</em>`), ...pks.map(x => `${x.year} ${x.round === 1 ? '1st' : '2nd'}-round pick${x.from !== a ? ` (from ${x.from})` : ''}`)].join(', ') || '—';
    const [k, l] = K.capStatus(r.after, c);
    return `<div class="dl-sum${r.fails.length ? ' bad' : ''}"><header>${logo(a, 48)}<b>${esc(a)}</b><span class="cp-chip ${k}">${l}</span><span class="dl-pay">${K.money(r.before)} → <b>${K.money(r.after)}</b></span></header>
      ${K.capBar(r.before, c, r.after)}
      <p><span>Gets</span>${items(r.inP, r.inPk)}</p><p><span>Sends</span>${items(r.outP, r.outPk)}</p>
      ${r.fails.map(f => `<p class="dl-f">✕ ${esc(f)}</p>`).join('')}${r.warns.map(f => `<p class="dl-w">! ${esc(f)}</p>`).join('')}${!r.fails.length && r.how ? `<p class="dl-ok">✓ ${esc(r.how)}</p>` : ''}</div>`;
  };
  const saved = trSaved();
  const any = TR.out.size || TR.picks.length;
  pane.innerHTML = `<div class="dl-top">
      <div class="dl-teams">${TR.teams.map((a, i) => `<select class="cp-sel" data-trteam="${i}" aria-label="Team ${i + 1}">${teams.map(x => `<option value="${x}"${x === a ? ' selected' : ''}${x !== a && TR.teams.includes(x) ? ' disabled' : ''}>${esc(tname(x))}</option>`).join('')}</select>`).join('')}
      ${TR.teams.length < 4 ? '<button class="btn ghost sm" data-tradd>+ Add a team</button>' : ''}</div>
      <p class="dl-hint">Tap players to move them. ${TR.teams.length > 2 ? 'Pick where each one goes.' : 'They go to the other team.'} Rules: ${esc(c.season)} salary matching, aprons and roster limits.</p>
    </div>
    <div class="dl-grid n${TR.teams.length}">${TR.teams.map(col).join('')}</div>
    <div class="dl-verdict ${any ? (E.ok ? 'ok' : 'bad') : ''}" id="trVerdict">
      <div class="dl-vh"><b>${!any ? 'Build a trade' : E.ok ? 'This trade works' : `This trade doesn't work${E.fails.length > 1 ? ` (${E.fails.length} problems)` : ''}`}</b>
        <span>${!any ? 'Pick players or picks above.' : E.ok ? `Under ${esc(c.season)} rules, every team's salary, apron and roster checks pass.` : 'See what to fix for each team below.'}</span>
        <div class="dl-acts">${any ? `<button class="btn sm" data-trshare>Share image</button><button class="btn ghost sm" data-trsave>Save</button><button class="link-btn" data-trreset>Clear</button>` : ''}</div></div>
      ${any ? `<div class="dl-sums">${TR.teams.map(sum).join('')}</div>` : ''}
    </div>
    ${saved.length ? `<div class="dl-saved"><h3>Saved trades</h3>${saved.map((s, i) => `<div class="dl-sv"><button class="link-btn" data-trload="${i}">${esc(s.label)}</button><small>${esc(new Date(s.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · ${s.ok ? 'works' : "doesn't work"}</small><button class="dl-x" data-trdel="${i}" aria-label="Delete">×</button></div>`).join('')}</div>` : ''}
    <p class="cp-src">Checks salary matching (with trade kickers), the 1st and 2nd aprons, cap room, roster size and recently signed free agents. Not checked: cash, trade exceptions, the 2-month aggregation wait for recently acquired players, and draft pick rules (like not trading 1sts in back-to-back years). Contracts updated ${esc(new Date(d.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}.</p>`;
  pane._d = d;
  if (!pane._wired) { pane._wired = true; wireTrade(pane); }
}

function trSaved() { try { return JSON.parse(localStorage.getItem(TR_LS) || '[]'); } catch (e) { return []; } }
const trLabel = d => TR.teams.map(a => { const n = [...TR.out].filter(([br, to]) => to === a).map(([br]) => d.players.find(p => p.br === br)?.name.split(' ').slice(-1)[0]).filter(Boolean); return `${a} gets ${n.join(', ') || (TR.picks.some(k => k.to === a) ? 'picks' : '—')}`; }).join(' · ');

function wireTrade(pane) {
  const redraw = () => renderTrade(pane, pane._d);
  pane.addEventListener('click', e => {
    const d = pane._d;
    const p = e.target.closest('[data-trp]');
    if (p) { const br = p.dataset.trp; if (TR.out.has(br)) TR.out.delete(br); else { const pl = d.players.find(x => x.br === br); const others = TR.teams.filter(a => a !== pl.cur); TR.out.set(br, others[0]); } redraw(); return; }
    if (e.target.closest('[data-tradd]')) { const free = Object.keys(d.teams).sort().find(a => !TR.teams.includes(a)); if (free) TR.teams.push(free); redraw(); return; }
    const rm = e.target.closest('[data-trrm]'); if (rm) { TR.teams = TR.teams.filter(a => a !== rm.dataset.trrm); redraw(); return; }
    const pf = e.target.closest('[data-pkform]'); if (pf) { TR.pickForm = pf.dataset.pkform; redraw(); return; }
    const pa = e.target.closest('[data-pkadd]'); if (pa) { const box = pa.closest('.dl-pkf'); TR.picks.push({ from: pa.dataset.pkadd, to: $('[data-pkto]', box).value, year: +$('[data-pky]', box).value, round: +$('[data-pkr]', box).value }); TR.pickForm = null; redraw(); return; }
    const pr = e.target.closest('[data-trpkrm]'); if (pr) { TR.picks.splice(+pr.dataset.trpkrm, 1); redraw(); return; }
    if (e.target.closest('[data-trreset]')) { TR.out.clear(); TR.picks = []; redraw(); return; }
    if (e.target.closest('[data-trsave]')) { const E = evaluate(d); const list = trSaved(); list.unshift({ at: Date.now(), teams: [...TR.teams], out: [...TR.out], picks: TR.picks, ok: !!E.ok, label: trLabel(d) }); try { localStorage.setItem(TR_LS, JSON.stringify(list.slice(0, 12))); } catch (x) {} toast('Trade saved on this device'); redraw(); return; }
    const ld = e.target.closest('[data-trload]'); if (ld) { const s = trSaved()[+ld.dataset.trload]; if (s) { TR.teams = s.teams; TR.out = new Map(s.out); TR.picks = s.picks || []; redraw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } return; }
    const dl = e.target.closest('[data-trdel]'); if (dl) { const list = trSaved(); list.splice(+dl.dataset.trdel, 1); try { localStorage.setItem(TR_LS, JSON.stringify(list)); } catch (x) {} redraw(); return; }
    const sh = e.target.closest('[data-trshare]');
    if (sh) { const E = evaluate(d); runShare(() => lazy('share').then(m => m.shareTrade({ teams: TR.teams, R: E.R, ok: !!E.ok, season: d.cap.season, names: Object.fromEntries(TR.teams.map(a => [a, (Object.values(S.teams).find(x => x.abbr === a) || {}).name || a])) })), sh); }
  });
  pane.addEventListener('change', e => {
    const d = pane._d;
    const ts = e.target.closest('[data-trteam]'); if (ts) { const i = +ts.dataset.trteam, old = TR.teams[i]; TR.teams[i] = ts.value; for (const [br, to] of [...TR.out]) { const p = d.players.find(x => x.br === br); if (p?.cur === old || to === old) TR.out.delete(br); } TR.picks = TR.picks.filter(k => k.from !== old && k.to !== old); redraw(); return; }
    const dd = e.target.closest('[data-trdest]'); if (dd) { TR.out.set(dd.dataset.trdest, dd.value); redraw(); }
  });
}
