/**
 * PasteLibrary UI Controller - Compact Tab Edition for ProxyPaste
 */

import { isTextFile, detectLanguage, getFileExtension } from './modules/fileTypes.js';
import {
  parseGitHubUrl,
  fetchRepoInfo,
  fetchRepoTree,
  fetchDirectoryContents,
  fetchFileContent,
  GitHubApiError
} from './modules/githubApi.js';
import { buildTreeIndex, getItemsInPath } from './modules/treeIndex.js';
import { loadSettings, saveSettings, addRecentRepo, saveSession, loadSession } from './modules/storage.js';
import { copyToClipboard, selectElementText } from './modules/clipboard.js';
import { renderCodeWithLineNumbers, escapeHtml } from './modules/highlighter.js';

const state = {
  owner: '',
  repo: '',
  ref: '',
  currentPath: '',
  currentItems: [],
  activeFile: null,
  activeContent: '',
  treeIndex: null,
  settings: {
    lastRepoUrl: '',
    githubToken: '',
    autoCopy: true,
    recentRepos: []
  }
};

const elements = {
  repoUrlInput: document.getElementById('repoUrlInput'),
  loadRepoBtn: document.getElementById('loadRepoBtn'),
  recentChips: document.getElementById('recentChips'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  settingsDrawer: document.getElementById('settingsDrawer'),
  tokenInput: document.getElementById('tokenInput'),
  saveTokenBtn: document.getElementById('saveTokenBtn'),
  autoCopyCheckbox: document.getElementById('autoCopyCheckbox'),
  rateLimitBadge: document.getElementById('rateLimitBadge'),
  breadcrumbBar: document.getElementById('breadcrumbBar'),
  breadcrumbList: document.getElementById('breadcrumbList'),
  upDirBtn: document.getElementById('upDirBtn'),
  fileFilterInput: document.getElementById('fileFilterInput'),
  fileListContainer: document.getElementById('fileListContainer'),
  itemsCountBadge: document.getElementById('itemsCountBadge'),
  activeFileName: document.getElementById('activeFileName'),
  activeFileMeta: document.getElementById('activeFileMeta'),
  codeScrollBox: document.getElementById('codeScrollBox'),
  copyCodeBtn: document.getElementById('copyCodeBtn'),
  highlightAllBtn: document.getElementById('highlightAllBtn'),
  sendToProxyPasteBtn: document.getElementById('sendToProxyPasteBtn'),
  toast: document.getElementById('plToast')
};

let toastTimer = null;
function showNotice(msg, isError = false) {
  if (!elements.toast) return;
  elements.toast.hidden = false;
  elements.toast.className = `notice pl-toast ${isError ? 'error' : 'success'}`;
  elements.toast.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2800);
}

async function init() {
  if (!elements.repoUrlInput) return;
  state.settings = await loadSettings();
  elements.tokenInput.value = state.settings.githubToken || '';
  elements.autoCopyCheckbox.checked = state.settings.autoCopy !== false;

  renderRecentChips();
  attachEventListeners();

  const session = await loadSession();
  if (session && session.owner && session.repo) {
    elements.repoUrlInput.value = session.repoInput || `https://github.com/${session.owner}/${session.repo}`;
    state.owner = session.owner;
    state.repo = session.repo;
    state.ref = session.ref || 'main';
    state.currentPath = session.currentPath || '';
    if (session.activeFile) state.activeFile = session.activeFile;

    try {
      const treeResult = await fetchRepoTree({
        owner: state.owner,
        repo: state.repo,
        ref: state.ref,
        token: state.settings.githubToken
      });
      state.treeIndex = buildTreeIndex(treeResult.tree, isTextFile);
      updateRateLimit(treeResult.rateLimit);
      loadDirectoryFromIndex(state.currentPath, false);

      if (session.activeFile) {
        await selectFile(session.activeFile, true);
      }
    } catch {
      await loadDirectory(state.currentPath, false);
      if (session.activeFile) {
        await selectFile(session.activeFile, true);
      }
    }
  } else if (state.settings.lastRepoUrl) {
    elements.repoUrlInput.value = state.settings.lastRepoUrl;
  }
}

