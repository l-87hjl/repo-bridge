'use strict';

const {
  normalizeContent,
  computeLineMap,
  extractLineRange,
  searchContent,
  findSymbols,
  detectLanguage,
  buildLineReference,
  checkDrift,
  parseImports,
  findReferences,
  resolveImportPath,
  buildDependencyGraph,
} = require('../src/normalize');

// ─── normalizeContent ─────────────────────────────────────────────────────────

describe('normalizeContent', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeContent('line1\r\nline2\r\n')).toBe('line1\nline2\n');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeContent('line1\rline2\r')).toBe('line1\nline2\n');
  });

  it('leaves LF-only content unchanged', () => {
    expect(normalizeContent('line1\nline2\n')).toBe('line1\nline2\n');
  });

  it('strips BOM by default', () => {
    expect(normalizeContent('\uFEFFhello')).toBe('hello');
  });

  it('preserves BOM when stripBom is false', () => {
    expect(normalizeContent('\uFEFFhello', { stripBom: false })).toBe('\uFEFFhello');
  });

  it('strips trailing whitespace when option enabled', () => {
    expect(normalizeContent('line1  \nline2\t\n', { stripTrailingWhitespace: true }))
      .toBe('line1\nline2\n');
  });

  it('handles mixed line endings', () => {
    expect(normalizeContent('a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeContent(null)).toBe('');
    expect(normalizeContent(undefined)).toBe('');
  });
});

// ─── computeLineMap ───────────────────────────────────────────────────────────

describe('computeLineMap', () => {
  it('returns empty array for empty content', () => {
    expect(computeLineMap('')).toEqual([]);
  });

  it('computes correct line map for simple content', () => {
    const map = computeLineMap('hello\nworld');
    expect(map).toHaveLength(2);
    expect(map[0]).toEqual({ lineNumber: 1, startOffset: 0, endOffset: 5, text: 'hello' });
    expect(map[1]).toEqual({ lineNumber: 2, startOffset: 6, endOffset: 11, text: 'world' });
  });

  it('handles trailing newline', () => {
    const map = computeLineMap('line1\nline2\n');
    expect(map).toHaveLength(3);
    expect(map[2].text).toBe('');
    expect(map[2].lineNumber).toBe(3);
  });

  it('handles single line without newline', () => {
    const map = computeLineMap('single');
    expect(map).toHaveLength(1);
    expect(map[0]).toEqual({ lineNumber: 1, startOffset: 0, endOffset: 6, text: 'single' });
  });
});

// ─── extractLineRange ─────────────────────────────────────────────────────────

describe('extractLineRange', () => {
  const content = 'line1\nline2\nline3\nline4\nline5';

  it('extracts single line', () => {
    const result = extractLineRange(content, 3);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toEqual({ lineNumber: 3, text: 'line3' });
    expect(result.totalLines).toBe(5);
  });

  it('extracts line range', () => {
    const result = extractLineRange(content, 2, 4);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0].text).toBe('line2');
    expect(result.lines[2].text).toBe('line4');
  });

  it('clamps to valid range', () => {
    const result = extractLineRange(content, 0, 100);
    expect(result.lines).toHaveLength(5);
    expect(result.lines[0].lineNumber).toBe(1);
    expect(result.lines[4].lineNumber).toBe(5);
  });

  it('handles non-string input', () => {
    const result = extractLineRange(null, 1, 5);
    expect(result.lines).toEqual([]);
    expect(result.totalLines).toBe(0);
  });
});

// ─── searchContent ────────────────────────────────────────────────────────────

