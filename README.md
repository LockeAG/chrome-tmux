# chrome-tmux

Drive Chrome the way you drive tmux. Hit `Ctrl-A`, then a letter.

I live in tmux all day, and every time I switch to the browser my hands keep
reaching for a prefix key that is not there. So I built one. `Ctrl-A` then `o`
gives me a searchable list of every tab in every window. `Ctrl-A` then `1` jumps
to the first tab. The keys I already know, in the app I use most.

There is a vim mode too, for moving around inside a page.

No build step, no dependencies, no network calls. Plain JavaScript and CSS.

## The idea

**The prefix owns containers. Vim mode owns the page.** No key means two things.

If you know tmux, the mapping is the one you would guess:

| tmux | Chrome |
| --- | --- |
| window | tab |
| session | window |

So `Ctrl-A w` lists your tabs, the way `prefix w` lists your windows in tmux.

## Install

There is no store listing. Load it yourself:

```fish
git clone git@github.com:LockeAG/chrome-tmux.git
open -a "Google Chrome" chrome://extensions
```

Turn on Developer mode, click **Load unpacked**, and pick the folder.

Tabs you already had open start working straight away. The extension injects
itself into them rather than making you reload everything.

## What it looks like

<!-- screenshots go here -->

## The keys

Press `Ctrl-A`, let go, then press one of these. `-- PREFIX --` appears in the
bottom-left corner while it waits. There is no timeout, same as tmux.

| Key | What it does |
| --- | --- |
| `Ctrl-A` `Ctrl-O` | the tab tree, searchable across every window |
| `Ctrl-A` `o` or `w` | the same thing |
| `Ctrl-A` `s` | the same tree, collapsed to just windows |
| `Ctrl-A` `b` or `p` | previous tab |
| `Ctrl-A` `n` | next tab |
| `Ctrl-A` `l` | back to the last tab you were on |
| `Ctrl-A` `1`-`9` | jump to a tab by position |
| `Ctrl-A` `c` | new tab |
| `Ctrl-A` `x` | close this tab |
| `Ctrl-A` `v` | vim mode on or off |
| `Ctrl-A` `?` | show every key, in the page |
| `Ctrl-A` `Ctrl-A` | jump the caret to the start of the line |

In vim mode the keys are bare, no prefix. `-- VIM --` sits in the corner so you
always know where you are.

| Key | What it does |
| --- | --- |
| `h` `j` `k` `l` | scroll |
| `d` `u` | half a page down or up |
| `gg` `G` | top, bottom |
| `f` | label every link, type the label to follow it |
| `F` | the same, but opens in a background tab |
| `/` `n` `N` | find on the page, next, previous |
| `H` `L` | back, forward |
| `r` | reload |
| `Esc` | leave vim mode |

Vim mode gets out of the way the moment you click into a text box, and comes
back when you click out. Typing in a search field never scrolls the page.

In the tab tree, start typing to filter. Move with the arrows or `Ctrl-N` and
`Ctrl-P`, because plain `j` and `k` belong to the search box. `Tab` switches
between tabs and windows. `Enter` goes there, `Esc` backs out.

## The one annoying trade

This takes over `Ctrl-A` everywhere in Chrome, including inside text boxes. On
macOS that means you lose "jump to the start of the line".

Press `Ctrl-A` twice to get it back, exactly like `send-prefix` in tmux. It
works in ordinary inputs, in textareas, and in rich text editors.

If that trade is not worth it to you, the prefix is one line in
`src/content/main.js`. There is no settings screen yet.

## The new tab

Chrome will not let any extension run code on its own pages, so the prefix was
dead on the New Tab Page. The way round it is to bring your own new tab, so
this replaces it: a search box, your most visited sites, and every key working
the way it does everywhere else.

Search goes to Google. The sites come from Chrome's own list, the same one it
uses for its shortcuts.

One quirk worth knowing. When an extension overrides the new tab, Chrome parks
the cursor in the address bar rather than the page. The page grabs focus back
as it loads, which works, but if you ever open a new tab and the keys ignore
you, click once on the page.

## Where it still does not work

`chrome://` pages, the Web Store, and the PDF viewer. Same rule, and there is
no way round it there, because you cannot bring your own version of those.

The address bar is the other one. If your cursor is in the omnibox, the keys
belong to Chrome, not to the page.

## A note on privacy

It makes no network requests at all. Nothing is collected, nothing is sent
anywhere, and there is no remote code or `eval` in it. It reads your tab titles
and URLs because that is what a tab switcher does, and they never leave your
browser. The interface lives in a closed shadow root, so pages cannot read it or
restyle it.

## Rough edges, honestly

- No settings screen. The keymap lives in the source.
- On Windows and Linux `Ctrl-A` is select-all, so the default prefix is a poor
  fit there. This was built for macOS.
- Link hints skip anything inside an iframe.
- Find uses `window.find`, which is old and unofficial. It works today.
- No counts like `3j`, no marks.

## Licence

MIT.
