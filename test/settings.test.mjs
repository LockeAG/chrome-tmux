import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// settings.js is a classic script for content-script and options-page use, so
// it has no exports. Evaluate it against a stub global and read what it hangs
// off globalThis, which is exactly how both callers get at it.
/**
 * @param {{ mac?: boolean, sync?: any, local?: any }} [options]
 */
function loadSettings({ mac = true, sync, local } = {}) {
  const scope = {
    navigator: { platform: mac ? 'MacIntel' : 'Win32' },
    URL,
    chrome: {
      storage: {
        sync: sync ?? { get: async () => ({}), set: async () => {} },
        local: local ?? { get: async () => ({}), set: async () => {} }
      }
    }
  };
  scope.globalThis = scope;
  const source = readFileSync(new URL('../src/content/settings.js', import.meta.url), 'utf8');
  new Function('globalThis', 'navigator', 'chrome', 'URL', source)(
    scope, scope.navigator, scope.chrome, URL
  );
  return scope.SV_SETTINGS;
}

const press = (over = {}) => ({
  code: 'KeyA', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...over
});

test('the platform default avoids select-all off macOS', () => {
  assert.equal(loadSettings({ mac: true }).platformPrefix().ctrl, true);
  assert.equal(loadSettings({ mac: false }).platformPrefix().ctrl, false);
  assert.equal(loadSettings({ mac: false }).platformPrefix().alt, true);
});

test('an unset prefix is not stored, so it stays per-machine', () => {
  const S = loadSettings();
  assert.equal(S.defaults().prefix, null);
  assert.deepEqual(S.effectivePrefix(S.defaults()), S.platformPrefix());
});

test('every shipped default is a host the matcher can actually use', () => {
  const S = loadSettings();
  for (const pattern of S.DEFAULT_DISABLED) {
    assert.equal(S.normaliseHost(pattern), pattern, `default must survive normalising: ${pattern}`);
  }
  // Spot-check that they do what the list claims.
  const list = S.defaults().disabled;
  assert.equal(S.disabledFor(list, 'docs.google.com'), true);
  assert.equal(S.disabledFor(list, 'excel.officeapps.live.com'), true);
  assert.equal(S.disabledFor(list, 'acme.sharepoint.com'), true);
  assert.equal(S.disabledFor(list, 'www.notion.so'), true);
  assert.equal(S.disabledFor(list, 'github.com'), false, 'must not swallow ordinary sites');
  assert.equal(S.disabledFor(list, 'news.ycombinator.com'), false);
});

test('deleting every default sticks, rather than reappearing', async () => {
  const stored = { settings: { prefix: null, disabled: [] } };
  const S = loadSettings({
    sync: { get: async () => stored, set: async () => {} },
    local: { get: async () => ({}), set: async () => {} }
  });
  assert.deepEqual((await S.load()).disabled, [], 'an explicit empty list is respected');
});

test('the prefix matches modifiers exactly', () => {
  const S = loadSettings();
  const prefix = { ctrl: true, alt: false, shift: false, meta: false, code: 'KeyA' };

  assert.equal(S.matches(prefix, press({ ctrlKey: true })), true);
  assert.equal(S.matches(prefix, press({ ctrlKey: true, shiftKey: true })), false);
  assert.equal(S.matches(prefix, press({ ctrlKey: true, altKey: true })), false);
  assert.equal(S.matches(prefix, press({ code: 'KeyB', ctrlKey: true })), false);
});

test('capture uses the physical key, so macOS Option combos survive', () => {
  const S = loadSettings();
  // Option-A reports key 'å' and Option-E reports 'Dead'; code is stable.
  assert.deepEqual(
    S.fromEvent({ ...press({ altKey: true }), key: 'å' }),
    { ctrl: false, alt: true, shift: false, meta: false, code: 'KeyA' }
  );
  assert.equal(S.fromEvent(press({ code: 'ControlLeft', ctrlKey: true })), null);
  assert.equal(S.fromEvent(press()), null, 'a bare key is not a prefix');
});

