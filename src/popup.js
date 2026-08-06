// @ts-check
// chrome:// links cannot be opened by an <a href>, so route it through tabs.
/** @type {HTMLElement} */ (document.getElementById('shortcuts')).addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});
