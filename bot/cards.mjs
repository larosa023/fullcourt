// The picture that goes with each of the Discord bot's replies. card(view, model) returns a Canvas (bot/draw.mjs);
// functions/api/card.js turns it into a PNG. Every card is 800 px wide: Discord shows it at about half that, so the
// smallest lettering here (19-20 px) lands near 10 px on screen. Keep cards under ~640 px tall or Discord shrinks them.
// Teams are drawn as a coloured tag with their abbreviation. Team logos and player photos aren't drawn here: the
// reply shows those itself, straight from ESPN, beside the picture.
import { Canvas, measure, mix, luma } from './draw.mjs';
// (dates arrive already written out in the model: building a date formatter here would cost more than drawing the card)
import { LGS } from './espn.mjs';

const W = 800, PAD = 28;
// the site's dark theme
const BG = 0x0c0e11, SURF = 0x14171c, SURF2 = 0x1a1e24, SURF3 = 0x232831, INK = 0xedeff2, INK2 = 0xc9ced6, MUTED = 0x8b93a0, LINE = 0x2b313a, ACCENT = 0xff7a3d, LIVE = 0xff4170, WIN = 0x3dd488, LOSS = 0xff6a5c, WARN = 0xf2b33d;

const hex = c => { const n = parseInt(c || '', 16); return Number.isFinite(n) ? n : 0x3a414d; };
// a team colour that still reads on the dark background: as a tag fill, and as a line or bar
const tagFill = c => { const n = hex(c); return luma(n) < 0.07 ? 0x30363f : n; };
// behind white text: strong colours as they are, pale ones (seafoam, gold) taken down until white reads on them
const heroFill = c => { let n = tagFill(c); for (let k = 0; k < 4 && luma(n) > 0.36; k++) n = mix(n, 0x000000, 0.25); return n; };
const bright = c => { let n = hex(c); if (luma(n) < 0.07) return INK2; for (let k = 0; k < 3 && luma(n) < 0.28; k++) n = mix(n, 0xffffff, 0.35); return n; }; // black (Spurs, Nets) becomes near-white
const base = (y, h, size) => Math.round(y + h / 2 + size * 0.35); // baseline that centres capitals and digits in a box
const SIZE = f => +f.slice(1);

function tag(c, x, y, w, h, ab, color, font = 'B19') {
  const fill = tagFill(color);
  c.rect(x, y, w, h, fill, { r: Math.min(9, h / 3) });
  c.text(ab, x + w / 2, base(y, h, SIZE(font)), font, luma(fill) > 0.62 ? 0x14171c : 0xffffff, { align: 'c' });
}
// the shared top and bottom: title with the orange bar, a note on the right, the wordmark
function frame(h, title, sub, { tint, note } = {}) {
  const c = new Canvas(W, h, BG);
  if (tint != null) c.rect(0, 0, W, 96, { v: [mix(tagFill(tint), BG, 0.55), BG] });
  c.rect(PAD, 30, 6, 36, ACCENT, { r: 3 });
  const subW = sub ? measure(sub, 'T20') : 0;
  c.text(title, PAD + 20, 61, 'D40', INK, { max: W - PAD * 2 - 20 - (subW ? subW + 24 : 0) });
  if (sub) c.text(sub, W - PAD, 58, 'T20', MUTED, { align: 'r' });
  foot(c, note);
  return c;
}
function foot(c, note) {
  c.text('FULLCOURT', W - PAD, c.h - 18, 'B19', ACCENT, { align: 'r' });
  if (note) c.text(note, PAD, c.h - 18, 'T20', MUTED, { max: W - PAD * 2 - 140 });
}
const scoreLine = g => (g.st === 'pre' ? `${g.a.ab} at ${g.h.ab}` : `${g.a.ab} ${g.a.s}, ${g.h.ab} ${g.h.s}`);
const stateInk = g => (g.st === 'in' ? LIVE : g.st === 'post' ? MUTED : INK);

/* ---------- /score: every game of the day ---------- */
function scoreCard(v, m) {
  const n = m.games.length, cols = n > 8 ? 3 : n > 1 ? 2 : 1, gap = 14, tw = Math.floor((W - PAD * 2 - gap * (cols - 1)) / cols), th = cols === 3 ? 88 : 104, rows = Math.ceil(n / cols);
  const top = 96, h = top + rows * (th + gap) - gap + 62;
  const live = m.games.filter(g => g.st === 'in').length;
  const c = frame(h, `${LGS[m.lg]} scores`, m.label, { note: m.games.some(g => g.st === 'pre') ? 'Tip-off times are Eastern' : '' });
  m.games.forEach((g, k) => {
    const x = PAD + (k % cols) * (tw + gap), y = top + Math.floor(k / cols) * (th + gap), sw = cols === 3 ? 84 : 112; // sw: the status column
    c.rect(x, y, tw, th, SURF, { r: 14 });
    if (g.st === 'in') c.rect(x, y + 14, 4, th - 28, LIVE, { r: 2 });
    const rowH = (th - 20) / 2, bw = cols === 3 ? 58 : 66, bh = cols === 3 ? 28 : 32;
    [g.a, g.h].forEach((t, r) => {
      const ry = y + 10 + r * rowH;
      tag(c, x + 14, Math.round(ry + (rowH - bh) / 2), bw, bh, t.ab, t.color, t.ab.length > 3 ? 'B19' : cols === 3 ? 'B19' : 'B22');
      if (g.st === 'pre') { if (t.rec) c.text(t.rec, x + tw - sw - 12, base(ry, rowH, 20), 'T20', MUTED, { align: 'r' }); }
      else c.text(t.s, x + tw - sw - 12, base(ry, rowH, 30), 'D30', g.st === 'post' && !t.win ? MUTED : INK, { align: 'r' });
    });
    c.rect(x + tw - sw, y + 16, 2, th - 32, LINE);
    // status: one or two short lines centred in the right-hand column
    const parts = (g.st === 'in' || cols === 3) && / /.test(g.tag) ? g.tag.split(' ') : [g.tag], font = cols === 3 ? 'B19' : 'B22', lh = SIZE(font) + 8, sy = y + th / 2 - (parts.length * lh) / 2;
    parts.forEach((p, i) => c.text(p, x + tw - sw / 2 + 1, base(sy + i * lh, lh, SIZE(font)), font, stateInk(g), { align: 'c', max: sw - 10 }));
  });
  if (live) { const t = `${live} live`, w = measure(t, 'B19'); c.circle(W - PAD - w - 14, 79, 5, LIVE); c.text(t, W - PAD, 86, 'B19', LIVE, { align: 'r' }); }
  return c;
}

