const search = document.getElementById('q');

// Chrome parks focus in the omnibox when an extension overrides the New Tab
// Page, and it does so around load rather than before it. A single focus()
// call races that and loses, which is why Cmd-T used to leave you typing in
// the address bar. So keep claiming focus for a short window instead.
function claimFocus() {
  window.focus();
  search.focus({ preventScroll: true });
}

function claimFocusUntil(ms) {
  const deadline = performance.now() + ms;
  (function again() {
    claimFocus();
    if (performance.now() < deadline) requestAnimationFrame(again);
  })();
}

claimFocusUntil(800);
document.addEventListener('DOMContentLoaded', () => claimFocusUntil(400));
window.addEventListener('load', () => claimFocusUntil(400));
window.addEventListener('pageshow', () => claimFocusUntil(400));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) claimFocusUntil(200);
});

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '32');
  return url.href;
}

chrome.topSites.get().then((sites) => {
  const nav = document.getElementById('sites');
  sites.slice(0, 12).forEach((site) => {
    const link = document.createElement('a');
    link.href = site.url;
    link.tabIndex = -1;

    const icon = document.createElement('img');
    icon.src = faviconUrl(site.url);
    icon.alt = '';
    icon.onerror = () => icon.remove();

    const label = document.createElement('span');
    label.textContent = site.title || new URL(site.url).hostname;

    link.append(icon, label);
    nav.append(link);
  });
});
