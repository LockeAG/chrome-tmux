// Cuts a single capture of tools/promo.html into the Chrome Web Store promo
// formats. Fit inside the target, then pad on the Tokyo Night background. The
// promo page is flat and centred, so the padding leaves no seam.
//
// Run: node tools/make-promo.js <capture.png|jpg> [outDir]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = process.argv[2];
const OUT = process.argv[3] ?? 'assets/store';
const PAD = '1a1b26';
// A browser capture leaves a lot of air around a centred composition. Crop in
// first, or the logo ends up a stamp in the middle of the small tile.
const TIGHTEN = 0.62;

const FORMATS = [
  { name: 'cover', width: 1280, height: 800 },
  { name: 'promo-small', width: 440, height: 280 },
  { name: 'promo-marquee', width: 1400, height: 560 }
];

if (!SRC) {
  console.error('usage: node tools/make-promo.js <capture> [outDir]');
  process.exit(1);
}

const sips = (args) => execFileSync('/usr/bin/sips', args, { encoding: 'utf8' });

function dimensions(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  const width = out.match(/pixelWidth:\s*(\d+)/);
  const height = out.match(/pixelHeight:\s*(\d+)/);
  if (!width || !height) throw new Error(`sips gave no dimensions for ${file}`);
  return { width: Number(width[1]), height: Number(height[1]) };
}

fs.mkdirSync(OUT, { recursive: true });
const raw = dimensions(SRC);
const source = {
  width: Math.round(raw.width * TIGHTEN),
  height: Math.round(raw.height * TIGHTEN)
};

FORMATS.forEach((format) => {
  const target = path.join(OUT, `${format.name}.png`);
  const scale = Math.min(format.width / source.width, format.height / source.height);
  const fitted = {
    w: Math.round(source.width * scale),
    h: Math.round(source.height * scale)
  };

  sips(['-s', 'format', 'png', SRC, '--out', target]);
  sips(['-c', String(source.height), String(source.width), target]);
  sips(['-z', String(fitted.h), String(fitted.w), target]);
  sips([
    '--padToHeightWidth', String(format.height), String(format.width),
    '--padColor', PAD, target
  ]);

  console.log(`${format.name}.png ${format.width}x${format.height}`);
});