function persistCurrentSession() {
  if (!state.owner || !state.repo) return;
  saveSession({
    repoInput: elements.repoUrlInput.value,
    owner: state.owner,
    repo: state.repo,
    ref: state.ref,
    currentPath: state.currentPath,
    activeFile: state.activeFile ? {
      name: state.activeFile.name,
      path: state.activeFile.path,
      type: state.activeFile.type,
      size: state.activeFile.size,
      downloadUrl: state.activeFile.downloadUrl
    } : null
  });
}

function attachEventListeners() {
  elements.loadRepoBtn.addEventListener('click', () => loadRepository(elements.repoUrlInput.value));
  elements.repoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadRepository(elements.repoUrlInput.value);
  });

  elements.toggleSettingsBtn.addEventListener('click', () => {
    elements.settingsDrawer.hidden = !elements.settingsDrawer.hidden;
  });

  elements.saveTokenBtn.addEventListener('click', async () => {
    const token = elements.tokenInput.value.trim();
    await saveSettings({ githubToken: token });
    state.settings.githubToken = token;
    showNotice('GitHub token saved.');
    elements.settingsDrawer.hidden = true;
  });

  elements.autoCopyCheckbox.addEventListener('change', async (e) => {
    const autoCopy = e.target.checked;
    await saveSettings({ autoCopy });
    state.settings.autoCopy = autoCopy;
  });

  elements.upDirBtn.addEventListener('click', navigateUp);
  elements.fileFilterInput.addEventListener('input', () => filterItems(elements.fileFilterInput.value));

  elements.copyCodeBtn.addEventListener('click', handleManualCopy);
  elements.sendToProxyPasteBtn.addEventListener('click', handleSendToProxyPaste);
  elements.highlightAllBtn.addEventListener('click', handleHighlightAll);
}

