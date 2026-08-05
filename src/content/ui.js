/* Shadow-root UI: mode indicator, tab switcher, link hints, find bar.
   Styles go through a constructable stylesheet so a strict page CSP cannot
   block them the way it blocks an injected <style> element. */

globalThis.SV_UI = (() => {
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .indicator {
      position: fixed; bottom: 8px; left: 8px; z-index: 1;
      padding: 3px 8px; border-radius: 4px;
      background: #9ece6a; color: #1a1b26;
      font-size: 11px; letter-spacing: .08em; font-weight: 600;
      pointer-events: none;
    }
    .indicator[data-kind="armed"] { background: #ff9e64; color: #1a1b26; }

    .scrim {
      position: fixed; inset: 0; z-index: 2;
      background: rgba(16, 16, 24, .62);
      display: flex; justify-content: center; align-items: flex-start;
      padding-top: 12vh; pointer-events: auto;
    }

    .panel {
      width: min(680px, 92vw); max-height: 70vh;
      display: flex; flex-direction: column; overflow: hidden;
      border-radius: 10px; border: 1px solid #414868;
      background: #1a1b26; color: #c0caf5;
      box-shadow: 0 24px 64px rgba(0, 0, 0, .55);
    }

    .search {
      all: unset; display: block; width: 100%;
      padding: 14px 16px; font-size: 14px; color: #c0caf5;
      border-bottom: 1px solid #292e42;
    }
    .search::placeholder { color: #565f89; }

    .list { overflow-y: auto; padding: 6px; }

    .group {
      padding: 8px 10px 4px; font-size: 10px; letter-spacing: .1em;
      text-transform: uppercase; color: #565f89;
    }

    .row {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 10px; border-radius: 6px; cursor: pointer;
    }
    .row[data-selected="true"] { background: #292e42; }
    .row[data-live="true"] .title { color: #7dcfff; }

    .dot {
      width: 7px; height: 7px; flex: none; margin-left: auto;
      border-radius: 50%; background: #414868;
    }
    .row[data-audible="true"] .dot { background: #9ece6a; }
    .row[data-active="true"] .title { color: #9ece6a; }

    .icon { width: 16px; height: 16px; flex: none; border-radius: 3px; }
    .text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .title { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .url { font-size: 11px; color: #565f89; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .empty { padding: 24px; text-align: center; color: #565f89; font-size: 13px; }

    .footer {
      padding: 8px 14px; border-top: 1px solid #292e42;
      font-size: 11px; color: #565f89;
    }

    .help { padding: 18px 20px; overflow-y: auto; }
    .help section + section { margin-top: 18px; }
    .help h3 {
      margin: 0 0 8px; font-size: 10px; letter-spacing: .1em;
      text-transform: uppercase; color: #565f89; font-weight: 600;
    }
    .help dl { display: grid; grid-template-columns: 128px 1fr; gap: 5px 14px; margin: 0; }
    .help dt { font-size: 12px; color: #9ece6a; white-space: nowrap; }
    .help dd { margin: 0; font-size: 12px; color: #a9b1d6; }

    .hint {
      position: fixed; z-index: 3;
      padding: 1px 4px; border-radius: 3px;
      background: #e0af68; color: #1a1b26;
      font-size: 11px; font-weight: 700; line-height: 1.4;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .4);
      pointer-events: none;
    }
    .hint[data-matched="true"] { background: #ff9e64; color: #1a1b26; }

    .findbar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 2;
      display: flex; gap: 8px; align-items: center;
      padding: 8px 12px; background: #1a1b26; color: #c0caf5;
      border-top: 1px solid #414868; font-size: 13px;
      pointer-events: auto;
    }
    .findbar input { all: unset; flex: 1; color: #c0caf5; }
    .findbar[data-miss="true"] input { color: #f7768e; }
  `;

  let host = null;
  let root = null;

  function ensureRoot() {
    if (root && host?.isConnected) return root;
    // Drop a host left behind by an earlier instance of this script.
    document.getElementById('__chrome_tmux__')?.remove();
    host = document.createElement('div');
    host.id = '__chrome_tmux__';
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('inset', '0', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('pointer-events', 'none', 'important');
    root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    (document.body ?? document.documentElement).appendChild(host);
    return root;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* Indicator */

  function setIndicator(kind) {
    const r = ensureRoot();
    const existing = r.querySelector('.indicator');
    if (!kind) {
      existing?.remove();
      return;
    }
    const node = existing ?? r.appendChild(el('div', 'indicator'));
    node.dataset.kind = kind;
    node.textContent = kind === 'armed' ? '-- PREFIX --' : '-- VIM --';
  }

  /* Fuzzy match: subsequence, rewarding runs and word boundaries. */

  function score(query, text) {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0;
    let total = 0;
    let previous = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] !== q[qi]) continue;
      total += previous === ti - 1 ? 3 : 1;
      if (ti === 0 || /[\s/\-._?&=]/.test(t[ti - 1])) total += 2;
      previous = ti;
      qi++;
    }
    return qi === q.length ? total : -1;
  }

  /* Tab switcher */

  let switcher = null;

  function closeSwitcher() {
    switcher?.scrim.remove();
    switcher = null;
  }

  function openSwitcher({ groups, activeTabId, collapsed }, onPick, onClose) {
    closeSwitcher();
    // Identity for this overlay, so work still in flight cannot act on a later one.
    const token = {};
    const r = ensureRoot();

    const scrim = el('div', 'scrim');
    const panel = el('div', 'panel');
    const search = el('input', 'search');
    search.placeholder = collapsed ? 'Filter windows' : 'Filter tabs';
    search.spellcheck = false;
    const list = el('div', 'list');
    const footer = el(
      'div',
      'footer',
      'enter switch · ctrl-j/ctrl-k move · ctrl-x close tab · tab windows · esc'
    );

    panel.append(search, list, footer);
    scrim.append(panel);
    r.append(scrim);

    let rows = [];
    let selected = 0;

    function entries() {
      if (collapsed) {
        return groups.map((g) => {
          // No fallback: after a local close the window may have no flagged
          // active tab, and naming the wrong one is worse than naming none.
          const active = g.tabs.find((t) => t.active);
          return {
            windowId: g.windowId,
            group: null,
            title: `Window · ${g.tabs.length} tab${g.tabs.length === 1 ? '' : 's'}`,
            url: active?.title ?? '',
            favIconUrl: active?.favIconUrl ?? '',
            active: g.focused
          };
        });
      }
      const all = groups.flatMap((g, i) =>
        g.tabs.map((t) => ({
          tabId: t.id,
          group: `Window ${i + 1}${g.focused ? ' (current)' : ''}`,
          title: t.title,
          url: t.url,
          favIconUrl: t.favIconUrl,
          active: t.id === activeTabId,
          live: Boolean(t.live),
          audible: Boolean(t.audible)
        }))
      );

      // A call you are in is the one tab you always want first.
      const live = all.filter((item) => item.live).map((item) => ({ ...item, group: 'In a call' }));
      return live.length ? [...live, ...all.filter((item) => !item.live)] : all;
    }

    function render() {
      const query = search.value.trim();
      let items = entries();

      if (query) {
        items = items
          .map((item) => {
            // Bonus only on top of a real match. Adding it first would drag a
            // call tab that matches nothing past genuine but weak matches.
            const base = Math.max(score(query, item.title), score(query, item.url));
            return { item, rank: base < 0 ? -1 : base + (item.live ? 6 : 0) };
          })
          .filter((x) => x.rank >= 0)
          .sort((a, b) => b.rank - a.rank)
          .map((x) => x.item);
      }

      list.textContent = '';
      rows = [];
      if (!items.length) {
        list.append(el('div', 'empty', query ? 'No matches' : 'No tabs'));
        return;
      }

      let lastGroup = null;
      items.forEach((item) => {
        if (!query && item.group && item.group !== lastGroup) {
          list.append(el('div', 'group', item.group));
          lastGroup = item.group;
        }
        const row = el('div', 'row');
        row.dataset.active = String(item.active);
        row.dataset.live = String(Boolean(item.live));
        row.dataset.audible = String(Boolean(item.audible));
        const icon = el('img', 'icon');
        icon.src = item.favIconUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        icon.onerror = () => icon.remove();
        const text = el('div', 'text');
        text.append(el('div', 'title', item.title), el('div', 'url', item.url));
        row.append(icon, text);
        if (item.live) row.append(el('div', 'dot'));
        row.addEventListener('click', () => pick(item));
        list.append(row);
        rows.push({ node: row, item });
      });

      selected = Math.min(selected, rows.length - 1);
      paintSelection();
    }

    function paintSelection() {
      rows.forEach((row, i) => {
        row.node.dataset.selected = String(i === selected);
      });
      rows[selected]?.node.scrollIntoView({ block: 'nearest' });
    }

    function move(step) {
      if (!rows.length) return;
      selected = (selected + step + rows.length) % rows.length;
      paintSelection();
    }

    function pick(item) {
      if (!item) return;
      closeSwitcher();
      if (item.windowId !== undefined) onPick({ windowId: item.windowId });
      else if (item.tabId !== undefined) onPick({ tabId: item.tabId });
    }

    async function killSelected() {
      // A row in the collapsed view is a window, not a tab. Closing "its active
      // tab" is not what the row says it is, so this does nothing there.
      if (collapsed) return;

      const item = rows[selected]?.item;
      if (item?.tabId === undefined) return;

      // Drop the row only if Chrome accepted the close.
      const result = await onClose(item.tabId);
      if (!result?.ok || switcher?.token !== token) return;

      groups = groups
        .map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.id !== item.tabId) }))
        .filter((g) => g.tabs.length);

      if (!groups.length) {
        closeSwitcher();
        return;
      }
      render();
    }

    search.addEventListener('keydown', (event) => {
      event.stopPropagation();
      const ctrl = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeSwitcher();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        pick(rows[selected]?.item);
      } else if (event.key === 'ArrowDown' || (ctrl && (event.key === 'n' || event.key === 'j'))) {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowUp' || (ctrl && (event.key === 'p' || event.key === 'k'))) {
        event.preventDefault();
        move(-1);
      } else if (event.ctrlKey && !event.metaKey && event.key === 'x') {
        event.preventDefault();
        killSelected();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        collapsed = !collapsed;
        search.placeholder = collapsed ? 'Filter windows' : 'Filter tabs';
        selected = 0;
        render();
      }
    });

    search.addEventListener('input', () => {
      selected = 0;
      render();
    });

    scrim.addEventListener('mousedown', (event) => {
      if (event.target === scrim) closeSwitcher();
    });

    switcher = { scrim, token };
    render();
    search.focus({ preventScroll: true });
  }

  /* Help */

  const KEYMAP = [
    ['Prefix', [
      ['C-a C-o / o / w', 'tab tree, searchable across every window'],
      ['C-a s', 'the same tree, collapsed to windows'],
      ['C-a b / l', 'toggle to the last tab you were on'],
      ['C-a p', 'previous tab in order'],
      ['C-a n', 'next tab in order'],
      ['C-a 1-9', 'jump to tab by position'],
      ['C-a m', 'jump to a call, cycles if several'],
      ['C-a c', 'new tab'],
      ['C-a x', 'close tab'],
      ['C-a v', 'toggle vim mode'],
      ['C-a ?', 'this help'],
      ['C-a C-a', 'move caret to line start']
    ]],
    ['Vim mode', [
      ['h j k l', 'scroll'],
      ['d / u', 'half page down / up'],
      ['gg / G', 'top / bottom'],
      ['f / F', 'link hints, F opens a background tab'],
      ['/ n N', 'find, next, previous'],
      ['H / L', 'history back / forward'],
      ['r', 'reload'],
      ['Esc', 'leave vim mode']
    ]],
    ['In the tab tree', [
      ['type', 'filter'],
      ['ctrl-j / ctrl-k', 'move, ctrl-n / ctrl-p and arrows too'],
      ['ctrl-x', 'close the highlighted tab, list stays open'],
      ['', 'tabs only, not the collapsed windows view'],
      ['tab', 'toggle tabs and windows'],
      ['enter / esc', 'switch / close']
    ]]
  ];

  let help = null;

  function closeHelp() {
    help?.scrim.remove();
    help = null;
  }

  function openHelp() {
    closeHelp();
    const r = ensureRoot();

    const scrim = el('div', 'scrim');
    const panel = el('div', 'panel');
    const body = el('div', 'help');

    KEYMAP.forEach(([title, rows]) => {
      const section = el('section');
      section.append(el('h3', null, title));
      const list = el('dl');
      rows.forEach(([keys, description]) => {
        list.append(el('dt', null, keys), el('dd', null, description));
      });
      section.append(list);
      body.append(section);
    });

    panel.append(body, el('div', 'footer', 'any key closes'));
    scrim.append(panel);
    r.append(scrim);

    scrim.addEventListener('mousedown', closeHelp);
    help = { scrim };
  }

  /* Link hints */

  const HINT_CHARS = 'asdfghjkl';
  const HINT_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  let hints = null;

  function closeHints() {
    hints?.nodes.forEach((n) => n.marker.remove());
    hints = null;
  }

  function labels(count) {
    const width = count <= HINT_CHARS.length ? 1 : Math.ceil(Math.log(count) / Math.log(HINT_CHARS.length));
    const out = [];
    for (let i = 0; i < count; i++) {
      let n = i;
      let label = '';
      for (let d = 0; d < width; d++) {
        label = HINT_CHARS[n % HINT_CHARS.length] + label;
        n = Math.floor(n / HINT_CHARS.length);
      }
      out.push(label);
    }
    return out;
  }

  function visibleTargets() {
    return [...document.querySelectorAll(HINT_SELECTOR)].filter((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
      const style = getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    });
  }

  function openHints(onActivate) {
    closeHints();
    const r = ensureRoot();
    const targets = visibleTargets();
    if (!targets.length) return false;

    const keys = labels(targets.length);
    const nodes = targets.map((element, i) => {
      const rect = element.getBoundingClientRect();
      const marker = el('div', 'hint', keys[i]);
      marker.style.left = `${Math.max(0, rect.left)}px`;
      marker.style.top = `${Math.max(0, rect.top)}px`;
      r.append(marker);
      return { element, marker, label: keys[i] };
    });

    hints = { nodes, typed: '', onActivate };
    return true;
  }

  function feedHint(key) {
    if (!hints) return 'idle';
    if (key === 'Escape' || key === 'Backspace') {
      closeHints();
      return 'closed';
    }
    if (!HINT_CHARS.includes(key)) return 'ignored';

    const typed = hints.typed + key;
    const matches = hints.nodes.filter((n) => n.label.startsWith(typed));
    if (!matches.length) {
      closeHints();
      return 'closed';
    }

    const exact = matches.find((n) => n.label === typed);
    if (exact && matches.length === 1) {
      const { element } = exact;
      const { onActivate } = hints;
      closeHints();
      onActivate(element);
      return 'activated';
    }

    hints.typed = typed;
    hints.nodes.forEach((n) => {
      const hit = n.label.startsWith(typed);
      n.marker.style.display = hit ? '' : 'none';
      n.marker.dataset.matched = String(hit);
    });
    return 'typing';
  }

  /* Find bar, backed by Chrome's window.find */

  let findbar = null;
  let lastTerm = '';

  // window.find is non-standard and long deprecated. A throw here would happen
  // inside a capture-phase keydown listener, which is the worst place for one.
  function find(term, backwards) {
    try {
      return window.find(term, false, backwards, true, false, false, false);
    } catch {
      return false;
    }
  }

  function closeFind() {
    findbar?.node.remove();
    findbar = null;
  }

  function openFind(onDone) {
    closeFind();
    const r = ensureRoot();
    const node = el('div', 'findbar');
    const label = el('span', null, '/');
    const input = el('input');
    input.spellcheck = false;
    node.append(label, input);
    r.append(node);

    function search(backwards) {
      if (!input.value) return;
      lastTerm = input.value;
      node.dataset.miss = String(!find(input.value, backwards));
    }

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFind();
        onDone();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        search(event.shiftKey);
        closeFind();
        onDone();
      }
    });

    input.addEventListener('input', () => {
      getSelection()?.collapseToStart();
      search(false);
    });

    findbar = { node, input };
    input.focus({ preventScroll: true });
  }

  function repeatFind(term, backwards) {
    if (!term) return;
    find(term, backwards);
  }

  function lastFindTerm() {
    return lastTerm;
  }

  return {
    setIndicator,
    openSwitcher,
    closeSwitcher,
    isSwitcherOpen: () => Boolean(switcher),
    openHelp,
    closeHelp,
    helpOpen: () => Boolean(help),
    openHints,
    feedHint,
    closeHints,
    hintsOpen: () => Boolean(hints),
    openFind,
    closeFind,
    findOpen: () => Boolean(findbar),
    repeatFind,
    lastFindTerm
  };
})();