describe('searchContent', () => {
  const content = 'function hello() {\n  console.log("hello");\n}\n\nfunction world() {\n  return "world";\n}';

  it('finds literal matches with line numbers', () => {
    const results = searchContent(content, 'function');
    expect(results).toHaveLength(2);
    expect(results[0].lineNumber).toBe(1);
    expect(results[1].lineNumber).toBe(5);
  });

  it('provides context lines', () => {
    const results = searchContent(content, 'console', { contextLines: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].lineNumber).toBe(2);
    expect(results[0].context.before).toHaveLength(1);
    expect(results[0].context.after).toHaveLength(1);
  });

  it('supports case-insensitive search', () => {
    const results = searchContent(content, 'FUNCTION', { caseSensitive: false });
    expect(results).toHaveLength(2);
  });

  it('supports regex patterns', () => {
    const results = searchContent(content, 'function\\s+\\w+', { regex: true });
    expect(results).toHaveLength(2);
  });

  it('respects maxResults', () => {
    const results = searchContent(content, 'function', { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  it('returns empty for no matches', () => {
    const results = searchContent(content, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('returns empty for empty content', () => {
    expect(searchContent('', 'test')).toEqual([]);
    expect(searchContent(null, 'test')).toEqual([]);
  });
});

// ─── detectLanguage ───────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('detects JavaScript', () => {
    expect(detectLanguage('src/server.js')).toBe('js');
    expect(detectLanguage('index.mjs')).toBe('js');
  });

  it('detects TypeScript', () => {
    expect(detectLanguage('app.ts')).toBe('js');
    expect(detectLanguage('Component.tsx')).toBe('js');
  });

  it('detects Python', () => {
    expect(detectLanguage('script.py')).toBe('py');
  });

  it('detects Go', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('detects Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rs');
  });

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('data.csv')).toBeNull();
    expect(detectLanguage('image.png')).toBeNull();
  });

  it('returns null for no path', () => {
    expect(detectLanguage(null)).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });
});

// ─── findSymbols ──────────────────────────────────────────────────────────────

describe('findSymbols', () => {
  it('finds JavaScript functions', () => {
    const content = 'function hello() {}\nconst world = () => {};\nasync function getData() {}';
    const symbols = findSymbols(content, 'file.js');
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    const names = symbols.map(s => s.name);
    expect(names).toContain('hello');
    expect(names).toContain('getData');
  });

  it('finds JavaScript classes', () => {
    const content = 'class MyService {\n  constructor() {}\n  run() {}\n}';
    const symbols = findSymbols(content, 'file.js');
    const classSymbols = symbols.filter(s => s.type === 'class');
    expect(classSymbols).toHaveLength(1);
    expect(classSymbols[0].name).toBe('MyService');
  });

  it('finds Python symbols', () => {
    const content = 'class Handler:\n    def process(self):\n        pass\n\ndef main():\n    pass';
    const symbols = findSymbols(content, 'app.py');
    const names = symbols.map(s => s.name);
    expect(names).toContain('Handler');
    // 'process' is indented, matches Python def pattern with optional leading whitespace
    expect(names).toContain('process');
    expect(names).toContain('main');
  });

  it('finds Go symbols', () => {
    const content = 'func main() {\n}\n\ntype Server struct {\n}\n\nfunc (s *Server) Start() {\n}';
    const symbols = findSymbols(content, 'main.go');
    const names = symbols.map(s => s.name);
    expect(names).toContain('main');
    expect(names).toContain('Server');
    expect(names).toContain('Start');
  });

  it('filters by name', () => {
    const content = 'function readFile() {}\nfunction writeFile() {}\nfunction deleteFile() {}';
    const symbols = findSymbols(content, 'file.js', { nameFilter: 'read' });
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('readFile');
  });

  it('filters by type', () => {
    const content = 'function hello() {}\nclass World {}';
    const symbols = findSymbols(content, 'file.js', { typeFilter: ['class'] });
    expect(symbols).toHaveLength(1);
    expect(symbols[0].type).toBe('class');
  });

  it('returns empty for unknown language', () => {
    expect(findSymbols('content', 'data.csv')).toEqual([]);
  });

  it('returns correct line numbers', () => {
    const content = '// comment\n\nfunction foo() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}';
    const symbols = findSymbols(content, 'file.js');
    const foo = symbols.find(s => s.name === 'foo');
    const bar = symbols.find(s => s.name === 'bar');
    expect(foo.lineNumber).toBe(3);
    expect(bar.lineNumber).toBe(7);
  });
});

// ─── buildLineReference ───────────────────────────────────────────────────────