async function loadRepository(input) {
  if (!input || !input.trim()) {
    showNotice('Enter a repository URL or owner/repo.', true);
    return;
  }

  try {
    const parsed = parseGitHubUrl(input.trim());
    state.owner = parsed.owner;
    state.repo = parsed.repo;
    state.currentPath = parsed.path || '';
    state.ref = parsed.ref || '';

    elements.fileListContainer.innerHTML = `
      <div class="pl-empty-state">
        <p>Loading tree index...</p>
      </div>
    `;

    if (!state.ref) {
      try {
        const repoInfo = await fetchRepoInfo({
          owner: state.owner,
          repo: state.repo,
          token: state.settings.githubToken
        });
        state.ref = repoInfo.defaultBranch;
        updateRateLimit(repoInfo.rateLimit);
      } catch {
        state.ref = 'main';
      }
    }

    await addRecentRepo(input.trim());
    state.settings.recentRepos = (await loadSettings()).recentRepos;
    renderRecentChips();

    try {
      const treeResult = await fetchRepoTree({
        owner: state.owner,
        repo: state.repo,
        ref: state.ref,
        token: state.settings.githubToken
      });
      state.treeIndex = buildTreeIndex(treeResult.tree, isTextFile);
      updateRateLimit(treeResult.rateLimit);
      loadDirectoryFromIndex(state.currentPath, true);
    } catch {
      await loadDirectory(state.currentPath, true);
    }
  } catch (err) {
    showNotice(err.message, true);
    elements.fileListContainer.innerHTML = `
      <div class="pl-empty-state">
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function loadDirectoryFromIndex(path, clearActive = true) {
  state.currentPath = path;
  if (clearActive) {
    state.activeFile = null;
    state.activeContent = '';
    elements.activeFileName.textContent = 'No file selected';
    elements.activeFileMeta.textContent = '';
    elements.copyCodeBtn.disabled = true;
    elements.sendToProxyPasteBtn.disabled = true;
    elements.highlightAllBtn.disabled = true;
    elements.codeScrollBox.innerHTML = `
      <div class="pl-empty-state">
        <p>Click a text file above to preview, copy, or send to ProxyPaste.</p>
      </div>
    `;
  }
  elements.fileFilterInput.value = '';

  const items = getItemsInPath(state.treeIndex, state.currentPath);
  state.currentItems = items;
  renderDirectoryItems(items);
  renderBreadcrumbs();
  elements.breadcrumbBar.hidden = false;
  persistCurrentSession();
}

async function loadDirectory(path, clearActive = true) {
  if (state.treeIndex) {
    loadDirectoryFromIndex(path, clearActive);
    return;
  }

  state.currentPath = path;
  if (clearActive) {
    state.activeFile = null;
    state.activeContent = '';
    elements.activeFileName.textContent = 'No file selected';
    elements.activeFileMeta.textContent = '';
    elements.copyCodeBtn.disabled = true;
    elements.sendToProxyPasteBtn.disabled = true;
    elements.highlightAllBtn.disabled = true;
    elements.codeScrollBox.innerHTML = `
      <div class="pl-empty-state">
        <p>Click a text file above to preview, copy, or send to ProxyPaste.</p>
      </div>
    `;
  }
  elements.fileFilterInput.value = '';

  elements.fileListContainer.innerHTML = `
    <div class="pl-empty-state">
      <p>Loading directory...</p>
    </div>
  `;

  try {
    const result = await fetchDirectoryContents({
      owner: state.owner,
      repo: state.repo,
      path: state.currentPath,
      ref: state.ref,
      token: state.settings.githubToken
    });

    updateRateLimit(result.rateLimit);

    if (result.isFile) {
      await selectFile(result.items[0]);
      return;
    }

    const validItems = result.items.filter(item => {
      if (item.type === 'dir') return true;
      if (item.type === 'file') return isTextFile(item.name);
      return false;
    });

    validItems.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    state.currentItems = validItems;
    renderDirectoryItems(validItems);
    renderBreadcrumbs();
    elements.breadcrumbBar.hidden = false;
    persistCurrentSession();
  } catch (err) {
    showNotice(err.message, true);
    elements.fileListContainer.innerHTML = `
      <div class="pl-empty-state">
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderDirectoryItems(items) {
  elements.itemsCountBadge.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  if (items.length === 0) {
    elements.fileListContainer.innerHTML = `
      <div class="pl-empty-state">
        <p>No matching folders or text files found.</p>
      </div>
    `;
    return;
  }

  elements.fileListContainer.innerHTML = '';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = `pl-file-item ${item.type === 'dir' ? 'is-dir' : 'is-file'}`;
    row.dataset.path = item.path;

    if (state.activeFile && state.activeFile.path === item.path) {
      row.classList.add('selected');
    }

    const iconSpan = document.createElement('span');
    iconSpan.textContent = item.type === 'dir' ? '📁' : '📄';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pl-item-name';
    nameSpan.textContent = item.name;

    row.appendChild(iconSpan);
    row.appendChild(nameSpan);

    if (item.type === 'file') {
      const ext = getFileExtension(item.name);
      if (ext) {
        const badge = document.createElement('span');
        badge.className = 'pl-file-badge';
        badge.textContent = ext;
        row.appendChild(badge);
      }
    }

    row.addEventListener('click', () => {
      if (item.type === 'dir') {
        loadDirectory(item.path, true);
      } else {
        document.querySelectorAll('.pl-file-item').forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
        selectFile(item, false);
      }
    });

    elements.fileListContainer.appendChild(row);
  });
}

function filterItems(query) {
  if (!query || !query.trim()) {
    renderDirectoryItems(state.currentItems);
    return;
  }
  const q = query.trim().toLowerCase();
  const filtered = state.currentItems.filter(item => item.name.toLowerCase().includes(q));
  renderDirectoryItems(filtered);
}

async function selectFile(item, isRestoring = false) {
  state.activeFile = item;
  elements.activeFileName.textContent = item.name;
  elements.activeFileMeta.textContent = 'Loading...';
  elements.copyCodeBtn.disabled = true;
  elements.sendToProxyPasteBtn.disabled = true;
  elements.highlightAllBtn.disabled = true;

  document.querySelectorAll('.pl-file-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.path === item.path);
  });

  elements.codeScrollBox.innerHTML = `
    <div class="pl-empty-state">
      <p>Fetching content...</p>
    </div>
  `;

  try {
    const { content, rateLimit } = await fetchFileContent({
      owner: state.owner,
      repo: state.repo,
      path: item.path,
      ref: state.ref,
      downloadUrl: item.downloadUrl,
      token: state.settings.githubToken
    });

    updateRateLimit(rateLimit);
    state.activeContent = content;

    const lang = detectLanguage(item.name);
    const { html, lineCount } = renderCodeWithLineNumbers(content, lang);

    elements.codeScrollBox.innerHTML = html;
    elements.activeFileMeta.textContent = `(${lineCount} lines, ${formatBytes(item.size || content.length)})`;

    elements.copyCodeBtn.disabled = false;
    elements.sendToProxyPasteBtn.disabled = false;
    elements.highlightAllBtn.disabled = false;

    // Auto-copy and send to ProxyPaste if enabled and not passively restoring
    if (state.settings.autoCopy && !isRestoring) {
      await copyToClipboard(content);
      if (typeof globalThis.setProxyPasteDraft === 'function') {
        globalThis.setProxyPasteDraft(content);
      }
      showNotice(`✓ Copied "${item.name}" & sent to ProxyPaste!`);
    }

    persistCurrentSession();
  } catch (err) {
    showNotice(`Failed to load file: ${err.message}`, true);
    elements.codeScrollBox.innerHTML = `
      <div class="pl-empty-state">
        <p>⚠️ Error: ${escapeHtml(err.message)}</p>
      </div>
    `;
    elements.activeFileMeta.textContent = 'Error';
  }
}

