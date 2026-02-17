'use strict';

/**
 * Content normalization and line-mapping utilities.
 *
 * Solves the "line mismatch" problem that occurs when agents rely on
 * GitHub UI snippets or search results for line references. These utilities
 * ensure line numbers are computed from the actual raw blob content with
 * consistent normalization rules applied.
 *
 * Professional approach used by static analyzers, code intelligence systems,
 * and security scanners.
 */

// ─── Content Normalization ────────────────────────────────────────────────────

/**
 * Normalize file content for consistent line-number computation.
 *
 * Rules applied:
 *   1. CRLF (\r\n) → LF (\n)
 *   2. Lone CR (\r) → LF (\n)   (old Mac line endings)
 *   3. Optionally strip trailing whitespace per line
 *   4. Optionally strip BOM (byte-order mark)
 *
 * @param {string} content - Raw file content
 * @param {object} [options]
 * @param {boolean} [options.stripTrailingWhitespace=false]
 * @param {boolean} [options.stripBom=true]
 * @returns {string} Normalized content
 */
function normalizeContent(content, options = {}) {
  if (typeof content !== 'string') return '';
  const { stripTrailingWhitespace = false, stripBom = true } = options;

  let result = content;

  // Strip BOM if present
  if (stripBom && result.charCodeAt(0) === 0xFEFF) {
    result = result.slice(1);
  }

  // Normalize line endings: CRLF → LF, lone CR → LF
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Optionally strip trailing whitespace per line
  if (stripTrailingWhitespace) {
    result = result.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
  }

  return result;
}

// ─── Line Map Computation ─────────────────────────────────────────────────────

/**
 * Compute a line map from normalized content.
 *
 * Returns an array where each element represents one line:
 *   { lineNumber, startOffset, endOffset, text }
 *
 * Line numbers are 1-based (matching GitHub UI).
 *
 * @param {string} content - Normalized content (should be LF-only)
 * @returns {Array<{lineNumber: number, startOffset: number, endOffset: number, text: string}>}
 */
function computeLineMap(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return [];
  }

  const lines = content.split('\n');
  const map = [];
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    map.push({
      lineNumber: i + 1,
      startOffset: offset,
      endOffset: offset + text.length,
      text,
    });
    offset += text.length + 1; // +1 for the \n
  }

  return map;
}

// ─── Line Range Extraction ────────────────────────────────────────────────────

/**
 * Extract a range of lines from content.
 *
 * @param {string} content - File content
 * @param {number} startLine - 1-based start line (inclusive)
 * @param {number} [endLine] - 1-based end line (inclusive). Defaults to startLine.
 * @returns {{lines: Array<{lineNumber: number, text: string}>, totalLines: number}}
 */
function extractLineRange(content, startLine, endLine) {
  if (typeof content !== 'string') {
    return { lines: [], totalLines: 0 };
  }

  const allLines = content.split('\n');
  const totalLines = allLines.length;

  const start = Math.max(1, startLine);
  const end = Math.min(totalLines, endLine || startLine);

  const lines = [];
  for (let i = start; i <= end; i++) {
    lines.push({ lineNumber: i, text: allLines[i - 1] });
  }

  return { lines, totalLines };
}

// ─── Text Search with Line Numbers ────────────────────────────────────────────

/**
 * Search for a pattern in content and return line-accurate results.
 *
 * @param {string} content - File content (should be normalized)
 * @param {string} pattern - Search string or regex pattern
 * @param {object} [options]
 * @param {boolean} [options.regex=false] - Treat pattern as regex
 * @param {boolean} [options.caseSensitive=true]
 * @param {number} [options.contextLines=2] - Lines of context before/after match
 * @param {number} [options.maxResults=50] - Maximum matches to return
 * @returns {Array<{lineNumber: number, text: string, matchStart: number, matchEnd: number, context: {before: string[], after: string[]}}>}
 */
