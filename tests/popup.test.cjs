const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('extension/popup.js', 'utf8');

async function setup(frames, namespace = 'browser', pasteError = false, copyOptions = {}) {
  const elements = Object.fromEntries(['text', 'delay', 'start', 'stop', 'status', 'progress', 'mode', 'copy', 'speed-panel', 'start-label', 'mode-warning', 'usage-note', 'draft-status'].map(id => [id, {
    value: id === 'delay' ? '50' : id === 'mode' ? 'type' : '', disabled: id === 'start' || id === 'stop',
    addEventListener(event, fn) { this[event] = fn; }, checkValidity: () => true, focus() {}, select() { this.selected = true; }
  }]));
  const calls = [];
  const writes = [];
  const drafts = copyOptions.drafts ?? new Map();
  const intervals = new Map();
  let nextId = 0;
  const browser = {
    tabs: { query: async () => [{ id: 7 }] },
    scripting: { executeScript: async options => {
      calls.push(options);
      if (options.files) return [];
      if (!options.args) return frames;
      const [method, args] = options.args;
      if (method === 'readClipboard') {
        if (copyOptions.readError) throw new Error('Clipboard read failed');
        return [{ result: { text: copyOptions.remoteText ?? 'guest output\n😀' } }];
      }
      if (method === 'paste') {
        if (pasteError) throw new Error('Clipboard unavailable');
        return [{ result: { status: 'clipboard', typed: 0, total: args[0].length } }];
      }
      if (method === 'start') return [{ result: { status: 'typing', typed: 0, total: Array.from(args[0]).length } }];
      if (method === 'stop') return [{ result: { status: 'stopped', typed: 1, total: 3 } }];
      return [{ result: { status: 'typing', typed: 1, total: 3 } }];
    } }
  };
  const context = vm.createContext({
    document: { querySelector: selector => elements[selector.slice(1)] }, [namespace]: browser,
    localStorage: {
      getItem: key => {
        if (copyOptions.storageError) throw new Error('Storage unavailable');
        return drafts.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (copyOptions.storageError) throw new Error('Storage unavailable');
        drafts.set(key, value);
      },
      removeItem: key => {
        if (copyOptions.storageError) throw new Error('Storage unavailable');
        drafts.delete(key);
      }
    },
    navigator: { clipboard: { writeText: async value => {
      if (copyOptions.writeError) throw new Error('Clipboard write denied');
      writes.push(value);
    } } },
    setInterval: fn => { const id = ++nextId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id)
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, calls, intervals, writes, drafts };
}

test('reopening popup reconnects to the running frame and can stop it', async () => {
  const { elements, calls, intervals } = await setup([
    { frameId: 0, result: { available: true, rank: 10, status: 'idle', typed: 0, total: 0 } },
    { frameId: 4, result: { available: true, rank: 5, status: 'typing', typed: 1, total: 3 } }
  ]);
  assert.equal(elements.start.disabled, true);
  assert.equal(elements.stop.disabled, false);
  assert.equal(intervals.size, 1);
  await elements.stop.click();
  assert.equal(calls.at(-1).target.frameIds[0], 4);
  assert.equal(elements.status.textContent, 'Stopped: 1 / 3 characters');
  assert.equal(elements.start.disabled, false);
  assert.equal(intervals.size, 0);
});

test('submitting text targets the selected console and clears the popup copy', async () => {
  const { elements, calls } = await setup([
    { frameId: 0, result: { available: true, rank: 0, status: 'idle', typed: 0, total: 0 } },
    { frameId: 2, result: { available: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ]);
  elements.text.value = 'abc';
  elements.delay.value = '0';
  await elements.start.click();
  assert.equal(calls.at(-1).target.frameIds[0], 2);
  assert.equal(calls.at(-1).args[1][1], 0);
  assert.equal(elements.text.value, '');
  assert.equal(elements.stop.disabled, false);
});

test('missing console keeps start disabled and explains how to recover', async () => {
  const { elements } = await setup([{ frameId: 0, result: { available: false, status: 'idle' } }]);
  assert.equal(elements.start.disabled, true);
  assert.equal(elements.stop.disabled, true);
  assert.match(elements.status.textContent, /own tab/);
});

for (const namespace of ['browser', 'chrome']) {
  test(`${namespace} copy-out previews clipboard text and writes locally only on a separate click`, async () => {
    const { elements, calls, intervals, writes } = await setup([
      { frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
    ], namespace);
    elements.mode.value = 'copy';
    elements.mode.change();
    assert.equal(elements['speed-panel'].hidden, true);
    assert.equal(elements.copy.disabled, true);
    elements.delay.value = '';
    await elements.start.click();
    assert.equal(calls.at(-1).args[0], 'readClipboard');
    assert.equal(elements.text.value, 'guest output\n😀');
    assert.deepEqual(writes, []);
    assert.equal(elements.copy.disabled, false);
    assert.equal(intervals.size, 0);
    await elements.copy.click();
    assert.deepEqual(writes, ['guest output\n😀']);
    assert.match(elements.status.textContent, /local clipboard/);
    assert.equal(elements.text.value, 'guest output\n😀');
  });
  test(`${namespace} clipboard mode sends the full text without a typing job`, async () => {
    const { elements, calls, intervals } = await setup([
      { frameId: 2, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
    ], namespace);
    elements.mode.value = 'paste';
    elements.mode.change();
    assert.equal(elements['speed-panel'].hidden, true);
    assert.equal(elements['start-label'].textContent, 'Send to remote clipboard');
    elements.delay.value = '';
    elements.text.value = 'all\nof it';
    await elements.start.click();
    assert.equal(calls.at(-1).args[0], 'paste');
    assert.deepEqual(Array.from(calls.at(-1).args[1]), ['all\nof it']);
    assert.equal(elements.text.value, '');
    assert.match(elements.status.textContent, /transfer requested/);
    assert.equal(intervals.size, 0);
    assert.equal(elements.stop.disabled, true);
    assert.equal(elements.start.disabled, false);
  });
  test(`${namespace} API supports initialization, typing, polling, and stopping`, async () => {
    const { elements, calls, intervals } = await setup([
      { frameId: 0, result: { available: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
    ], namespace);
    assert.equal(elements.start.disabled, false);
    elements.text.value = 'abc';
    await elements.start.click();
    assert.equal(elements.status.textContent, 'Typing: 0 / 3 characters');
    await [...intervals.values()][0]();
    assert.equal(elements.progress.value, 1);
    await elements.stop.click();
    assert.equal(calls.at(-1).target.frameIds[0], 0);
    assert.equal(elements.status.textContent, 'Stopped: 1 / 3 characters');
    assert.equal(intervals.size, 0);
  });
}

test('unavailable clipboard explains the limitation and allows switching back to typing', async () => {
  const { elements } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: false, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ]);
  elements.mode.value = 'paste';
  elements.mode.change();
  assert.equal(elements.start.disabled, true);
  assert.match(elements.status.textContent, /Use Type/);
  elements.mode.value = 'type';
  elements.mode.change();
  assert.equal(elements.start.disabled, false);
  assert.equal(elements['speed-panel'].hidden, false);
});

test('failed clipboard submission keeps text available to retry', async () => {
  const { elements } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ], 'browser', true);
  elements.mode.value = 'paste';
  elements.mode.change();
  elements.text.value = 'keep me';
  await elements.start.click();
  assert.equal(elements.text.value, 'keep me');
  assert.match(elements.status.textContent, /unavailable/);
  assert.equal(elements.mode.disabled, false);
});

test('empty remote clipboard is reported without enabling local copy', async () => {
  const { elements } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ], 'browser', false, { remoteText: '' });
  elements.mode.value = 'copy';
  elements.mode.change();
  await elements.start.click();
  assert.match(elements.status.textContent, /empty/);
  assert.equal(elements.copy.disabled, true);
});

test('blocked local clipboard write selects text for manual copying', async () => {
  const { elements, writes } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ], 'browser', false, { writeError: true });
  elements.mode.value = 'copy';
  elements.mode.change();
  await elements.start.click();
  await elements.copy.click();
  assert.equal(elements.text.selected, true);
  assert.equal(elements.text.value, 'guest output\n😀');
  assert.match(elements.status.textContent, /Ctrl\+C or Command\+C/);
  assert.deepEqual(writes, []);
});

