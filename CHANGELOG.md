# Changelog

Notable changes, newest first. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
loosely and [semantic versioning](https://semver.org/).

## Unreleased

Everything so far. Nothing has been tagged yet, and there is no store listing.

### Added

- A tmux-style `Ctrl-A` prefix, caught in the page rather than by a browser
  shortcut, so it can be released back with a second press.
- The tab tree: a searchable list of every tab across every window, grouped by
  window, on `Ctrl-A C-o`. `Ctrl-A s` collapses it to windows only.
- Tab actions on the prefix: toggle to the last tab, step through tabs, jump by
  position, new tab, close tab.
- Vim mode on `Ctrl-A v`: scrolling, half-page jumps, top and bottom, link
  hints, find, history, reload. Suspends itself while a text field has focus.
- A help overlay on `Ctrl-A ?`, drawn in the page, so it works without a round
  trip to the service worker.
- A replacement New Tab Page, because Chrome forbids extensions from running on
  its own. Search box, your most visited sites, and every key working normally.
- Live call awareness: call tabs are hoisted to the top of the tab tree, tinted,
  with a dot that goes green while the tab is making sound. `Ctrl-A m` jumps
  straight to a call and cycles if there are several. Covers Google Meet, Zoom,
  Teams, Webex, Amazon Chime, GoTo Meeting, BlueJeans, Skype, Jitsi, Around and
  Gather.
- Tests. `npm test`, no dependencies, covering the call URL patterns against
  real meeting URLs and every near miss that has been a false positive.
- Generated store assets and the scripts that build them, at Chrome Web Store
  sizes on the Tokyo Night background.

### Changed

- Tokyo Night throughout, replacing the original zinc and green.
- Renamed from `chrome-simple-vim`. The prefix turned out to be the load-bearing
  idea; vim mode is a mode inside it.
- `Ctrl-A b` now toggles to the last tab you were on, the tmux `last-window`
  behaviour, instead of stepping back one position. `Ctrl-A p` kept the
  positional meaning.
- The prefix no longer times out, matching tmux. Once armed it waits, and the
  indicator says so.
- Tabs that were already open when the extension loads get the content script
  injected on demand, instead of needing a reload.
- Movement in the tab tree is documented as `Ctrl-J` / `Ctrl-K`. `Ctrl-N` /
  `Ctrl-P` and the arrows still work; they always did.

### Fixed

- The New Tab Page stole focus back from the tab tree for up to a second after
  load, so `Cmd-T` followed quickly by `Ctrl-A o` typed into the wrong box.
- Orphaned content scripts, left behind by an extension reload, swallowed
  `Ctrl-A` while being unable to act on it. Instances now hand over.
- `chrome.runtime.sendMessage` throws synchronously on an invalidated context,
  so catching on the returned promise was not enough.
- A race on the last-active tab record between the worker-startup seed and a
  concurrent tab switch could send `Ctrl-A b` to the wrong tab.
- Link hints passed an untrusted `href` straight to `chrome.tabs.create`; only
  `http` and `https` survive now.
- Call tabs were given their ranking bonus before non-matches were filtered, so
  a call tab that matched nothing outranked genuine matches when filtering.
- Several call URL patterns misfired: lookalike hosts like `fakezoom.us`,
  BlueJeans marketing slugs beginning with a digit, Jitsi's dial-in page, and a
  missing match for GoTo's current join host.

### Removed

- The `chrome.commands` path. It only fired if you hand-bound a browser-level
  shortcut, which makes Chrome swallow `Ctrl-A` before any page sees it and
  breaks the prefix that works. It could not help on `chrome://` pages either.
- Whereby from the call list. Its rooms and its marketing pages share one URL
  shape, and a pricing page hoisted above your call is worse than no hoisting.

### Known gaps

- `chrome://` pages, the Web Store and the PDF viewer. Chrome forbids content
  scripts there and there is no way round it.
- No settings screen. The keymap lives in the source.
- `Ctrl-A` is select-all on Windows and Linux, so the default prefix is a poor
  fit outside macOS.
- Link hints skip anything inside an iframe.
- Teams only matches its join page; it rewrites the URL once you are in a call.
