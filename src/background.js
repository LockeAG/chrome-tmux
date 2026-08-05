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
        color: armed ? '#ff9e64' : '#9ece6a'
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

/* Last-active tab per window, for the `b` / `l` toggle. */

// Every read-modify-write of lastActive goes through one chain. Without it,
// the seed below can write a whole stale map on top of a real tab switch that
// landed between its own read and write, and the toggle sends you to the wrong
// tab from then on.
let lastActiveWrites = Promise.resolve();

function editLastActive(edit) {
  lastActiveWrites = lastActiveWrites
    .then(async () => {
      const { lastActive = {} } = await chrome.storage.session.get('lastActive');
      if (edit(lastActive)) await chrome.storage.session.set({ lastActive });
    })
    .catch(() => {});
  return lastActiveWrites;
}

function recordActivation(windowId, tabId) {
  return editLastActive((lastActive) => {
    const entry = lastActive[windowId] ?? {};
    if (entry.current === tabId) return false;
    lastActive[windowId] = { previous: entry.current ?? null, current: tabId };
    return true;
  });
}

async function previousTab(windowId) {
  await lastActiveWrites;
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  return lastActive[windowId]?.previous ?? null;
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  recordActivation(windowId, tabId);
});

// Without this, nothing is known about a window until you switch tabs twice:
// the first switch records where you went but not where you came from, so the
// first `C-a b` of a browser session does nothing. Runs whenever the service
// worker spins up, and defers to any real activation already recorded.
async function seedActivation() {
  const active = await chrome.tabs.query({ active: true });
  await editLastActive((lastActive) => {
    let changed = false;
    for (const tab of active) {
      if (tab.id === undefined || lastActive[tab.windowId]) continue;
      lastActive[tab.windowId] = { previous: null, current: tab.id };
      changed = true;
    }
    return changed;
  });
}

seedActivation();

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
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

    // tmux last-window: toggle between the two tabs you were last on.
    case 'b':
    case 'l': {
      const previous = await previousTab(tab.windowId);
      if (previous !== null) await chrome.tabs.update(previous, { active: true }).catch(() => null);
      return state;
    }

    case 'n':
      await cycleTab(tab, 1);
      return state;

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