/* ---------- /game: one game ---------- */
// the two-colour panel with both teams and the score (or the tip-off time)
function hero(c, g, y = 20, h = 190) {
  const ac = heroFill(g.a.color), hc = heroFill(g.h.color);
  c.rect(20, y, 380, h, { h: [mix(ac, BG, 0.45), mix(ac, BG, 0.9)] }, { r: 20 }); c.rect(400, y, 380, h, { h: [mix(hc, BG, 0.9), mix(hc, BG, 0.45)] }, { r: 20 });
  c.rect(380, y, 40, h, mix(mix(ac, hc, 0.5), BG, 0.9));
  const team = (t, left) => {
    const x = left ? 48 : W - 48, al = left ? 'l' : 'r';
    tag(c, left ? x : x - 104, y + 30, 104, 46, t.ab, t.color, 'D30');
    c.text(t.nick || t.name || '', x, y + 112, 'B22', INK, { align: al, max: 150 });
    if (t.rec) c.text(t.rec, x, y + 140, 'T20', INK2, { align: al });
  };
  team(g.a, true); team(g.h, false);
  const mid = y + h / 2;
  if (g.st === 'pre') {
    c.text('TIP-OFF', 400, y + 46, 'B19', INK2, { align: 'c' });
    c.text(g.tag, 400, base(y + 52, 80, 60), 'D60', INK, { align: 'c' });
    c.text(`${g.ds} · Eastern`, 400, y + h - 28, 'T20', INK2, { align: 'c' });
  } else {
    const dim = t => (g.st === 'post' && !t.win ? 0xa3aab5 : 0xffffff);
    c.text(g.a.s, 384, base(mid - 48 + 8, 96, 96), 'D96', dim(g.a), { align: 'r' });
    c.text(g.h.s, 416, base(mid - 48 + 8, 96, 96), 'D96', dim(g.h), { align: 'l' });
    const t = g.tag, w = measure(t, 'B19') + (g.st === 'in' ? 18 : 0);
    c.rect(400 - w / 2 - 12, y + 14, w + 24, 30, BG, { r: 15, a: 0.55 });
    if (g.st === 'in') c.circle(400 - w / 2 + 5, y + 29, 5, LIVE);
    c.text(t, 400 + (g.st === 'in' ? 9 : 0), y + 36, 'B19', g.st === 'in' ? LIVE : INK2, { align: 'c' });
    c.text(g.ds, 400, y + h - 16, 'T20', INK2, { align: 'c' });
  }
}
function gameCard(v, g) {
  const lines = Math.max(g.a.lines?.length || 0, g.h.lines?.length || 0), pre = g.st === 'pre';
  const leaders = [['POINTS', 'pts'], ['REBOUNDS', 'reb'], ['ASSISTS', 'ast']].filter(([, k]) => g.a[k] || g.h[k]);
  const info = pre ? [['LINE', g.line], ['TOTAL', g.ou != null ? `O/U ${g.ou}` : ''], ['WATCH', g.tv]].filter(x => x[1]) : [];
  let y = 226; const hLines = lines ? 130 : 0, hInfo = info.length ? 84 : 0, hLead = leaders.length ? 104 : 0;
  const c = new Canvas(W, y + (hLines ? hLines + 14 : 0) + (hInfo ? hInfo + 14 : 0) + (hLead ? hLead + 14 : 0) + 40, BG);
  hero(c, g);
  if (lines) {
    c.rect(20, y, 760, hLines, SURF, { r: 16 });
    const cw = Math.min(72, Math.floor(420 / (lines + 1))), x0 = 780 - 24 - cw * (lines + 1);
    const head = Array.from({ length: lines }, (_, k) => (k < 4 ? String(k + 1) : k === 4 ? 'OT' : `${k - 3}OT`));
    head.forEach((t, k) => c.text(t, x0 + cw * k + cw - 8, y + 32, 'B19', MUTED, { align: 'r' })); c.text('T', 780 - 32, y + 32, 'B19', MUTED, { align: 'r' });
    [g.a, g.h].forEach((t, r) => {
      const ry = y + 44 + r * 40;
      tag(c, 40, ry + 4, 66, 30, t.ab, t.color); c.text(t.nick || '', 120, base(ry, 38, 24), 'T24', INK2, { max: x0 - 130 });
      (t.lines || []).forEach((s, k) => c.text(s, x0 + cw * k + cw - 8, base(ry, 38, 24), 'T24', INK2, { align: 'r' }));
      c.text(t.s, 780 - 32, base(ry, 38, 24), 'D24', g.st === 'post' && !t.win ? MUTED : INK, { align: 'r' });
    });
    y += hLines + 14;
  }
  if (info.length) {
    const tw = Math.floor((760 - 14 * (info.length - 1)) / info.length);
    info.forEach(([label, val], k) => { const x = 20 + k * (tw + 14); c.rect(x, y, tw, hInfo, SURF, { r: 16 }); c.text(label, x + 20, y + 32, 'B19', MUTED); c.text(val, x + 20, y + 64, 'B22', INK, { max: tw - 40 }); });
    y += hInfo + 14;
  }
  if (leaders.length) {
    const tw = Math.floor((760 - 14 * (leaders.length - 1)) / leaders.length);
    leaders.forEach(([label, k], n) => {
      const x = 20 + n * (tw + 14); c.rect(x, y, tw, hLead, SURF, { r: 16 });
      c.text(pre ? `${label} / GAME` : label, x + 20, y + 30, 'B19', MUTED);
      [g.a, g.h].forEach((t, r) => { const l = t[k]; if (!l) return; const ry = y + 40 + r * 30; c.circle(x + 25, ry + 13, 5, bright(t.color)); c.text(l[1], x + tw - 18, base(ry, 26, 24), 'D24', INK, { align: 'r' }); c.text(l[0], x + 38, base(ry, 26, 20), 'T20', INK2, { max: tw - 38 - 18 - measure(l[1], 'D24') - 8 }); });
    });
  }
  foot(c, g.note || '');
  return c;
}
// the bar under a game's other views: who played, the score, the state
const gameSub = g => `${scoreLine(g)} · ${g.st === 'pre' ? g.tag : g.det}`;
const BOXC = [['MIN', 2, 318], ['PTS', 3, 372], ['REB', 4, 426], ['AST', 5, 480], ['STL', 6, 530], ['BLK', 7, 580], ['FG', 8, 654], ['3PT', 9, 720], ['+/-', 10, 772]];
function boxCard(v, g) {
  const key = v.side === 'h' ? 'h' : 'a', t = g[key], rows = g.box?.[key] || [], tot = g.tot?.[key];
  const top = 132, rh = 38, c = frame(top + rows.length * rh + (tot ? 46 : 0) + 56, `${t.nick || t.ab} box score`, gameSub(g), { tint: t.color, note: rows.length ? 'Most minutes first' : 'No box score yet' });
  c.text('PLAYER', 44, 118, 'B19', MUTED); BOXC.forEach(([l, , x]) => c.text(l, x, 118, 'B19', MUTED, { align: 'r' }));
  rows.forEach((p, k) => {
    const y = top + k * rh; if (k % 2 === 0) c.rect(20, y, 760, rh, SURF, { r: 10 });
    if (p[1]) c.rect(28, y + 11, 4, rh - 22, bright(t.color), { r: 2 }); // starter
    c.text(p[0], 44, base(y, rh, 24), 'T24', INK, { max: 226 });
    BOXC.forEach(([l, i, x]) => { const val = String(p[i] ?? ''); c.text(val, x, base(y, rh, 24), l === 'PTS' ? 'D24' : l === 'FG' || l === '3PT' || l === '+/-' ? 'T20' : 'T24', l === 'PTS' ? INK : l === '+/-' ? (val.startsWith('+') ? WIN : val.startsWith('-') ? LOSS : MUTED) : INK2, { align: 'r' }); });
  });
  if (tot) {
    const y = top + rows.length * rh + 6; c.rect(20, y, 760, 40, SURF3, { r: 10 }); c.text('TEAM', 44, base(y, 40, 19), 'B19', INK2);
    const cell = (x, val, font = 'T24') => val != null && c.text(String(val), x, base(y, 40, SIZE(font)), font, INK, { align: 'r' });
    cell(372, t.s, 'D24'); cell(426, tot.reb); cell(480, tot.ast); cell(530, tot.stl); cell(580, tot.blk); cell(654, tot.fg, 'T20'); cell(720, tot.tp, 'T20');
  }
  return c;
}
const STAT_ROWS = [['FIELD GOAL %', 'fgp', 1], ['3-POINT %', 'tpp', 1], ['FREE THROW %', 'ftp', 1], ['REBOUNDS', 'reb', 1], ['ASSISTS', 'ast', 1], ['STEALS', 'stl', 1], ['BLOCKS', 'blk', 1], ['TURNOVERS', 'to', -1], ['POINTS IN PAINT', 'paint', 1], ['FAST BREAK PTS', 'fast', 1]];
// rows of two bars growing out from the middle; the better side keeps its colour
function duel(c, y, rows, colA, colB, rh = 40) {
  rows.forEach(([label, a, b, dir = 1, fa, fb], k) => {
    const ry = y + k * rh, na = parseFloat(a), nb = parseFloat(b), ok = Number.isFinite(na) && Number.isFinite(nb), max = Math.max(na, nb, 1e-9), lw = measure(label, 'B19'), half = 250 - lw / 2 - 14;
    const aWins = ok && (na - nb) * dir > 0, bWins = ok && (nb - na) * dir > 0;
    c.text(label, 400, base(ry, rh, 19), 'B19', MUTED, { align: 'c' });
    if (ok) {
      const wa = Math.max(6, half * na / max), wb = Math.max(6, half * nb / max), x1 = 400 - lw / 2 - 14, x2 = 400 + lw / 2 + 14;
      c.rect(x1 - half, ry + rh / 2 - 5, half, 10, SURF2, { r: 5 }); c.rect(x2, ry + rh / 2 - 5, half, 10, SURF2, { r: 5 });
      c.rect(x1 - wa, ry + rh / 2 - 5, wa, 10, aWins ? colA : 0x4a515d, { r: 5 }); c.rect(x2, ry + rh / 2 - 5, wb, 10, bWins ? colB : 0x4a515d, { r: 5 });
    }
    c.text(fa ?? String(a ?? '-'), 44, base(ry, rh, 24), 'D24', aWins || !ok ? INK : MUTED); c.text(fb ?? String(b ?? '-'), W - 44, base(ry, rh, 24), 'D24', bWins || !ok ? INK : MUTED, { align: 'r' });
  });
}
function twoColours(a, b) { let A = bright(a), B = bright(b); const d = Math.abs((A >> 16 & 255) - (B >> 16 & 255)) + Math.abs((A >> 8 & 255) - (B >> 8 & 255)) + Math.abs((A & 255) - (B & 255)); if (d < 60) B = INK2; return [A, B]; }
function statsCard(v, g) {
  const rows = STAT_ROWS.filter(([, k]) => g.tot?.a?.[k] != null && g.tot?.h?.[k] != null).map(([l, k, dir]) => [l, g.tot.a[k], g.tot.h[k], dir, /%/.test(l) ? `${g.tot.a[k]}%` : undefined, /%/.test(l) ? `${g.tot.h[k]}%` : undefined]);
  const c = frame(150 + rows.length * 40 + 56, 'Team stats', gameSub(g), { note: rows.length ? '' : 'No team stats yet' }), [ca, cb] = twoColours(g.a.color, g.h.color);
  tag(c, 44, 96, 78, 34, g.a.ab, g.a.color, 'B22'); tag(c, W - 44 - 78, 96, 78, 34, g.h.ab, g.h.color, 'B22');
  duel(c, 146, rows, ca, cb);
  return c;
}
function flowCard(v, g) {
  const c = frame(560, 'Win probability', gameSub(g)), wp = g.wp || [], [ca, cb] = twoColours(g.a.color, g.h.color);
  const x0 = 96, x1 = 772, y0 = 116, y1 = 476, mid = (y0 + y1) / 2;
  c.rect(x0, y0, x1 - x0, y1 - y0, SURF, { r: 14 });
  for (const f of [0.25, 0.75]) c.rect(x0 + 10, Math.round(y0 + (y1 - y0) * f), x1 - x0 - 20, 1, LINE);
  c.rect(x0 + 10, Math.round(mid) - 1, x1 - x0 - 20, 2, 0x4a515d);
  tag(c, 20, y0 + 6, 66, 30, g.h.ab, g.h.color); tag(c, 20, y1 - 36, 66, 30, g.a.ab, g.a.color); c.text('50%', 86, base(mid - 12, 24, 19), 'B19', MUTED, { align: 'r' });
  if (wp.length > 1) {
    const pts = wp.map((p, k) => [x0 + 12 + (x1 - x0 - 24) * k / (wp.length - 1), y1 - 12 - (y1 - y0 - 24) * p]);
    // shade towards whichever team is ahead, then the line on top in two colours
    for (let k = 0; k + 1 < pts.length; k++) c.area([pts[k], pts[k + 1]], mid, (pts[k][1] + pts[k + 1][1]) / 2 < mid ? cb : ca, 0.34, 0.06);
    for (let k = 0; k + 1 < pts.length; k++) c.line([pts[k], pts[k + 1]], 3.5, (pts[k][1] + pts[k + 1][1]) / 2 < mid ? cb : ca);
    const end = pts[pts.length - 1]; c.circle(end[0], end[1], 7, 0xffffff);
    const last = wp[wp.length - 1], fav = last >= 0.5 ? g.h : g.a, pct = Math.round(Math.max(last, 1 - last) * 100);
    c.text(g.st === 'post' ? 'TIP-OFF' : 'TIP-OFF', x0 + 12, y1 + 30, 'B19', MUTED); c.text(g.st === 'post' ? 'FINAL' : 'NOW', x1 - 12, y1 + 30, 'B19', MUTED, { align: 'r' });
    if (g.st !== 'post') c.text(`${fav.ab} ${pct}%`, 400, y1 + 30, 'B19', INK2, { align: 'c' });
    else if (g.tot?.a?.lead != null && g.tot?.h?.lead != null) c.text(`Biggest lead: ${g.a.ab} ${g.tot.a.lead} · ${g.h.ab} ${g.tot.h.lead}`, 400, y1 + 30, 'B19', INK2, { align: 'c' });
  } else c.text('No win probability for this game yet', (x0 + x1) / 2, base(y0, y1 - y0, 20), 'T20', MUTED, { align: 'c' });
  return c;
}

