// @ts-check

/** @type {HTMLElement} */ (document.getElementById('options')).addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});
