/**
 * Cross-browser storage abstraction for settings, token, and recent repos.
 * Works seamlessly in Chrome, Firefox, and standard WebExtension environments.
 */

const STORAGE_KEY = 'pastelibrary_settings';

const DEFAULT_SETTINGS = {
  lastRepoUrl: '',
  githubToken: '',
  autoCopy: true,
  recentRepos: [],
  lastSession: null
};

/**
 * Checks if browser/chrome storage API is available.
 */
function getBrowserStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    return browser.storage.local;
  }
  return null;
}

let memoryFallback = null;

/**
 * Loads all settings.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function loadSettings() {
  const storage = getBrowserStorage();
  if (storage) {
    return new Promise((resolve) => {
      storage.get([STORAGE_KEY], (result) => {
        const stored = result ? result[STORAGE_KEY] : null;
        resolve({ ...DEFAULT_SETTINGS, ...(stored || {}) });
      });
    });
  }

  // Fallback to localStorage or in-memory
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } else if (memoryFallback) {
      return { ...DEFAULT_SETTINGS, ...memoryFallback };
    }
  } catch (e) {
    console.warn('Storage read fallback error:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Saves given settings keys.
 * @param {Partial<typeof DEFAULT_SETTINGS>} updates 
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function saveSettings(updates) {
  const current = await loadSettings();
  const merged = { ...current, ...updates };

  const storage = getBrowserStorage();
  if (storage) {
    await new Promise((resolve) => {
      storage.set({ [STORAGE_KEY]: merged }, () => resolve());
    });
  } else {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } else {
        memoryFallback = { ...merged };
      }
    } catch (e) {
      console.warn('Storage save fallback error:', e);
    }
  }

  return merged;
}

/**
 * Adds a repository URL to recent history.
 * @param {string} repoUrl 
 */
export async function addRecentRepo(repoUrl) {
  if (!repoUrl) return;
  const settings = await loadSettings();
  const normalized = repoUrl.trim();
  const filtered = settings.recentRepos.filter(r => r.toLowerCase() !== normalized.toLowerCase());
  filtered.unshift(normalized);
  const trimmed = filtered.slice(0, 8); // Keep top 8

  await saveSettings({ recentRepos: trimmed, lastRepoUrl: normalized });
}

/**
 * Saves current navigation session state (repo, branch, current folder, active file).
 * @param {{ repoInput: string, owner: string, repo: string, ref: string, currentPath: string, activeFile?: object }} session 
 */
export async function saveSession(session) {
  await saveSettings({ lastSession: session });
}

/**
 * Loads current navigation session state.
 * @returns {Promise<object|null>}
 */
export async function loadSession() {
  const settings = await loadSettings();
  return settings.lastSession || null;
}

/**
 * Clears saved navigation session state.
 */
export async function clearSession() {
  await saveSettings({ lastSession: null });
}
