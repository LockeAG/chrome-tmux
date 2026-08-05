// Normalises raw screenshots into Chrome Web Store sizes: fit inside the
// target, then pad to exact dimensions on the Tokyo Night background so every
// shot lines up in the carousel regardless of how it was cropped.
//
// Run: node tools/make-store-shots.js <sourceDir> <outDir>

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = process.argv[2];
const OUT = process.argv[3] ?? 'assets/store';
const PAD = '1a1b26';
const TARGET = { width: 1280, height: 800 };

if (!SRC) {
  console.error('usage: node tools/make-store-shots.js <sourceDir> [outDir]');
  process.exit(1);
}

const sips = (args) => execFileSync('/usr/bin/sips', args, { encoding: 'utf8' });

function dimensions(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  return {
    width: Number(out.match(/pixelWidth:\s*(\d+)/)[1]),
    height: Number(out.match(/pixelHeight:\s*(\d+)/)[1])
  };
}

fs.mkdirSync(OUT, { recursive: true });

const sources = fs
  .readdirSync(SRC)
  .filter((name) => /\.(png|jpe?g)$/i.test(name))
  .sort();

sources.forEach((name, index) => {
  const source = path.join(SRC, name);
  const target = path.join(OUT, `screenshot-${String(index + 1).padStart(2, '0')}.png`);

  const { width, height } = dimensions(source);
  const scale = Math.min(TARGET.width / width, TARGET.height / height);
  const fitted = { w: Math.round(width * scale), h: Math.round(height * scale) };

  sips(['-s', 'format', 'png', source, '--out', target]);
  sips(['-z', String(fitted.h), String(fitted.w), target]);
  sips(['--padToHeightWidth', String(TARGET.height), String(TARGET.width), '--padColor', PAD, target]);

  console.log(`${name} -> ${path.basename(target)} (${fitted.w}x${fitted.h} padded to 1280x800)`);
});

console.log(`\n${sources.length} screenshot(s) in ${OUT}`);
