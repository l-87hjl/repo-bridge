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

// ─── Import Parsing ──────────────────────────────────────────────────────────

/**
 * Language-specific patterns for parsing import/require statements.
 * Each pattern extracts: the imported module/path and optionally the imported symbols.
 */
const IMPORT_PATTERNS = {
  js: [
    // import { foo, bar } from 'module'
    { type: 'named_import', pattern: /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm },
    // import foo from 'module'
    { type: 'default_import', pattern: /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm },
    // import * as foo from 'module'
    { type: 'namespace_import', pattern: /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm },
    // import 'module' (side-effect only)
    { type: 'side_effect_import', pattern: /import\s+['"]([^'"]+)['"]/gm },
    // const foo = require('module')
    { type: 'require', pattern: /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm },
    // const { foo, bar } = require('module')
    { type: 'destructured_require', pattern: /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm },
    // Dynamic import: require('module') standalone or in expression
    { type: 'dynamic_require', pattern: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm },
    // export { foo } from 'module' (re-export)
    { type: 're_export', pattern: /export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm },
    // export * from 'module'
    { type: 'wildcard_re_export', pattern: /export\s+\*\s+from\s+['"]([^'"]+)['"]/gm },
  ],
  py: [
    // import module
    { type: 'import', pattern: /^import\s+([\w.]+)/gm },
    // from module import foo, bar
    { type: 'from_import', pattern: /^from\s+([\w.]+)\s+import\s+(.+)$/gm },
  ],
  go: [
    // import "package"
    { type: 'import', pattern: /import\s+"([^"]+)"/gm },
    // import ( "package1" \n "package2" )
    { type: 'grouped_import', pattern: /import\s*\(\s*([\s\S]*?)\)/gm },
  ],
  rb: [
    // require 'module' or require "module"
    { type: 'require', pattern: /require\s+['"]([^'"]+)['"]/gm },
    // require_relative 'module'
    { type: 'require_relative', pattern: /require_relative\s+['"]([^'"]+)['"]/gm },
  ],
  java: [
    // import package.Class;
    { type: 'import', pattern: /import\s+([\w.]+(?:\.\*)?)\s*;/gm },
  ],
  rs: [
    // use crate::module::item;
    { type: 'use', pattern: /use\s+([\w:]+(?:::\{[^}]+\})?(?:::\*)?)\s*;/gm },
    // mod module;
    { type: 'mod', pattern: /mod\s+(\w+)\s*;/gm },
    // extern crate name;
    { type: 'extern_crate', pattern: /extern\s+crate\s+(\w+)\s*;/gm },
  ],
};

/**
 * Parse import/require statements from file content.
 *
 * Returns an array of imports with:
 *   - module: the imported module path/name
 *   - symbols: array of imported symbol names (if applicable)
 *   - type: import type (import, require, from_import, etc.)
 *   - lineNumber: 1-based line number
 *   - text: the raw line text
 *   - isRelative: true if path starts with . or ..
 *
 * @param {string} content - File content
 * @param {string} filePath - File path (for language detection)
 * @param {object} [options]
 * @param {string} [options.language] - Override language detection
 * @returns {Array<{module: string, symbols: string[], type: string, lineNumber: number, text: string, isRelative: boolean}>}
 */
