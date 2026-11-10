const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('extension/engine.js', 'utf8');

function setup() {
  const events = [];
  const timers = new Map();
  let nextId = 0;
  const attributes = new Map();
  const canvas = {
    isConnected: true,
    getBoundingClientRect: () => ({ width: 640, height: 480 }),
    matches: () => true,
    closest: () => null,
    hasAttribute: key => attributes.has(key),
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    focus() {},
    dispatchEvent: event => { events.push(event); return true; }
  };
  const document = { querySelector: () => null, querySelectorAll: () => [canvas], activeElement: canvas };
  const context = vm.createContext({
    document, window: {}, Event: class { constructor(type, options) { Object.assign(this, { type }, options); } }, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    KeyboardEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source, context);
  function tick() {
    const [id, entry] = timers.entries().next().value;
    timers.delete(id);
    entry.callback();
  }
  return { api: context.__proxyPaste, events, timers, tick, canvas, attributes, context, document };
}

test('normalizes newlines, preserves Unicode code points, and sends balanced Shift events', () => {
  const env = setup();
  const state = env.api.start('A!\r\n\t😀', 0);
  assert.equal(state.total, 5);
  assert.equal(env.events.length, 0);
  assert.equal([...env.timers.values()][0].delay, 300);
  while (env.timers.size) env.tick();
  assert.deepEqual(env.events.filter(e => e.type === 'keydown' && e.key !== 'Shift').map(e => e.key), ['A', '!', 'Enter', 'Tab', '😀']);
  assert.equal(env.events.filter(e => e.key === 'Shift' && e.type === 'keydown').length, 2);
  assert.equal(env.events.filter(e => e.key === 'Shift' && e.type === 'keyup').length, 2);
  assert.equal(env.api.inspect().status, 'done');
  assert.equal(env.api.inspect().typed, 5);
  assert.equal(env.attributes.has('tabindex'), false);
});

test('stops between characters and retains counts without retaining text in status', () => {
  const env = setup();
  env.api.start('secret', 50);
  env.tick();
  const state = env.api.stop();
  assert.equal(state.status, 'stopped');
  assert.equal(state.typed, 1);
  assert.equal(env.timers.size, 0);
  assert.equal(JSON.stringify(env.api.inspect()).includes('secret'), false);
});

test('reinjection keeps a running job and prevents a second job', () => {
  const env = setup();
  env.api.start('abc', 40);
  vm.runInContext(source, env.context);
  assert.equal(env.context.__proxyPaste, env.api);
  assert.throws(() => env.api.start('def', 40), /already running/);
  assert.equal(env.timers.size, 1);
});

test('disconnecting the console stops the job', () => {
  const env = setup();
  env.api.start('abc', 50);
  env.canvas.isConnected = false;
  env.tick();
  assert.equal(env.api.inspect().status, 'error');
  assert.equal(env.events.length, 0);
  assert.equal(env.timers.size, 0);
});

test('rejects invalid input and missing canvases before sending anything', () => {
  const env = setup();
  for (const delay of [-1, NaN, Infinity, 2001]) assert.throws(() => env.api.start('abc', delay), /Delay/);
  assert.throws(() => env.api.start('', 50), /text/);
  env.document.querySelectorAll = () => [];
  assert.throws(() => env.api.start('abc', 50), /canvas/);
  assert.equal(env.timers.size, 0);
});

test('preserves existing canvas tabindex and configured delay', () => {
  const env = setup();
  env.attributes.set('tabindex', '0');
  env.api.start('ab', 125);
  env.tick();
  assert.equal([...env.timers.values()][0].delay, 125);
  assert.equal(env.api.inspect().delay, 125);
  env.tick();
  assert.equal(env.attributes.get('tabindex'), '0');
});

test('clipboard mode sends one unchanged text value without typing or timers', () => {
  const env = setup();
  const changes = [];
  const clipboard = { value: '', disabled: false, dispatchEvent(event) { changes.push({ type: event.type, value: this.value }); } };
  env.document.querySelector = selector => selector === '#noVNC_clipboard_text' ? clipboard : null;
  const text = 'Hello!\r\n\t😀';
  assert.equal(env.api.inspect().clipboardAvailable, true);
  assert.equal(env.api.paste(text).status, 'clipboard');
  assert.deepEqual(changes, [{ type: 'change', value: text }]);
  assert.equal(env.events.length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(JSON.stringify(env.api.inspect()).includes(text), false);
});

test('clipboard mode rejects unavailable controls, empty input, and a running typing job', () => {
  const env = setup();
  assert.equal(env.api.inspect().clipboardAvailable, false);
  assert.throws(() => env.api.paste('abc'), /no accessible noVNC clipboard/);
  env.document.querySelector = () => ({ disabled: true });
  assert.throws(() => env.api.paste('abc'), /no accessible noVNC clipboard/);
  assert.throws(() => env.api.paste(''), /text/);
  env.api.start('abc', 50);
  assert.throws(() => env.api.paste('abc'), /Stop the typing job/);
});

test('explicit clipboard read returns current noVNC text without events or retained state', () => {
  const env = setup();
  const clipboard = { value: 'guest output\r\n\t😀', disabled: false, dispatchEvent() { throw new Error('Reading must not send anything'); } };
  env.document.querySelector = () => clipboard;
  assert.equal(env.api.readClipboard().text, clipboard.value);
  assert.equal(env.api.inspect().status, 'idle');
  assert.equal('text' in env.api.inspect(), false);
  assert.equal(env.events.length, 0);
  assert.equal(env.timers.size, 0);
  clipboard.value = '';
  assert.equal(env.api.readClipboard().text, '');
});

test('clipboard read rejects missing and disabled noVNC controls', () => {
  const env = setup();
  assert.throws(() => env.api.readClipboard(), /no accessible noVNC clipboard/);
  env.document.querySelector = () => ({ disabled: true });
  assert.throws(() => env.api.readClipboard(), /no accessible noVNC clipboard/);
});
