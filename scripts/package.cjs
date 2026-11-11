// Dependency-free ZIP packager so `npm run package` works on macOS, Linux, and Windows.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { build } = require('./build.cjs');

const root = path.resolve(__dirname, '..');
const browsers = ['firefox', 'chrome', 'edge', 'safari'];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(path.join(directory, entry.name), relative) : [relative];
    });
}

// Writes a standard ZIP (deflate, fixed 1980-01-01 timestamps for reproducible archives).
function zipDirectory(directory) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const name of listFiles(directory)) {
    const data = fs.readFileSync(path.join(directory, ...name.split('/')));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const fileName = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(stored ? 0 : 8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    header.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    header.copy(entry, 8, 6, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    local.push(header, fileName, body);
    central.push(entry, fileName);
    offset += header.length + fileName.length + body.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

function packageAll(output = root) {
  const dist = path.join(output, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  build(dist);
  return browsers.map(browser => {
    const archive = path.join(output, `proxypaste-${browser}.zip`);
    fs.writeFileSync(archive, zipDirectory(path.join(dist, browser)));
    return archive;
  });
}

if (require.main === module) {
  for (const archive of packageAll()) console.log(`Packaged ${path.relative(root, archive)}`);
}
module.exports = { packageAll, zipDirectory, crc32 };
