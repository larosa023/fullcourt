/* ---------------- Ask: career highs ----------------
   "Draymond Green career highs": his best in each category the way Basketball-Reference counts them (regular season,
   with the playoffs a switch away): points, rebounds, assists, steals, blocks, threes, field goals and free throws,
   each with its game (tap for the box score), plus his triple-doubles and double-doubles. From the game
   logs (ESPN box scores since 2000-01, tools/gamelogs.mjs). Shares as a picture of the same card. */
const HI_RAW = 'https://raw.githubusercontent.com/larosa023/fullcourt/gamelog-data';
const HI_CATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-pointers'], ['fgm', 'Field goals'], ['ftm', 'Free throws']];
const hiMemo = new Map();
const hiBests = n => { if (!hiMemo.has(n)) { const p = getJSON(`${HI_RAW}/bests/${n}.json?t=${Math.floor(Date.now() / 36e5)}`, { timeout: 15000 }); p.catch(() => hiMemo.delete(n)); hiMemo.set(n, p); } return hiMemo.get(n); };
const hiDate = d => { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const HI_DATA = new Map(); // card id -> what its picture needs

// focus: a category the question named ("career high in rebounds"), lit on the card
async function highsAnswer(pid, name, focus) {
  const B = (await hiBests(+pid % 20))?.players?.[String(pid)];
  if (!B?.h) return { text: `I don't have ${esc(name)}'s career highs yet: single-game records start in 2000-01, and they're rebuilt each morning.`, miss: true };
  // a career that began before 2000-01 is only partly in the box scores
  const ix = await lazy('finder').then(m => m.gfIndex()).catch(() => null), me = ix?.players?.find(p => String(p[0]) === String(pid));
  const c = B.c || {}, early = !!me && me[2] <= 2001;
  // each tile opens the box score of the game he did it in; a bigger playoff high under it opens that game
  const tile = (k, l, g, alt) => g ? `<div class="xh-t${focus === k ? ' on' : ''}"><button class="xh-tg" data-game="${g[1]}" data-legpid="${pid}" title="Box score"><span class="xh-l">${l}</span><b>${g[0]}</b><small>${g[4]} ${esc(g[3])} · ${hiDate(g[2])}</small><span class="xh-bx">Box score ›</span></button>${alt ? `<button class="xh-po" data-game="${alt[1]}" data-legpid="${pid}" title="Box score">Playoffs: <b>${alt[0]}</b> ${alt[4]} ${esc(alt[3])}, ${hiDate(alt[2])} ›</button>` : ''}</div>` : '';
  const grid = side => {
    const H = B.h[side] || {}, O = B.h[side === 'r' ? 'p' : 'r'] || {};
    return HI_CATS.map(([k, l]) => tile(k, l, H[k]?.[0], side === 'r' && O[k]?.[0] && O[k][0][0] > (H[k]?.[0]?.[0] ?? -1) ? O[k][0] : null)).join('');
  };
  const counts = [[c.tdR || 0, 'Triple-doubles'], [c.ddR || 0, 'Double-doubles'], [c.gpR || 0, 'Games'], ...(c.p40 ? [[c.p40, '40-point games']] : [])];
  const id = `ch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  HI_DATA.set(id, { pid: String(pid), name, B, early });
  const hasPo = Object.keys(B.h.p || {}).length > 0, pts = B.h.r?.pts?.[0];
  const text = pts ? `${esc(name)}'s career high is <b>${pts[0]} points</b> (${pts[4]} ${esc(pts[3])}, ${hiDate(pts[2])})${B.h.p?.pts?.[0]?.[0] > pts[0] ? `, and <b>${B.h.p.pts[0][0]}</b> in the playoffs` : ''}. His best in every category:` : `${esc(name)}'s career highs:`;
  const html = `<div class="xh" id="${id}" data-side="r">
    <div class="xh-h">${face(pid, name, 'xh-f', 120)}<div><span class="xh-l">Career highs${early ? ' since 2000-01' : ''}</span><b>${esc(name)}</b></div>
      ${hasPo ? `<div class="seg sm xh-seg"><span class="knob"></span><button data-chside="r" aria-pressed="true">Regular season</button><button data-chside="p" aria-pressed="false">Playoffs</button></div>` : ''}</div>
    <div class="xh-g" data-for="r">${grid('r')}</div>
    ${hasPo ? `<div class="xh-g" data-for="p" hidden>${grid('p')}</div>` : ''}
    <div class="xh-c">${counts.map(([n, l]) => `<div><b>${n.toLocaleString()}</b><span>${l}</span></div>`).join('')}</div>
    <div class="xh-ft"><span>Regular season unless marked.${early ? ' Box scores start in 2000-01, so earlier games aren\'t counted.' : ''}</span>
      <button class="btn ghost sm" data-chshare="${id}">${SHARE_ICON}<span>${!isTouch && !!navigator.clipboard?.write && 'ClipboardItem' in window ? 'Copy as image' : 'Share as image'}</span></button></div>
  </div>`;
  return { text, html, src: 'ESPN box scores', ctx: { pid: String(pid) } };
}

document.addEventListener('click', e => {
  const sd = e.target.closest?.('[data-chside]');
  if (sd) {
    e.stopPropagation(); const card = sd.closest('.xh'), side = sd.dataset.chside; card.dataset.side = side;
    card.querySelectorAll('[data-chside]').forEach(b => b.setAttribute('aria-pressed', b === sd));
    card.querySelectorAll('.xh-g').forEach(g => { g.hidden = g.dataset.for !== side; });
    placeKnob(sd.parentElement); return;
  }
  const sh = e.target.closest?.('[data-chshare]'); if (!sh) return;
  e.preventDefault(); e.stopPropagation();
  const card = sh.closest('.xh'), D = HI_DATA.get(sh.dataset.chshare); if (!D) return;
  const side = card?.dataset.side || 'r', H = D.B.h[side] || {}, c = D.B.c || {};
  runShare(() => lazy('share').then(m => m.shareHighs({ name: D.name, espn: D.pid, side,
    tiles: HI_CATS.map(([k, l]) => { const g = H[k]?.[0]; return g ? { l, v: g[0], when: `${g[4]} ${g[3]} · ${hiDate(g[2])}` } : null; }).filter(Boolean),
    counts: side === 'r' ? [[c.tdR || 0, 'Triple-doubles'], [c.ddR || 0, 'Double-doubles'], [c.gpR || 0, 'Games']] : [[c.gpP || 0, 'Playoff games']],
    early: D.early })), sh);
}, true);