/* ---------- /player ---------- */
function playerHero(c, p, y = 20, h = 142) {
  const col = heroFill(p.color);
  c.rect(20, y, 760, h, { h: [mix(col, BG, 0.3), mix(col, BG, 0.88)] }, { r: 20 });
  c.text(p.name, 48, y + 56, 'D40', 0xffffff, { max: 560 });
  c.text([p.pos, p.jersey, p.team].filter(Boolean).join(' · '), 48, y + 90, 'T20', INK, { max: 560 });
  c.text([p.ht, p.wt, p.age && `Age ${p.age}`, p.exp].filter(Boolean).join(' · '), 48, y + 120, 'T20', INK2, { max: 560 });
  if (p.ab) tag(c, W - 48 - 104, y + 26, 104, 46, p.ab, p.color, 'D30');
  if (p.away) c.text(p.away.toUpperCase(), W - 48, y + 112, 'B19', LOSS, { align: 'r' });
}
function playerCard(v, p) {
  if (v.tab === 'log') return logCard(v, p);
  if (v.tab === 'career') return careerCard(v, p);
  const s = p.now || {}, log = [...(p.log || [])].reverse(), c = new Canvas(W, log.length ? 622 : 420, BG), col = bright(p.color);
  playerHero(c, p);
  [['POINTS', s.pts, p.ranks?.pts], ['REBOUNDS', s.reb, p.ranks?.reb], ['ASSISTS', s.ast, p.ranks?.ast]].forEach(([l, val, rk], k) => {
    const x = 20 + k * 258, y = 176; c.rect(x, y, 244, 110, SURF, { r: 16 });
    c.text(String(val ?? '-'), x + 20, y + 66, 'D60', INK); c.text(l, x + 20, y + 94, 'B19', MUTED);
    if (rk && parseInt(rk.replace(/\D/g, ''), 10) <= 30) { const t = rk.replace('Tied-', 'T-'), w = measure(t, 'B19'); c.rect(x + 244 - w - 34, y + 14, w + 20, 28, mix(ACCENT, SURF, 0.82), { r: 14 }); c.text(t, x + 244 - 24, y + 34, 'B19', ACCENT, { align: 'r' }); }
  });
  [['STL', s.stl], ['BLK', s.blk], ['FG%', s.fgp], ['3P%', s.tpp], ['FT%', s.ftp], ['MIN', s.min]].forEach(([l, val], k) => {
    const x = 20 + k * 128.4, y = 300; c.rect(x, y, 118, 74, SURF, { r: 14 }); c.text(String(val ?? '-'), x + 16, y + 38, 'D30', INK); c.text(l, x + 16, y + 62, 'B19', MUTED);
  });
  c.text(`${p.label || 'This season'}${s.gp ? ` · ${s.gp} games` : ''}`, W - PAD, 404, 'T20', MUTED, { align: 'r' });
  if (log.length) {
    c.text(`LAST ${log.length} · POINTS`, PAD, 404, 'B19', MUTED);
    const max = Math.max(...log.map(g => +g.pts || 0), 1), slot = 744 / log.length, bw = Math.min(46, slot - 22), y1 = 546, hMax = 96, avg = parseFloat(s.pts);
    if (Number.isFinite(avg) && avg <= max) { const ay = Math.round(y1 - hMax * avg / max); for (let x = PAD; x < W - PAD; x += 14) c.rect(x, ay, 7, 2, INK2, { a: 0.5 }); }
    log.forEach((g, k) => {
      const cx = PAD + slot * k + slot / 2, bh = Math.max(4, hMax * (+g.pts || 0) / max), t = String(g.pts), tw = measure(t, 'B19');
      c.rect(cx - bw / 2, y1 - bh, bw, bh, g.res === 'W' ? col : 0x4a515d, { r: 6 });
      c.rect(cx - tw / 2 - 4, y1 - bh - 25, tw + 8, 20, BG); c.text(t, cx, y1 - bh - 8, 'B19', INK, { align: 'c' });
      c.text(`${g.at === '@' ? '@' : ''}${g.opp}`, cx, y1 + 24, 'B19', MUTED, { align: 'c', max: slot - 4 });
    });
    foot(c, 'Colored bars are wins · dashes mark his average');
  } else foot(c, '');
  return c;
}
function table(c, top, cols, rows, { rh = 38 } = {}) {
  cols.forEach(col => c.text(col.l, col.x, top - 14, 'B19', MUTED, { align: col.a || 'r' }));
  rows.forEach((r, k) => {
    const y = top + k * rh; if (r.strong) c.rect(20, y + 2, 760, rh - 4, SURF3, { r: 10 }); else if (k % 2 === 0) c.rect(20, y, 760, rh, SURF, { r: 10 });
    cols.forEach((col, i) => { const cell = r.cells[i]; if (cell == null || cell === '') return; const [txt, ink, font] = Array.isArray(cell) ? cell : [cell]; c.text(String(txt), col.x, base(y, rh, SIZE(font || col.f || 'T24')), font || col.f || 'T24', ink ?? col.ink ?? INK2, { align: col.a || 'r', max: col.max || 0 }); });
  });
}
function logCard(v, p) {
  const rows = p.log || [], c = frame(132 + rows.length * 38 + 56, p.name, `Last ${rows.length} games`, { tint: p.color, note: rows.length ? '' : 'No games yet this season' });
  table(c, 132, [{ l: 'DATE', x: 44, a: 'l', f: 'T20', ink: MUTED }, { l: 'OPP', x: 130, a: 'l', f: 'B22', ink: INK }, { l: 'RESULT', x: 226, a: 'l', f: 'T20' }, { l: 'MIN', x: 392 }, { l: 'PTS', x: 446, f: 'D24', ink: INK }, { l: 'REB', x: 500 }, { l: 'AST', x: 554 }, { l: 'STL', x: 602 }, { l: 'BLK', x: 650 }, { l: 'FG', x: 716, f: 'T20' }, { l: '3PT', x: 772, f: 'T20' }],
    rows.map(g => ({ cells: [g.ds, `${g.at === '@' ? '@ ' : ''}${g.opp}`, [`${g.res} ${g.score}`, g.res === 'W' ? WIN : g.res === 'L' ? LOSS : INK2], g.min, g.pts, g.reb, g.ast, g.stl, g.blk, g.fg, g.tp] })));
  return c;
}
function careerCard(v, p) {
  const rows = p.seasons || [], c = frame(132 + (rows.length + (p.career ? 1 : 0)) * 38 + 56, p.name, 'Season by season', { tint: p.color, note: rows.length >= 9 ? 'Last nine seasons · per game' : 'Per game' });
  const cell = s => [s.gp, s.min, s.pts, s.reb, s.ast, s.stl, s.blk, s.fgp, s.tpp, s.ftp];
  table(c, 132, [{ l: 'SEASON', x: 44, a: 'l', f: 'B22', ink: INK }, { l: 'TEAM', x: 146, a: 'l', f: 'T20', ink: MUTED }, { l: 'GP', x: 250 }, { l: 'MIN', x: 312 }, { l: 'PTS', x: 374, f: 'D24', ink: INK }, { l: 'REB', x: 430 }, { l: 'AST', x: 486 }, { l: 'STL', x: 538 }, { l: 'BLK', x: 590 }, { l: 'FG%', x: 652, f: 'T20' }, { l: '3P%', x: 714, f: 'T20' }, { l: 'FT%', x: 774, f: 'T20' }],
    [...rows.map(s => ({ cells: [s.yr, s.ab, ...cell(s)] })), ...(p.career ? [{ strong: true, cells: [['Career', INK], '', ...cell(p.career)] }] : [])]);
  return c;
}

