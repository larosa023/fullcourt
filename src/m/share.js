const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function canvasKit() {
  try { await Promise.all(['800 condensed 120px Archivo', '800 120px Archivo', '600 30px "Instrument Sans"', '500 26px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch (e) {}
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
  const x = c.getContext('2d');
  try { x.fontStretch = 'condensed'; } catch (e) {}
  const C = { bg: cssVar('--bg') || '#0C0E11', surface: cssVar('--surface') || '#14171C', ink: cssVar('--ink') || '#EDEFF2', muted: cssVar('--muted') || '#8B93A0', line: cssVar('--line') || '#252A32', accent: cssVar('--accent') || '#FF7A3D' };
  x.fillStyle = C.bg; x.fillRect(0, 0, 1080, 1080);
  // the display face is Archivo at its condensed width, like the site's headings (the width has to be in the font string: setting ctx.font resets it)
  const font = (w, s, fam) => fam === 'mono' ? `${w} ${s}px "IBM Plex Mono", monospace` : fam === 'body' ? `${w} ${s}px "Instrument Sans", sans-serif` : `${w} condensed ${s}px Archivo, "Arial Narrow", sans-serif`;
  const text = (t, px, py, f, color, align = 'left') => { x.font = f; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(t, px, py); };
  const fit = (t, f, max) => { x.font = f; let s = String(t); while (s.length > 3 && x.measureText(s).width > max) s = s.slice(0, -2); return s === String(t) ? s : s.trimEnd() + '…'; };
  // biggest size (down to a floor) at which the text fits the width
  const size = (t, w, fam, maxPx, minPx, width) => { let px = maxPx; while (px > minPx) { x.font = font(w, px, fam); if (x.measureText(String(t)).width <= width) break; px -= 2; } return px; };
  const foot = () => {
    x.fillStyle = C.line; x.fillRect(72, 968, 936, 2);
    text('FULL', 72, 1024, font(800, 34), C.ink); const w = (x.measureText('FULL').width); text('COURT', 72 + w, 1024, `italic ${font(800, 34)}`, C.accent);
    text('nbafullcourty.netlify.app', 1008, 1022, font(500, 22, 'mono'), C.muted, 'right');
  };
  return { c, x, C, font, text, fit, size, foot };
}
async function shareGame(d, sides) {
  const K = await canvasKit(); const { x, C, font, text, fit } = K;
  const comp = d.header?.competitions?.[0], st = comp?.status;
  const g = { state: st?.type?.state, period: st?.period, clock: st?.displayClock, desc: st?.type?.description || '' };
  const status = g.state === 'pre' ? fmtLocal(comp.date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ' + TZ_AB : statusText(g);
  text(status.toUpperCase(), 72, 128, font(600, 30, 'mono'), g.state === 'in' ? cssVar('--live') || C.accent : C.accent);
  text(fmtET(comp.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), 1008, 128, font(500, 26, 'mono'), C.muted, 'right');
  const imgs = await Promise.all(sides.map(s => loadImg(logoSrc(s.abbr, 300))));
  const post = g.state === 'post';
  sides.forEach((s, i) => {
    const y0 = 200 + i * 300;
    x.fillStyle = C.surface; roundRect(x, 72, y0, 936, 260, 28); x.fill();
    x.fillStyle = visibleColor(teamColor(s.id), C.surface); x.fillRect(72, y0 + 30, 8, 200);
    if (imgs[i]) x.drawImage(imgs[i], 112, y0 + 40, 180, 180);
    const dim = post && !s.winner;
    const tpx = K.size(s.short || s.name, 800, null, 64, 40, 400);
    text(fit(s.short || s.name, font(800, tpx), 400), 320, y0 + 128, font(800, tpx), dim ? C.muted : C.ink);
    text(`${s.rec || ''}${s.rec ? ' · ' : ''}${s.ha === 'home' ? 'Home' : 'Away'}`.toUpperCase(), 320, y0 + 178, font(500, 26, 'mono'), C.muted);
    if (g.state !== 'pre') text(String(s.score ?? ''), 968, y0 + 172, font(800, 150), dim ? C.muted : C.ink, 'right');
  });
  // top scorer on each side
  const lines = sides.map(s => {
    const T = (d.boxscore?.players || []).find(t => t.team?.id === s.id)?.statistics?.[0];
    if (!T) return null;
    const lab = T.labels || [], v = (a, k) => a.stats?.[lab.indexOf(k)];
    const best = (T.athletes || []).filter(a => a.stats?.length).sort((a, b) => (+v(b, 'PTS') || 0) - (+v(a, 'PTS') || 0))[0];
    return best ? `${s.abbr}  ${best.athlete?.shortName || best.athlete?.displayName}  ${v(best, 'PTS')} PTS · ${v(best, 'REB')} REB · ${v(best, 'AST')} AST` : null;
  }).filter(Boolean);
  lines.forEach((l, i) => text(fit(l, font(600, 30, 'body'), 936), 72, 846 + i * 48, font(600, 30, 'body'), i ? C.muted : C.ink));
  K.foot();
  return { canvas: K.c, name: `${sides[0].abbr}-at-${sides[1].abbr}.png`.toLowerCase(), title: `${sides[0].abbr} @ ${sides[1].abbr}` };
}
async function sharePlayer(info) {
  const K = await canvasKit(); const { x, C, font, text, fit } = K;
  const tc = teamColor(info.teamId || info.abbr);
  x.fillStyle = C.surface; roundRect(x, 72, 72, 936, 560, 32); x.fill();
  const g = x.createLinearGradient(0, 72, 0, 632); g.addColorStop(0, tc); g.addColorStop(1, C.surface);
  x.save(); roundRect(x, 72, 72, 936, 560, 32); x.clip(); x.globalAlpha = .55; x.fillStyle = g; x.fillRect(72, 72, 936, 560); x.globalAlpha = 1;
  const [head, lg] = await Promise.all([loadImg(headSrc(info.id, 700)), info.abbr ? loadImg(logoSrc(info.abbr, 200)) : null]);
  if (lg) { x.globalAlpha = .18; x.drawImage(lg, 560, 40, 520, 520); x.globalAlpha = 1; }
  if (head) { const h = 470, w = h * head.width / head.height; x.drawImage(head, 1008 - w + 30, 632 - h, w, h); }
  x.restore();
  text((info.jersey ? `#${info.jersey} · ` : '') + (info.pos || '') + (info.abbr ? ` · ${info.abbr}` : ''), 112, 150, font(600, 28, 'mono'), C.ink);
  const npx = Math.min(K.size(info.first, 800, null, 92, 52, 540), K.size(info.last, 800, null, 92, 52, 540));
  text(fit(info.first, font(800, npx), 540), 112, 300, font(800, npx), C.ink);
  text(fit(info.last, font(800, npx), 540), 112, 300 + npx, font(800, npx), C.ink);
  text((info.season || 'Season').toUpperCase() + ' · PER GAME', 72, 712, font(600, 26, 'mono'), C.accent);
  const cells = info.stats.slice(0, 5);
  const cw = 936 / cells.length;
  const vpx = Math.min(...cells.map(([, v]) => K.size(String(v ?? '–'), 800, null, 96, 40, cw - 36)));
  cells.forEach(([k, v], i) => {
    const cx = 72 + i * cw;
    if (i) { x.fillStyle = C.line; x.fillRect(cx, 752, 2, 150); }
    text(String(v ?? '–'), cx + (i ? 24 : 0), 856, font(800, vpx), C.ink);
    text(k, cx + (i ? 24 : 0), 900, font(500, 26, 'mono'), C.muted);
  });
  K.foot();
  return { canvas: K.c, name: `${info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, title: info.name };
}
// one player's line from one game: photo over team colours, the matchup and final, the big three, then the rest
async function sharePlayerGame(gameId, pid) {
  const d = await summaryCached(gameId, 30e3);
  const comp = d.header?.competitions?.[0]; if (!comp) return null;
  let A = null, team = null;
  for (const T of d.boxscore?.players || []) { const st = T.statistics?.[0]; const a = st?.athletes?.find(x => String(x.athlete?.id) === String(pid)); if (a) { A = { a, lab: st.labels || st.names || [] }; team = T.team; break; } }
  if (!A || !A.a.stats?.length) return null;
  const v = k => A.a.stats[A.lab.indexOf(k)] ?? '', n = k => parseFloat(v(k)) || 0;
  const ma = k => String(v(k) || '0-0').split('-').map(Number);
  const [fgm, fga] = ma('FG'), [tpm, tpa] = ma('3PT'), [ftm, fta] = ma('FT');
  const ath = A.a.athlete, me = comp.competitors.find(c => String(c.team?.id) === String(team.id)), op = comp.competitors.find(c => c !== me);
  const st = comp.status?.type || {}, done = st.state === 'post', live = st.state === 'in';
  const won = done && me?.winner;
  const status = done ? statusText({ state: 'post', period: comp.status?.period }) : live ? statusText({ state: 'in', period: comp.status?.period, clock: comp.status?.displayClock, desc: st.description || '' }) : '';
  const pts = n('PTS'), reb = n('REB'), ast = n('AST'), stl = n('STL'), blk = n('BLK');
  const tens = [pts, reb, ast, stl, blk].filter(x => x >= 10).length;
  // season high: compare with this season's game log (already cached when the player has been opened)
  let seasonHigh = false;
  try { const log = await gameLog(pid); const others = log.filter(g => String(g.id) !== String(gameId)); if (others.length >= 3 && pts > Math.max(...others.map(g => g.pts))) seasonHigh = true; } catch (e) {}
  const badges = [tens >= 3 ? 'Triple-double' : tens === 2 ? 'Double-double' : '', seasonHigh ? 'Season high' : '', pts >= BIG_PTS ? `${pts}-point game` : ''].filter(Boolean).slice(0, 2);

  const K = await canvasKit(); const { x, C, font, text, fit } = K;
  const tc = visibleColor(teamColor(team.id), C.surface);
  // hero: photo over the team colour
  x.fillStyle = C.surface; roundRect(x, 72, 72, 936, 470, 32); x.fill();
  x.save(); roundRect(x, 72, 72, 936, 470, 32); x.clip();
  const g = x.createLinearGradient(72, 72, 1008, 542); g.addColorStop(0, tc); g.addColorStop(1, C.surface);
  x.globalAlpha = .6; x.fillStyle = g; x.fillRect(72, 72, 936, 470); x.globalAlpha = 1;
  const [head, lg, olg] = await Promise.all([loadImg(headSrc(pid, 700)), loadImg(logoSrc(team.abbreviation, 240)), loadImg(logoSrc(op?.team?.abbreviation, 240))]);
  if (lg) { x.globalAlpha = .16; x.drawImage(lg, 600, 40, 460, 460); x.globalAlpha = 1; }
  if (head) { const h = 420, w = h * head.width / head.height; x.drawImage(head, 1008 - w + 20, 542 - h, w, h); }
  x.restore();
  text([ath.jersey ? `#${ath.jersey}` : '', ath.position?.abbreviation || '', team.abbreviation].filter(Boolean).join(' · '), 112, 140, font(600, 26, 'mono'), C.ink);
  const first = (ath.firstName || ath.displayName.split(' ')[0]).toUpperCase(), last = (ath.lastName || ath.displayName.split(' ').slice(1).join(' ')).toUpperCase();
  const npx = Math.min(K.size(first, 800, null, 104, 52, 520), K.size(last, 800, null, 104, 52, 520));
  text(fit(first, font(800, npx), 520), 112, 260, font(800, npx), C.ink);
  text(fit(last, font(800, npx), 520), 112, 260 + npx * .95, font(800, npx), C.ink);
  badges.forEach((b, i) => {
    x.font = font(700, 22, 'mono'); const w = x.measureText(b.toUpperCase()).width + 28, bx = 112 + (i ? badges.slice(0, i).reduce((s, q) => { x.font = font(700, 22, 'mono'); return s + x.measureText(q.toUpperCase()).width + 40; }, 0) : 0);
    x.fillStyle = C.accent; roundRect(x, bx, 466, w, 40, 20); x.fill(); text(b.toUpperCase(), bx + 14, 494, font(700, 22, 'mono'), cssVar('--accent-ink') || '#111');
  });
  // matchup strip
  const y0 = 574;
  x.fillStyle = C.surface; roundRect(x, 72, y0, 936, 104, 24); x.fill();
  const meS = me?.score ?? '', opS = op?.score ?? '';
  if (olg) x.drawImage(olg, 100, y0 + 22, 60, 60);
  text(`${me?.homeAway === 'home' ? 'vs' : '@'} ${op?.team?.abbreviation || ''}`, 178, y0 + 66, font(800, 40), C.ink);
  text(fmtET(comp.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(), 178, y0 + 92, font(500, 18, 'mono'), C.muted);
  if (done || live) {
    const res = done ? (won ? 'W' : 'L') : '';
    text(`${res ? res + ' ' : ''}${meS}-${opS}`, 968, y0 + 66, font(800, 48), done ? (won ? (cssVar('--win') || '#3DDC84') : (cssVar('--loss') || '#FF5A5F')) : C.ink, 'right');
    text(status.toUpperCase(), 968, y0 + 92, font(500, 18, 'mono'), live ? (cssVar('--live') || C.accent) : C.muted, 'right');
  }
  // the big three
  const big = [['PTS', pts], ['REB', reb], ['AST', ast]], cw = 936 / 3;
  big.forEach(([k, val], i) => {
    const cx = 72 + i * cw;
    if (i) { x.fillStyle = C.line; x.fillRect(cx, 704, 2, 118); }
    text(String(val), cx + (i ? 28 : 0), 800, font(800, 124), C.ink);
    text(k, cx + (i ? 28 : 0), 834, font(500, 24, 'mono'), C.muted);
  });
  // the rest as small boxes, then shooting
  const pc = (m, a) => a ? `${(m / a * 100).toFixed(0)}%` : '–';
  const pm = String(v('+/-')).trim();
  const rest = [['STL', stl], ['BLK', blk], ['TO', n('TO')], ['MIN', v('MIN') || 0], ['FG', `${fgm}-${fga}`, pc(fgm, fga)], ['3PT', `${tpm}-${tpa}`, pc(tpm, tpa)], ['FT', `${ftm}-${fta}`, pc(ftm, fta)]].concat(pm ? [['+/-', /^[-+]/.test(pm) || pm === '0' ? pm : '+' + pm]] : []);
  const bw = (936 - (rest.length - 1) * 10) / rest.length;
  rest.forEach(([k, val, sub], i) => {
    const bx = 72 + i * (bw + 10);
    x.fillStyle = C.surface; roundRect(x, bx, 862, bw, 86, 16); x.fill();
    const vpx = K.size(String(val), 800, null, 40, 24, bw - 16);
    text(String(val), bx + bw / 2, 906, font(800, vpx), C.ink, 'center');
    text(sub ? `${k} ${sub}` : k, bx + bw / 2, 934, font(500, 17, 'mono'), C.muted, 'center');
  });
  K.foot();
  const slug = `${ath.displayName}-${op?.team?.abbreviation || 'game'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { canvas: K.c, name: `${slug}.png`, title: `${ath.displayName} vs ${op?.team?.abbreviation || ''}` };
}
// team colours like black or navy vanish on a dark card: fall back to the accent
function visibleColor(hex, bg) {
  const lum = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
  const a = lum(hex), b = lum(bg);
  if (a == null || b == null || Math.abs(a - b) > 0.12) return hex;
  // too close to the background: lift it toward white (dark card) or black (light card)
  const n = parseInt(String(hex).trim().replace('#', ''), 16), t = b < 0.5 ? 255 : 0, k = 0.45;
  const mix = c => Math.round(c + (t - c) * k);
  return `rgb(${mix(n >> 16 & 255)} ${mix(n >> 8 & 255)} ${mix(n & 255)})`;
}
function roundRect(x, l, t, w, h, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }


/* Deadline: a trade card. T = { teams, R (per-team result from the trade machine), ok, season, names } */
async function shareTrade(T) {
  const K = await canvasKit(); const { x, C, font, text, fit } = K;
  const n = T.teams.length;
  text('TRADE', 72, 132, font(800, 92), C.ink);
  text(`${T.season} rules`.toUpperCase(), 72, 176, font(500, 24, 'mono'), C.muted);
  const okTxt = T.ok ? '✓ WORKS' : '✕ DOESN\'T WORK', okC = T.ok ? '#2BC48A' : '#FF5A5F';
  x.font = font(800, 40); const ow = x.measureText(okTxt).width + 44;
  x.fillStyle = okC + '22'; x.beginPath(); x.roundRect(1008 - ow, 82, ow, 64, 32); x.fill();
  text(okTxt, 1008 - ow / 2, 128, font(800, 40), okC, 'center');
  const logos = await Promise.all(T.teams.map(a => loadImg(logoSrc(a, 200))));
  const top = 214, bottom = 948, h = (bottom - top) / n;
  T.teams.forEach((a, i) => {
    const r = T.R[a], y = top + i * h, tc = teamColor(a);
    x.fillStyle = C.surface; x.beginPath(); x.roundRect(72, y + 8, 936, h - 16, 26); x.fill();
    x.fillStyle = tc; x.beginPath(); x.roundRect(72, y + 8, 10, h - 16, [26, 0, 0, 26]); x.fill();
    const L = Math.min(84, h - 70); if (logos[i]) x.drawImage(logos[i], 106, y + 28, L, L);
    text(fit((T.names[a] || a).toUpperCase(), font(800, 40), 560), 106 + L + 22, y + 62, font(800, 40), C.ink);
    text(`${money(r.before)} → ${money(r.after)}`, 984, y + 60, font(500, 24, 'mono'), C.muted, 'right');
    const items = [...r.inP.map(p => `${p.name}  ${money(p.sal[0])}`), ...r.inPk.map(k => `${k.year} ${k.round === 1 ? '1st' : '2nd'}-round pick (${k.from})`)];
    const lineH = Math.min(40, (h - 110) / Math.max(1, Math.min(items.length, 5)));
    text('GETS', 106 + L + 22, y + 100, font(500, 20, 'mono'), C.accent);
    const shown = items.slice(0, Math.max(1, Math.floor((h - 100) / lineH) - 0));
    shown.forEach((t, j) => text(fit(t, font(600, Math.min(30, lineH - 6), 'body'), 700), 106 + L + 22, y + 100 + (j + 1) * lineH, font(600, Math.min(30, lineH - 6), 'body'), C.ink));
    if (!items.length) text('Nothing', 106 + L + 22, y + 100 + lineH, font(600, 28, 'body'), C.muted);
    if (items.length > shown.length) text(`+${items.length - shown.length} more`, 984, y + h - 30, font(500, 22, 'mono'), C.muted, 'right');
  });
  K.foot();
  return { canvas: K.c, name: `trade-${T.teams.join('-').toLowerCase()}.png`, title: `Trade: ${T.teams.join(', ')}` };
}
function money(v) { return Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`; }