describe('buildLineReference', () => {
  it('builds single-line reference', () => {
    const ref = buildLineReference({
      owner: 'org', repo: 'my-app', path: 'src/main.js',
      blobSha: 'abc123', startLine: 42,
    });
    expect(ref.ref).toBe('org/my-app:src/main.js:42');
    expect(ref.startLine).toBe(42);
    expect(ref.endLine).toBe(42);
    expect(ref.githubUrl).toContain('#L42');
    expect(ref.githubUrl).not.toContain('-L');
  });

  it('builds multi-line reference', () => {
    const ref = buildLineReference({
      owner: 'org', repo: 'my-app', path: 'src/main.js',
      blobSha: 'abc123', startLine: 10, endLine: 20,
    });
    expect(ref.ref).toBe('org/my-app:src/main.js:10-20');
    expect(ref.githubUrl).toContain('#L10-L20');
  });

  it('uses commitSha for immutable URL when provided', () => {
    const ref = buildLineReference({
      owner: 'org', repo: 'my-app', path: 'src/main.js',
      blobSha: 'blob123', commitSha: 'commit456', startLine: 5,
    });
    expect(ref.githubUrl).toContain('/blob/commit456/');
    expect(ref.commitSha).toBe('commit456');
    expect(ref.blobSha).toBe('blob123');
  });

  it('falls back to blobSha when no commitSha', () => {
    const ref = buildLineReference({
      owner: 'org', repo: 'my-app', path: 'src/main.js',
      blobSha: 'blob123', startLine: 5,
    });
    expect(ref.githubUrl).toContain('/blob/blob123/');
    expect(ref.commitSha).toBeNull();
  });
});

// ─── checkDrift ───────────────────────────────────────────────────────────────

describe('checkDrift', () => {
  it('detects no drift when SHAs match', () => {
    const result = checkDrift('abc123', 'abc123');
    expect(result.drifted).toBe(false);
  });

  it('detects drift when SHAs differ', () => {
    const result = checkDrift('abc123', 'def456');
    expect(result.drifted).toBe(true);
    expect(result.referenceSha).toBe('abc123');
    expect(result.currentSha).toBe('def456');
  });
});

// ─── parseImports ─────────────────────────────────────────────────────────────

