// A very small drawing kit for the Discord bot's image cards: filled and rounded boxes, gradients, text, lines, rings,
// and a PNG writer. It exists because the bot runs on Cloudflare's free plan (about 10 ms of processor time a request):
// a real vector renderer needs several times that, this needs 2-4 ms. Text is copied from letters drawn ahead of time
// (bot/font.bin, built by tools/botfont.py), so only the sizes listed there exist.
// Colours are 0xRRGGBB numbers. Coordinates are pixels; text y is the baseline.

/* ---------- lettering ---------- */
// font.bin is read in place: nothing is unpacked when the bot starts, and a face costs nothing until a card uses it.
const FAMILY = ['D', 'T', 'B']; // display, text, bold: a face is named family + size, e.g. "D40", "B22"
let FACES = null;
export function loadFonts(buffer) {
  if (FACES) return;
  const dv = new DataView(buffer), faces = {};
  if (dv.getUint32(0, true) !== 0x31464346) throw new Error('font.bin: not a font file');
  for (let f = 0, n = dv.getUint16(4, true); f < n; f++) {
    const o = 6 + f * 16;
    faces[FAMILY[dv.getUint8(o)] + dv.getUint8(o + 1)] = { dv, u8: new Uint8Array(buffer), ng: dv.getUint16(o + 2, true), gt: dv.getUint32(o + 4, true), kt: dv.getUint32(o + 8, true), nk: dv.getUint32(o + 12, true), glyphs: new Map(), kerns: new Map() };
  }
  FACES = faces;
}
const face = name => { const f = FACES?.[name]; if (!f) throw new Error(`no lettering for "${name}" (add the size in tools/botfont.py)`); return f; };
// one letter's record, found by binary search in the sorted table and remembered
function lookup(f, cp) {
  let g = f.glyphs.get(cp); if (g !== undefined) return g;
  g = null;
  for (let lo = 0, hi = f.ng - 1; lo <= hi;) { const mid = lo + hi >> 1, p = f.gt + mid * 12, c = f.dv.getUint16(p, true); if (c === cp) { g = { adv: f.dv.getUint16(p + 2, true) / 64, left: f.dv.getInt8(p + 4), top: f.dv.getInt8(p + 5), w: f.dv.getUint8(p + 6), h: f.dv.getUint8(p + 7), at: f.dv.getUint32(p + 8, true) }; break; } if (c < cp) lo = mid + 1; else hi = mid - 1; }
  f.glyphs.set(cp, g); return g;
}
// the spacing adjustment between two letters (0 for most pairs)
function kern(f, a, b) {
  const key = a * 65536 + b; let v = f.kerns.get(key); if (v !== undefined) return v;
  v = 0;
  for (let lo = 0, hi = f.nk - 1; lo <= hi;) { const mid = lo + hi >> 1, p = f.kt + mid * 6, k = f.dv.getUint16(p, true) * 65536 + f.dv.getUint16(p + 2, true); if (k === key) { v = f.dv.getInt16(p + 4, true) / 64; break; } if (k < key) lo = mid + 1; else hi = mid - 1; }
  f.kerns.set(key, v); return v;
}
// the letter to draw for a character: itself, or without its accent, or a question mark
function glyphOf(f, cp) {
  let g = lookup(f, cp);
  if (!g && cp > 0x7f) { const base = String.fromCodePoint(cp).normalize('NFD').codePointAt(0); g = lookup(f, base) || lookup(f, cp === 0x2019 || cp === 0x2018 ? 0x27 : cp === 0x2014 || cp === 0x2013 ? 0x2d : cp === 0x2026 ? 0x2e : 0x3f); }
  return g || lookup(f, 0x3f);
}
export function measure(str, font) {
  const f = face(font); let w = 0, prev = 0;
  for (const ch of String(str)) { const cp = ch.codePointAt(0), g = glyphOf(f, cp); if (!g) continue; w += g.adv + (prev ? kern(f, prev, cp) : 0); prev = cp; }
  return w;
}
// the text, shortened with "…" until it fits
export function fit(str, font, max) {
  let s = String(str); if (measure(s, font) <= max) return s;
  while (s.length > 1 && measure(s + '…', font) > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/* ---------- canvas ---------- */
export const mix = (a, b, t) => { const k = Math.max(0, Math.min(1, t)), ch = s => Math.round((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * k); return ch(16) << 16 | ch(8) << 8 | ch(0); };
// perceived brightness 0-1, to choose light or dark text on a colour
export const luma = c => (0.2126 * (c >> 16 & 255) + 0.7152 * (c >> 8 & 255) + 0.0722 * (c & 255)) / 255;

// The pixels are kept exactly as a PNG stores them (per row: one filter byte, then R G B per pixel), so writing the
// file is compression only, with no conversion pass.
export class Canvas {
  constructor(w, h, bg = 0) {
    this.w = w; this.h = h; this.row = w * 3 + 1; this.px = new Uint8Array(this.row * h);
    this._span(0, 0, w, bg, 1);
    for (let y = 1; y < h; y++) this.px.copyWithin(y * this.row, 0, this.row); // every row starts as a copy of the first
  }
  // blend one pixel towards a colour by cov (0-1)
  _mix(x, y, c, cov) {
    if (cov <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const p = y * this.row + 1 + x * 3, px = this.px;
    if (cov >= 1) { px[p] = c >>> 16 & 255; px[p + 1] = c >>> 8 & 255; px[p + 2] = c & 255; return; }
    const k = cov * 256 | 0; px[p] += ((c >>> 16 & 255) - px[p]) * k >> 8; px[p + 1] += ((c >>> 8 & 255) - px[p + 1]) * k >> 8; px[p + 2] += ((c & 255) - px[p + 2]) * k >> 8;
  }
  _span(y, x0, x1, c, a) { // [x0, x1) on one row
    if (y < 0 || y >= this.h) return; x0 = Math.max(0, x0); x1 = Math.min(this.w, x1); if (x1 <= x0) return;
    if (a < 1) { for (let x = x0; x < x1; x++) this._mix(x, y, c, a); return; }
    const px = this.px, from = y * this.row + 1 + x0 * 3, to = y * this.row + 1 + x1 * 3;
    px[from] = c >>> 16 & 255; px[from + 1] = c >>> 8 & 255; px[from + 2] = c & 255;
    for (let n = 3; from + n < to; n *= 2) px.copyWithin(from + n, from, Math.min(from + n, to - n)); // double what's filled until the span is full
  }
  // fill: a colour, or { v: [top, bottom] } / { h: [left, right] } for a gradient. r: corner radius, a: opacity
  rect(x, y, w, h, fill, { r = 0, a = 1 } = {}) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w <= 0 || h <= 0) return this;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const solid = typeof fill === 'number', vert = !solid && fill.v, horiz = !solid && fill.h;
    let copyFrom = -1; // a finished full-width row of a solid box: later rows are copies of it
    // a left-to-right gradient is the same on every row: work its colours out once
    let across = null; if (horiz) { across = new Int32Array(w); for (let i = 0; i < w; i++) across[i] = mix(horiz[0], horiz[1], w > 1 ? i / (w - 1) : 0); }
    for (let j = 0; j < h; j++) {
      const yy = y + j; if (yy < 0 || yy >= this.h) continue;
      const rowC = solid ? fill : vert ? mix(vert[0], vert[1], h > 1 ? j / (h - 1) : 0) : 0;
      const colC = i => (across ? across[i] : rowC);
      // how far into a rounded corner this row is
      const cy = j < r ? r : j >= h - r ? h - r : -1;
      let inset = 0;
      if (cy >= 0) {
        const dy = j + 0.5 - cy; inset = Math.ceil(r);
        for (let i = 0; i < inset; i++) {
          const cov = Math.max(0, Math.min(1, r - Math.hypot(i + 0.5 - r, dy) + 0.5)) * a;
          if (cov > 0) { this._mix(x + i, yy, colC(i), cov); this._mix(x + w - 1 - i, yy, colC(w - 1 - i), cov); }
        }
      }
      if (horiz) { if (a >= 1 && copyFrom >= 0) this._copy(copyFrom, yy, x + inset, x + w - inset); else { for (let i = inset; i < w - inset; i++) this._mix(x + i, yy, across[i], a); if (a >= 1 && cy < 0) copyFrom = yy; } }
      else if (solid && a >= 1 && cy < 0 && copyFrom >= 0) this._copy(copyFrom, yy, x, x + w);
      else { this._span(yy, x + inset, x + w - inset, rowC, a); if (solid && a >= 1 && cy < 0) copyFrom = yy; }
    }
    return this;
  }
  _copy(fromY, toY, x0, x1) { x0 = Math.max(0, x0); x1 = Math.min(this.w, x1); if (x1 > x0) this.px.copyWithin(toY * this.row + 1 + x0 * 3, fromY * this.row + 1 + x0 * 3, fromY * this.row + 1 + x1 * 3); }
  // align: 'l' (x is the left edge), 'c' (centre) or 'r' (right edge). max: shorten to this width. Returns the width drawn
  text(str, x, y, font, color, { align = 'l', a = 1, max = 0 } = {}) {
    const f = face(font), s = max ? fit(str, font, max) : String(str);
    const width = measure(s, font); let pen = align === 'c' ? x - width / 2 : align === 'r' ? x - width : x, prev = 0;
    const W = this.w, H = this.h, px = this.px, row = this.row, u8 = f.u8, R = color >>> 16 & 255, G = color >>> 8 & 255, B = color & 255;
    for (const ch of s) {
      const cp = ch.codePointAt(0), g = glyphOf(f, cp); if (!g) continue;
      if (prev) pen += kern(f, prev, cp);
      const gx = Math.round(pen + g.left), gy = Math.round(y - g.top);
      for (let j = 0; j < g.h; j++) {
        const yy = gy + j; if (yy < 0 || yy >= H) continue;
        let src = g.at + j * g.w, p = yy * row + 1 + gx * 3;
        for (let i = 0; i < g.w; i++, src++, p += 3) {
          const c = u8[src]; if (!c) continue; const xx = gx + i; if (xx < 0 || xx >= W) continue;
          const k = a >= 1 ? c + (c >> 7) : (c + (c >> 7)) * a | 0;
          px[p] += (R - px[p]) * k >> 8; px[p + 1] += (G - px[p + 1]) * k >> 8; px[p + 2] += (B - px[p + 2]) * k >> 8;
        }
      }
      pen += g.adv; prev = cp;
    }
    return width;
  }
  circle(cx, cy, r, color, a = 1) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) this._mix(x, y, color, Math.max(0, Math.min(1, r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5)) * a);
    return this;
  }
  // part of a ring, clockwise from the top; from/to are fractions of a full turn (0-1)
  ring(cx, cy, r, width, color, from = 0, to = 1, a = 1) {
    const hw = width / 2, full = to - from >= 0.9999;
    for (let y = Math.floor(cy - r - hw - 1); y <= cy + r + hw + 1; y++) for (let x = Math.floor(cx - r - hw - 1); x <= cx + r + hw + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, cov = Math.max(0, Math.min(1, hw - Math.abs(Math.hypot(dx, dy) - r) + 0.5)); if (!cov) continue;
      if (!full) { let t = Math.atan2(dx, -dy) / (2 * Math.PI); if (t < 0) t += 1; if (t < from || t > to) continue; }
      this._mix(x, y, color, cov * a);
    }
    return this;
  }
  // a line through the points ([[x, y], ...]) with round ends and joins
  line(pts, width, color, a = 1) {
    const hw = width / 2;
    for (let s = 0; s + 1 < pts.length; s++) {
      const [x0, y0] = pts[s], [x1, y1] = pts[s + 1], dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
      for (let y = Math.floor(Math.min(y0, y1) - hw - 1); y <= Math.max(y0, y1) + hw + 1; y++) for (let x = Math.floor(Math.min(x0, x1) - hw - 1); x <= Math.max(x0, x1) + hw + 1; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2)), d = Math.hypot(x + 0.5 - x0 - t * dx, y + 0.5 - y0 - t * dy);
        this._mix(x, y, color, Math.max(0, Math.min(1, hw - d + 0.5)) * a);
      }
    }
    return this;
  }
  // the area between a line through the points and the row `base`, fading from opacity a0 at the line to a1 at the base
  area(pts, base, color, a0 = 0.35, a1 = 0) {
    for (let s = 0; s + 1 < pts.length; s++) {
      const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const yt = y0 + (y1 - y0) * ((x + 0.5 - x0) / (x1 - x0 || 1)), top = Math.min(yt, base), bot = Math.max(yt, base), span = bot - top || 1;
        for (let y = Math.floor(top); y < bot; y++) { const k = (y + 0.5 - top) / span, f = yt <= base ? k : 1 - k; this._mix(x, y, color, a0 + (a1 - a0) * f); }
      }
    }
    return this;
  }
  png() { return encodePNG(this.px, this.w, this.h); }
}

