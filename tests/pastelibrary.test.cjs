const { test } = require('node:test');
const assert = require('node:assert/strict');

test('PasteLibrary fileTypes: recognizes whitelisted text files and ignores binaries', async () => {
  const { isTextFile, detectLanguage } = await import('../extension/modules/fileTypes.js');

  const textFiles = [
    'README.md', 'main.py', 'test.lua', 'App.java', 'config.yaml', 'service.yml',
    'index.js', 'styles.css', 'index.html', 'schema.sql', 'Dockerfile', 'Makefile',
    '.gitignore', '.env', 'CMakeLists.txt', 'script.sh', 'main.rs', 'server.go'
  ];
  for (const f of textFiles) {
    assert.equal(isTextFile(f), true, `Expected ${f} to be recognized as text file`);
  }

  const nonTextFiles = [
    'image.png', 'photo.jpg', 'archive.zip', 'binary.exe', 'lib.dll', 'font.woff2', 'audio.mp3'
  ];
  for (const f of nonTextFiles) {
    assert.equal(isTextFile(f), false, `Expected ${f} to NOT be recognized as text file`);
  }

  assert.equal(detectLanguage('test.js'), 'javascript');
  assert.equal(detectLanguage('script.py'), 'python');
  assert.equal(detectLanguage('index.html'), 'html');
});

test('PasteLibrary githubApi: parses GitHub URLs and shorthands', async () => {
  const { parseGitHubUrl } = await import('../extension/modules/githubApi.js');

  const url1 = parseGitHubUrl('https://github.com/ejrad/PasteLibrary.git');
  assert.equal(url1.owner, 'ejrad');
  assert.equal(url1.repo, 'PasteLibrary');

  const url2 = parseGitHubUrl('facebook/react');
  assert.equal(url2.owner, 'facebook');
  assert.equal(url2.repo, 'react');

  const url3 = parseGitHubUrl('https://github.com/torvalds/linux/tree/master/kernel');
  assert.equal(url3.owner, 'torvalds');
  assert.equal(url3.repo, 'linux');
  assert.equal(url3.ref, 'master');
  assert.equal(url3.path, 'kernel');

  const urlTrailing = parseGitHubUrl('facebook/react/');
  assert.equal(urlTrailing.owner, 'facebook');
  assert.equal(urlTrailing.repo, 'react');

  const urlGitTrailing = parseGitHubUrl('https://github.com/facebook/react.git/');
  assert.equal(urlGitTrailing.owner, 'facebook');
  assert.equal(urlGitTrailing.repo, 'react');
});

test('PasteLibrary highlighter: tokenizes code and generates line numbers', async () => {
  const { renderCodeWithLineNumbers, escapeHtml } = await import('../extension/modules/highlighter.js');

  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml('<div>&"\'</div>'), '&lt;div&gt;&amp;&quot;&#39;&lt;/div&gt;');

  const code = 'function hello() {\n  return "world";\n}';
  const rendered = renderCodeWithLineNumbers(code, 'javascript');
  assert.equal(rendered.lineCount, 3);
  assert.ok(rendered.html.includes('tok-keyword'), 'Contains keyword token');
  assert.ok(rendered.html.includes('tok-string'), 'Contains string token');
});

test('PasteLibrary storage: persists and restores session state', async () => {
  const { saveSession, loadSession, clearSession } = await import('../extension/modules/storage.js');

  await saveSession({
    repoInput: 'owner/repo',
    owner: 'owner',
    repo: 'repo',
    ref: 'main',
    currentPath: 'src/components',
    activeFile: { name: 'App.jsx', path: 'src/components/App.jsx' }
  });

  const restored = await loadSession();
  assert.ok(restored !== null);
  assert.equal(restored.currentPath, 'src/components');
  assert.equal(restored.activeFile.name, 'App.jsx');

  await clearSession();
  const cleared = await loadSession();
  assert.equal(cleared, null);
});

test('PasteLibrary treeIndex: builds tree index and provides instant folder lookups', async () => {
  const { buildTreeIndex, getItemsInPath } = await import('../extension/modules/treeIndex.js');
  const { isTextFile } = await import('../extension/modules/fileTypes.js');

  const mockTree = [
    { path: 'README.md', type: 'blob', size: 500, sha: '111' },
    { path: 'package.json', type: 'blob', size: 300, sha: '222' },
    { path: 'logo.png', type: 'blob', size: 10000, sha: '333' },
    { path: 'src', type: 'tree', sha: '444' },
    { path: 'src/index.js', type: 'blob', size: 120, sha: '555' },
    { path: 'src/utils', type: 'tree', sha: '666' },
    { path: 'src/utils/math.lua', type: 'blob', size: 250, sha: '777' }
  ];

  const index = buildTreeIndex(mockTree, isTextFile);

  const rootItems = getItemsInPath(index, '');
  assert.ok(rootItems.some(i => i.name === 'src' && i.type === 'dir'));
  assert.ok(rootItems.some(i => i.name === 'README.md' && i.type === 'file'));
  assert.ok(rootItems.some(i => i.name === 'package.json' && i.type === 'file'));
  assert.ok(!rootItems.some(i => i.name === 'logo.png'));

  const srcItems = getItemsInPath(index, 'src');
  assert.ok(srcItems.some(i => i.name === 'utils' && i.type === 'dir'));
  assert.ok(srcItems.some(i => i.name === 'index.js' && i.type === 'file'));

  const utilsItems = getItemsInPath(index, 'src/utils');
  assert.equal(utilsItems.length, 1);
  assert.equal(utilsItems[0].name, 'math.lua');
});