/* ---------- /compare ---------- */
function compareCard(v, m) {
  const { a, b } = m, sa = a.now || {}, sb = b.now || {}, [ca, cb] = twoColours(a.color, b.color);
  const rows = [['POINTS', 'pts'], ['REBOUNDS', 'reb'], ['ASSISTS', 'ast'], ['STEALS', 'stl'], ['BLOCKS', 'blk'], ['THREES', 'tpm'], ['FIELD GOAL %', 'fgp'], ['3-POINT %', 'tpp'], ['FREE THROW %', 'ftp'], ['MINUTES', 'min']].map(([l, k]) => [l, sa[k], sb[k], 1]);
  const c = new Canvas(W, 172 + rows.length * 40 + 50, BG);
  const half = (p, left) => {
    const col = heroFill(p.color), x = left ? 20 : 406;
    c.rect(x, 20, 374, 130, { h: left ? [mix(col, BG, 0.35), mix(col, BG, 0.85)] : [mix(col, BG, 0.85), mix(col, BG, 0.35)] }, { r: 20 });
    const tx = left ? 44 : W - 44, al = left ? 'l' : 'r';
    c.text(p.name, tx, 66, 'B28', 0xffffff, { align: al, max: 326 });
    c.text([p.pos, p.jersey, p.ab].filter(Boolean).join(' · '), tx, 96, 'T20', INK, { align: al });
    c.text(`${p.now?.gp || 0} games${p.away ? ' · ' + p.away : ''}`, tx, 124, 'T20', INK2, { align: al });
  };
  half(a, true); half(b, false);
  c.circle(400, 85, 24, BG); c.text('VS', 400, 92, 'B19', MUTED, { align: 'c' });
  duel(c, 166, rows, ca, cb);
  foot(c, `${a.label || 'This season'} · per game`);
  return c;
}