test('failed remote read keeps existing text and restores controls', async () => {
  const { elements } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ], 'browser', false, { readError: true });
  elements.mode.value = 'copy';
  elements.mode.change();
  elements.text.value = 'previous text';
  await elements.start.click();
  assert.equal(elements.text.value, 'previous text');
  assert.equal(elements.text.disabled, false);
  assert.equal(elements.start.disabled, false);
  assert.match(elements.status.textContent, /read failed/);
});

test('copy-out without clipboard support explains that screen text cannot be extracted', async () => {
  const { elements } = await setup([
    { frameId: 0, result: { available: true, clipboardAvailable: false, rank: 5, status: 'idle', typed: 0, total: 0 } }
  ]);
  elements.mode.value = 'copy';
  elements.mode.change();
  assert.equal(elements.start.disabled, true);
  assert.match(elements.status.textContent, /Screen text cannot be extracted/);
});

const readyFrames = [{ frameId: 0, result: { available: true, clipboardAvailable: true, rank: 5, status: 'idle', typed: 0, total: 0 } }];

for (const namespace of ['browser', 'chrome']) {
  test(`${namespace} restores only the latest text after closing and reopening the popup`, async () => {
    const first = await setup(readyFrames, namespace);
    first.elements.text.value = 'first draft';
    first.elements.text.input();
    first.elements.text.value = 'latest\ntext 😀';
    first.elements.text.input();
    first.elements.delay.value = '200';
    first.elements.mode.value = 'paste';
    first.elements.mode.change();
    assert.deepEqual([...first.drafts], [['currentText', 'latest\ntext 😀']]);
    const reopened = await setup(readyFrames, namespace, false, { drafts: first.drafts });
    assert.equal(reopened.elements.text.value, 'latest\ntext 😀');
    assert.equal(reopened.elements.mode.value, 'type');
    assert.equal(reopened.elements.delay.value, '50');
    reopened.elements.text.value = '';
    reopened.elements.text.input();
    assert.equal(reopened.drafts.size, 0);
    const cleared = await setup(readyFrames, namespace, false, { drafts: reopened.drafts });
    assert.equal(cleared.elements.text.value, '');
  });
}

