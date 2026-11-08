const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = ['popup.html', 'popup.css', 'popup.js', 'engine.js'];

function build(output = path.join(root, 'dist')) {
  const source = path.join(root, 'extension');
  const base = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  for (const browser of ['firefox', 'chrome', 'edge', 'safari']) {
    const manifest = structuredClone(base);
    if (browser !== 'firefox') delete manifest.browser_specific_settings;
    const destination = path.join(output, browser);
    fs.mkdirSync(destination, { recursive: true });
    for (const asset of assets) fs.copyFileSync(path.join(source, asset), path.join(destination, asset));
    fs.cpSync(path.join(source, 'icons'), path.join(destination, 'icons'), { recursive: true });
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
}

if (require.main === module) {
  build();
  console.log('Built Firefox, Chrome, Edge, and Safari extension source in dist/.');
}
module.exports = { build };
