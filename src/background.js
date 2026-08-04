// Open spike. On a tab with no content script (chrome://, New Tab Page, Web
// Store, PDF viewer) nothing can capture the key after the prefix. The
// candidate fallback is hosting it in the action popup. Whether
// chrome.action.openPopup() is allowed from a command handler is undocumented,
// so this arms the test on exactly the pages the fallback is meant to fix.
// Flip to false once the answer is known.
const SPIKE_OPEN_POPUP = true;

const tabKey = (tabId) => `tab:${tabId}`;

async function getState(tabId) {
  const key = tabKey(tabId);
  const store = await chrome.storage.session.get(key);
  return store[key] ?? { mode: 'off', armedAt: null };
}

async function setState(tabId, state) {
  await chrome.storage.session.set({ [tabKey(tabId)]: state });
  await paintBadge(tabId, state);
  return state;
}

async function paintBadge(tabId, state) {
  const armed = Boolean(state.armedAt);
  const text = armed ? '^A' : state.mode === 'vim' ? 'V' : '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: armed ? '#c2410c' : '#15803d'
      });
    }
  } catch {
    // Tab closed mid-flight. Nothing to paint.
  }
}

// Resolves to the content script's reply, or null when there is no content
// script in that tab.
function send(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => null);
}

const INJECTABLE = /^(https?|file):/;

// Declared content scripts only run on page load, so tabs that were already
// open when the extension loaded have nothing listening. Inject on demand.
async function ensureContentScript(tabId, url) {
  if (!url || !INJECTABLE.test(url)) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/ui.js', 'src/content/main.js']
    });
    return true;
  } catch (error) {
    console.warn('[chrome-tmux] inject failed:', error?.message ?? error);
    return false;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      const alive = await send(tab.id, { type: 'ping' });
      if (!alive) await ensureContentScript(tab.id, tab.url);
    })
  );
});

async function tryOpenPopup(where) {
  try {
    await chrome.action.openPopup();
    console.log(`[chrome-tmux] openPopup succeeded from ${where}`);
    return true;
  } catch (error) {
    console.warn(`[chrome-tmux] openPopup failed from ${where}:`, error?.message ?? error);
    return false;
  }
}

/* Last-active tab per window, for `prefix l`. */

async function recordActivation(windowId, tabId) {
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  const entry = lastActive[windowId] ?? {};
  if (entry.current === tabId) return;
  lastActive[windowId] = { previous: entry.current ?? null, current: tabId };
  await chrome.storage.session.set({ lastActive });
}

async function previousTab(windowId) {
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  return lastActive[windowId]?.previous ?? null;
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  recordActivation(windowId, tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});

/* Prefix */

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'prefix') return;
  const target = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!target?.id) return;

  const state = await getState(target.id);

  if (state.armedAt) {
    // Second prefix press. Chrome swallowed the key at browser level, so the
    // page never saw it. Hand the passthrough to the content script.
    await setState(target.id, { ...state, armedAt: null });
    send(target.id, { type: 'passthrough' });
    return;
  }

  await setState(target.id, { ...state, armedAt: Date.now() });

  let delivered = await send(target.id, { type: 'armed' });

  if (delivered === null && (await ensureContentScript(target.id, target.url))) {
    delivered = await send(target.id, { type: 'armed' });
  }

  if (delivered === null && SPIKE_OPEN_POPUP) {
    // Genuine dead zone. This is the only place the fallback can be tested.
    await tryOpenPopup('a tab with no content script');
  }
});

/* Prefix actions */

async function collectWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows
    .filter((w) => w.type === 'normal')
    .map((w) => ({
      windowId: w.id,
      focused: w.focused,
      tabs: w.tabs.map((t) => ({
        id: t.id,
        index: t.index,
        title: t.title || t.url || '',
        url: t.url || '',
        favIconUrl: t.favIconUrl || '',
        active: t.active
      }))
    }));
}

async function cycleTab(tab, step) {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  if (tabs.length < 2) return;
  const next = tabs[(tab.index + step + tabs.length) % tabs.length];
  await chrome.tabs.update(next.id, { active: true });
}

async function focusTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function runPrefixAction(key, tab, state) {
  switch (key) {
    // `o` mirrors the tmux session picker on C-a C-o. Ctrl+O reaches here as
    // plain `o`, so the modified and unmodified forms are the same key.
    case 'o':
    case 'w':
    case 's':
      send(tab.id, {
        type: 'switcher',
        collapsed: key === 's',
        activeTabId: tab.id,
        groups: await collectWindows()
      });
      return state;

    case 'l': {
      const previous = await previousTab(tab.windowId);
      if (previous !== null) await chrome.tabs.update(previous, { active: true }).catch(() => null);
      return state;
    }

    case 'n':
      await cycleTab(tab, 1);
      return state;

    case 'b':
    case 'p':
      await cycleTab(tab, -1);
      return state;

    case 'c':
      await chrome.tabs.create({ windowId: tab.windowId });
      return state;

    case 'x':
      await chrome.tabs.remove(tab.id);
      return { ...state, closed: true };

    case 'v':
      return { ...state, mode: state.mode === 'vim' ? 'off' : 'vim' };

    case '?':
      await tryOpenPopup('a content script message');
      return state;

    default: {
      if (/^[1-9]$/.test(key)) {
        const tabs = await chrome.tabs.query({ windowId: tab.windowId });
        const target = tabs[Number(key) - 1];
        if (target) await chrome.tabs.update(target.id, { active: true });
      }
      return state;
    }
  }
}

/* Messages from content scripts */

async function handle(message, sender) {
  const tab = sender.tab;
  if (!tab?.id) return null;

  switch (message.type) {
    case 'ready': {
      const state = await getState(tab.id);
      await paintBadge(tab.id, state);
      return { mode: state.mode };
    }

    case 'arm': {
      // The content script caught the prefix itself. Mirror it here so the
      // badge and the disarm timer stay in step.
      const state = await getState(tab.id);
      await setState(tab.id, { ...state, armedAt: Date.now() });
      return { mode: state.mode };
    }

    case 'armedKey': {
      // No expiry check: the content script owns the timing on both paths and
      // will not send a key it considers stale.
      const state = await getState(tab.id);
      const next = await runPrefixAction(message.key, tab, state);
      if (next.closed) {
        // Do not resurrect state for a tab we just removed.
        await chrome.storage.session.remove(tabKey(tab.id));
        return { mode: next.mode };
      }
      await setState(tab.id, { ...next, armedAt: null });
      return { mode: next.mode };
    }

    case 'disarm': {
      const state = await getState(tab.id);
      await setState(tab.id, { ...state, armedAt: null });
      return { mode: state.mode };
    }

    case 'setMode': {
      const state = await getState(tab.id);
      await setState(tab.id, { ...state, mode: message.mode, armedAt: null });
      return { mode: message.mode };
    }

    case 'pick':
      await focusTab(message.tabId);
      return { ok: true };

    case 'openUrl': {
      // The href comes from page content, so it is untrusted. Only ever open
      // web URLs: javascript:, data: and file: must not survive a link hint.
      let url;
      try {
        url = new URL(message.url);
      } catch {
        return { ok: false };
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false };
      await chrome.tabs.create({ windowId: tab.windowId, url: url.href, active: false });
      return { ok: true };
    }

    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // `C-a x` answers a tab that no longer exists. Swallow the dead port so the
  // service worker console stays readable.
  handle(message, sender).then(sendResponse).catch(() => {});
  return true;
});
