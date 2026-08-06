// @ts-check

const CONFIG = globalThis.SV_SETTINGS;

const prefixButton = /** @type {HTMLButtonElement} */ (document.getElementById('prefix'));
const prefixNote = /** @type {HTMLElement} */ (document.getElementById('prefix-note'));
const disabledBox = /** @type {HTMLTextAreaElement} */ (document.getElementById('disabled'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));

/** @type {Settings} */
let current = CONFIG.defaults();
let capturing = false;
// Saving on top of settings we failed to read would wipe the real ones and
// push the wipe to every machine.
let degraded = false;

function render() {
  const prefix = CONFIG.effectivePrefix(current);
  prefixButton.textContent = capturing ? 'press a key…' : CONFIG.label(prefix);

  const save = /** @type {HTMLButtonElement} */ (document.getElementById('save'));
  save.disabled = degraded;
  save.style.opacity = degraded ? '0.4' : '';
  save.style.cursor = degraded ? 'not-allowed' : 'pointer';

  if (degraded) {
    prefixNote.textContent = 'settings could not be read, so saving is off';
  } else if (capturing) {
    prefixNote.textContent = 'Esc to cancel';
  } else if (!current.prefix) {
    // Left alone, the prefix follows each machine: Ctrl-A on macOS where it is
    // free, Alt-A elsewhere where Ctrl-A is select-all.
    prefixNote.textContent = 'default for this platform, and not synced';
  } else if (!CONFIG.isMac() && current.prefix.ctrl && !current.prefix.alt &&
             !current.prefix.meta && current.prefix.code === 'KeyA') {
    prefixNote.textContent = 'warning: this is select-all on Windows and Linux';
  } else {
    prefixNote.textContent = 'set explicitly, so it syncs to all your machines';
  }
}

/** @param {string} message */
function say(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = '';
  }, 2500);
}

prefixButton.addEventListener('click', () => {
  capturing = true;
  render();
  prefixButton.focus();
});

prefixButton.addEventListener('blur', () => {
  if (!capturing) return;
  capturing = false;
  render();
});

prefixButton.addEventListener('keydown', (event) => {
  if (!capturing) return;
  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    capturing = false;
    render();
    return;
  }

  const prefix = CONFIG.fromEvent(event);
  if (!prefix) return; // modifiers alone, or nothing held down

  if (CONFIG.isReserved(prefix)) {
    // Chrome keeps these for itself and ignores preventDefault, so this would
    // close or open a tab every time you pressed the prefix.
    prefixNote.textContent = `${CONFIG.label(prefix)} belongs to Chrome, pick another`;
    return;
  }

  current = { ...current, prefix };
  capturing = false;
  render();
});

document.getElementById('save')?.addEventListener('click', async () => {
  if (degraded) return;
  const typed = disabledBox.value.split('\n').map((line) => line.trim()).filter(Boolean);

  try {
    // save() normalises: a pasted URL, a port, a trailing dot or an IDN all
    // become the bare host the content script will actually compare against.
    current = await CONFIG.save({ ...current, disabled: typed });
  } catch (error) {
    // Sync has an 8 KB per-item cap and a write rate limit. Silence here would
    // leave you believing a blocklist was saved when it was not.
    say(`not saved: ${error instanceof Error ? error.message : 'storage refused it'}`);
    return;
  }

  disabledBox.value = current.disabled.join('\n');
  render();

  const dropped = typed.length - current.disabled.length;
  say(dropped > 0 ? `saved, ${dropped} line(s) were not usable hosts` : 'saved');
});

document.getElementById('reset')?.addEventListener('click', async () => {
  try {
    current = await CONFIG.save(CONFIG.defaults());
  } catch {
    say('not saved: storage refused it');
    return;
  }
  degraded = false;
  disabledBox.value = '';
  render();
  say('reset');
});

CONFIG.load().then((loaded) => {
  degraded = loaded === null;
  current = loaded ?? CONFIG.defaults();
  disabledBox.value = current.disabled.join('\n');
  render();
  if (degraded) say('could not read your settings, reset to start again');
});
