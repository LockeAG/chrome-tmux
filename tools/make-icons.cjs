// Generates the extension icons. No dependencies: raw PNG via zlib.
// Run: node tools/make-icons.js icons

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = process.argv[2] ?? 'icons';

// Tokyo Night
const BG = [26, 27, 38, 255];
const FG = [158, 206, 106, 255];
const CLEAR = [0, 0, 0, 0];

const table = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// A rounded terminal tile with a block cursor sitting on a prompt line.
function pixel(x, y, size) {
  const radius = size <= 16 ? 3 : size * 0.22;
  const inset = size <= 16 ? 0 : size * 0.06;
  const min = inset;
  const max = size - inset;
  if (x < min || y < min || x >= max || y >= max) return CLEAR;

  const cx = Math.min(Math.max(x + 0.5, min + radius), max - radius);
  const cy = Math.min(Math.max(y + 0.5, min + radius), max - radius);
  if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) return CLEAR;

  const px = x + 0.5;
  const py = y + 0.5;

  const block = px >= size * 0.34 && px < size * 0.66 && py >= size * 0.26 && py < size * 0.62;
  const line = px >= size * 0.26 && px < size * 0.74 && py >= size * 0.70 && py < size * 0.80;
  return block || line ? FG : BG;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(size, pixel));
}
console.log('wrote icons to', OUT);