async function handleManualCopy() {
  if (!state.activeContent) return;
  const copied = await copyToClipboard(state.activeContent);
  if (typeof globalThis.setProxyPasteDraft === 'function') {
    globalThis.setProxyPasteDraft(state.activeContent);
  }
  if (copied) {
    showNotice('✓ Copied & sent to ProxyPaste!');
  } else {
    showNotice('Could not copy to clipboard.', true);
  }
}

function handleSendToProxyPaste() {
  if (!state.activeContent) return;
  if (typeof globalThis.setProxyPasteDraft === 'function') {
    globalThis.setProxyPasteDraft(state.activeContent);
  }
  if (typeof globalThis.switchTab === 'function') {
    globalThis.switchTab('proxypaste');
  }
  showNotice('✓ Sent to ProxyPaste!');
}

function handleHighlightAll() {
  const codeElement = elements.codeScrollBox.querySelector('.code-body code');
  if (codeElement) {
    selectElementText(codeElement);
    showNotice('Code selected.');
  }
}

function renderBreadcrumbs() {
  elements.breadcrumbList.innerHTML = '';

  const rootCrumb = document.createElement('span');
  rootCrumb.className = `pl-crumb ${!state.currentPath ? 'active' : ''}`;
  rootCrumb.textContent = 'Root';
  rootCrumb.addEventListener('click', () => {
    if (state.currentPath) loadDirectory('', true);
  });
  elements.breadcrumbList.appendChild(rootCrumb);

  if (!state.currentPath) return;

  const parts = state.currentPath.split('/');
  let accumulated = '';

  parts.forEach((part, index) => {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const isLast = index === parts.length - 1;

    const sep = document.createElement('span');
    sep.className = 'pl-separator';
    sep.textContent = '/';
    elements.breadcrumbList.appendChild(sep);

    const crumb = document.createElement('span');
    crumb.className = `pl-crumb ${isLast ? 'active' : ''}`;
    crumb.textContent = part;

    if (!isLast) {
      const targetPath = accumulated;
      crumb.addEventListener('click', () => loadDirectory(targetPath, true));
    }

    elements.breadcrumbList.appendChild(crumb);
  });
}

function navigateUp() {
  if (!state.currentPath) return;
  const parts = state.currentPath.split('/');
  parts.pop();
  loadDirectory(parts.join('/'), true);
}

function renderRecentChips() {
  elements.recentChips.innerHTML = '';
  const repos = state.settings.recentRepos || [];
  repos.slice(0, 3).forEach(repoUrl => {
    const chip = document.createElement('span');
    chip.className = 'pl-chip';
    chip.textContent = repoUrl.replace(/^https?:\/\/github\.com\//i, '');
    chip.title = repoUrl;
    chip.addEventListener('click', () => {
      elements.repoUrlInput.value = repoUrl;
      loadRepository(repoUrl);
    });
    elements.recentChips.appendChild(chip);
  });
}

function updateRateLimit(rateLimit) {
  if (!rateLimit) return;
  elements.rateLimitBadge.textContent = `API: ${rateLimit.remaining}/${rateLimit.limit}`;
  if (rateLimit.remaining <= 5) {
    elements.rateLimitBadge.style.color = 'var(--error)';
    elements.rateLimitBadge.title = `Low API rate limit remaining! Resets at ${rateLimit.resetDate?.toLocaleTimeString()}`;
  } else {
    elements.rateLimitBadge.style.color = 'var(--muted)';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