/* ---------- PNG ---------- */
// The browser-standard compressor (CompressionStream) only runs at its thorough setting, about 8 ms for one card. This
// one is the quick kind: one look-back per position and the fixed code table from the Deflate spec (RFC 1951). Files
// come out roughly twice the size (still 100-250 KB) in a quarter of the time. The Adler-32 checksum zlib needs is
// summed in the same pass.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], LEN_XB = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], DIST_XB = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
let T = null;
function tables() {
  const rev = (v, n) => { let r = 0; for (let i = 0; i < n; i++) r = r << 1 | (v >> i & 1); return r; };
  const sym = s => (s < 144 ? [rev(0x30 + s, 8), 8] : s < 256 ? [rev(0x190 + s - 144, 9), 9] : s < 280 ? [rev(s - 256, 7), 7] : [rev(0xc0 + s - 280, 8), 8]);
  const litC = new Uint16Array(256), litN = new Uint8Array(256), lenC = new Uint32Array(259), lenN = new Uint8Array(259), distSym = new Uint8Array(512);
  for (let s = 0; s < 256; s++) [litC[s], litN[s]] = sym(s);
  for (let k = 0; k < 29; k++) for (let l = LEN_BASE[k]; l <= (k < 28 ? LEN_BASE[k + 1] - 1 : 258); l++) { if (k < 28 && l === 258) continue; const [c, n] = sym(257 + k); lenC[l] = c | (l - LEN_BASE[k]) << n; lenN[l] = n + LEN_XB[k]; }
  { const [c, n] = sym(285); lenC[258] = c; lenN[258] = n; }
  // distance -> its code number: direct for 1-256, by the top bits above that (the way zlib does it)
  for (let k = 0; k < 30; k++) for (let d = DIST_BASE[k]; d < (k < 29 ? DIST_BASE[k + 1] : 32769); d++) { if (d <= 256) distSym[d - 1] = k; else distSym[256 + ((d - 1) >> 7)] = k; }
  const distC = new Uint8Array(30); for (let k = 0; k < 30; k++) distC[k] = rev(k, 5);
  return { litC, litN, lenC, lenN, distSym, distC, eob: sym(256), head: new Int32Array(1 << 15) };
}
// zlib stream (header, one fixed-code block, Adler-32) of `a`
export function deflateFast(a) {
  T ||= tables();
  const { litC, litN, lenC, lenN, distSym, distC, head } = T, n = a.length, out = new Uint8Array(Math.ceil(n * 9 / 8) + 16);
  head.fill(-1);
  let o = 2, bits = 3, nb = 3, i = 0, s1 = 1, s2 = 0, pend = 0; // bits: final block (1), fixed codes (01)
  out[0] = 0x78; out[1] = 0x01;
  const end = n - 4;
  while (i < n) {
    let len = 0, cand = -1;
    if (i <= end) {
      const v = a[i] | a[i + 1] << 8 | a[i + 2] << 16 | a[i + 3] << 24, h = Math.imul(v, 0x9e3779b1) >>> 17;
      cand = head[h]; head[h] = i;
      if (cand >= 0 && i - cand <= 32768 && (a[cand] | a[cand + 1] << 8 | a[cand + 2] << 16 | a[cand + 3] << 24) === v) {
        // count how far the repeat goes, adding the bytes to the checksum as they are read
        const max = Math.min(258, n - i); len = 4;
        s1 += a[i]; s2 += s1; s1 += a[i + 1]; s2 += s1; s1 += a[i + 2]; s2 += s1; s1 += a[i + 3]; s2 += s1;
        for (let b; len < max && (b = a[i + len]) === a[cand + len]; len++) { s1 += b; s2 += s1; }
      }
    }
    if (len) {
      const d = i - cand, k = d <= 256 ? distSym[d - 1] : distSym[256 + ((d - 1) >> 7)];
      bits |= lenC[len] << nb; nb += lenN[len];
      while (nb >= 8) { out[o++] = bits & 255; bits >>>= 8; nb -= 8; }
      bits |= (distC[k] | (d - DIST_BASE[k]) << 5) << nb; nb += 5 + DIST_XB[k];
      while (nb >= 8) { out[o++] = bits & 255; bits >>>= 8; nb -= 8; }
      i += len; pend += len;
    } else {
      const b = a[i++];
      bits |= litC[b] << nb; nb += litN[b];
      while (nb >= 8) { out[o++] = bits & 255; bits >>>= 8; nb -= 8; }
      s1 += b; s2 += s1; pend++;
    }
    if (pend > 3000) { s1 %= 65521; s2 %= 65521; pend = 0; }
  }
  bits |= T.eob[0] << nb; nb += T.eob[1];
  while (nb > 0) { out[o++] = bits & 255; bits >>>= 8; nb -= 8; }
  s1 %= 65521; s2 %= 65521;
  out[o++] = s2 >>> 8; out[o++] = s2 & 255; out[o++] = s1 >>> 8; out[o++] = s1 & 255;
  return out.subarray(0, o);
}
let CRC = null;
const crc32 = (u8, from, to) => { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = 0xffffffff; for (let i = from; i < to; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// rows: the image as PNG scanlines (filter byte 0, then RGB), which is how Canvas keeps it
export function encodePNG(rows, w, h) {
  const z = deflateFast(rows), out = new Uint8Array(8 + 25 + 12 + z.length + 12), dv = new DataView(out.buffer);
  out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8;
  const chunk = (type, len, fillData) => { dv.setUint32(o, len); for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i); fillData(o + 8); dv.setUint32(o + 8 + len, crc32(out, o + 4, o + 8 + len)); o += 12 + len; };
  chunk('IHDR', 13, p => { dv.setUint32(p, w); dv.setUint32(p + 4, h); out[p + 8] = 8; out[p + 9] = 2; });
  chunk('IDAT', z.length, p => out.set(z, p));
  chunk('IEND', 0, () => {});
  return out;
}
