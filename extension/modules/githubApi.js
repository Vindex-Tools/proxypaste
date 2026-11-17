/**
 * GitHub API client and URL parser.
 */

export class GitHubApiError extends Error {
  constructor(message, status = 0, rateLimit = null) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

/**
 * Extracts rate limit details from Response headers.
 * @param {Response} response 
 * @returns {{ remaining: number, limit: number, resetDate: Date } | null}
 */
export function extractRateLimit(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  const reset = response.headers.get('x-ratelimit-reset');

  if (remaining !== null && limit !== null) {
    return {
      remaining: parseInt(remaining, 10),
      limit: parseInt(limit, 10),
      resetDate: reset ? new Date(parseInt(reset, 10) * 1000) : null
    };
  }
  return null;
}

/**
 * Parses user input into GitHub repository details.
 * Supports:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/tree/main/src
 * - https://github.com/owner/repo/blob/main/src/index.js
 * - owner/repo
 * 
 * @param {string} input 
 * @returns {{ owner: string, repo: string, ref?: string, path?: string }}
 */
export function parseGitHubUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new GitHubApiError('Please enter a GitHub repository URL or owner/repo.');
  }

  const clean = input.trim().replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');

  // Format: owner/repo
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(clean)) {
    const [owner, repo] = clean.split('/');
    return { owner, repo, path: '' };
  }

  // Format: https://github.com/owner/repo...
  try {
    const url = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    if (url.hostname !== 'github.com') {
      throw new GitHubApiError('URL hostname must be github.com');
    }

    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segments.length < 2) {
      throw new GitHubApiError('Invalid GitHub repository path.');
    }

    const owner = segments[0];
    const repo = segments[1];

    if (segments.length >= 4 && (segments[2] === 'tree' || segments[2] === 'blob')) {
      const ref = segments[3];
      const path = segments.slice(4).join('/');
      return { owner, repo, ref, path };
    }

    return { owner, repo, path: '' };
  } catch (err) {
    if (err instanceof GitHubApiError) throw err;
    throw new GitHubApiError('Invalid URL format. Example: https://github.com/owner/repo');
  }
}

/**
 * Helper to build common headers.
 * @param {string|null} token 
 * @param {string} acceptHeader 
 * @returns {HeadersInit}
 */
function buildHeaders(token, acceptHeader = 'application/vnd.github.v3+json') {
  const headers = {
    'Accept': acceptHeader
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }
  return headers;
}

/**
 * Fetches repository metadata (e.g. default branch).
 * @param {{ owner: string, repo: string, token?: string }} params
 */
export async function fetchRepoInfo({ owner, repo, token = null }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  const rateLimit = extractRateLimit(res);

  if (!res.ok) {
    handleHttpError(res, rateLimit);
  }

  const data = await res.json();
  return {
    name: data.name,
    fullName: data.full_name,
    defaultBranch: data.default_branch || 'main',
    description: data.description,
    isPrivate: data.private,
    rateLimit
  };
}

/**
 * Fetches the entire repository tree in 1 single request via Git Trees API.
 * @param {{ owner: string, repo: string, ref: string, token?: string }} params
 * @returns {Promise<{ tree: Array, truncated: boolean, rateLimit: object|null }>}
 */
export async function fetchRepoTree({ owner, repo, ref = 'main', token = null }) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const res = await fetch(endpoint, { headers: buildHeaders(token) });
  const rateLimit = extractRateLimit(res);

  if (!res.ok) {
    handleHttpError(res, rateLimit);
  }

  const data = await res.json();
  return {
    tree: data.tree || [],
    truncated: Boolean(data.truncated),
    rateLimit
  };
}

/**
 * Fetches items inside a folder/path.
 * @param {{ owner: string, repo: string, path?: string, ref?: string, token?: string }} params
 * @returns {Promise<{ items: Array, rateLimit: object|null }>}
 */
export async function fetchDirectoryContents({ owner, repo, path = '', ref = '', token = null }) {
  let endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
  if (path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    endpoint += `/${encodedPath}`;
  }

  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  const query = params.toString();
  if (query) endpoint += `?${query}`;

  const res = await fetch(endpoint, { headers: buildHeaders(token) });
  const rateLimit = extractRateLimit(res);

  if (!res.ok) {
    handleHttpError(res, rateLimit);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    // Single file response instead of directory
    return { items: [data], isFile: true, rateLimit };
  }

  // Normalize directory items
  const items = data.map(item => ({
    name: item.name,
    path: item.path,
    type: item.type, // 'dir' | 'file' | 'submodule' | 'symlink'
    size: item.size,
    sha: item.sha,
    downloadUrl: item.download_url
  }));

  return { items, isFile: false, rateLimit };
}

/**
 * Fetches the raw text content of a file.
 * @param {{ owner: string, repo: string, path: string, ref?: string, downloadUrl?: string, token?: string }} params
 * @returns {Promise<{ content: string, rateLimit: object|null }>}
 */
export async function fetchFileContent({ owner, repo, path, ref = '', downloadUrl = '', token = null }) {
  // If token is present, fetch via API with raw media type for private/authenticated support
  if (token && token.trim()) {
    let endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
    if (path) {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      endpoint += `/${encodedPath}`;
    }
    if (ref) endpoint += `?ref=${encodeURIComponent(ref)}`;

    const res = await fetch(endpoint, {
      headers: buildHeaders(token, 'application/vnd.github.raw')
    });
    const rateLimit = extractRateLimit(res);

    if (!res.ok) {
      handleHttpError(res, rateLimit);
    }

    const content = await res.text();
    return { content, rateLimit };
  }

  // Fallback: use downloadUrl or direct raw endpoint
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const targetUrl = downloadUrl || `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref || 'main')}/${encodedPath}`;
  const res = await fetch(targetUrl);
  const rateLimit = extractRateLimit(res);

  if (!res.ok) {
    handleHttpError(res, rateLimit);
  }

  const content = await res.text();
  return { content, rateLimit };
}

/**
 * Throws a formatted GitHubApiError based on HTTP status.
 */
function handleHttpError(response, rateLimit) {
  if (response.status === 403) {
    if (rateLimit && rateLimit.remaining === 0) {
      const resetTime = rateLimit.resetDate ? rateLimit.resetDate.toLocaleTimeString() : 'soon';
      throw new GitHubApiError(`GitHub API rate limit exceeded. Resets at ${resetTime}. Add a Personal Access Token to continue.`, 403, rateLimit);
    }
    throw new GitHubApiError('Access forbidden. The repository may be private or token has insufficient permissions.', 403, rateLimit);
  }
  if (response.status === 404) {
    throw new GitHubApiError('Repository or path not found. Please verify the URL.', 404, rateLimit);
  }
  if (response.status === 401) {
    throw new GitHubApiError('Bad GitHub credentials / invalid Personal Access Token.', 401, rateLimit);
  }
  throw new GitHubApiError(`GitHub API error: ${response.status} ${response.statusText}`, response.status, rateLimit);
}