/* ---------- /team ---------- */
function teamHero(c, t, title, sub) {
  const col = heroFill(t.color);
  c.rect(20, 20, 760, 130, { h: [mix(col, BG, 0.25), mix(col, BG, 0.88)] }, { r: 20 });
  tag(c, 44, 44, 104, 46, t.ab, mix(col, 0x000000, 0.35), 'D30');
  const room = t.rec ? 400 : 580; c.text(title, 164, measure(title, 'D40') <= room ? 80 : 77, measure(title, 'D40') <= room ? 'D40' : 'D30', 0xffffff, { max: room });
  c.text(sub, 44, 126, 'T20', INK, { max: 560 });
}
function teamCard(v, t) {
  const tiles = t.rec || t.ppg != null, off = tiles ? 0 : -94, c = new Canvas(W, 596 + off, BG), fx = n => (n == null ? '-' : n.toFixed(1));
  teamHero(c, t, t.name, [t.place, t.streak ? `${t.streak > 0 ? 'Won' : 'Lost'} ${Math.abs(t.streak)} in a row` : ''].filter(Boolean).join(' · ') || (tiles ? LGS[t.lg] : `${LGS[t.lg]} · between seasons`));
  if (t.rec) { c.text(t.rec, W - 48, 96, 'D60', 0xffffff, { align: 'r' }); c.text('RECORD', W - 48, 126, 'B19', INK2, { align: 'r' }); }
  if (tiles) [['SCORED', fx(t.ppg)], ['ALLOWED', fx(t.opp)], ['MARGIN', t.diff == null ? '-' : (t.diff > 0 ? '+' : '') + t.diff.toFixed(1), t.diff > 0 ? WIN : t.diff < 0 ? LOSS : INK], ['HOME', t.home || '-'], ['AWAY', t.road || '-']].forEach(([l, val, ink], k) => {
    const x = 20 + k * 154.8, y = 164; c.rect(x, y, 140, 80, SURF, { r: 14 }); c.text(String(val), x + 16, y + 42, 'D30', ink || INK); c.text(l, x + 16, y + 66, 'B19', MUTED);
  });
  // form: one square per game, oldest on the left
  const y = 262 + off;
  c.text(`LAST ${t.last.length || 10}`, PAD, y + 25, 'B19', MUTED);
  t.last.forEach((g, k) => { const x = 128 + k * 42; c.rect(x, y, 34, 34, g.win ? mix(WIN, BG, 0.25) : mix(LOSS, BG, 0.3), { r: 9 }); c.text(g.win ? 'W' : 'L', x + 17, base(y, 34, 19), 'B19', 0x0c0e11, { align: 'c' }); });
  const wins = t.last.filter(g => g.win).length; if (t.last.length) c.text(`${wins}-${t.last.length - wins}`, W - PAD, y + 26, 'D24', INK, { align: 'r' });
  const colTop = 316 + off, list = (x, title, games, none, row) => { c.text(title, x + 4, colTop + 20, 'B19', MUTED); games.forEach((g, k) => { const ry = colTop + 32 + k * 40; c.rect(x, ry, 372, 36, SURF, { r: 10 }); row(g, x, ry); }); if (!games.length) c.text(none, x + 4, colTop + 58, 'T20', MUTED); };
  list(20, 'RECENT RESULTS', [...t.last].reverse().slice(0, 5), 'No games yet', (g, x, ry) => {
    c.text(g.win ? 'W' : 'L', x + 26, base(ry, 36, 22), 'B22', g.win ? WIN : LOSS, { align: 'c' }); c.text(g.home ? 'vs' : '@', x + 60, base(ry, 36, 20), 'T20', MUTED, { align: 'c' }); tag(c, x + 80, ry + 5, 58, 26, g.opp, g.oc);
    c.text(`${g.my}-${g.their}`, x + 256, base(ry, 36, 24), 'D24', INK, { align: 'r' }); c.text(g.ds, x + 360, base(ry, 36, 20), 'T20', MUTED, { align: 'r' });
  });
  list(408, 'UP NEXT', t.next.slice(0, 5), 'No games scheduled', (g, x, ry) => {
    c.text(g.home ? 'vs' : '@', x + 22, base(ry, 36, 20), 'T20', MUTED, { align: 'c' }); tag(c, x + 40, ry + 5, 58, 26, g.opp, g.oc);
    c.text(g.ds, x + 112, base(ry, 36, 20), 'T20', INK2); c.text(g.ts, x + 360, base(ry, 36, 22), 'B22', INK, { align: 'r' });
  });
  foot(c, t.next.length ? 'Tip-off times are Eastern' : '');
  return c;
}
function injuryCard(v, t) {
  const rows = t.rows.slice(0, 10), c = new Canvas(W, 166 + Math.max(1, rows.length) * 44 + 50, BG);
  teamHero(c, t, `${t.nick} injuries`, rows.length ? `${rows.length} listed` : 'Nobody listed');
  rows.forEach((r, k) => {
    const y = 166 + k * 44, out = /out/i.test(r.status), ink = out ? LOSS : WARN, label = r.status.toUpperCase().replace('DAY-TO-DAY', 'DAY TO DAY'), w = measure(label, 'B19') + 24;
    c.rect(20, y, 760, 38, SURF, { r: 10 });
    c.text(r.name, 40, base(y, 38, 22), 'B22', INK, { max: 250 }); if (r.pos) c.text(r.pos, 300, base(y, 38, 20), 'T20', MUTED);
    c.rect(336, y + 5, w, 28, mix(ink, SURF, 0.8), { r: 14 }); c.text(label, 336 + w / 2, base(y + 5, 28, 19), 'B19', ink, { align: 'c' });
    c.text(r.what, 336 + w + 14, base(y, 38, 20), 'T20', INK2, { max: 760 - 336 - w - 14 - 110 });
    if (r.back) c.text(r.back, 764, base(y, 38, 20), 'T20', MUTED, { align: 'r' });
  });
  if (!rows.length) c.text('No injuries on the report.', 40, 196, 'T24', INK2);
  foot(c, rows.some(r => r.back) ? 'Date on the right: expected back' : '');
  return c;
}

