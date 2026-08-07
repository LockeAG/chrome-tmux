// @ts-check

(() => {
  const CONFIG = globalThis.SV_SETTINGS;

  /** @type {HTMLElement} */ (document.getElementById('version')).textContent =
    `v${chrome.runtime.getManifest().version}`;

  /** @type {HTMLElement} */ (document.getElementById('options')).addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // The prefix is per-platform and rebindable, so show the real one.
  CONFIG.load().then((settings) => {
    const prefix = CONFIG.effectivePrefix(settings ?? CONFIG.defaults());
    /** @type {HTMLElement} */ (document.getElementById('prefix')).textContent = CONFIG.label(prefix);
  });
})();