function searchContent(content, pattern, options = {}) {
  if (typeof content !== 'string' || !pattern) return [];

  const {
    regex: useRegex = false,
    caseSensitive = true,
    contextLines = 2,
    maxResults = 50,
  } = options;

  const lines = content.split('\n');
  const results = [];

  let re;
  if (useRegex) {
    try {
      re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    } catch (e) {
      // Invalid regex — fall back to literal search
      re = null;
    }
  }

  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    const line = lines[i];
    let match;

    if (re) {
      re.lastIndex = 0;
      match = re.exec(line);
    } else {
      const searchIn = caseSensitive ? line : line.toLowerCase();
      const searchFor = caseSensitive ? pattern : pattern.toLowerCase();
      const idx = searchIn.indexOf(searchFor);
      if (idx !== -1) {
        match = { index: idx, 0: searchFor };
      }
    }

    if (match) {
      const before = [];
      const after = [];

      for (let b = Math.max(0, i - contextLines); b < i; b++) {
        before.push(lines[b]);
      }
      for (let a = i + 1; a <= Math.min(lines.length - 1, i + contextLines); a++) {
        after.push(lines[a]);
      }

      results.push({
        lineNumber: i + 1,
        text: line,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        context: { before, after },
      });
    }
  }

  return results;
}

// ─── Symbol Discovery ─────────────────────────────────────────────────────────

/**
 * Language-specific patterns for finding symbol definitions.
 * Each pattern captures a symbol name in group 1.
 */
const SYMBOL_PATTERNS = {
  // JavaScript / TypeScript
  js: [
    { type: 'function', pattern: /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm },
    { type: 'class', pattern: /(?:^|\s)(?:export\s+)?class\s+(\w+)/gm },
    { type: 'const_fn', pattern: /(?:^|\s)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>/gm },
    { type: 'method', pattern: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm },
    { type: 'interface', pattern: /(?:^|\s)(?:export\s+)?interface\s+(\w+)/gm },
    { type: 'type', pattern: /(?:^|\s)(?:export\s+)?type\s+(\w+)\s*=/gm },
    { type: 'enum', pattern: /(?:^|\s)(?:export\s+)?enum\s+(\w+)/gm },
  ],
  // Python
  py: [
    { type: 'function', pattern: /^\s*(?:async\s+)?def\s+(\w+)/gm },
    { type: 'class', pattern: /^\s*class\s+(\w+)/gm },
  ],
  // Go
  go: [
    { type: 'function', pattern: /^func\s+(\w+)/gm },
    { type: 'method', pattern: /^func\s+\([^)]+\)\s+(\w+)/gm },
    { type: 'type', pattern: /^type\s+(\w+)\s+(?:struct|interface)/gm },
  ],
  // Ruby
  rb: [
    { type: 'function', pattern: /^\s*def\s+(\w+)/gm },
    { type: 'class', pattern: /^\s*class\s+(\w+)/gm },
    { type: 'module', pattern: /^\s*module\s+(\w+)/gm },
  ],
  // Java / Kotlin / C#
  java: [
    { type: 'class', pattern: /(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?class\s+(\w+)/gm },
    { type: 'interface', pattern: /(?:public|private|protected)?\s*interface\s+(\w+)/gm },
    { type: 'method', pattern: /(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/gm },
    { type: 'enum', pattern: /(?:public|private|protected)?\s*enum\s+(\w+)/gm },
  ],
  // Rust
  rs: [
    { type: 'function', pattern: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm },
    { type: 'struct', pattern: /(?:pub\s+)?struct\s+(\w+)/gm },
    { type: 'trait', pattern: /(?:pub\s+)?trait\s+(\w+)/gm },
    { type: 'enum', pattern: /(?:pub\s+)?enum\s+(\w+)/gm },
    { type: 'impl', pattern: /impl(?:<[^>]+>)?\s+(\w+)/gm },
  ],
};

// File extension to language key mapping
const EXT_TO_LANG = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'js', '.tsx': 'js', '.jsx': 'js',
  '.py': 'py', '.pyw': 'py',
  '.go': 'go',
  '.rb': 'rb',
  '.java': 'java', '.kt': 'java', '.kts': 'java', '.cs': 'java',
  '.rs': 'rs',
};

