/* ---------------- player page: shot profile over his last 5 or 10 games ----------------
   Each game's play-by-play is read once and boiled down to just his shots (where, made or not, two or three); only
   that is kept, so flipping between 5 and 10 or reopening him later doesn't fetch the games again. */
const SP_GAMES = new Map();
async function spGame(gid, pid) {
  const k = gid + '|' + pid; if (SP_GAMES.has(k)) return SP_GAMES.get(k);
  const d = await getJSON(`${API}/summary?event=${gid}`, { timeout: 15000 });
  const v = getShots(d).filter(s => String(s.pid) === String(pid)).map(({ x, y, made, three }) => ({ x, y, made, three }));
  SP_GAMES.set(k, v); if (SP_GAMES.size > 120) SP_GAMES.delete(SP_GAMES.keys().next().value);
  return v;
}
const SP_GROUPS = [['ra', 'At the rim'], ['paint', 'Paint'], ['mid', 'Mid-range'], ['c3', 'Corner 3'], ['a3', 'Above the break 3']];
const spGroup = s => { const z = zoneOf(s); return z === 'ra' || z === 'paint' ? z : z.startsWith('mid') ? 'mid' : z.startsWith('c3') ? 'c3' : 'a3'; };

async function fillShots(car, pid) {
  const box = $('.career-in', car);
  let n = lsGet('fc-shp-n') === '5' ? 5 : 10, view = 'zones', drawN = 0;
  let log = [];
  try { log = (await gameLog(pid)).filter(g => g.id && (g.min || 0) > 0); } catch (e) {}
  if (!log.length) { box.innerHTML = '<p class="lu-none">No games this season yet.</p>'; return; }
  const draw = async () => {
    const my = ++drawN, list = log.slice(0, n);
    box.innerHTML = '<div class="sk" style="height:300px;border-radius:12px"></div>';
    const got = new Array(list.length); let i = 0;
    await Promise.all([0, 1, 2].map(async () => { while (i < list.length) { const j = i++; try { got[j] = await spGame(list[j].id, pid); } catch (e) { got[j] = null; } } }));
    if (my !== drawN || !car.isConnected) return;
    const games = got.filter(Boolean), shots = games.flat();
    if (!shots.length) { box.innerHTML = '<p class="lu-none">No shot locations in these games\' play-by-play.</p>'; return; }
    // newer half against older half, by zone group
    const half = Math.floor(games.length / 2), newer = got.slice(0, half).filter(Boolean).flat(), older = got.slice(half).filter(Boolean).flat();
    const line = arr => { const a = arr.length, m = arr.filter(s => s.made).length; return { a, m, p: a ? m / a * 100 : null }; };
    const rows = SP_GROUPS.map(([k, name]) => {
      const all = line(shots.filter(s => spGroup(s) === k)), nw = line(newer.filter(s => spGroup(s) === k)), od = line(older.filter(s => spGroup(s) === k));
      const share = shots.length ? all.a / shots.length * 100 : 0, d = nw.a >= 3 && od.a >= 3 ? nw.p - od.p : null;
      const avg = ZONE_AVG[k];
      const vs = all.a >= 5 && all.p != null ? (all.p - avg >= 5 ? 'hot' : all.p - avg <= -5 ? 'cold' : '') : '';
      return `<tr><th>${esc(name)}</th><td>${all.m}/${all.a} <b class="${vs}">${all.p != null ? all.p.toFixed(0) + '%' : '–'}</b></td><td>${avg}%</td><td>${share.toFixed(0)}%</td><td class="${d == null ? '' : d >= 8 ? 'hot' : d <= -8 ? 'cold' : ''}">${d == null ? '–' : `${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d).toFixed(0)}`}</td></tr>`;
    }).join('');
    const marks = [...shots.filter(s => !s.made), ...shots.filter(s => s.made)].map(s => {
      const px = Math.max(5, Math.min(495, s.x * 10)), py = Math.max(5, Math.min(462, (s.y + 4.25) * 10));
      return s.made ? `<circle cx="${px}" cy="${py}" r="5.5" class="sp-m"/>` : `<path transform="translate(${px} ${py})" d="M-4 -4L4 4M4 -4L-4 4" class="sp-x"/>`;
    }).join('');
    const t3 = line(shots.filter(s => s.three)), all = line(shots);
    box.innerHTML = `<div class="sp-ctl">
        <div class="seg sm" data-spn><span class="knob"></span>${[5, 10].map(k => `<button data-spn="${k}" aria-pressed="${n === k}">Last ${k}</button>`).join('')}</div>
        <div class="seg sm" data-spv><span class="knob"></span><button data-spv="zones" aria-pressed="${view === 'zones'}">Zones</button><button data-spv="marks" aria-pressed="${view === 'marks'}">Shots</button></div>
        <span class="sp-sum">${all.m}/${all.a} FG (${all.p.toFixed(0)}%) · ${t3.m}/${t3.a} 3PT · ${games.length} games</span>
      </div>
      <div class="sp-body">
        <svg class="court sp-court" viewBox="0 0 500 470" role="img" aria-label="Shot profile, last ${games.length} games">${COURT}${view === 'zones' ? shotZones(shots) : `<g class="sp-marks">${marks}</g>`}</svg>
        <div class="sp-side">
          <table class="sp-t"><thead><tr><th>Zone</th><th>FG</th><th title="A typical rate for the league">Typical</th><th title="Share of his shots">Mix</th><th title="FG% in his newer ${half} games against the ${games.length - half} before (3+ shots in each)">Trend</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="sp-note">From each game's play-by-play (free throws aren't counted). Trend compares his newer ${half} games with the ${games.length - half} before; green or red when it moved 8 points or more.</p>
        </div>
      </div>`;
    $$('.seg', box).forEach(placeKnob);
  };
  car.addEventListener('click', e => {
    const a = e.target.closest('button[data-spn]'), b = e.target.closest('button[data-spv]');
    if (a) { e.stopPropagation(); const k = +a.dataset.spn; if (k !== n) { n = k; lsSet('fc-shp-n', k === 5 ? '5' : null); draw(); } }
    if (b) { e.stopPropagation(); if (b.dataset.spv !== view) { view = b.dataset.spv; draw(); } }
  });
  await draw();
}
