# Privacy policy

**chrome-tmux collects nothing, stores nothing off your machine, and sends
nothing anywhere.**

There is no server. There is no analytics, no telemetry, no crash reporting, no
account, and no network request of any kind. The extension makes no outbound
connections at all.

## What it reads, and why

To be a tab switcher it has to see your tabs. Specifically:

| What | Why | Where it goes |
| --- | --- | --- |
| Tab titles and URLs | to list and filter your tabs, and to tell whether a tab is a video call | the list drawn on your screen, nothing else |
| Which tab is active, and which window | to switch to the right one and to offer "last tab" | in-memory session state |
| Whether a tab is playing audio | the dot that marks a live call | the list on your screen |
| Your most visited sites | the tiles on the replacement New Tab Page | that page, nothing else |

All of it stays in your browser. It is held in `chrome.storage.session`, which
Chrome clears when you quit. Nothing is written to disk by this extension.

## What it deliberately does not do

- It does not load your sites' favicons into the pages you visit. The tab list
  shows a colour derived from the hostname instead, so no request reveals your
  open tabs to the page you happen to be on.
- It does not read page content, form fields, passwords or anything you type.
  It listens for one key combination and, once armed, one key after it.
- It contains no remote code and no `eval`. Every line is in the package you
  installed.
- It does not talk to other extensions or accept messages from web pages.

## Permissions

| Permission | What it is for |
| --- | --- |
| `tabs` | read tab titles and URLs, switch, create and close tabs |
| `storage` | remember the mode and last-tab state for the session |
| `scripting` | start working in tabs that were already open when you installed it |
| `topSites` | the tiles on the New Tab Page |
| `favicon` | site icons on the New Tab Page, an extension page, never on your sites |
| `<all_urls>` | the prefix has to work on every page, so the key listener runs everywhere |

`<all_urls>` is the broadest of these. It is required because a keyboard shortcut
that only works on some sites is not a keyboard shortcut. It is used only to
listen for keys and to draw the overlay.

## Changes

Any change to this policy will appear in
[CHANGELOG.md](CHANGELOG.md) and in the repository history at
https://github.com/LockeAG/chrome-tmux.

Last updated: 2026-08-06.
