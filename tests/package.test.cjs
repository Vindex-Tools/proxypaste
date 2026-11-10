const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { packageAll, crc32 } = require('../scripts/package.cjs');

// Minimal reader for the archives written by package.cjs.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(dataStart, dataStart + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.equal(crc32(data), crc, `${name} CRC`);
    files.set(name, data);
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return files;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('package writes one ZIP per browser with manifest.json at the archive root', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'proxypaste-package-'));
  try {
    const archives = packageAll(output);
    assert.deepEqual(archives.map(file => path.basename(file)), ['firefox', 'chrome', 'edge', 'safari'].map(b => `proxypaste-${b}.zip`));
    for (const archive of archives) {
      const browser = path.basename(archive, '.zip').replace('proxypaste-', '');
      const files = readZip(fs.readFileSync(archive));
      const manifest = JSON.parse(files.get('manifest.json'));
      assert.equal(manifest.manifest_version, 3);
      assert.equal(Boolean(manifest.browser_specific_settings), browser === 'firefox');
      for (const [name, data] of files) {
        assert.ok(!name.includes('\\') && !name.startsWith('/'), name);
        assert.deepEqual(data, fs.readFileSync(path.join(output, 'dist', browser, ...name.split('/'))));
      }
      assert.ok(files.has('engine.js') && files.has('popup.html') && files.has('icons/icon-128.png'));
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
