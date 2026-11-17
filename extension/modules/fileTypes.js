/**
 * Whitelist and utilities for text file detection and syntax categorization.
 */

// Comprehensive set of known text file extensions (lowercase without dot)
const TEXT_EXTENSIONS = new Set([
  // Plain Text & Logs
  'txt', 'text', 'log', 'out', 'err', 'msg', 'rtf', 'diff', 'patch',
  
  // Markdown & Documentation
  'md', 'markdown', 'mdown', 'mkdn', 'rst', 'adoc', 'asciidoc', 
  'tex', 'latex', 'org', 'wiki', 'pod', 'rdoc', 'man',

  // Web & Markup
  'html', 'htm', 'xhtml', 'xml', 'svg', 'xaml', 'rss', 'atom', 'xsd', 'xsl', 'xslt', 'opml',

  // Stylesheets
  'css', 'scss', 'sass', 'less', 'styl', 'stylus', 'postcss',

  // JavaScript & TypeScript
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',

  // Web Frameworks & Templates
  'vue', 'svelte', 'astro', 'jsp', 'asp', 'aspx', 'erb', 'ejs', 
  'hbs', 'handlebars', 'mustache', 'twig', 'jinja', 'jinja2', 'liquid',

  // Data Interchange & Configuration
  'json', 'json5', 'jsonc', 'jsonld', 'ndjson', 'yaml', 'yml', 'toml', 
  'ini', 'cfg', 'conf', 'config', 'properties', 'env', 'inf', 'reg', 'plist',

  // Programming Languages
  // C / C++
  'c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'cxx', 'hxx', 'inl', 'i', 'tpp', 'ipp',
  // C#
  'cs', 'csx',
  // Java & JVM
  'java', 'kt', 'kts', 'scala', 'sc', 'groovy', 'gvy', 'gradle', 'clj', 'cljs', 'cljc', 'edn',
  // Python
  'py', 'pyw', 'pyi', 'rpy', 'ipynb',
  // Ruby
  'rb', 'rake', 'gemspec', 'podspec',
  // PHP
  'php', 'phtml', 'php3', 'php4', 'php5', 'phps',
  // Go
  'go', 'mod', 'sum',
  // Rust
  'rs',
  // Lua
  'lua', 'luau',
  // Shell & Scripts
  'sh', 'bash', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'awk', 'sed',
  // Swift
  'swift',
  // Dart
  'dart',
  // R
  'r', 'rmd',
  // Perl
  'pl', 'pm', 't', 'al',
  // Haskell & Functional
  'hs', 'lhs', 'ex', 'exs', 'erl', 'hrl', 'ml', 'mli', 'fs', 'fsi', 'fsx', 're', 'rei',
  // Systems & Emerging
  'zig', 'nim', 'nims', 'v', 'jl', 'd', 'f', 'for', 'f90', 'f95', 'asm', 's', 'sol', 'vy', 'move',
  // Schema & IDL
  'proto', 'protobuf', 'thrift', 'graphql', 'gql', 'prisma', 'avro',
  // Database
  'sql', 'psql', 'plsql', 'tsql', 'cql', 'ddl',
  // Build / CI
  'cmake', 'make', 'justfile'
]);

// Exact filenames that are text files (case-insensitive, lowercase)
const EXACT_TEXT_FILENAMES = new Set([
  'dockerfile',
  'containerfile',
  'makefile',
  'gnumakefile',
  'cmakelists.txt',
  'gemfile',
  'rakefile',
  'vagrantfile',
  'procfile',
  'justfile',
  'license',
  'licence',
  'copying',
  'readme',
  'changelog',
  'contributing',
  'authors',
  'notice',
  'patents',
  'security',
  'codeowners',
  '.gitignore',
  '.gitattributes',
  '.gitmodules',
  '.editorconfig',
  '.npmignore',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  '.dockerignore',
  '.env',
  '.env.example',
  '.env.local',
  '.env.production',
  '.env.test',
  '.bashrc',
  '.bash_profile',
  '.zshrc',
  '.profile',
  '.vimrc'
]);

/**
 * Checks if a filename corresponds to a text file.
 * @param {string} filename 
 * @returns {boolean}
 */
export function isTextFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  
  const lowerName = filename.toLowerCase().trim();
  
  // Exact match (e.g., Dockerfile, LICENSE, .gitignore)
  if (EXACT_TEXT_FILENAMES.has(lowerName)) {
    return true;
  }

  // Check dotfiles (e.g., .eslintrc.json or extensionless .bashrc)
  if (lowerName.startsWith('.')) {
    const parts = lowerName.split('.');
    if (parts.length > 2) {
      const ext = parts.pop();
      if (TEXT_EXTENSIONS.has(ext)) return true;
    }
  }

  // Standard extension check
  const dotIndex = lowerName.lastIndexOf('.');
  if (dotIndex !== -1 && dotIndex < lowerName.length - 1) {
    const ext = lowerName.substring(dotIndex + 1);
    return TEXT_EXTENSIONS.has(ext);
  }

  return false;
}

/**
 * Extracts extension from filename.
 * @param {string} filename 
 * @returns {string}
 */
export function getFileExtension(filename) {
  if (!filename) return '';
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex !== -1 ? filename.substring(dotIndex + 1).toLowerCase() : '';
}

/**
 * Determines syntax highlighting language key based on filename.
 * @param {string} filename 
 * @returns {string}
 */
export function detectLanguage(filename) {
  if (!filename) return 'text';
  const lower = filename.toLowerCase();
  const ext = getFileExtension(lower);

  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'javascript';
  if (['ts', 'mts', 'cts', 'tsx'].includes(ext)) return 'typescript';
  if (['py', 'pyw', 'pyi'].includes(ext)) return 'python';
  if (['java'].includes(ext)) return 'java';
  if (['lua', 'luau'].includes(ext)) return 'lua';
  if (['yaml', 'yml'].includes(ext)) return 'yaml';
  if (['json', 'jsonc', 'json5'].includes(ext)) return 'json';
  if (['html', 'htm', 'xhtml', 'vue', 'svelte'].includes(ext)) return 'html';
  if (['xml', 'svg'].includes(ext)) return 'xml';
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'css';
  if (['c', 'h', 'cpp', 'hpp', 'cc', 'cxx'].includes(ext)) return 'cpp';
  if (['cs'].includes(ext)) return 'csharp';
  if (['go'].includes(ext)) return 'go';
  if (['rs'].includes(ext)) return 'rust';
  if (['rb'].includes(ext)) return 'ruby';
  if (['php'].includes(ext)) return 'php';
  if (['sh', 'bash', 'zsh'].includes(ext) || lower === '.bashrc' || lower === '.zshrc') return 'shell';
  if (['sql'].includes(ext)) return 'sql';
  if (['md', 'markdown'].includes(ext) || lower.startsWith('readme')) return 'markdown';
  if (lower === 'dockerfile') return 'dockerfile';

  return 'text';
}
