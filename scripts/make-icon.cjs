'use strict';

/**
 * Generates the Sunspire app icon as a crisp pixel-art PNG.
 * Run: node scripts/make-icon.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 64;
const SCALE = 4;
const pixels = new Uint8Array(SIZE * SIZE * 4);

function hex(value) {
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16)
  ];
}

function put(x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const index = (y * SIZE + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = alpha;
}

function insideRounded(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x > right || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

const bg = hex('#0b0e08');
const border = hex('#c6f95e');
const borderDim = hex('#5d7c2b');
const top = hex('#9fdd52');
const topLight = hex('#c6f95e');
const topShade = hex('#7cbd3b');
const left = hex('#5f9b39');
const leftDark = hex('#3f7126');
const right = hex('#4a7f2c');
const rightDark = hex('#2f5a1a');
const dirt = hex('#8a6239');
const dirtDark = hex('#644526');
const shine = hex('#e2ff9d');

// Rounded dark tile with acid frame.
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    if (!insideRounded(x, y, 2, 2, SIZE - 3, SIZE - 3, 9)) continue;
    const frame =
      !insideRounded(x, y, 4, 4, SIZE - 5, SIZE - 5, 7) ||
      (x >= 4 && x <= 5) || (x >= SIZE - 6 && x <= SIZE - 5) ||
      (y >= 4 && y <= 5) || (y >= SIZE - 6 && y <= SIZE - 5);
    put(x, y, frame ? (x + y > SIZE ? borderDim : border) : bg);
  }
}

// Isometric grass block.
const topFace = [
  [32, 2],
  [52, 12],
  [32, 22],
  [12, 12]
];
const leftFace = [
  [12, 12],
  [32, 22],
  [32, 44],
  [12, 34]
];
const rightFace = [
  [32, 22],
  [52, 12],
  [52, 34],
  [32, 44]
];
const leftGrass = [
  [12, 12],
  [32, 22],
  [32, 28],
  [12, 18]
];
const rightGrass = [
  [32, 22],
  [52, 12],
  [52, 18],
  [32, 28]
];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function fillPoly(poly, colorFor) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!inPoly(x, y, poly)) continue;
      const color = colorFor(x, y);
      if (color) put(x, y, color);
    }
  }
}

fillPoly(leftFace, (x, y) => {
  if (inPoly(x, y, leftGrass)) {
    if ((x * 3 + y) % 11 === 0) return leftDark;
    return y > 18 ? left : hex('#6cab41');
  }
  if (y - (12 + (x - 12) / 2) < 7) return leftDark;
  if ((x + y) % 7 === 0) return dirtDark;
  return dirt;
});

fillPoly(rightFace, (x, y) => {
  if (inPoly(x, y, rightGrass)) {
    if ((x * 5 + y) % 13 === 0) return rightDark;
    return right;
  }
  if (y - (12 + (52 - x) / 2) < 7) return rightDark;
  if ((x + y) % 5 === 0) return hex('#523820');
  return dirtDark;
});

fillPoly(topFace, (x, y) => {
  if ((x * 7 + y * 13) % 29 === 0) return topShade;
  if ((x * 5 + y * 3) % 37 === 0) return topLight;
  if (y < 8) return topLight;
  if (x > 44 || y > 16) return topShade;
  return top;
});

// Soft pixel highlights on the top rim.
put(18, 11, shine);
put(19, 11, shine);
put(20, 10, shine);
put(18, 12, shine);

// Encode PNG.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const outSize = SIZE * SCALE;
const raw = Buffer.alloc((outSize * 4 + 1) * outSize);

for (let y = 0; y < outSize; y += 1) {
  const rowStart = y * (outSize * 4 + 1);
  raw[rowStart] = 0;
  const sourceY = Math.floor(y / SCALE);
  for (let x = 0; x < outSize; x += 1) {
    const sourceX = Math.floor(x / SCALE);
    const src = (sourceY * SIZE + sourceX) * 4;
    const dst = rowStart + 1 + x * 4;
    raw[dst] = pixels[src];
    raw[dst + 1] = pixels[src + 1];
    raw[dst + 2] = pixels[src + 2];
    raw[dst + 3] = pixels[src + 3];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outSize, 0);
ihdr.writeUInt32BE(outSize, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const target = path.join(__dirname, '..', 'public', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, png);
console.log(`[sunspire] icon written: ${target} (${outSize}x${outSize}, ${png.length} bytes)`);
