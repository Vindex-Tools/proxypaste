/**
 * In-memory index to organize GitHub recursive tree into instant directory lookups.
 * Enables 1-request loading with zero API requests for folder navigation.
 */

/**
 * Builds an index from GitHub's recursive git tree.
 * @param {Array<{ path: string, type: string, size?: number, sha: string }>} treeItems 
 * @param {(filename: string) => boolean} isTextFileFn 
 */
export function buildTreeIndex(treeItems, isTextFileFn) {
  // Map of parentPath -> Map of childName -> item
  const dirMap = new Map();

  function getDirEntry(parentPath) {
    if (!dirMap.has(parentPath)) {
      dirMap.set(parentPath, new Map());
    }
    return dirMap.get(parentPath);
  }

  // Ensure root exists
  getDirEntry('');

  for (const item of treeItems) {
    const fullPath = item.path;
    const parts = fullPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');

    // Ensure all ancestor directories exist in index
    for (let i = 0; i < parts.length - 1; i++) {
      const ancestorParent = parts.slice(0, i).join('/');
      const ancestorName = parts[i];
      const ancestorFullPath = parts.slice(0, i + 1).join('/');
      const ancestorMap = getDirEntry(ancestorParent);
      if (!ancestorMap.has(ancestorName)) {
        ancestorMap.set(ancestorName, {
          name: ancestorName,
          path: ancestorFullPath,
          type: 'dir',
          size: 0
        });
      }
    }

    if (item.type === 'tree') {
      // Explicit folder from git tree
      const parentEntry = getDirEntry(parentPath);
      if (!parentEntry.has(name)) {
        parentEntry.set(name, {
          name,
          path: fullPath,
          type: 'dir',
          size: 0
        });
      }
    } else if (item.type === 'blob') {
      // File: check whitelist
      if (isTextFileFn(name)) {
        const parentEntry = getDirEntry(parentPath);
        parentEntry.set(name, {
          name,
          path: fullPath,
          type: 'file',
          size: item.size || 0,
          sha: item.sha
        });
      }
    }
  }

  return {
    dirMap,
    totalFiles: treeItems.filter(i => i.type === 'blob').length
  };
}

/**
 * Retrieves direct child folders and whitelisted files for a given directory path.
 * @param {{ dirMap: Map<string, Map<string, object>> }} index 
 * @param {string} dirPath 
 * @returns {Array<{ name: string, path: string, type: 'dir'|'file', size: number }>}
 */
export function getItemsInPath(index, dirPath = '') {
  if (!index || !index.dirMap) return [];
  const cleanPath = (dirPath || '').replace(/^\/+|\/+$/g, '');
  const childMap = index.dirMap.get(cleanPath);
  if (!childMap) return [];

  const items = Array.from(childMap.values());

  // Sort: directories first, then alphabetical
  items.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return items;
}
