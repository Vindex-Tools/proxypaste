// This controller lives in the browser's isolated content-script world, independently
// of the popup. Only counts/status are returned; completed text is released.
(() => {
  if (globalThis.__proxyPaste) return;
  let state = { status: 'idle', typed: 0, total: 0, error: '' };
  let timer = null;
  let characters = [];
  let target = null;
  let addedTabIndex = false;

  function canvas() {
    return Array.from(document.querySelectorAll('canvas')).filter(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).sort((a, b) => rank(b) - rank(a))[0];
  }
  function rank(element) {
    return (element === document.activeElement ? 10 : 0)
      + (element.matches('#noVNC_canvas') || element.closest('#noVNC_container, #noVNC_screen') ? 5 : 0);
  }
  function snapshot() { return { ...state }; }
  function finish(status, error = '') {
    clearTimeout(timer);
    timer = null;
    characters = [];
    if (addedTabIndex && target) target.removeAttribute('tabindex');
    addedTabIndex = false;
    target = null;
    state.status = status;
    state.error = error;
    return snapshot();
  }
  function key(character) {
    if (/^[a-z]$/i.test(character)) return { key: character, code: `Key${character.toUpperCase()}`, shiftKey: /^[A-Z]$/.test(character) };
    if (/^[0-9]$/.test(character)) return { key: character, code: `Digit${character}` };
    const special = { '\n': ['Enter', 'Enter'], '\t': ['Tab', 'Tab'], ' ': [' ', 'Space'] }[character];
    if (special) return { key: special[0], code: special[1] };
    const pairs = [ ['`~', 'Backquote'], ['-_', 'Minus'], ['=+', 'Equal'], ['[{', 'BracketLeft'], [']}', 'BracketRight'], ['\\|', 'Backslash'], [';:', 'Semicolon'], ["'\"", 'Quote'], [',<', 'Comma'], ['.>', 'Period'], ['/?', 'Slash'] ];
    const pair = pairs.find(([symbols]) => symbols.includes(character));
    if (pair) return { key: character, code: pair[1], shiftKey: pair[0].indexOf(character) === 1 };
    const shiftedDigits = ')!@#$%^&*(';
    if (shiftedDigits.includes(character)) return { key: character, code: `Digit${shiftedDigits.indexOf(character)}`, shiftKey: true };
    return { key: character, code: '' };
  }
  function send(character) {
    const options = key(character);
    const fire = (type, details) => target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, view: window, ...details }));
    if (options.shiftKey) fire('keydown', { key: 'Shift', code: 'ShiftLeft', location: 1, shiftKey: true });
    try {
      fire('keydown', options);
      fire('keypress', options);
      fire('keyup', options);
    } finally {
      if (options.shiftKey) fire('keyup', { key: 'Shift', code: 'ShiftLeft', location: 1, shiftKey: false });
    }
  }
  globalThis.__proxyPaste = {
    inspect() {
      const found = canvas();
      const clipboard = document.querySelector('#noVNC_clipboard_text');
      return { ...snapshot(), available: Boolean(found), clipboardAvailable: Boolean(clipboard && !clipboard.disabled), rank: found ? rank(found) : -1 };
    },
    stop() { return state.status === 'typing' ? finish('stopped') : snapshot(); },
    readClipboard() {
      const clipboard = document.querySelector('#noVNC_clipboard_text');
      if (!clipboard || clipboard.disabled) throw new Error('This console has no accessible noVNC clipboard. Text cannot be copied from the screen.');
      // This is noVNC's current clipboard value, which can also contain earlier outbound text.
      // Return it only for an explicit read, never in status polling or stored controller state.
      return { text: clipboard.value };
    },
    paste(text) {
      if (state.status === 'typing') throw new Error('Stop the typing job before sending clipboard text.');
      if (typeof text !== 'string' || !text) throw new Error('Enter some text first.');
      const clipboard = document.querySelector('#noVNC_clipboard_text');
      if (!clipboard || clipboard.disabled) throw new Error('This console has no accessible noVNC clipboard. Use Type instead.');
      // noVNC's own change handler forwards the entire value through clipboardPasteFrom.
      // This is a clipboard transfer request, not confirmation of guest receipt or insertion.
      clipboard.value = text;
      clipboard.dispatchEvent(new Event('change', { bubbles: true }));
      state = { status: 'clipboard', typed: 0, total: Array.from(text).length, error: '' };
      return snapshot();
    },
    start(text, delay) {
      if (state.status === 'typing') throw new Error('A typing job is already running.');
      if (typeof text !== 'string' || !text) throw new Error('Enter some text first.');
      if (!Number.isFinite(delay) || delay < 0 || delay > 2000) throw new Error('Delay must be between 0 and 2000 ms.');
      target = canvas();
      if (!target) throw new Error('No visible console canvas found.');
      characters = Array.from(text.replace(/\r\n?/g, '\n'));
      state = { status: 'typing', typed: 0, total: characters.length, error: '' };
      addedTabIndex = !target.hasAttribute('tabindex');
      if (addedTabIndex) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      function tick() {
        try {
          if (!target.isConnected) { finish('error', 'Console disconnected.'); return; }
          send(characters[state.typed]);
          state.typed += 1;
          if (state.typed === state.total) finish('done');
          else timer = setTimeout(tick, delay);
        } catch (error) { finish('error', error.message); }
      }
      timer = setTimeout(tick, 300);
      return snapshot();
    }
  };
})();