/* ---------- /standings ---------- */
function standingsCard(v, m) {
  const want = v.conf, groups = m.groups.length > 1 && (want === 'east' || want === 'west') ? m.groups.filter(g => g.name.toLowerCase().startsWith(want)) : m.groups;
  const lines = m.lg === 'nba' && m.groups.length > 1;
  if (groups.length === 1) {
    const g = groups[0], rh = 32, top = 132, c = frame(top + g.rows.length * rh + 56, `${LGS[m.lg]} standings`, m.groups.length > 1 ? `${g.name} Conference` : '', { note: lines ? 'Top 6 make the playoffs · 7-10 go to the play-in' : '' });
    table(c, top, [{ l: '', x: 50, f: 'B19', ink: MUTED }, { l: 'TEAM', x: 134, a: 'l', f: 'T24', ink: INK, max: 150 }, { l: 'W', x: 330, f: 'D24', ink: INK }, { l: 'L', x: 376, f: 'D24', ink: INK }, { l: 'PCT', x: 446, f: 'T20' }, { l: 'GB', x: 506, f: 'T20' }, { l: 'HOME', x: 580, f: 'T20' }, { l: 'AWAY', x: 652, f: 'T20' }, { l: 'L10', x: 716, f: 'T20' }, { l: 'STRK', x: 772, f: 'B19' }],
      g.rows.map((r, k) => ({ cells: [k + 1, r.nick, r.w, r.l, r.pct, r.gb, r.home, r.road, r.l10, [r.strk, /^W/.test(r.strk) ? WIN : /^L/.test(r.strk) ? LOSS : MUTED]] })), { rh });
    g.rows.forEach((r, k) => tag(c, 62, top + k * rh + 4, 60, 24, r.ab, r.color));
    if (lines) for (const [n, ink] of [[6, INK2], [10, MUTED]]) if (g.rows.length > n) c.rect(28, top + n * rh - 1, 744, 2, ink, { a: 0.7 });
    return c;
  }
  const rh = 31, top = 138, n = Math.max(...groups.map(g => g.rows.length)), c = frame(top + n * rh + 56, `${LGS[m.lg]} standings`, '', { note: lines ? 'Top 6 make the playoffs · 7-10 go to the play-in' : '' });
  groups.slice(0, 2).forEach((g, gi) => {
    const x = 20 + gi * 388; c.text(g.name.toUpperCase(), x + 12, 122, 'B19', ACCENT); c.text('W-L', x + 232, 122, 'B19', MUTED, { align: 'r' }); c.text('GB', x + 292, 122, 'B19', MUTED, { align: 'r' }); c.text('STRK', x + 360, 122, 'B19', MUTED, { align: 'r' });
    g.rows.forEach((r, k) => {
      const y = top + k * rh; if (k % 2 === 0) c.rect(x, y, 372, rh, SURF, { r: 9 });
      c.text(String(k + 1), x + 34, base(y, rh, 19), 'B19', MUTED, { align: 'r' }); tag(c, x + 46, y + 4, 60, rh - 8, r.ab, r.color);
      c.text(`${r.w}-${r.l}`, x + 232, base(y, rh, 24), 'D24', INK, { align: 'r' }); c.text(r.gb, x + 292, base(y, rh, 20), 'T20', MUTED, { align: 'r' }); c.text(r.strk, x + 360, base(y, rh, 19), 'B19', /^W/.test(r.strk) ? WIN : /^L/.test(r.strk) ? LOSS : MUTED, { align: 'r' });
    });
    if (lines) for (const [k, ink] of [[6, INK2], [10, MUTED]]) if (g.rows.length > k) c.rect(x + 6, top + k * rh - 1, 360, 2, ink, { a: 0.7 });
  });
  return c;
}

