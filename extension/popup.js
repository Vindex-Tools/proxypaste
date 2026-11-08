// Firefox and Safari expose browser; Chromium also supports chrome.
const extensionApi = globalThis.browser ?? globalThis.chrome;
const text = document.querySelector('#text');
const delay = document.querySelector('#delay');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const mode = document.querySelector('#mode');
const copy = document.querySelector('#copy');
const draftStatus = document.querySelector('#draft-status');
const draftKey = 'currentText';
let lastState;
let tabId;
let frameId;
let polling;
let busy = false;

// Synchronous popup storage saves each edit before the popup can close.
// One key holds only the current text: no history, timestamps, mode, or settings.
function saveDraft() {
  try {
    if (text.value) localStorage.setItem(draftKey, text.value);
    else localStorage.removeItem(draftKey);
    draftStatus.hidden = true;
  } catch {
    draftStatus.hidden = false;
    draftStatus.textContent = 'Draft could not be saved. Keep this popup open to avoid losing edits.';
  }
}

function restoreDraft() {
  try {
    text.value = localStorage.getItem(draftKey) ?? '';
  } catch {
    draftStatus.hidden = false;
    draftStatus.textContent = 'Draft could not be restored. Local storage is unavailable.';
  }
  updateCopy();
}

function updateCopy() {
  copy.hidden = mode.value !== 'copy';
  copy.disabled = busy || !text.value;
}
text.addEventListener('input', () => { saveDraft(); updateCopy(); });
copy.addEventListener('click', async () => {
  if (!text.value) return;
  try {
    await navigator.clipboard.writeText(text.value);
    status.className = 'status';
    status.textContent = 'Copied to your local clipboard.';
  } catch {
    text.focus();
    text.select();
    status.className = 'status status--error';
    status.textContent = 'Clipboard write blocked. Text selected; press Ctrl+C or Command+C to copy.';
  }
});

function show(state) {
  lastState = state;
  status.className = `status status--${state.status}`;
  const running = state.status === 'typing';
  const paste = mode.value === 'paste';
  const copying = mode.value === 'copy';
  mode.disabled = running || busy;
  start.disabled = running || busy || ((paste || copying) && !state.clipboardAvailable);
  stop.disabled = !running;
  stop.hidden = !running;
  text.disabled = running;
  delay.disabled = running || paste || copying;
  progress.max = state.total || 1;
  progress.value = state.typed;
  progress.hidden = !['typing', 'done', 'stopped'].includes(state.status);
  const count = `${state.typed} / ${state.total} characters`;
  status.textContent = ({ idle: paste ? 'Ready to send to the remote clipboard.' : 'Console found. Ready to type.', typing: `Typing: ${count}`, done: `Sent: ${count}`, stopped: `Stopped: ${count}`, clipboard: 'Clipboard transfer requested. Paste inside the guest.', error: state.error })[state.status];
  if (copying && !running) {
    progress.hidden = true;
    status.className = 'status';
    status.textContent = 'Copy in the guest, then read the noVNC clipboard.';
  }
  if ((paste || copying) && !state.clipboardAvailable) {
    status.className = 'status status--error';
    status.textContent = copying ? 'No noVNC clipboard found. Screen text cannot be extracted.' : 'No noVNC clipboard found. Use Type for this console.';
  }
  updateCopy();
  if (!running) clearInterval(polling);
}

function updateMode() {
  const paste = mode.value === 'paste';
  const copying = mode.value === 'copy';
  document.querySelector('#speed-panel').hidden = paste || copying;
  document.querySelector('#start-label').textContent = copying ? 'Read noVNC clipboard' : paste ? 'Send to remote clipboard' : 'Type into console';
  document.querySelector('#mode-warning').textContent = copying ? 'Requires guest clipboard sharing. Reads the current clipboard, not screen text.' : paste ? 'Requires guest clipboard support. Not available in text-only VM consoles.' : 'Newlines press Enter and may run commands.';
  document.querySelector('#usage-note').textContent = copying ? 'Copy text inside the guest, click Read noVNC clipboard, then Copy locally. The noVNC clipboard may contain older text, including text you sent earlier. Clipboard sharing must be configured in the guest. Text-only screen output cannot be read here. You can also select text in this box and copy it manually.' : paste ? 'After sending, use Paste inside the guest. Delivery cannot be confirmed. Clipboard text remains in noVNC and the guest until replaced.' : 'Click inside your console before opening ProxyPaste. Typing continues when this popup closes. Reopen to stop.';
  updateCopy();
  if (lastState) show(lastState);
}
mode.addEventListener('change', updateMode);

async function call(method, args = []) {
  const results = await extensionApi.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (name, values) => globalThis.__proxyPaste[name](...values),
    args: [method, args]
  });
  const result = results[0];
  if (!result || result.error || !result.result) throw new Error(result?.error?.message || 'Console unavailable. Reopen ProxyPaste on the console page.');
  return result.result;
}
function fail(error) {
  clearInterval(polling);
  status.className = 'status status--error';
  status.textContent = error.message;
  start.disabled = frameId === undefined || (mode.value !== 'type' && !lastState?.clipboardAvailable);
  stop.disabled = true;
  stop.hidden = true;
  text.disabled = false;
  delay.disabled = false;
  mode.disabled = false;
  updateCopy();
}
function watch() {
  clearInterval(polling);
  polling = setInterval(async () => {
    try { show(await call('inspect')); } catch (error) { fail(error); }
  }, 250);
}
start.addEventListener('click', async () => {
  const copying = mode.value === 'copy';
  if (!copying && !text.value) { status.className = 'status status--error'; status.textContent = 'Enter some text first.'; text.focus(); return; }
  const paste = mode.value === 'paste';
  if (!paste && !copying && (delay.value === '' || !delay.checkValidity())) { status.className = 'status status--error'; status.textContent = 'Enter a delay between 0 and 2000 ms.'; return; }
  busy = true;
  start.disabled = true;
  mode.disabled = true;
  text.disabled = true;
  updateCopy();
  try {
    if (copying) {
      const result = await call('readClipboard');
      if (typeof result.text !== 'string') throw new Error('No clipboard text returned. Reload the console page and try again.');
      text.value = result.text;
      saveDraft();
      busy = false;
      show(lastState);
      status.textContent = text.value ? 'Loaded noVNC clipboard. Review it, then copy locally.' : 'noVNC clipboard is empty. Copy inside the guest, then try again.';
      return;
    }
    const state = await call(paste ? 'paste' : 'start', paste ? [text.value] : [text.value, Number(delay.value)]);
    text.value = '';
    saveDraft();
    busy = false;
    show({ ...lastState, ...state });
    if (state.status === 'typing') watch();
  } catch (error) { busy = false; fail(error); }
});
stop.addEventListener('click', async () => {
  try { show(await call('stop')); } catch (error) { fail(error); }
});

restoreDraft();

(async () => {
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
    await extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['engine.js'] });
    const frames = await extensionApi.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__proxyPaste?.inspect()
    });
    const candidates = frames.filter(frame => frame.result);
    const selected = candidates.find(frame => frame.result.status === 'typing')
      || candidates.filter(frame => frame.result.available).sort((a, b) => b.result.rank - a.result.rank || a.frameId - b.frameId)[0];
    if (!selected) throw new Error('No accessible console canvas found. Open the console directly in its own tab, click it, and try again.');
    frameId = selected.frameId;
    show(selected.result);
    if (selected.result.status === 'typing') watch();
  } catch (error) { fail(new Error(`Cannot access this console. ${error.message}`)); }
})();
