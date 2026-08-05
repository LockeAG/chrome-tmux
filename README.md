# chrome-tmux

![chrome-tmux](assets/store/cover.png)

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

`Ctrl-A` then `?`. Every key, drawn in the page, without leaving it:

![The help overlay](assets/store/screenshot-01.png)

## The keys

Press `Ctrl-A`, let go, then press one of these. `-- PREFIX --` appears in the
bottom-left corner while it waits. There is no timeout, same as tmux.

| Key | What it does |
| --- | --- |
| `Ctrl-A` `Ctrl-O` | the tab tree, searchable across every window |
| `Ctrl-A` `o` or `w` | the same thing |
| `Ctrl-A` `s` | the same tree, collapsed to just windows |
| `Ctrl-A` `b` or `l` | toggle back to the last tab you were on |
| `Ctrl-A` `p` | previous tab in order |
| `Ctrl-A` `n` | next tab in order |
| `Ctrl-A` `1`-`9` | jump to a tab by position |
| `Ctrl-A` `m` | jump to a call, cycles if there are several |
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

In the tab tree, start typing to filter. Move with `Ctrl-J` and `Ctrl-K`, or
`Ctrl-N` and `Ctrl-P`, or the arrows. They all do the same thing. Plain `j` and
`k` cannot: the filter box has focus, so they would just type letters. `Tab`
switches between tabs and windows. `Enter` goes there, `Esc` backs out.

## Calls come first

A tab that is a live call gets hoisted to the top of the tab tree under **In a
call**, tinted blue, with a dot on the right that turns green while the tab is
making sound. When you filter, call tabs are weighted so they stay near the top.

`Ctrl-A` `m` skips the tree entirely and jumps straight there. Press it again to
cycle if you are in more than one.

Recognised by the shape of the URL, so a meeting counts but a landing page does
not. Covered: Google Meet, Zoom, Teams, Webex, Amazon Chime, GoTo Meeting,
BlueJeans, Skype, Jitsi, Around and Gather. The list is one array in
`src/calls.js`, with a test beside it.

Discord and Slack are deliberately absent. Joining a voice channel or a huddle
does not change the URL, so any pattern would flag every channel and every
workspace you have open.

Teams is the weak one. It only matches while you are on the join page, because
once you are in the call it rewrites the URL to something with nothing reliable
to match on. Guessing would cost false positives.

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
no way round it there, because you cannot bring your own version of those. Do
not try to reach them by binding a browser-level shortcut either: that makes
Chrome swallow `Ctrl-A` everywhere and breaks the prefix on the pages where it
does work.

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

## Tests

The URL patterns are the one part of this worth testing, because a wrong one
either hides your call or hoists a pricing page above it.

```fish
npm test
```

Every supported provider has a real meeting URL in `test/calls.test.mjs`, and
every near miss that has ever been a false positive is in there next to it.

## Building the images

Everything in `assets/store/` is generated, at Chrome Web Store sizes, on the
Tokyo Night background:

```fish
node tools/make-icons.cjs icons
node tools/make-store-shots.cjs ~/Desktop/Chrome-Tmux assets/store
node tools/make-promo.cjs <capture-of-tools/promo.html> assets/store
```

`tools/promo.html` is the cover art. Serve it, capture it at any window size,
and `make-promo.cjs` cuts it into the cover, the small tile and the marquee. The
page is flat and centred so the padding never shows a seam.

## Licence

MIT.