/**
 * Detect language from file path extension.
 * @param {string} filePath
 * @returns {string|null} Language key or null
 */
function detectLanguage(filePath) {
  if (!filePath) return null;
  const ext = filePath.includes('.') ? '.' + filePath.split('.').pop().toLowerCase() : '';
  return EXT_TO_LANG[ext] || null;
}

/**
 * Find symbol definitions in file content.
 *
 * @param {string} content - File content
 * @param {string} filePath - File path (used for language detection)
 * @param {object} [options]
 * @param {string} [options.language] - Override language detection
 * @param {string} [options.nameFilter] - Filter symbols by name (substring match)
 * @param {string[]} [options.typeFilter] - Filter by symbol type ('function', 'class', etc.)
 * @returns {Array<{name: string, type: string, lineNumber: number, text: string}>}
 */
function findSymbols(content, filePath, options = {}) {
  if (typeof content !== 'string') return [];

  const lang = options.language || detectLanguage(filePath);
  if (!lang || !SYMBOL_PATTERNS[lang]) return [];

  const patterns = SYMBOL_PATTERNS[lang];
  const lines = content.split('\n');
  const symbols = [];
  const { nameFilter, typeFilter } = options;

  for (const { type, pattern } of patterns) {
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(type)) continue;

    // Reset regex
    const re = new RegExp(pattern.source, pattern.flags);

    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      if (!name) continue;
      if (nameFilter && !name.toLowerCase().includes(nameFilter.toLowerCase())) continue;

      // Calculate line number from the position of the symbol name (not the
      // start of the regex match, which may include leading whitespace/newlines)
      const namePos = match.index + match[0].indexOf(name);
      let lineNumber = 1;
      for (let i = 0; i < namePos; i++) {
        if (content[i] === '\n') lineNumber++;
      }

      symbols.push({
        name,
        type,
        lineNumber,
        text: lines[lineNumber - 1] || '',
      });
    }
  }

  // Sort by line number, deduplicate
  symbols.sort((a, b) => a.lineNumber - b.lineNumber);
  const seen = new Set();
  return symbols.filter(s => {
    const key = `${s.name}:${s.lineNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Line Reference Builder ───────────────────────────────────────────────────

/**
 * Build an immutable line reference that includes blob SHA for drift detection.
 *
 * @param {object} params
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {string} params.path
 * @param {string} params.blobSha
 * @param {string} [params.commitSha]
 * @param {number} params.startLine - 1-based
 * @param {number} [params.endLine] - 1-based
 * @returns {{ref: string, owner: string, repo: string, path: string, blobSha: string, commitSha: string|null, startLine: number, endLine: number, githubUrl: string}}
 */
function buildLineReference({ owner, repo, path, blobSha, commitSha, startLine, endLine }) {
  const anchor = endLine && endLine !== startLine
    ? `#L${startLine}-L${endLine}`
    : `#L${startLine}`;

  // Use commit SHA for immutable URLs, fall back to blob SHA
  const refSha = commitSha || blobSha;
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${refSha}/${path}${anchor}`;

  return {
    ref: `${owner}/${repo}:${path}:${startLine}${endLine && endLine !== startLine ? `-${endLine}` : ''}`,
    owner,
    repo,
    path,
    blobSha,
    commitSha: commitSha || null,
    startLine,
    endLine: endLine || startLine,
    githubUrl,
  };
}

/**
 * Check if a blob SHA has drifted (file changed since reference was created).
 *
 * @param {string} referenceSha - SHA stored in the reference
 * @param {string} currentSha - Current file SHA from GitHub
 * @returns {{drifted: boolean, referenceSha: string, currentSha: string}}
 */
function checkDrift(referenceSha, currentSha) {
  return {
    drifted: referenceSha !== currentSha,
    referenceSha,
    currentSha,
  };
}

module.exports = {
  normalizeContent,
  computeLineMap,
  extractLineRange,
  searchContent,
  findSymbols,
  detectLanguage,
  buildLineReference,
  checkDrift,
  // Exported for testing / extension
  SYMBOL_PATTERNS,
  EXT_TO_LANG,
};
