const search = document.getElementById('q');

// Chrome parks focus in the omnibox when an extension overrides the New Tab
// Page. Claiming it here is what lets Ctrl-A reach the page at all.
function claimFocus() {
  search.focus({ preventScroll: true });
}

claimFocus();
window.addEventListener('load', claimFocus);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) claimFocus();
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
