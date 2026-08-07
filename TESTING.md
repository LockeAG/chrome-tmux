# Manual check

Everything here is a real failure this extension has had, or a place where the
tests and the type checker are blind. `npm test` cannot load a browser, so this
is the only thing standing between a green suite and a dead extension.

Work top to bottom. Stop and report at the first thing that does not do what it
says, since later steps often depend on earlier ones.

## Setup

- [ ] `chrome://extensions`, Developer mode on, **Load unpacked**, pick this folder
- [ ] The card shows no **Errors** button
- [ ] Click **service worker** and check the console is clean

> A silent service-worker failure is the worst bug this project has had. It
> looked exactly like "the keys do nothing".

## The prefix

On an ordinary page such as `example.com`, click the page body first.

- [ ] `Ctrl-A` shows `-- PREFIX --` bottom-left, and the toolbar badge shows `^A`
- [ ] The indicator stays until you press something. There is no timeout
- [ ] `Esc` clears it without doing anything
- [ ] Any unmapped key, say `q`, clears it without doing anything
- [ ] `Ctrl-A` then `Ctrl-A` inside a text box moves the caret to the line start
- [ ] In a text box, `Ctrl-A` alone does **not** select all, it arms the prefix

## The tab tree

- [ ] `Ctrl-A` then `Ctrl-O` opens it. `o` and `w` do the same
- [ ] It lists tabs from **every** window, grouped by window
- [ ] Typing filters. `Ctrl-J` / `Ctrl-K`, `Ctrl-N` / `Ctrl-P` and the arrows all move
- [ ] `Enter` switches, and focuses the right window if the tab is in another one
- [ ] `Ctrl-X` closes the highlighted tab and the list stays open, minus that row
- [ ] `Tab` collapses to one row per window. `Enter` there brings that window
      forward and leaves its own tab alone
- [ ] `Esc` closes
- [ ] Rows show a coloured square, not a site favicon. This is deliberate

With a call open, for example a real Google Meet:

- [ ] It appears at the top under **In a call**, tinted
- [ ] The dot on the right goes green while the call is making sound
- [ ] `Ctrl-A` then `m` jumps straight to it from another tab

## Vim mode

- [ ] `Ctrl-A` then `v` shows `-- VIM --`, badge shows `V`
- [ ] `j` `k` scroll. `d` `u` half a page. `gg` and `G` jump to the ends
- [ ] `f` labels the links. Typing a label follows it. `F` opens one in a background tab
- [ ] `/` opens find, typing searches, `n` and `N` step through matches
- [ ] Click into a text box: typing there scrolls nothing
- [ ] Click out again: `j` scrolls once more
- [ ] `Esc` leaves vim mode, and the page still gets its own `Esc`

## The new tab page

- [ ] `Cmd-T` shows the dark search page, not Google's
- [ ] **Type immediately without clicking.** The text lands in the search box
- [ ] The footer names your actual prefix
- [ ] The tiles show your most visited sites, with real favicons
- [ ] Searching goes to Google
- [ ] `Ctrl-A` then `o` works here, without clicking first

> This page shipped completely dead once, because a script tag was missing.
> Typing without clicking is the check that matters.

## Settings

- [ ] `Ctrl-A` then `,` opens settings. So does the popup's **Settings** link,
      and right-clicking the toolbar icon
- [ ] The prefix box shows `Ctrl-A` and says *default for this platform*
- [ ] Click it, press `Ctrl-;`. It shows `Ctrl-;` and says it now syncs
- [ ] `Esc` mid-capture cancels
- [ ] Try `Ctrl-W`. It refuses, rather than binding something that closes tabs
- [ ] Save, then check on a page that `Ctrl-;` arms the prefix and `Ctrl-A` does not
- [ ] **Reset to defaults**, confirm the prefix returns to `Ctrl-A`

Blocklist:

- [ ] The box already lists Gmail, Docs, Office and the rest
- [ ] Open Gmail. `Ctrl-A` selects all, and no `-- PREFIX --` appears
- [ ] Add `example.com`, save, then on an already-open `example.com` tab confirm
      the prefix stops working **without reloading that tab**
- [ ] Paste `https://news.ycombinator.com/newest`, save, confirm it is stored as
      `news.ycombinator.com`
- [ ] Add a line containing only `*`, save. It says a line was not usable
- [ ] Delete every line, save, reopen settings. The list is still empty

## Things that have broken before

- [ ] With several pages open, reload the extension from `chrome://extensions`.
      Go back to a page and press the prefix. It works without reloading the page
- [ ] Open a page, then install or reload the extension, then press the prefix on
      that page. It works
- [ ] On a page with an "are you sure you want to leave" prompt, `Ctrl-X` from
      the tab tree. Choose to stay: the tab survives
- [ ] Two windows on two monitors. `Ctrl-A` `s`, jump between them
- [ ] A window with 100+ tabs. The tree opens without a visible stall and
      filtering keeps up
- [ ] A page that uses single-key shortcuts, GitHub or Gmail. In vim mode our
      keys win, and with the site on the blocklist theirs do

## Keyboard layout

Skip if you only ever use one Latin layout. **Known broken**, so this is
confirmation rather than discovery.

- [ ] Add a Russian or French input source, switch to it, press the prefix and
      then `w`. Expect: nothing happens

## What to report

For anything that fails: which step, what you saw, and whatever the console says
on the page and in the service worker. The console usually names the file and
line, which is enough to find it.
