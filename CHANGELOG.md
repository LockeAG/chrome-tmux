# Changelog

Notable changes, newest first. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
loosely and [semantic versioning](https://semver.org/).

## Unreleased

### Added

- A browser smoke suite, `npm run smoke`. Playwright loads the extension into a
  real Chrome and checks what no unit test can: the service worker starts and
  stays up, the new tab, options and popup pages load every script they depend
  on with no page errors, a trusted keystroke arms the prefix while a
  page-dispatched one does not, `C-a c` really opens a tab, and blocklisting a
  site makes an already-open tab stand down without a reload. Both bugs that
  reached users this session would have been caught by it.
- Tests that check the package holds together, not just that the logic is
  right. The content scripts are loaded from five places, the manifest, the
  on-demand injection and three HTML pages, and nothing in Chrome keeps those
  lists in step. Twice a file was added to one and forgotten in the others,
  leaving a page that threw on its first line and silently did nothing. Now a
  test asserts they agree, that every path the manifest names exists, that any
  page reading the settings global loads the file that defines it, and that the
  help overlay and the service worker document the same set of prefix keys.
  Each guard was checked by reintroducing the bug it exists for.

### Fixed

- The replacement New Tab Page had been dead since the settings feature landed:
  it loaded the content scripts but not `settings.js`, so the first line threw
  and no key worked there. The same omission in the on-demand injection path was
  caught before release; this one was not.
- The popup and the New Tab Page both stated the prefix was `Ctrl-A`. It is
  per-platform and rebindable, so both now show the one you actually have.

### Security

- **Synthetic keyboard events are ignored.** The key handler did not check
  `event.isTrusted`, so any page could dispatch a `Ctrl-A` and a following key
  to run any prefix action: close the tab, spawn tabs, switch tabs, or turn vim
  mode on, with no interaction from the user. Found by audit, and demonstrated.
- **The tab list no longer loads remote favicons.** Each one was an `<img>`
  request inside the host page's document, so a page could read
  `performance.getEntriesByType('resource')` and harvest the hostnames of every
  tab open in every window. Rows now show a colour derived from the hostname,
  and favicon URLs are no longer sent to the page at all.
- Added [PRIVACY.md](PRIVACY.md), required for a Chrome Web Store listing.

### Added

- A settings page, reachable with `C-a ,`, from the popup, or by right-clicking
  the toolbar icon. The prefix is now rebindable: click the box, press the
  combination. Alongside it, a list of sites to stay out of, one host per line,
  with `*.domain` wildcards. On those sites no key is intercepted at all.
- Settings are stored in `chrome.storage.sync`, so Chrome carries them between
  your signed-in machines the way it carries bookmarks. A local copy guards
  against a sync failure losing the list. This is a new data flow and is
  documented in [PRIVACY.md](PRIVACY.md).
- The site list ships with defaults rather than empty: Gmail, Google Docs,
  Office on the web, SharePoint, Overleaf, Notion, Figma, Slack, `vscode.dev`
  and `github.dev`. A spreadsheet needs `Ctrl-A` more than a tab switcher does.
  They appear in the settings box rather than being hidden, so any can be
  deleted, and emptying the list keeps it empty.
- The prefix defaults per machine rather than syncing: `Ctrl-A` on macOS,
  `Alt-A` elsewhere, since `Ctrl-A` is select-all off macOS. It only syncs once
  you set one deliberately, so saving a blocklist entry on a Mac cannot push
  `Ctrl-A` to your PC.
- The prefix is stored as a physical key (`KeyA`) rather than the character it
  produces. On macOS, Option-A reports `å` and Option-E reports `Dead`, so a
  character-based binding would match the wrong keys and break when synced.
- Blocklist entries are normalised on save: a pasted URL, a port, a trailing
  dot or an internationalised domain all reduce to the host the browser
  actually reports, so a line cannot silently never match.
- Settings survive a storage failure. A read error falls back to a local mirror
  and, failing that, the extension stays inert rather than assuming the
  blocklist is empty and firing on a site you switched off.
- Keys Chrome keeps for itself, such as Ctrl-W and Ctrl-T, are refused as a
  prefix. Chrome ignores `preventDefault` on those, so binding one would have
  closed or opened a tab on every prefix press.
- Patterns that parse but can never match, such as `*` or `.com`, are dropped
  with a count in the save message rather than saved to match nothing.
- Tests for all of it, including the cases that matter: `*.figma.com` must not
  match `notfigma.com` or `figma.com.evil.com`, an exact host must not match its
  parent, a trailing dot must not bypass the list, malformed synced data must
  not throw on every keystroke, and sync answering "nothing stored" must be
  authoritative over a stale local mirror.
- Type checking with `// @ts-check` and JSDoc, run by `npm test` via
  `tsc --noEmit`. No build step: Chrome still loads the source as written, and
  TypeScript is a devDependency that never ships.

### Fixed

- `chrome.windows.getAll` types its tab list as optional, so a window without
  one would have thrown while building the tab tree.
- `chrome.tabs.remove` was called with a possibly undefined tab id.
- The screenshot scripts threw an unhelpful error if `sips` returned no
  dimensions; they now say which file failed.

### Changed

- Screenshots are captured with the page zoomed, so the interface is physically
  large in a frame the browser caps at about 1512px wide. `make-store-shots.cjs`
  now crops to the target aspect instead of fitting and padding, which fills the
  frame and makes the rescale roughly 1:1.

## 0.1.0 - 2026-08-05

First tag. Load-unpacked only, no store listing.

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
- `Ctrl-X` in the tab tree closes the highlighted tab without leaving the list,
  which updates in place. It does nothing in the collapsed windows view, where a
  row is a window rather than a tab.
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
- A window row in the collapsed view now focuses that window and leaves its
  active tab alone, instead of activating a tab derived from the snapshot. The
  old behaviour could pick the wrong tab once the snapshot went stale.
- The collapsed view shows no subtitle when it cannot tell which tab a window is
  on, rather than naming the first one and being wrong.

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
- The keymap beyond the prefix is not configurable; it lives in the source.
- `Ctrl-A` is select-all on Windows and Linux, so the default prefix is a poor
  fit outside macOS.
- Link hints skip anything inside an iframe.
- Teams only matches its join page; it rewrites the URL once you are in a call.
- `Ctrl-X` treats Chrome accepting a close as success. `chrome.tabs.remove`
  resolves before a `beforeunload` dialog is answered, so a page you choose to
  stay on survives and reappears next time the list is opened. Waiting on
  `tabs.onRemoved` instead would hang for as long as the dialog sits there.