function parseImports(content, filePath, options = {}) {
  if (typeof content !== 'string') return [];

  const lang = options.language || detectLanguage(filePath);
  if (!lang || !IMPORT_PATTERNS[lang]) return [];

  const patterns = IMPORT_PATTERNS[lang];
  const lines = content.split('\n');
  const imports = [];
  const seen = new Set();

  for (const { type, pattern } of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = re.exec(content)) !== null) {
      let modulePath = '';
      let symbols = [];

      if (lang === 'js') {
        if (type === 'named_import' || type === 'destructured_require') {
          symbols = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
          modulePath = match[2];
        } else if (type === 'default_import' || type === 'require') {
          symbols = [match[1]];
          modulePath = match[2];
        } else if (type === 'namespace_import') {
          symbols = [match[1]];
          modulePath = match[2];
        } else if (type === 'side_effect_import' || type === 'dynamic_require') {
          modulePath = match[1];
        } else if (type === 're_export') {
          symbols = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
          modulePath = match[2];
        } else if (type === 'wildcard_re_export') {
          modulePath = match[1];
        }
      } else if (lang === 'py') {
        if (type === 'import') {
          modulePath = match[1];
        } else if (type === 'from_import') {
          modulePath = match[1];
          symbols = match[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        }
      } else if (lang === 'go') {
        if (type === 'import') {
          modulePath = match[1];
        } else if (type === 'grouped_import') {
          // Parse grouped imports
          const block = match[1];
          const goImportRe = /["']([^"']+)["']/g;
          let goMatch;
          while ((goMatch = goImportRe.exec(block)) !== null) {
            const goModule = goMatch[1];
            const goKey = `${goModule}:grouped_import`;
            if (!seen.has(goKey)) {
              seen.add(goKey);
              // Find line number for this specific import in the block
              let ln = 1;
              const goPos = match.index + block.indexOf(goMatch[0]);
              for (let i = 0; i < goPos && i < content.length; i++) {
                if (content[i] === '\n') ln++;
              }
              imports.push({
                module: goModule,
                symbols: [],
                type: 'import',
                lineNumber: ln,
                text: lines[ln - 1] || '',
                isRelative: false,
              });
            }
          }
          continue; // Don't process further for grouped imports
        }
      } else if (lang === 'rb') {
        modulePath = match[1];
      } else if (lang === 'java') {
        modulePath = match[1];
        const parts = modulePath.split('.');
        if (!modulePath.endsWith('.*')) {
          symbols = [parts[parts.length - 1]];
        }
      } else if (lang === 'rs') {
        modulePath = match[1];
        // Extract symbols from use paths like crate::foo::{bar, baz}
        const braceMatch = modulePath.match(/\{([^}]+)\}/);
        if (braceMatch) {
          symbols = braceMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      if (!modulePath) continue;

      const key = `${modulePath}:${type}:${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Calculate line number
      let lineNumber = 1;
      for (let i = 0; i < match.index && i < content.length; i++) {
        if (content[i] === '\n') lineNumber++;
      }

      const isRelative = modulePath.startsWith('.') || modulePath.startsWith('/');

      imports.push({
        module: modulePath,
        symbols,
        type,
        lineNumber,
        text: lines[lineNumber - 1] || '',
        isRelative,
      });
    }
  }

  // Sort by line number, deduplicate by module+lineNumber
  imports.sort((a, b) => a.lineNumber - b.lineNumber);
  return imports;
}

// ─── Reference Finding ──────────────────────────────────────────────────────

/**
 * Find all references to a symbol name in file content.
 *
 * Distinguishes between:
 *   - 'definition': where the symbol is defined (function/class/const declaration)
 *   - 'import': where the symbol is imported
 *   - 'usage': where the symbol is used (called, referenced, assigned)
 *
 * @param {string} content - File content
 * @param {string} symbolName - Symbol name to find
 * @param {string} filePath - File path (for language detection)
 * @param {object} [options]
 * @param {number} [options.contextLines=1] - Lines of context around each reference
 * @returns {Array<{lineNumber: number, text: string, type: string, context: {before: string[], after: string[]}}>}
 */
function findReferences(content, symbolName, filePath, options = {}) {
  if (typeof content !== 'string' || !symbolName) return [];

  const { contextLines = 1 } = options;
  const lines = content.split('\n');
  const references = [];
  const seen = new Set();

  // Get definitions for this symbol
  const definitions = findSymbols(content, filePath, { nameFilter: symbolName });
  const defLines = new Set(definitions.filter(d => d.name === symbolName).map(d => d.lineNumber));

  // Get imports for this symbol
  const fileImports = parseImports(content, filePath);
  const importLines = new Set();
  for (const imp of fileImports) {
    if (imp.symbols.includes(symbolName) || imp.module.endsWith(symbolName)) {
      importLines.add(imp.lineNumber);
    }
  }

  // Scan every line for the symbol name as a word boundary match
  const wordRe = new RegExp(`\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    wordRe.lastIndex = 0;

    if (!wordRe.test(line)) continue;

    const lineNum = i + 1;
    const key = lineNum;
    if (seen.has(key)) continue;
    seen.add(key);

    // Classify the reference
    let refType = 'usage';
    if (defLines.has(lineNum)) {
      refType = 'definition';
    } else if (importLines.has(lineNum)) {
      refType = 'import';
    }

    // Build context
    const before = [];
    const after = [];
    for (let b = Math.max(0, i - contextLines); b < i; b++) {
      before.push(lines[b]);
    }
    for (let a = i + 1; a <= Math.min(lines.length - 1, i + contextLines); a++) {
      after.push(lines[a]);
    }

    references.push({
      lineNumber: lineNum,
      text: line,
      type: refType,
      context: { before, after },
    });
  }

  return references;
}

// ─── Dependency Graph ───────────────────────────────────────────────────────

/**
 * Resolve a relative import path against a file's directory.
 *
 * @param {string} importPath - The import path (e.g., './utils', '../lib/helper')
 * @param {string} currentFilePath - The file that contains the import (e.g., 'src/server.js')
 * @returns {string} Resolved path (e.g., 'src/utils', 'lib/helper')
 */
function resolveImportPath(importPath, currentFilePath) {
  if (!importPath.startsWith('.')) return importPath;

  // Get directory of current file
  const parts = currentFilePath.split('/');
  parts.pop(); // Remove filename
  let dir = parts;

  const importParts = importPath.split('/');
  for (const part of importParts) {
    if (part === '.') continue;
    if (part === '..') {
      dir.pop();
    } else {
      dir.push(part);
    }
  }

  return dir.join('/');
}

/**
 * Build a dependency graph from a set of files with their contents.
 *
 * Returns a graph with:
 *   - nodes: array of files with their imports and exports
 *   - edges: array of { from, to, symbols } relationships
 *   - entryPoints: files that are imported by nothing
 *   - leafNodes: files that import nothing
 *   - circular: detected circular dependency chains
 *
 * @param {Array<{path: string, content: string}>} files - Files with content
 * @returns {{nodes: Array, edges: Array, entryPoints: string[], leafNodes: string[], circular: Array}}
 */
function buildDependencyGraph(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { nodes: [], edges: [], entryPoints: [], leafNodes: [], circular: [] };
  }

  const nodes = [];
  const edges = [];
  const importedBy = new Map();  // path → set of files that import it
  const importsFrom = new Map(); // path → set of files it imports

  // Build a lookup of all known file paths (without extensions for resolution)
  const knownPaths = new Set(files.map(f => f.path));
  const pathsWithoutExt = new Map();
  for (const f of files) {
    const noExt = f.path.replace(/\.[^.]+$/, '');
    pathsWithoutExt.set(noExt, f.path);
    // Also map /index variants
    pathsWithoutExt.set(noExt + '/index', f.path);
  }

  for (const file of files) {
    const imports = parseImports(file.content, file.path);
    const symbols = findSymbols(file.content, file.path);

    const resolvedImports = [];
    for (const imp of imports) {
      let resolved = imp.module;
      if (imp.isRelative) {
        resolved = resolveImportPath(imp.module, file.path);
      }

      // Try to match to a known file
      let matchedPath = null;
      if (knownPaths.has(resolved)) {
        matchedPath = resolved;
      } else if (pathsWithoutExt.has(resolved)) {
        matchedPath = pathsWithoutExt.get(resolved);
      } else {
        // Try common extensions
        for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.py', '.go', '.rs', '.rb', '.java']) {
          if (knownPaths.has(resolved + ext)) {
            matchedPath = resolved + ext;
            break;
          }
        }
      }

      resolvedImports.push({
        module: imp.module,
        resolvedPath: matchedPath,
        symbols: imp.symbols,
        type: imp.type,
        lineNumber: imp.lineNumber,
        isRelative: imp.isRelative,
        isExternal: !matchedPath && !imp.isRelative,
      });

      if (matchedPath) {
        edges.push({
          from: file.path,
          to: matchedPath,
          symbols: imp.symbols,
          importType: imp.type,
          lineNumber: imp.lineNumber,
        });

        if (!importedBy.has(matchedPath)) importedBy.set(matchedPath, new Set());
        importedBy.get(matchedPath).add(file.path);

        if (!importsFrom.has(file.path)) importsFrom.set(file.path, new Set());
        importsFrom.get(file.path).add(matchedPath);
      }
    }

    nodes.push({
      path: file.path,
      imports: resolvedImports,
      exports: symbols.map(s => ({ name: s.name, type: s.type, lineNumber: s.lineNumber })),
      importCount: resolvedImports.length,
      exportCount: symbols.length,
    });
  }

  // Find entry points (not imported by anything) and leaf nodes (import nothing)
  const allPaths = new Set(files.map(f => f.path));
  const entryPoints = [];
  const leafNodes = [];

  for (const path of allPaths) {
    if (!importedBy.has(path) || importedBy.get(path).size === 0) {
      entryPoints.push(path);
    }
    if (!importsFrom.has(path) || importsFrom.get(path).size === 0) {
      leafNodes.push(path);
    }
  }

  // Detect circular dependencies using DFS
  const circular = [];
  const visited = new Set();
  const inStack = new Set();

  function dfs(node, chain) {
    if (inStack.has(node)) {
      const cycleStart = chain.indexOf(node);
      if (cycleStart !== -1) {
        circular.push(chain.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    chain.push(node);

    const deps = importsFrom.get(node) || new Set();
    for (const dep of deps) {
      dfs(dep, [...chain]);
    }

    inStack.delete(node);
  }

  for (const path of allPaths) {
    if (!visited.has(path)) {
      dfs(path, []);
    }
  }

  return {
    nodes,
    edges,
    entryPoints: entryPoints.sort(),
    leafNodes: leafNodes.sort(),
    circular,
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
  // New: import parsing, reference finding, dependency graphs
  parseImports,
  findReferences,
  resolveImportPath,
  buildDependencyGraph,
  // Exported for testing / extension
  SYMBOL_PATTERNS,
  IMPORT_PATTERNS,
  EXT_TO_LANG,
};
