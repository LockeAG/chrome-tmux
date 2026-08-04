# Simple Vim

A tmux-style prefix and a vim mode for Chrome. No build step, no dependencies.

The model: **prefix owns containers, vim mode owns the page.** Chrome tabs are
tmux windows, Chrome windows are tmux sessions. No key means two things.

## Install

```fish
open -a "Google Chrome" chrome://extensions
```

Turn on Developer mode, click "Load unpacked", pick this directory.

Already-open tabs have no content script until they reload. Reload the tabs you
want to test on.

## Keys

Prefix is `Control-A`.

| Key | Action |
| --- | --- |
| `C-a C-o` | tab tree, searchable across every window |
| `C-a o` / `C-a w` | the same tree |
| `C-a s` | the same tree, collapsed to windows |
| `C-a b` / `C-a p` | previous tab in order |
| `C-a n` | next tab in order |
| `C-a l` | last tab you were on |
| `C-a 1-9` | jump to tab N by position |
| `C-a c` | new tab |
| `C-a x` | close tab |
| `C-a v` | toggle vim mode |
| `C-a ?` | help overlay, drawn in the page; any key closes it |
| `C-a C-a` | move caret to line start |

Vim mode, bare keys:

| Key | Action |
| --- | --- |
| `h` `j` `k` `l` | scroll |
| `d` / `u` | half page down / up |
| `gg` / `G` | top / bottom |
| `f` / `F` | link hints, `F` opens in a background tab |
| `/` `n` `N` | find, next, previous |
| `H` / `L` | history back / forward |
| `r` | reload |
| `Esc` | leave vim mode |

In the switcher, typing filters. Navigation is arrows or `Ctrl-n` / `Ctrl-p`,
because plain `j` and `k` belong to the search box. `Tab` toggles between tabs
and windows. `Enter` switches, `Esc` closes.

## Where the prefix is caught

In the page, by the content script.

Control-A is not a macOS menu accelerator, so unlike a Command shortcut the page
can claim it before anything else does. That means `chrome.commands` is not
needed on ordinary pages, which is lucky: Chrome rejects `MacCtrl+A` in the
manifest, because command shortcuts "must include either Ctrl or Alt" and on
macOS `Ctrl` means Command.

The `prefix` command is still declared, with no suggested key. Bind it by hand
at `chrome://extensions/shortcuts` if you want the prefix on `chrome://` pages.
It has no effect anywhere else, since the page path gets there first.

## The Ctrl-A trade

The content script swallows Ctrl-A everywhere, including inside text fields, so
the macOS "move to start of line" binding stops working.

`C-a C-a` gives it back. The second press is caught the same way and the caret
is moved by hand. Works in inputs, textareas, and contenteditable.

## Known gaps

1. **`chrome://` pages, the New Tab Page, the Web Store, the PDF viewer.** No
   content script runs there, so nothing catches the prefix at all. Binding the
   `prefix` command by hand gets you as far as an armed state; catching the
   second key there still needs the fallback below.
2. **Focus in the omnibox.** Keys go to the address bar, not the page.

The badge (`^A` armed, `V` vim mode) is the mitigation. Tabs that were already
open when the extension loaded get the content script injected on demand, so no
reloading is needed.

The prefix has no timeout, same as tmux. Once armed it waits, and `-- PREFIX --`
bottom-left says so. Escape or any unmapped key clears it.

## Open spike

Whether `chrome.action.openPopup()` is allowed from a command handler is
undocumented, and the answer decides whether gap 1 can be closed.

Running it needs the `prefix` command bound by hand first, since it fires from
the command handler. Then press it on `chrome://extensions`. No content script
replies, so the service worker treats it as a dead zone and calls `openPopup()`.

Open the service worker console (`chrome://extensions` → Simple Vim → "service
worker") and read the line:

- `openPopup succeeded` → the popup can host the second key. Build the fallback.
- `openPopup failed` → the only fallback left is
  `chrome.windows.create({type: "popup"})`, with real focus-steal cost.

`C-a ?` runs the same call from the content-script path, which is the ordinary
case rather than the interesting one.

Set `SPIKE_OPEN_POPUP` to `false` in `src/background.js` once the answer is in.

## Not done yet

- The `chrome://` fallback, pending the spike above.
- Counts (`3j`), marks, and a configurable keymap.
