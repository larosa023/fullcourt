const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function canvasKit() {
  try { await Promise.all(['800 120px Archivo', '600 30px "Instrument Sans"', '500 26px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch (e) {}
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
  const x = c.getContext('2d');
  try { x.fontStretch = 'condensed'; } catch (e) {}
  const C = { bg: cssVar('--bg') || '#0C0E11', surface: cssVar('--surface') || '#14171C', ink: cssVar('--ink') || '#EDEFF2', muted: cssVar('--muted') || '#8B93A0', line: cssVar('--line') || '#252A32', accent: cssVar('--accent') || '#FF7A3D' };
  x.fillStyle = C.bg; x.fillRect(0, 0, 1080, 1080);
  const font = (w, s, fam) => `${w} ${s}px ${fam === 'mono' ? '"IBM Plex Mono", monospace' : fam === 'body' ? '"Instrument Sans", sans-serif' : 'Archivo, "Arial Narrow", sans-serif'}`;
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
  const status = g.state === 'pre' ? fmtET(comp.date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : statusText(g);
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