/* ---------- /leaders ---------- */
function leadersCard(v, m) {
  const rows = m.rows, rh = 44, top = 100, c = frame(top + Math.max(1, rows.length) * rh + 52, `${m.label} leaders`, `${LGS[m.lg]} · ${m.unit}`);
  const nums = rows.map(r => parseFloat(r.val)).filter(Number.isFinite), max = Math.max(...nums, 1e-9), min = Math.min(...nums, max), floor = /Pct/.test(m.stat) ? Math.max(0, min - (max - min) * 1.5 - 1) : 0;
  rows.forEach((r, k) => {
    const y = top + k * rh, val = parseFloat(r.val);
    c.rect(20, y, 760, rh - 6, SURF, { r: 12 });
    c.text(String(k + 1), 62, base(y, rh - 6, 24), 'D24', k === 0 ? ACCENT : MUTED, { align: 'r' });
    c.text(r.name, 78, base(y, rh - 6, 22), 'B22', INK, { max: 286 }); tag(c, 376, y + 7, 60, 24, r.ab, r.color);
    c.rect(452, y + 14, 220, 10, SURF3, { r: 5 }); if (Number.isFinite(val)) c.rect(452, y + 14, Math.max(8, 220 * (val - floor) / (max - floor || 1)), 10, k === 0 ? ACCENT : bright(r.color), { r: 5 });
    c.text(r.val, 764, base(y, rh - 6, 30), 'D30', INK, { align: 'r' });
  });
  if (!rows.length) c.text('No leaders yet this season.', 40, top + 30, 'T24', INK2);
  return c;
}

