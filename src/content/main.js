/* Key capture and the mode machine.

   off  --(C-a)-------> armed --(key)--> off
   off  --(C-a v)-----> vim
   vim  --(C-a v|Esc)-> off
   vim  --(C-a)-------> armed --(key)--> vim

   The prefix is caught here, in the page. There is no browser-level shortcut:
   binding one would make Chrome swallow Ctrl-A before any page could see it.

   Wrapped in an IIFE because the service worker may inject this file into a
   tab that already has it. Re-running bare top-level `const` would throw. */

(() => {
  // A previous instance may still be here: injected twice, or orphaned by an
  // extension reload. Either way, retire it and take over.
  globalThis.__CHROME_TMUX__?.retire?.();

  const SCROLL_STEP = 64;
  const UI = globalThis.SV_UI;

  let mode = 'off';
  let armed = false;
  let pendingG = false;
  let gTimer = null;
  let retired = false;

  // chrome.runtime.id goes undefined once the extension is reloaded, which
  // orphans every content script already in a page.
  function contextAlive() {
    return !retired && Boolean(chrome.runtime?.id);
  }

  function retire() {
    if (retired) return;
    retired = true;
    window.removeEventListener('keydown', onKeyDown, true);
    UI.closeSwitcher();
    UI.closeHints();
    UI.closeFind();
    UI.closeHelp();
    UI.setIndicator(null);
  }

  function send(message) {
    // sendMessage throws synchronously on an invalidated context, so catching
    // on the returned promise is not enough.
    if (!contextAlive()) {
      retire();
      return Promise.resolve(null);
    }
    try {
      return chrome.runtime.sendMessage(message).catch(() => null);
    } catch {
      retire();
      return Promise.resolve(null);
    }
  }

  function paint() {
    UI.setIndicator(armed ? 'armed' : mode === 'vim' ? 'vim' : null);
  }

  // No timeout, same as tmux. The prefix stays armed until a key arrives, and
  // the indicator is what tells you it is waiting.
  function setArmed(value, notify = false) {
    armed = value;
    if (notify) send({ type: value ? 'arm' : 'disarm' });
    paint();
  }

  function setMode(next) {
    mode = next;
    if (next !== 'vim') {
      UI.closeHints();
      UI.closeFind();
    }
    paint();
  }

  /* Focus */

  function deepActiveElement() {
    let node = document.activeElement;
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return node;
  }

  const NON_TEXT_INPUTS = new Set([
    'button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'color', 'range'
  ]);

  function isEditable(node) {
    if (!node) return false;
    if (node.isContentEditable) return true;
    const tag = node.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((node.type || 'text').toLowerCase());
    return node.getAttribute?.('role') === 'textbox';
  }

  /* C-a C-a: emulate the macOS line-start binding we took over. A synthetic
     KeyboardEvent is untrusted and will not move the caret, so do it by hand. */

  function moveToLineStart() {
    const node = deepActiveElement();
    if (!node) return;

    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      try {
        const caret = node.selectionStart ?? 0;
        const newline = node.value.lastIndexOf('\n', caret - 1);
        const target = newline === -1 ? 0 : newline + 1;
        node.setSelectionRange(target, target);
      } catch {
        // Input types like email and number reject setSelectionRange.
      }
      return;
    }

    if (node.isContentEditable) {
      getSelection()?.modify?.('move', 'backward', 'lineboundary');
    }
  }

  /* Scrolling */

  function scroller() {
    let node = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) return node;
      node = node.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  function scrollBy(x, y) {
    scroller().scrollBy({ left: x, top: y, behavior: 'instant' });
  }

  function scrollTo(where) {
    const target = scroller();
    target.scrollTo({ top: where === 'bottom' ? target.scrollHeight : 0, behavior: 'instant' });
  }

  /* Hints */

  function activate(element, newTab) {
    if (newTab) {
      const href = element.getAttribute?.('href');
      if (href) {
        send({ type: 'openUrl', url: new URL(href, location.href).href });
        return;
      }
    }
    if (isEditable(element)) {
      element.focus();
      return;
    }
    element.click();
  }

  function startHints(newTab) {
    UI.openHints((element) => activate(element, newTab));
  }

  /* Vim keys */

  function handleVimKey(event) {
    const key = event.key;

    if (pendingG) {
      clearTimeout(gTimer);
      pendingG = false;
      if (key === 'g') {
        scrollTo('top');
        return true;
      }
    }

    switch (key) {
      case 'h': scrollBy(-SCROLL_STEP, 0); return true;
      case 'l': scrollBy(SCROLL_STEP, 0); return true;
      case 'j': scrollBy(0, SCROLL_STEP); return true;
      case 'k': scrollBy(0, -SCROLL_STEP); return true;
      case 'd': scrollBy(0, innerHeight / 2); return true;
      case 'u': scrollBy(0, -innerHeight / 2); return true;
      case 'G': scrollTo('bottom'); return true;
      case 'g':
        pendingG = true;
        gTimer = setTimeout(() => { pendingG = false; }, 700);
        return true;
      case 'f': startHints(false); return true;
      case 'F': startHints(true); return true;
      case '/': UI.openFind(() => paint()); return true;
      case 'n': UI.repeatFind(UI.lastFindTerm(), false); return true;
      case 'N': UI.repeatFind(UI.lastFindTerm(), true); return true;
      case 'H': history.back(); return true;
      case 'L': history.forward(); return true;
      case 'r': location.reload(); return true;
      default: return false;
    }
  }

  /* Key capture */

  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

  // Control-A is not a macOS menu accelerator, so unlike a Command shortcut the
  // page can claim it before anything else does.
  function isPrefix(event) {
    return event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'a';
  }

  function onKeyDown(event) {
    // An orphan must give the page its keys back rather than swallow them.
    if (!contextAlive()) {
      retire();
      return;
    }
    if (MODIFIERS.has(event.key)) return;

    if (UI.helpOpen()) {
      event.preventDefault();
      event.stopPropagation();
      UI.closeHelp();
      return;
    }

    // Our own overlays own their input. Let the event reach them.
    if (UI.isSwitcherOpen() || UI.findOpen()) return;

    if (isPrefix(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (armed) {
        // Second press. Give back the line-start binding we took over.
        setArmed(false, true);
        moveToLineStart();
      } else {
        setArmed(true, true);
      }
      return;
    }

    if (UI.hintsOpen()) {
      const result = UI.feedHint(event.key);
      if (result !== 'ignored') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (armed) {
      event.preventDefault();
      event.stopPropagation();
      setArmed(false);
      if (event.key === 'Escape') {
        send({ type: 'disarm' });
        return;
      }
      // Help is drawn in the page, so it needs no round trip.
      if (event.key === '?') {
        send({ type: 'disarm' });
        UI.openHelp();
        return;
      }
      send({ type: 'armedKey', key: event.key }).then((response) => {
        if (response?.mode) setMode(response.mode);
      });
      return;
    }

    if (mode !== 'vim') return;

    // Suspend the keymap while a text field has focus. Without this, typing in
    // any search box scrolls the page instead.
    if (isEditable(deepActiveElement())) return;

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      // No preventDefault: pages use Escape to close their own things.
      setMode('off');
      send({ type: 'setMode', mode: 'off' });
      return;
    }

    if (handleVimKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener('keydown', onKeyDown, true);

  /* Messages from the service worker */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Always answer. The service worker uses a null reply to detect a tab with
    // no content script, which is how it knows to inject one.
    sendResponse({ ok: true });
    switch (message.type) {
      case 'switcher':
        setArmed(false);
        UI.openSwitcher(
          message,
          (target) => send({ type: 'pick', ...target }),
          (tabId) => send({ type: 'close', tabId })
        );
        break;
    }
  });

  /* Restore mode after a navigation kills this script. */

  send({ type: 'ready' }).then((response) => {
    if (response?.mode) setMode(response.mode);
  });

  globalThis.__CHROME_TMUX__ = { retire };
  console.log('[chrome-tmux] content script ready');
})();
