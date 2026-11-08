const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build.cjs');

test('browser packages preserve assets and permissions with Firefox-only metadata', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'proxypaste-build-'));
  try {
    build(output);
    for (const browser of ['firefox', 'chrome', 'edge', 'safari']) {
      const directory = path.join(output, browser);
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
      assert.equal(manifest.manifest_version, 3);
      assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'clipboardWrite']);
      assert.equal(Boolean(manifest.browser_specific_settings), browser === 'firefox');
      for (const asset of ['popup.html', 'popup.css', 'popup.js', 'engine.js']) {
        assert.deepEqual(fs.readFileSync(path.join(directory, asset)), fs.readFileSync(path.join(__dirname, '..', 'extension', asset)));
      }
      for (const icon of new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])) {
        assert.deepEqual(fs.readFileSync(path.join(directory, icon)), fs.readFileSync(path.join(__dirname, '..', 'extension', icon)));
      }
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
