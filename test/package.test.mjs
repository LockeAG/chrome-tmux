import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The content scripts are loaded from five places: the manifest, the on-demand
// injection in the service worker, and three HTML pages. Nothing in Chrome
// keeps those lists in step, and twice now a new file was added to one and
// forgotten in the others, leaving a page that threw on its first line and
// silently did nothing. These tests are the thing that notices.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

const CONTENT_SCRIPTS = manifest.content_scripts[0].js;

/** Every `<script src>` in an HTML file, resolved from the repo root. */
function scriptsIn(htmlPath) {
  const dir = path.posix.dirname(htmlPath);
  return [...read(htmlPath).matchAll(/<script\s+src="([^"]+)"/g)]
    .map((match) => path.posix.normalize(path.posix.join(dir, match[1])));
}

const HTML_PAGES = ['src/newtab.html', 'src/popup.html', 'src/options.html'];

test('every path the manifest names exists', () => {
  const declared = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    manifest.action.default_popup,
    manifest.chrome_url_overrides.newtab,
    ...CONTENT_SCRIPTS,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];

  for (const file of declared) {
    assert.ok(existsSync(path.join(root, file)), `manifest names a missing file: ${file}`);
  }
});

test('every script an HTML page loads exists', () => {
  for (const page of HTML_PAGES) {
    for (const script of scriptsIn(page)) {
      assert.ok(existsSync(path.join(root, script)), `${page} loads a missing file: ${script}`);
    }
  }
});

test('the service worker injects exactly what the manifest declares', () => {
  const source = read('src/background.js');
  const match = source.match(/executeScript\(\{[\s\S]*?files:\s*\[([\s\S]*?)\]/);
  assert.ok(match, 'could not find the injected file list in ensureContentScript');

  const injected = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    injected,
    CONTENT_SCRIPTS,
    'the on-demand injection and the manifest disagree, so tabs open before install get a different set'
  );
});

test('a page loading the content script loads its dependencies first, in order', () => {
  const main = CONTENT_SCRIPTS.at(-1);

  for (const page of HTML_PAGES) {
    const scripts = scriptsIn(page);
    if (!scripts.includes(main)) continue;

    const required = scripts.filter((script) => CONTENT_SCRIPTS.includes(script));
    assert.deepEqual(
      required,
      CONTENT_SCRIPTS,
      `${page} loads ${main} without the rest, or out of order, so it throws before any key works`
    );
  }
});

test('a page using the settings global loads settings.js', () => {
  const settings = CONTENT_SCRIPTS.find((file) => file.endsWith('settings.js'));
  assert.ok(settings, 'settings.js is no longer a content script, update this test');

  for (const page of HTML_PAGES) {
    const scripts = scriptsIn(page);
    const usesSettings = scripts
      .filter((script) => script.endsWith('.js') && existsSync(path.join(root, script)))
      .some((script) => read(script).includes('SV_SETTINGS'));

    if (!usesSettings) continue;
    assert.ok(
      scripts.includes(settings),
      `${page} reads SV_SETTINGS but never loads ${settings}`
    );
  }
});

test('every prefix key in the help is implemented, and the other way round', () => {
  const ui = read('src/content/ui.js');
  const background = read('src/background.js');

  const keymap = ui.match(/const KEYMAP = \[([\s\S]*?)\n {2}\];/);
  assert.ok(keymap, 'could not find KEYMAP in ui.js');

  // Rows look like ['C-a b / l', '…']. Take the keys, drop the prefix itself.
  const documented = new Set();
  for (const [, keys] of keymap[1].matchAll(/\['(C-a [^']+)'/g)) {
    for (const part of keys.replace('C-a ', '').split(' / ')) {
      // Ctrl-O reaches the worker as a bare `o`, so Ctrl-O and o are one key.
      const raw = part.trim();
      const stripped = raw.replace(/^(Ctrl|C)-/i, '');
      const key = stripped === raw ? raw : stripped.toLowerCase();
      if (key && key !== 'a' && key.toLowerCase() !== 'esc') documented.add(key);
    }
  }

  // Handled in the page, never sent to the worker.
  const local = new Set(['?']);
  // Ranges the worker matches with a regex rather than a case.
  const ranged = new Set(['1-9']);

  const implemented = new Set(
    [...background.matchAll(/^\s{4}case '(.)':/gm)].map((m) => m[1])
  );

  for (const key of documented) {
    if (local.has(key) || ranged.has(key)) continue;
    assert.ok(
      implemented.has(key),
      `the help lists C-a ${key} but the worker has no case for it`
    );
  }

  for (const key of implemented) {
    assert.ok(
      documented.has(key) || local.has(key),
      `the worker handles C-a ${key} but the help does not mention it`
    );
  }
});