/* ---------- /props and /odds ---------- */
const price = n => (Number.isFinite(+n) && n !== null && n !== '' ? (+n > 0 ? '+' + +n : String(+n)) : '-');
function propsCard(v, m) {
  const rows = m.rows.slice(0, 11), rh = 42, top = 134, c = frame(top + rows.length * rh + 56, `${m.name} props`, m.game ? `${m.game} · ${m.ts} ET` : '', { note: 'Best price at the line most books have' });
  [['MARKET', 44, 'l'], ['LINE', 356, 'r'], ['OVER', 560, 'r'], ['UNDER', 764, 'r']].forEach(([l, x, a]) => c.text(l, x, top - 14, 'B19', MUTED, { align: a }));
  rows.forEach((r, k) => {
    const y = top + k * rh; c.rect(20, y, 760, rh - 6, SURF, { r: 12 });
    c.text(r.label, 44, base(y, rh - 6, 22), 'B22', INK); c.text(String(r.line), 356, base(y, rh - 6, 30), 'D30', INK, { align: 'r' });
    [[r.o, 560], [r.u, 764]].forEach(([b, x]) => { if (!b) { c.text('-', x, base(y, rh - 6, 24), 'T24', MUTED, { align: 'r' }); return; } const bw = measure(b[1], 'B19'); c.text(b[1], x, base(y, rh - 6, 19), 'B19', MUTED, { align: 'r' }); c.text(price(b[0]), x - bw - 10, base(y, rh - 6, 24), 'D24', b[0] > 0 ? WIN : INK2, { align: 'r' }); });
  });
  return c;
}
function oddsCard(v, m) {
  const rows = m.games.slice(0, 12), rh = 50, top = 134, c = frame(top + rows.length * rh + 52, `${LGS[m.lg]} odds`, m.label, { note: m.book ? `Lines from ${m.book} · times Eastern` : '' });
  [['GAME', 44, 'l'], ['TIP', 330, 'r'], ['SPREAD', 474, 'r'], ['TOTAL', 584, 'r'], ['MONEYLINE', 764, 'r']].forEach(([l, x, a]) => c.text(l, x, top - 14, 'B19', MUTED, { align: a }));
  rows.forEach((g, k) => {
    const y = top + k * rh, h = rh - 6; c.rect(20, y, 760, h, SURF, { r: 12 });
    tag(c, 36, y + 9, 62, 26, g.a.ab, g.a.color); c.text('@', 112, base(y, h, 20), 'T20', MUTED, { align: 'c' }); tag(c, 126, y + 9, 62, 26, g.h.ab, g.h.color);
    c.text(g.tag, 330, base(y, h, 20), 'T20', stateInk(g), { align: 'r' });
    c.text(g.line || '-', 474, base(y, h, 22), 'B22', INK, { align: 'r' }); c.text(g.ou != null ? String(g.ou) : '-', 584, base(y, h, 24), 'D24', INK, { align: 'r' });
    c.text(g.mlA != null && g.mlH != null ? `${price(g.mlA)} / ${price(g.mlH)}` : '-', 764, base(y, h, 22), 'B22', INK2, { align: 'r' });
  });
  return c;
}

const CARDS = { score: scoreCard, game: (v, g) => (v.tab === 'box' ? boxCard(v, g) : v.tab === 'stats' ? statsCard(v, g) : v.tab === 'wp' ? flowCard(v, g) : gameCard(v, g)), player: playerCard, compare: compareCard, team: teamCard, injuries: injuryCard, standings: standingsCard, leaders: leadersCard, props: propsCard, odds: oddsCard };
export const hasCard = (view, model) => !!CARDS[view.k] && !(view.k === 'score' && !model.games.length) && !(view.k === 'odds' && !model.games.length) && !(view.k === 'props' && !model.rows.length);
export function card(view, model) { return CARDS[view.k](view, model); }
