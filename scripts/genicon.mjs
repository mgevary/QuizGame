/**
 * genicon.mjs — draws the app icons with a tiny hand-rolled PNG encoder, so
 * the build needs no image dependencies. The glyph is a small spiral maze in
 * the app's accent gradient on the app's dark ground.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA pixel buffer (size*size*4) as a PNG. */
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // Simple source-over so the strokes anti-alias against the ground.
    const sa = a / 255;
    buf[i] = Math.round(buf[i] * (1 - sa) + r * sa);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - sa) + g * sa);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - sa) + b * sa);
    buf[i + 3] = 255;
  };

  // Ground: the app's dark background with a subtle vertical lift.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size;
      set(x, y, Math.round(10 + t * 12), Math.round(10 + t * 10), Math.round(21 + t * 26), 255);
    }
  }

  // A square spiral, the most maze-like glyph that stays legible at 32px.
  const pad = Math.round(size * 0.17);
  const stroke = Math.max(2, Math.round(size * 0.085));
  const gap = stroke * 2;
  const grad = (t) => {
    // Accent (#7c6cff) → cyan (#40ddff) across the spiral.
    const r = Math.round(124 + (64 - 124) * t);
    const g = Math.round(108 + (221 - 108) * t);
    const b = Math.round(255 + (255 - 255) * t);
    return [r, g, b];
  };

  const line = (x0, y0, x1, y1, t) => {
    const [r, g, b] = grad(t);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      for (let dy = 0; dy < stroke; dy++) {
        for (let dx = 0; dx < stroke; dx++) set(x + dx, y + dy, r, g, b, 255);
      }
    }
  };

  let left = pad, top = pad, right = size - pad - stroke, bottom = size - pad - stroke;
  let turn = 0;
  const maxTurns = 9;
  while (left < right && top < bottom && turn < maxTurns) {
    const t = turn / maxTurns;
    if (turn % 4 === 0) { line(left, top, right, top, t); top += gap; }
    else if (turn % 4 === 1) { line(right, top - gap, right, bottom, t); right -= gap; }
    else if (turn % 4 === 2) { line(right + gap, bottom, left, bottom, t); bottom -= gap; }
    else { line(left, bottom + gap, left, top, t); left += gap; }
    turn++;
  }

  return png(size, buf);
}

fs.mkdirSync('icons', { recursive: true });
for (const [name, size] of [['favicon-32', 32], ['apple-touch-icon', 180], ['icon-512', 512]]) {
  fs.writeFileSync(`icons/${name}.png`, draw(size));
  console.log(`icons/${name}.png  ${size}x${size}`);
}
