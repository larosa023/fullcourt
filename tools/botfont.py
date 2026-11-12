#!/usr/bin/env python3
# Builds bot/font.bin: the lettering the Discord bot's image cards are drawn with.
#
# The bot runs on Cloudflare's free plan, which allows about 10 ms of processor time per request. Laying out and
# rasterising vector text in that time isn't possible, so every letter is drawn here, once, at each size the cards
# use, and the bot only copies the finished shapes into place (bot/draw.mjs).
#
# Fonts (both SIL Open Font License, the same two the site uses; licences in bot/fonts/):
#   display.ttf  Archivo 800, width 92     scores, numbers, titles
#   bold.ttf     Instrument Sans 700       names, labels
#   text.ttf     Instrument Sans 500       everything else
# They are static cuts of the variable fonts, trimmed to Latin + Latin Extended-A.
#
# Run:  pip install freetype-py uharfbuzz   then   python3 tools/botfont.py
#
# File layout (little-endian):
#   "FCF1", u16 number of faces
#   per face (16 bytes): u8 family (0 display, 1 text, 2 bold), u8 size, u16 glyph count, u32 glyph table offset,
#                        u32 kerning table offset, u32 kerning pair count
#   glyph (12 bytes):    u16 code point, u16 advance (1/64 px), i8 left, i8 top, u8 width, u8 height, u32 offset of its
#                        coverage bytes (width x height, 0-255)
#   kerning pair (6 bytes, sorted): u16 first, u16 second, i16 adjustment (1/64 px)
import os, struct, freetype, uharfbuzz as hb

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'bot', 'fonts')
FAMILIES = ['display', 'text', 'bold']
ASCII = list(range(0x20, 0x7F)) + [0xB7, 0x2013, 0x2014, 0x2019, 0x2026, 0xD7]
# (family, size, ascii only): the cards' whole type scale. Add a size here before using it in bot/cards.mjs.
FACES = [('display', 96, True), ('display', 60, True), ('display', 40, False), ('display', 30, False), ('display', 24, False),
         ('bold', 28, False), ('bold', 22, False), ('bold', 19, False), ('text', 24, False), ('text', 20, False)]
KERN_SET = [c for c in range(0x21, 0x7F)]

def kerning(path, size):
    blob = hb.Blob.from_file_path(path); face = hb.Face(blob); font = hb.Font(face); upem = face.upem
    def adv(text):
        buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(font, buf, {'kern': True, 'liga': False})
        return [p.x_advance for p in buf.glyph_positions]
    single = {c: adv(chr(c))[0] for c in KERN_SET}
    out = []
    for a in KERN_SET:
        for b in KERN_SET:
            p = adv(chr(a) + chr(b))
            if len(p) != 2: continue
            d = p[0] - single[a]
            v = round(d * size * 64 / upem)
            if v: out.append((a, b, max(-32768, min(32767, v))))
    return sorted(out)

def build():
    faces, blobs = [], bytearray()
    for fam, size, ascii_only in FACES:
        path = os.path.join(FONTS, fam + '.ttf')
        ft = freetype.Face(path); ft.set_pixel_sizes(0, size)
        cps = sorted(c for c, _ in ft.get_chars() if c >= 0x20 and (not ascii_only or c in ASCII))
        glyphs = []
        for cp in cps:
            ft.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
            g = ft.glyph; bm = g.bitmap
            w, h = bm.width, bm.rows
            assert w < 256 and h < 256 and -128 <= g.bitmap_left < 128 and -128 <= g.bitmap_top < 128, (fam, size, cp)
            data = bytes(bm.buffer) if bm.pitch == w else b''.join(bytes(bm.buffer[r * bm.pitch:r * bm.pitch + w]) for r in range(h))
            glyphs.append((cp, min(65535, g.advance.x), g.bitmap_left, g.bitmap_top, w, h, data))
        faces.append((FAMILIES.index(fam), size, glyphs, kerning(path, size)))
        print(f'{fam} {size}: {len(glyphs)} glyphs, {sum(len(g[6]) for g in glyphs)} bytes, {len(faces[-1][3])} kerning pairs')
    head = 6 + 16 * len(faces)
    tables = bytearray(); recs = []
    # first pass: sizes, so offsets are known
    off = head
    layout = []
    for fam, size, glyphs, kern in faces:
        gt = off; off += 12 * len(glyphs); kt = off; off += 6 * len(kern); layout.append((gt, kt))
    data_off = off
    out = bytearray(b'FCF1' + struct.pack('<H', len(faces)))
    for (fam, size, glyphs, kern), (gt, kt) in zip(faces, layout): out += struct.pack('<BBHIII', fam, size, len(glyphs), gt, kt, len(kern))
    for fam, size, glyphs, kern in faces:
        for cp, adv, left, top, w, h, data in glyphs:
            out += struct.pack('<HHbbBBI', cp, adv, left, top, w, h, data_off + len(blobs)); blobs += data
        for a, b, v in kern: out += struct.pack('<HHh', a, b, v)
    assert len(out) == data_off
    out += blobs
    dest = os.path.join(HERE, '..', 'bot', 'font.bin')
    open(dest, 'wb').write(out); print('wrote', os.path.normpath(dest), len(out), 'bytes')

build()
