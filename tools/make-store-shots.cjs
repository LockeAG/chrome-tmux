// Normalises raw screenshots into Chrome Web Store sizes.
//
// Crops the largest centred rectangle matching the target aspect, then scales
// that to size. Cropping rather than padding keeps the frame full and, for a
// browser capture, makes the rescale close to 1:1 instead of shrinking the
// whole shot to fit between two bars.
//
// Capture crisply in the first place: a browser screenshot comes back around
// 1512px wide however large the viewport is, so on a big display the UI is
// downscaled to mush before this script sees it. Zoom the page first
// (document.documentElement.style.zoom = '3') so the interface is physically
// large in the frame.
//
// Run: node tools/make-store-shots.cjs <sourceDir> <outDir>

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
  const aspect = TARGET.width / TARGET.height;

  // Largest centred rectangle of the target aspect that fits the source.
  const crop = width / height > aspect
    ? { w: Math.round(height * aspect), h: height }
    : { w: width, h: Math.round(width / aspect) };

  sips(['-s', 'format', 'png', source, '--out', target]);
  sips(['-c', String(crop.h), String(crop.w), target]);
  sips(['-z', String(TARGET.height), String(TARGET.width), target]);
  // No-op unless sips rounded, but keeps the output exactly on size.
  sips(['--padToHeightWidth', String(TARGET.height), String(TARGET.width), '--padColor', PAD, target]);

  const ratio = (TARGET.width / crop.w).toFixed(2);
  console.log(`${name} -> ${path.basename(target)} (crop ${crop.w}x${crop.h}, scale ${ratio}x)`);
});

console.log(`\n${sources.length} screenshot(s) in ${OUT}`);
