/**
 * Lightweight, fast, safe syntax highlighter and line numbering module.
 * Self-contained without external runtime dependencies for extension CSP compliance.
 */

/**
 * Escapes raw strings for safe HTML injection.
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COMMON_KEYWORDS = new Set([
  'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'break', 'continue', 'class', 'extends', 'import', 'from', 'export', 'const', 'let', 'var',
  'new', 'this', 'super', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
  'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield',
  'def', 'elif', 'pass', 'lambda', 'with', 'as', 'assert', 'raise', 'is', 'not', 'and', 'or',
  'public', 'private', 'protected', 'static', 'final', 'interface', 'package', 'implements',
  'local', 'then', 'end', 'repeat', 'until', 'nil', 'elseif',
  'struct', 'fn', 'mut', 'pub', 'use', 'impl', 'trait', 'enum', 'match',
  'select', 'where', 'insert', 'update', 'into', 'values', 'from', 'join', 'group', 'order', 'by'
]);

const COMMON_TYPES_CONSTANTS = new Set([
  'true', 'false', 'null', 'undefined', 'None', 'nil', 'NaN', 'Infinity',
  'int', 'float', 'double', 'char', 'string', 'bool', 'boolean', 'void',
  'any', 'unknown', 'never', 'number', 'bigint', 'symbol', 'object'
]);

/**
 * Highlights a block of code based on detected language.
 * @param {string} code 
 * @param {string} lang 
 * @returns {string} HTML string with syntax highlighting spans
 */
export function highlightCode(code, lang = 'text') {
  if (!code) return '';
  if (lang === 'text') {
    return escapeHtml(code);
  }

  // Handle JSON
  if (lang === 'json') {
    return highlightJson(code);
  }

  // Handle YAML
  if (lang === 'yaml') {
    return highlightYaml(code);
  }

  // Tokenize line by line to maintain robust line numbering
  const lines = code.split('\n');
  const highlightedLines = lines.map(line => highlightLine(line, lang));
  return highlightedLines.join('\n');
}

/**
 * Highlights a single line of general code (JS, TS, Python, Java, Lua, etc.).
 */
function highlightLine(line, lang) {
  // Comments
  // Lua: --
  if (lang === 'lua' && line.includes('--')) {
    const idx = line.indexOf('--');
    return highlightLineTokens(line.slice(0, idx), lang) + 
      `<span class="tok-comment">${escapeHtml(line.slice(idx))}</span>`;
  }
  // Python / Shell / YAML: #
  if (['python', 'shell', 'yaml', 'dockerfile'].includes(lang) && line.includes('#')) {
    const idx = line.indexOf('#');
    return highlightLineTokens(line.slice(0, idx), lang) + 
      `<span class="tok-comment">${escapeHtml(line.slice(idx))}</span>`;
  }
  // Standard C-style line comments: //
  if (line.includes('//')) {
    const idx = line.indexOf('//');
    return highlightLineTokens(line.slice(0, idx), lang) + 
      `<span class="tok-comment">${escapeHtml(line.slice(idx))}</span>`;
  }

  return highlightLineTokens(line, lang);
}

function highlightLineTokens(text, lang) {
  // Regex token matching strings, numbers, identifiers, symbols
  const tokenRegex = /(".*?"|'.*?'|`.*?`|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[^\s\w]+|\s+)/g;

  return text.replace(tokenRegex, (match) => {
    const esc = escapeHtml(match);
    // Strings
    if ((match.startsWith('"') && match.endsWith('"')) ||
        (match.startsWith("'") && match.endsWith("'")) ||
        (match.startsWith('`') && match.endsWith('`'))) {
      return `<span class="tok-string">${esc}</span>`;
    }

    // Numbers
    if (/^\d+(\.\d+)?$/.test(match)) {
      return `<span class="tok-number">${esc}</span>`;
    }

    // Identifiers
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(match)) {
      if (COMMON_KEYWORDS.has(match)) {
        return `<span class="tok-keyword">${esc}</span>`;
      }
      if (COMMON_TYPES_CONSTANTS.has(match)) {
        return `<span class="tok-constant">${esc}</span>`;
      }
      return esc;
    }

    return esc;
  });
}

function highlightJson(code) {
  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[^\s\w"]+|\s+)/g;
  return code.replace(tokenRegex, (match) => {
    const esc = escapeHtml(match);
    if (/^"/.test(match)) {
      const cls = /:$/.test(match) ? 'tok-key' : 'tok-string';
      return `<span class="${cls}">${esc}</span>`;
    }
    if (/^(true|false|null)$/.test(match)) {
      return `<span class="tok-constant">${esc}</span>`;
    }
    if (/^-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?$/.test(match)) {
      return `<span class="tok-number">${esc}</span>`;
    }
    return esc;
  });
}

function highlightYaml(code) {
  const lines = code.split('\n');
  return lines.map(line => {
    if (line.trim().startsWith('#')) {
      return `<span class="tok-comment">${escapeHtml(line)}</span>`;
    }
    const tokenRegex = /^(\s*)([\w\-]+)(\s*:)(.*)$/;
    const match = line.match(tokenRegex);
    if (match) {
      const [, indent, key, colon, rest] = match;
      const escKey = `<span class="tok-key">${escapeHtml(key)}</span>`;
      const escRest = highlightLineTokens(rest, 'yaml');
      return `${escapeHtml(indent)}${escKey}${escapeHtml(colon)}${escRest}`;
    }
    return highlightLineTokens(line, 'yaml');
  }).join('\n');
}

/**
 * Builds a structured code viewer element with line numbers.
 * @param {string} rawCode 
 * @param {string} lang 
 * @returns {{ html: string, lineCount: number }}
 */
export function renderCodeWithLineNumbers(rawCode, lang = 'text') {
  const lines = rawCode.split('\n');
  const lineCount = lines.length;
  const highlighted = highlightCode(rawCode, lang);

  const gutterHtml = Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join('\n');

  const html = `
    <div class="code-container">
      <div class="line-numbers" aria-hidden="true">${gutterHtml}</div>
      <div class="code-body"><code class="language-${escapeHtml(lang)}">${highlighted}</code></div>
    </div>
  `;

  return { html, lineCount };
}
