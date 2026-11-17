// Tab switching abstraction for ProxyPaste and PasteLibrary
(() => {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');
  if (!tabs.length) return;

  function switchTab(name) {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach(panel => {
      const active = panel.id === `panel-${name}`;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    try {
      localStorage.setItem('activeTab', name);
    } catch {}

    if (name === 'proxypaste') {
      const txt = document.querySelector('#text');
      if (txt) txt.focus();
    } else if (name === 'pastelibrary') {
      const input = document.querySelector('#repoUrlInput');
      if (input) input.focus();
    }
  }

  const tabList = Array.from(tabs);
  tabList.forEach((tab, index) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = tabList[(index + 1) % tabList.length];
        next.focus();
        next.click();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = tabList[(index - 1 + tabList.length) % tabList.length];
        prev.focus();
        prev.click();
      }
    });
  });

  try {
    const saved = localStorage.getItem('activeTab');
    if (saved && (saved === 'proxypaste' || saved === 'pastelibrary')) {
      switchTab(saved);
    }
  } catch {}

  globalThis.switchTab = switchTab;
})();