for (const method of ['type', 'paste']) {
  test(`successful ${method} submission removes the saved draft`, async () => {
    const drafts = new Map([['currentText', 'send this']]);
    const env = await setup(readyFrames, 'browser', false, { drafts });
    env.elements.mode.value = method;
    env.elements.mode.change();
    await env.elements.start.click();
    assert.equal(env.elements.text.value, '');
    assert.equal(drafts.size, 0);
  });
}

test('failed submission preserves the current draft for reopening', async () => {
  const drafts = new Map([['currentText', 'keep this draft']]);
  const env = await setup(readyFrames, 'browser', true, { drafts });
  env.elements.mode.value = 'paste';
  env.elements.mode.change();
  await env.elements.start.click();
  assert.deepEqual([...drafts], [['currentText', 'keep this draft']]);
  const reopened = await setup(readyFrames, 'browser', false, { drafts });
  assert.equal(reopened.elements.text.value, 'keep this draft');
});

test('reading clipboard replaces the current draft and copying locally adds no saved data', async () => {
  const drafts = new Map([['currentText', 'previous draft']]);
  const env = await setup(readyFrames, 'browser', false, { drafts, remoteText: 'current clipboard' });
  env.elements.mode.value = 'copy';
  env.elements.mode.change();
  await env.elements.start.click();
  await env.elements.copy.click();
  assert.deepEqual([...drafts], [['currentText', 'current clipboard']]);
});

test('draft survives unavailable console access', async () => {
  const env = await setup([], 'browser', false, { drafts: new Map([['currentText', 'unfinished text']]) });
  assert.equal(env.elements.text.value, 'unfinished text');
  assert.equal(env.elements.text.disabled, false);
  assert.equal(env.elements.start.disabled, true);
});

test('unavailable local storage explains that edits cannot be saved', async () => {
  const env = await setup(readyFrames, 'browser', false, { storageError: true });
  assert.equal(env.elements['draft-status'].hidden, false);
  assert.match(env.elements['draft-status'].textContent, /could not be restored/);
  env.elements.text.value = 'unsaved edit';
  env.elements.text.input();
  assert.match(env.elements['draft-status'].textContent, /could not be saved/);
  assert.equal(env.elements.text.value, 'unsaved edit');
});