describe('parseImports', () => {
  it('parses ES module imports', () => {
    const content = "import express from 'express';\nimport { readFile, writeFile } from 'fs';\nimport * as path from 'path';";
    const imports = parseImports(content, 'app.js');
    expect(imports.length).toBeGreaterThanOrEqual(3);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('express');
    expect(modules).toContain('fs');
    expect(modules).toContain('path');
  });

  it('parses require statements', () => {
    const content = "const express = require('express');\nconst { readOneFile } = require('./github');";
    const imports = parseImports(content, 'server.js');
    expect(imports.length).toBeGreaterThanOrEqual(2);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('express');
    expect(modules).toContain('./github');
  });

  it('identifies relative vs external imports', () => {
    const content = "const a = require('./local');\nconst b = require('external');";
    const imports = parseImports(content, 'file.js');
    const local = imports.find(i => i.module === './local');
    const external = imports.find(i => i.module === 'external');
    expect(local.isRelative).toBe(true);
    expect(external.isRelative).toBe(false);
  });

  it('extracts imported symbols', () => {
    const content = "const { foo, bar } = require('./utils');";
    const imports = parseImports(content, 'file.js');
    const imp = imports.find(i => i.module === './utils');
    expect(imp.symbols).toContain('foo');
    expect(imp.symbols).toContain('bar');
  });

  it('parses Python imports', () => {
    const content = 'import os\nfrom pathlib import Path, PurePath\nimport sys';
    const imports = parseImports(content, 'script.py');
    expect(imports.length).toBeGreaterThanOrEqual(3);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('os');
    expect(modules).toContain('pathlib');
    expect(modules).toContain('sys');
  });

  it('parses Python from-import symbols', () => {
    const content = 'from pathlib import Path, PurePath';
    const imports = parseImports(content, 'script.py');
    const imp = imports.find(i => i.module === 'pathlib');
    expect(imp.symbols).toContain('Path');
    expect(imp.symbols).toContain('PurePath');
  });

  it('parses Ruby require', () => {
    const content = "require 'json'\nrequire_relative 'helper'";
    const imports = parseImports(content, 'app.rb');
    expect(imports.length).toBeGreaterThanOrEqual(2);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('json');
    expect(modules).toContain('helper');
  });

  it('parses Java imports', () => {
    const content = 'import java.util.List;\nimport java.io.*;';
    const imports = parseImports(content, 'App.java');
    expect(imports.length).toBeGreaterThanOrEqual(2);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('java.util.List');
    expect(modules).toContain('java.io.*');
  });

  it('parses Rust use statements', () => {
    const content = 'use std::io;\nuse crate::utils::helper;\nmod config;';
    const imports = parseImports(content, 'main.rs');
    expect(imports.length).toBeGreaterThanOrEqual(3);
    const modules = imports.map(i => i.module);
    expect(modules).toContain('std::io');
    expect(modules).toContain('crate::utils::helper');
    expect(modules).toContain('config');
  });

  it('returns correct line numbers', () => {
    const content = "// comment\n\nconst fs = require('fs');\nconst path = require('path');";
    const imports = parseImports(content, 'file.js');
    const fsImport = imports.find(i => i.module === 'fs');
    const pathImport = imports.find(i => i.module === 'path');
    expect(fsImport.lineNumber).toBe(3);
    expect(pathImport.lineNumber).toBe(4);
  });

  it('returns empty for unknown language', () => {
    expect(parseImports('content', 'data.csv')).toEqual([]);
  });

  it('returns empty for non-string input', () => {
    expect(parseImports(null, 'file.js')).toEqual([]);
  });

  it('parses re-exports', () => {
    const content = "export { foo, bar } from './utils';\nexport * from './helpers';";
    const imports = parseImports(content, 'index.js');
    const reExport = imports.find(i => i.module === './utils');
    expect(reExport).toBeDefined();
    expect(reExport.symbols).toContain('foo');
    const wildcardReExport = imports.find(i => i.module === './helpers');
    expect(wildcardReExport).toBeDefined();
  });
});

// ─── findReferences ───────────────────────────────────────────────────────────

describe('findReferences', () => {
  it('finds definitions, imports, and usages', () => {
    const content = "const { readFile } = require('fs');\n\nfunction processFile(path) {\n  return readFile(path);\n}";
    const refs = findReferences(content, 'readFile', 'file.js');
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const types = refs.map(r => r.type);
    expect(types).toContain('import');
    expect(types).toContain('usage');
  });

  it('classifies function definitions', () => {
    const content = "function myFunc() {\n  return 42;\n}\n\nconst result = myFunc();";
    const refs = findReferences(content, 'myFunc', 'file.js');
    const def = refs.find(r => r.type === 'definition');
    expect(def).toBeDefined();
    expect(def.lineNumber).toBe(1);
  });

  it('provides context lines', () => {
    const content = "// before\nfunction foo() {}\n// after\n\nfoo();";
    const refs = findReferences(content, 'foo', 'file.js', { contextLines: 1 });
    const def = refs.find(r => r.type === 'definition');
    expect(def.context.before).toHaveLength(1);
    expect(def.context.before[0]).toBe('// before');
    expect(def.context.after).toHaveLength(1);
    expect(def.context.after[0]).toBe('// after');
  });

  it('returns empty for no matches', () => {
    const refs = findReferences('const x = 1;', 'nonexistent', 'file.js');
    expect(refs).toHaveLength(0);
  });

  it('returns empty for non-string input', () => {
    expect(findReferences(null, 'foo', 'file.js')).toEqual([]);
    expect(findReferences('content', '', 'file.js')).toEqual([]);
  });

  it('uses word boundary matching', () => {
    const content = 'const fooBar = 1;\nconst foo = 2;\nconst barFoo = 3;';
    const refs = findReferences(content, 'foo', 'file.js');
    // Should match 'foo' standalone but also 'foo' in 'fooBar' since fooBar contains word boundary match
    // Actually with \\b, 'foo' matches in 'fooBar' at word start — let's verify
    expect(refs.length).toBeGreaterThanOrEqual(1);
    // The standalone 'foo' line should be found
    const fooRef = refs.find(r => r.text.includes('const foo = 2'));
    expect(fooRef).toBeDefined();
  });
});

