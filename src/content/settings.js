// @ts-check

/* Settings, shared by the content script and the options page.
   A plain script rather than a module, because content scripts are classic
   scripts and cannot import. Both sides load this file and read the global. */

/**
 * A physical key plus modifiers. `code` rather than `key`, because on macOS
 * Option composes: Option-A gives `key: 'å'` and Option-E gives `key: 'Dead'`,
 * neither of which survives a trip to another machine or another layout.
 * @typedef {object} Prefix
 * @property {boolean} ctrl
 * @property {boolean} alt
 * @property {boolean} shift
 * @property {boolean} meta
 * @property {string} code
 */

/**
 * @typedef {object} Settings
 * @property {Prefix | null} prefix null means "whatever suits this platform"
 * @property {string[]} disabled host patterns where the extension stays out
 */

globalThis.SV_SETTINGS = (() => {
  const KEY = 'settings';

  function isMac() {
    const platform =
      /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac/i.test(platform);
  }

  /**
   * Deliberately not stored. Ctrl-A is select-all on Windows and Linux, so a
   * Mac user saving an unrelated setting must not push Ctrl-A to their PC.
   * @returns {Prefix}
   */
  function platformPrefix() {
    return isMac()
      ? { ctrl: true, alt: false, shift: false, meta: false, code: 'KeyA' }
      : { ctrl: false, alt: true, shift: false, meta: false, code: 'KeyA' };
  }

  /** @returns {Settings} */
  function defaults() {
    return { prefix: null, disabled: [] };
  }

  /** @param {Settings} settings @returns {Prefix} */
  function effectivePrefix(settings) {
    return settings.prefix ?? platformPrefix();
  }

  const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

  /**
   * Reduce a line to a bare lowercase host. Accepts what people actually
   * paste: a full URL, a host with a port, a trailing dot, an IDN. Anything
   * unusable becomes '' and is dropped.
   * @param {string} input
   */
  function normaliseHost(input) {
    let text = String(input ?? '').trim().toLowerCase();
    if (!text) return '';

    let wildcard = false;
    if (text.startsWith('*.')) {
      wildcard = true;
      text = text.slice(2);
    }

    try {
      // Parsing punycodes an IDN, drops the port, path and scheme, and gives
      // back exactly what location.hostname will be compared against.
      const url = new URL(text.includes('://') ? text : `http://${text}`);
      const host = url.hostname.replace(/\.$/, '');
      // `*`, `.com` and other things that parse but can never equal a hostname
      // must be rejected here, or they save quietly and match nothing forever.
      if (!HOST.test(host)) return '';
      if (!host.includes('.') && host !== 'localhost') return '';
      return wildcard ? `*.${host}` : host;
    } catch {
      return '';
    }
  }

  /**
   * Storage is shared across machines and versions, so treat what comes back
   * as untrusted. A malformed value must not throw on every keystroke.
   * @param {any} raw
   * @returns {Settings}
   */
  function normalise(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};

    /** @type {Prefix | null} */
    let prefix = null;
    const p = source.prefix;
    if (p && typeof p === 'object' && typeof p.code === 'string' && p.code) {
      prefix = {
        ctrl: Boolean(p.ctrl),
        alt: Boolean(p.alt),
        shift: Boolean(p.shift),
        meta: Boolean(p.meta),
        code: p.code
      };
      // A prefix with no modifier would swallow a plain letter everywhere.
      if (!prefix.ctrl && !prefix.alt && !prefix.meta) prefix = null;
    }

    const disabled = Array.isArray(source.disabled)
      ? source.disabled.map(normaliseHost).filter(Boolean)
      : [];

    return { prefix, disabled };
  }

  /**
   * Reads sync, falls back to a local mirror, and reports failure rather than
   * pretending the blocklist is empty. A site the user switched off must not
   * start firing because storage hiccupped.
   * @returns {Promise<Settings | null>}
   */
  async function load() {
    try {
      // Sync is authoritative when it answers, including when it answers that
      // there is nothing stored. Refresh the mirror while we are here, so a
      // change made on another machine cannot leave a stale copy behind.
      const stored = await chrome.storage.sync.get(KEY);
      const settings = stored && KEY in stored ? normalise(stored[KEY]) : defaults();
      chrome.storage.local.set({ [KEY]: settings }).catch(() => {});
      return settings;
    } catch {
      // fall through to the mirror
    }

    try {
      const mirrored = await chrome.storage.local.get(KEY);
      if (mirrored && KEY in mirrored) return normalise(mirrored[KEY]);
    } catch {
      // nothing to fall back on
    }

    // Sync failed and there is no mirror, so we cannot know what is on the
    // blocklist. Say so rather than pretend it is empty.
    return null;
  }

  /** @param {Settings} settings */
  async function save(settings) {
    const clean = normalise(settings);
    await chrome.storage.sync.set({ [KEY]: clean });
    // Mirror locally so a sync failure later cannot lose the blocklist.
    await chrome.storage.local.set({ [KEY]: clean }).catch(() => {});
    return clean;
  }

  /**
   * Exact modifier match, so Ctrl-A never fires on Ctrl-Shift-A.
   * @param {Prefix} prefix
   * @param {KeyboardEvent} event
   */
  function matches(prefix, event) {
    return (
      event.code === prefix.code &&
      event.ctrlKey === prefix.ctrl &&
      event.altKey === prefix.alt &&
      event.metaKey === prefix.meta &&
      event.shiftKey === prefix.shift
    );
  }

  /**
   * Patterns are hosts: `mail.google.com`, or `*.example.com` for the domain
   * and everything under it.
   * @param {string[]} patterns
   * @param {string} hostname
   */
  function disabledFor(patterns, hostname) {
    const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
    if (!host) return false;
    return patterns.some((pattern) => {
      if (!pattern) return false;
      if (pattern.startsWith('*.')) {
        const domain = pattern.slice(2);
        return host === domain || host.endsWith(`.${domain}`);
      }
      return host === pattern;
    });
  }

  /** @param {string} code */
  function keyLabel(code) {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  /** @param {Prefix} prefix */
  function label(prefix) {
    const parts = [];
    if (prefix.ctrl) parts.push('Ctrl');
    if (prefix.alt) parts.push(isMac() ? 'Option' : 'Alt');
    if (prefix.shift) parts.push('Shift');
    if (prefix.meta) parts.push(isMac() ? 'Cmd' : 'Win');
    parts.push(keyLabel(prefix.code));
    return parts.join('-');
  }

  // Chrome handles these itself and ignores preventDefault, so binding one
  // would close or open a tab on every prefix press.
  const RESERVED = ['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyP', 'Tab'];

  /** @param {Prefix} prefix */
  function isReserved(prefix) {
    if (prefix.alt) return false;
    return (prefix.ctrl || prefix.meta) && RESERVED.includes(prefix.code);
  }

  const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS|CapsLock)/;

  /**
   * Turn a keypress into a prefix, or null if it is only modifiers or has none.
   * @param {KeyboardEvent} event
   * @returns {Prefix | null}
   */
  function fromEvent(event) {
    if (!event.code || MODIFIER_CODES.test(event.code)) return null;
    if (!event.ctrlKey && !event.altKey && !event.metaKey) return null;
    return {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      code: event.code
    };
  }

  return {
    KEY, defaults, normalise, normaliseHost, platformPrefix, effectivePrefix,
    load, save, matches, disabledFor, label, fromEvent, isReserved, isMac
  };
})();