test('host patterns are normalised to what location.hostname will be', () => {
  const S = loadSettings();
  assert.equal(S.normaliseHost('https://mail.google.com/inbox'), 'mail.google.com');
  assert.equal(S.normaliseHost('mail.google.com:443'), 'mail.google.com');
  assert.equal(S.normaliseHost('  FIGMA.com.  '), 'figma.com');
  assert.equal(S.normaliseHost('*.Figma.com'), '*.figma.com');
  assert.equal(S.normaliseHost('münchen.de'), 'xn--mnchen-3ya.de', 'IDNs are punycoded');
  assert.equal(S.normaliseHost(''), '');
  assert.equal(S.normaliseHost('   '), '');
});

test('disabled hosts match exactly, wildcards match the domain and below', () => {
  const S = loadSettings();
  const list = S.normalise({ disabled: ['mail.google.com', '*.figma.com', ' ', 'EXAMPLE.com'] }).disabled;

  assert.equal(S.disabledFor(list, 'mail.google.com'), true);
  assert.equal(S.disabledFor(list, 'example.com'), true);
  assert.equal(S.disabledFor(list, 'figma.com'), true, 'wildcard covers the bare domain');
  assert.equal(S.disabledFor(list, 'www.figma.com'), true);
  assert.equal(S.disabledFor(list, 'figma.com.'), true, 'a trailing dot must not bypass it');

  assert.equal(S.disabledFor(list, 'google.com'), false, 'an exact host must not match its parent');
  assert.equal(S.disabledFor(list, 'notfigma.com'), false);
  assert.equal(S.disabledFor(list, 'figma.com.evil.com'), false);
  assert.equal(S.disabledFor(list, ''), false);
});

test('malformed stored settings cannot throw or grant a bad prefix', () => {
  const S = loadSettings();
  assert.deepEqual(S.normalise(null), { prefix: null, disabled: [] });
  assert.deepEqual(S.normalise({ disabled: 'not-an-array' }).disabled, []);
  assert.equal(S.normalise({ prefix: { code: 'KeyA' } }).prefix, null, 'no modifier means no prefix');
  assert.equal(S.normalise({ prefix: {} }).prefix, null);
});

test('unusable host patterns are dropped, not saved to match nothing', () => {
  const S = loadSettings();
  for (const bad of ['*', '.com', 'http://', '*.', 'no spaces here', '..']) {
    assert.equal(S.normaliseHost(bad), '', `should be dropped: ${bad}`);
  }
  assert.equal(S.normaliseHost('localhost'), 'localhost', 'localhost is a real host');
  assert.equal(S.normaliseHost('localhost:3000'), 'localhost', 'a port is dropped');
  assert.equal(S.normaliseHost('127.0.0.1'), '127.0.0.1');
});

test('keys Chrome keeps for itself cannot be bound', () => {
  const S = loadSettings();
  const combo = (over) => ({ ctrl: false, alt: false, shift: false, meta: false, code: 'KeyA', ...over });

  assert.equal(S.isReserved(combo({ ctrl: true, code: 'KeyW' })), true, 'Ctrl-W closes the tab');
  assert.equal(S.isReserved(combo({ meta: true, code: 'KeyT' })), true);
  assert.equal(S.isReserved(combo({ ctrl: true, code: 'KeyA' })), false);
  assert.equal(S.isReserved(combo({ alt: true, code: 'KeyW' })), false, 'Alt-W is ours to take');
});

test('sync answering "nothing stored" is authoritative over a stale mirror', async () => {
  const stale = { get: async () => ({ settings: { disabled: ['deleted.com'] } }), set: async () => {} };
  const S = loadSettings({ sync: { get: async () => ({}), set: async () => {} }, local: stale });
  assert.deepEqual((await S.load()).disabled, S.defaults().disabled, 'the mirror must not win');
});

test('a storage failure keeps the blocklist rather than assuming it is empty', async () => {
  const failing = { get: async () => { throw new Error('sync down'); }, set: async () => {} };
  const mirror = { get: async () => ({ settings: { disabled: ['figma.com'] } }), set: async () => {} };

  const withMirror = loadSettings({ sync: failing, local: mirror });
  assert.deepEqual((await withMirror.load()).disabled, ['figma.com'], 'falls back to the local mirror');

  const bothDown = loadSettings({
    sync: failing,
    local: { get: async () => { throw new Error('local down'); }, set: async () => {} }
  });
  assert.equal(await bothDown.load(), null, 'reports failure instead of an empty blocklist');
});
