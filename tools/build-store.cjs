// Produces the Chrome Web Store build: everything except the New Tab Page.
//
// The override is the biggest review risk in the package. It adds two
// permissions to justify and it is the pattern reviewers are trained to
// distrust, all for the feature with the least value. So the store gets a
// narrower extension and the repo keeps the full one.
//
// Run: node tools/build-store.cjs [outDir]

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'dist'));

// Everything the New Tab Page is, and the permissions only it needs.
const DROP_FILES = ['src/newtab.html', 'src/newtab.js'];
const DROP_PERMISSIONS = ['topSites', 'favicon'];
const DROP_MANIFEST_KEYS = ['chrome_url_overrides'];

const COPY = ['manifest.json', 'src', 'icons'];

function copy(from, to) {
  const relative = path.relative(root, from).split(path.sep).join('/');
  if (DROP_FILES.includes(relative)) return;

  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copy(path.join(from, entry), path.join(to, entry));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(out, { recursive: true, force: true });
for (const entry of COPY) copy(path.join(root, entry), path.join(out, entry));

// Settings that only the New Tab Page uses are marked in the markup, so the
// store build can drop them rather than advertise a page it does not ship.
const optionsPage = path.join(out, 'src/options.html');
fs.writeFileSync(
  optionsPage,
  fs.readFileSync(optionsPage, 'utf8').replace(/ *<section data-newtab>[\s\S]*?<\/section>\n\n/g, '')
);

const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
for (const key of DROP_MANIFEST_KEYS) delete manifest[key];
manifest.permissions = manifest.permissions.filter((name) => !DROP_PERMISSIONS.includes(name));
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

/* Validate, because two builds that drift is exactly how this project has
   broken before. Fail the build rather than ship a package that half-mentions
   a page that is not there. */

const problems = [];

const declared = [
  manifest.background.service_worker,
  manifest.options_ui.page,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((entry) => entry.js),
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon)
];

for (const file of declared) {
  if (!fs.existsSync(path.join(out, file))) problems.push(`manifest names a missing file: ${file}`);
}

if (manifest.chrome_url_overrides) problems.push('the new tab override survived');
for (const name of DROP_PERMISSIONS) {
  if (manifest.permissions.includes(name)) problems.push(`permission ${name} survived`);
}

// Nothing left in the package should reference the page that is gone.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(out)) {
  if (!/\.(js|html|json)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('newtab') || /\bnew tab page\b/i.test(text)) {
    problems.push(`${path.relative(out, file)} still mentions the new tab page`);
  }
}

if (problems.length) {
  console.error('store build failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`store build in ${path.relative(process.cwd(), out) || out}`);
console.log(`  permissions: ${manifest.permissions.join(', ')}`);
console.log(`  host: ${manifest.host_permissions.join(', ')}`);
console.log('  new tab page: removed');