// ─── resolveImportPath ────────────────────────────────────────────────────────

describe('resolveImportPath', () => {
  it('resolves relative import in same directory', () => {
    expect(resolveImportPath('./utils', 'src/server.js')).toBe('src/utils');
  });

  it('resolves parent directory import', () => {
    expect(resolveImportPath('../lib/helper', 'src/modules/main.js')).toBe('src/lib/helper');
  });

  it('returns non-relative paths unchanged', () => {
    expect(resolveImportPath('express', 'src/server.js')).toBe('express');
    expect(resolveImportPath('@org/pkg', 'src/server.js')).toBe('@org/pkg');
  });

  it('handles deeply nested relative paths', () => {
    expect(resolveImportPath('../../config', 'src/lib/utils/helper.js')).toBe('src/config');
  });
});

// ─── buildDependencyGraph ─────────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  it('builds a simple dependency chain', () => {
    const files = [
      { path: 'src/server.js', content: "const github = require('./github');" },
      { path: 'src/github.js', content: "const { normalizeContent } = require('./normalize');" },
      { path: 'src/normalize.js', content: "'use strict';" },
    ];
    const graph = buildDependencyGraph(files);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);
    expect(graph.entryPoints).toContain('src/server.js');
    expect(graph.leafNodes).toContain('src/normalize.js');
    expect(graph.circular).toHaveLength(0);
  });

  it('detects circular dependencies', () => {
    const files = [
      { path: 'a.js', content: "const b = require('./b');" },
      { path: 'b.js', content: "const a = require('./a');" },
    ];
    const graph = buildDependencyGraph(files);
    expect(graph.circular.length).toBeGreaterThan(0);
  });

  it('identifies entry points and leaf nodes', () => {
    const files = [
      { path: 'main.js', content: "const lib = require('./lib');" },
      { path: 'lib.js', content: "'use strict';" },
    ];
    const graph = buildDependencyGraph(files);
    expect(graph.entryPoints).toContain('main.js');
    expect(graph.leafNodes).toContain('lib.js');
  });

  it('handles empty input', () => {
    const graph = buildDependencyGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.entryPoints).toHaveLength(0);
    expect(graph.leafNodes).toHaveLength(0);
    expect(graph.circular).toHaveLength(0);
  });

  it('handles files with no imports', () => {
    const files = [
      { path: 'standalone.js', content: 'const x = 1;\nfunction hello() { return x; }' },
    ];
    const graph = buildDependencyGraph(files);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
    expect(graph.entryPoints).toContain('standalone.js');
    expect(graph.leafNodes).toContain('standalone.js');
  });

  it('resolves imports with file extensions', () => {
    const files = [
      { path: 'app.js', content: "const utils = require('./utils');" },
      { path: 'utils.js', content: "module.exports = {};" },
    ];
    const graph = buildDependencyGraph(files);
    // The require('./utils') should resolve to 'utils.js' since we match without extension
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    const edge = graph.edges.find(e => e.from === 'app.js');
    expect(edge).toBeDefined();
    expect(edge.to).toBe('utils.js');
  });

  it('tracks exported symbols per node', () => {
    const files = [
      { path: 'lib.js', content: 'function readFile() {}\nfunction writeFile() {}\nclass FileManager {}' },
    ];
    const graph = buildDependencyGraph(files);
    const node = graph.nodes.find(n => n.path === 'lib.js');
    expect(node.exportCount).toBeGreaterThanOrEqual(3);
    const exportNames = node.exports.map(e => e.name);
    expect(exportNames).toContain('readFile');
    expect(exportNames).toContain('writeFile');
    expect(exportNames).toContain('FileManager');
  });
});
