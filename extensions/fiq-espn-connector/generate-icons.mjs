// Generates icon16.png, icon48.png, icon128.png
// Design: dark gray-950 background, gold (#D4AF37) rounded fill with dark "F"
// Pure Node.js — no extra dependencies.

import zlib   from 'node:zlib';
import fs     from 'node:fs';
import path   from 'node:path';

// ── CRC32 ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    CRC_TABLE[i] = c;
}
function crc32(buf) {
    let crc = 0xffffffff;
    for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG chunk ─────────────────────────────────────────────────────────────────

function chunk(type, data) {
    const lenBuf  = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const body    = Buffer.concat([typeBuf, data]);
    const crcBuf  = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body));
    return Buffer.concat([lenBuf, body, crcBuf]);
}

// ── Icon renderer ─────────────────────────────────────────────────────────────
// Each icon is size×size pixels, RGB (no alpha in IHDR so Chrome renders cleanly).
// Design:
//   - Background: gray-950 (#030712)
//   - Gold rounded square: #D4AF37, inset ~12% each side, corner radius ~18%
//   - "F" glyph: dark (#030712) centered on the gold square

const BG   = [3,   7,  18];   // gray-950
const GOLD = [212, 175, 55];  // #D4AF37
const DARK = [3,   7,  18];   // letter color on gold

// "F" as a 5-column × 7-row bitmap (1 = draw, 0 = background)
const F_GLYPH = [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
];
const GLYPH_ROWS = F_GLYPH.length;   // 7
const GLYPH_COLS = F_GLYPH[0].length; // 5

function lerp(a, b, t) { return a + (b - a) * t; }

function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
    const dx = Math.abs(px - cx) - (hw - r);
    const dy = Math.abs(py - cy) - (hh - r);
    return Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) + Math.min(Math.max(dx, dy), 0) - r;
}

function makeIcon(size) {
    const cx   = (size - 1) / 2;
    const cy   = (size - 1) / 2;
    const hw   = size * 0.38;  // half-width of gold square
    const hh   = size * 0.38;  // half-height
    const r    = size * 0.12;  // corner radius
    const aa   = 1.0;          // anti-aliasing width in pixels

    // Glyph placement
    const cellW = (hw * 2 * 0.62) / GLYPH_COLS;
    const cellH = (hh * 2 * 0.72) / GLYPH_ROWS;
    const gW    = cellW * GLYPH_COLS;
    const gH    = cellH * GLYPH_ROWS;
    const gLeft = cx - gW / 2;
    const gTop  = cy - gH / 2;

    const pixels = new Uint8Array(size * size * 3);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // SDF distance to rounded rect edge (negative = inside)
            const dist  = roundedRectSDF(x, y, cx, cy, hw, hh, r);
            // Coverage: 1 = fully inside gold square, 0 = fully outside
            const cover = Math.min(1, Math.max(0, (-dist + 0.5) / aa));

            // Is this pixel part of the "F" glyph?
            const col = Math.floor((x - gLeft) / cellW);
            const row = Math.floor((y - gTop)  / cellH);
            let glyphOn = false;
            if (row >= 0 && row < GLYPH_ROWS && col >= 0 && col < GLYPH_COLS) {
                glyphOn = F_GLYPH[row][col] === 1;
            }

            // Color on the gold layer
            const goldLayerColor = glyphOn ? DARK : GOLD;

            // Blend bg → gold layer based on coverage
            const R = Math.round(lerp(BG[0], goldLayerColor[0], cover));
            const G = Math.round(lerp(BG[1], goldLayerColor[1], cover));
            const B = Math.round(lerp(BG[2], goldLayerColor[2], cover));

            const i = (y * size + x) * 3;
            pixels[i]     = R;
            pixels[i + 1] = G;
            pixels[i + 2] = B;
        }
    }

    // Build raw PNG scan lines (filter byte 0 = None, then RGB per pixel)
    const rowSize = 1 + size * 3;
    const raw     = Buffer.alloc(size * rowSize);
    for (let y = 0; y < size; y++) {
        raw[y * rowSize] = 0; // filter: None
        for (let x = 0; x < size; x++) {
            const src  = (y * size + x) * 3;
            const dest = y * rowSize + 1 + x * 3;
            raw[dest]     = pixels[src];
            raw[dest + 1] = pixels[src + 1];
            raw[dest + 2] = pixels[src + 2];
        }
    }

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData[8]  = 8; // bit depth
    ihdrData[9]  = 2; // color type: RGB truecolor
    ihdrData[10] = 0; // deflate
    ihdrData[11] = 0; // adaptive filter
    ihdrData[12] = 0; // no interlace

    const compressed = zlib.deflateSync(raw);
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdrData),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ── Write icons ───────────────────────────────────────────────────────────────

const outDir = path.join(import.meta.dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
    const buf  = makeIcon(size);
    const file = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(file, buf);
    console.log(`✓  icons/icon${size}.png  (${buf.length} bytes)`);
}

console.log('\nDone. Replace with branded assets before Chrome Web Store submission.');
