'use strict';

const request = require('supertest');

// Mock github module before requiring server
jest.mock('../src/github', () => ({
  getInstallationOctokit: jest.fn().mockResolvedValue({
    rest: { rateLimit: { get: jest.fn().mockResolvedValue({ data: { rate: { remaining: 4500, limit: 5000, reset: Math.floor(Date.now() / 1000) + 3600 } } }) } },
  }),
  readOneFile: jest.fn(),
  listTree: jest.fn(),
  applyOneFile: jest.fn(),
  patchOneFile: jest.fn(),
  patchReplace: jest.fn(),
  patchDiff: jest.fn(),
  getRepoTree: jest.fn(),
  deleteOneFile: jest.fn(),
  updateFile: jest.fn(),
  dryRunOneFile: jest.fn(),
  appendToFile: jest.fn(),
  applyUnifiedDiff: jest.fn(),
  applySearchReplace: jest.fn(),
  listBranches: jest.fn(),
  createBranch: jest.fn(),
  createPullRequest: jest.fn(),
  invalidateTokenCache: jest.fn(),
  isTransientError: jest.fn(),
  withRetry: jest.fn(),
  // New v0.7.0 functions
  readFileWithLineMap: jest.fn(),
  getBlob: jest.fn(),
  searchRepoContent: jest.fn(),
  discoverSymbols: jest.fn(),
  // New v0.8.0 functions
  moveFile: jest.fn(),
  // New v0.9.0 functions
  analyzeImports: jest.fn(),
  findSymbolReferences: jest.fn(),
  analyzeDependencies: jest.fn(),
}));

let app;

beforeAll(() => {
  // Suppress server.listen by setting a high port; supertest manages its own
  process.env.PORT = '0';
  delete process.env.API_AUTH_TOKEN; // No auth required for tests
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_PRIVATE_KEY;
  const server = require('../src/server');
  app = server.app;
});

describe('GET /', () => {
  it('returns service info with all endpoints listed', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('repo-bridge');
    expect(res.body.status).toBe('running');
    expect(res.body.version).toBe('0.9.0');
    expect(res.body.endpoints).toContain('/metrics');
    expect(res.body.endpoints).toContain('/patchReplace');
    expect(res.body.endpoints).toContain('/patchDiff');
    expect(res.body.endpoints).toContain('/repoTree');
    expect(res.body.endpoints).toContain('/deleteFile');
    expect(res.body.endpoints).toContain('/updateFile');
    expect(res.body.endpoints).toContain('/readLines');
    expect(res.body.endpoints).toContain('/blob');
    expect(res.body.endpoints).toContain('/search');
    expect(res.body.endpoints).toContain('/symbols');
    expect(res.body.endpoints).toContain('/moveFile');
    expect(res.body.endpoints).toContain('/copy');
    expect(res.body.endpoints).toContain('/imports');
    expect(res.body.endpoints).toContain('/references');
    expect(res.body.endpoints).toContain('/dependencies');
    expect(res.body.capabilities.readLines).toBeDefined();
    expect(res.body.capabilities.moveFile).toBeDefined();
    expect(res.body.capabilities.search).toBeDefined();
    expect(res.body.capabilities.symbols).toBeDefined();
    expect(res.body.capabilities.imports).toBeDefined();
    expect(res.body.capabilities.references).toBeDefined();
    expect(res.body.capabilities.dependencies).toBeDefined();
  });
});

describe('GET /health', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('repo-bridge');
    expect(res.body.uptime).toBeGreaterThan(0);
  });
});

describe('GET /metrics', () => {
  it('returns metrics with memory, uptime, and config', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.version).toBe('0.9.0');
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.rss).toBeGreaterThan(0);
    expect(res.body.memory.heapUsed).toBeGreaterThan(0);
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(res.body.config).toBeDefined();
  });
});

describe('POST /patchReplace', () => {
  it('returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/patchReplace')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if operations is empty', async () => {
    const res = await request(app)
      .post('/patchReplace')
      .send({ repo: 'owner/repo', path: 'file.txt', message: 'fix', operations: [] });
    expect(res.status).toBe(400);
  });

  it('calls patchReplace on valid input', async () => {
    const github = require('../src/github');
    github.patchReplace.mockResolvedValueOnce({
      success: true, committed: true, path: 'file.txt', branch: 'main', commitSha: 'abc123',
    });

    const res = await request(app)
      .post('/patchReplace')
      .send({
        repo: 'owner/repo',
        path: 'file.txt',
        message: 'fix typo',
        operations: [{ search: 'old', replace: 'new' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.commitSha).toBe('abc123');
  });
});

describe('POST /patchDiff', () => {
  it('returns 400 if patch is missing', async () => {
    const res = await request(app)
      .post('/patchDiff')
      .send({ repo: 'owner/repo', path: 'file.txt', message: 'fix' });
    expect(res.status).toBe(400);
  });

  it('calls patchDiff on valid input', async () => {
    const github = require('../src/github');
    github.patchDiff.mockResolvedValueOnce({
      success: true, committed: true, path: 'file.txt', branch: 'main', commitSha: 'def456',
    });

    const res = await request(app)
      .post('/patchDiff')
      .send({
        repo: 'owner/repo',
        path: 'file.txt',
        message: 'apply diff',
        patch: '@@ -1,1 +1,1 @@\n-old\n+new',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /repoTree', () => {
  it('returns 400 if repo is missing', async () => {
    const res = await request(app)
      .post('/repoTree')
      .send({});
    expect(res.status).toBe(400);
  });

  it('calls getRepoTree on valid input', async () => {
    const github = require('../src/github');
    github.getRepoTree.mockResolvedValueOnce({
      success: true,
      owner: 'owner', repo: 'repo', branch: 'main',
      commitSha: 'aaa',
      truncated: false,
      totalEntries: 2,
      entries: [
        { path: 'README.md', type: 'file', sha: 'bbb', size: 100 },
        { path: 'src', type: 'dir', sha: 'ccc', size: 0 },
      ],
    });

    const res = await request(app)
      .post('/repoTree')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries).toHaveLength(2);
  });
});

describe('POST /deleteFile', () => {
  it('returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/deleteFile')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('calls deleteOneFile on valid input', async () => {
    const github = require('../src/github');
    github.deleteOneFile.mockResolvedValueOnce({
      success: true, path: 'old.txt', branch: 'main', commitSha: 'ghi789',
    });

    const res = await request(app)
      .post('/deleteFile')
      .send({ repo: 'owner/repo', path: 'old.txt', message: 'remove old file' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.commitSha).toBe('ghi789');
  });
});

describe('POST /updateFile', () => {
  it('returns 400 if content is missing', async () => {
    const res = await request(app)
      .post('/updateFile')
      .send({ repo: 'owner/repo', path: 'file.txt', message: 'update' });
    expect(res.status).toBe(400);
  });

  it('calls updateFile on valid input', async () => {
    const github = require('../src/github');
    github.updateFile.mockResolvedValueOnce({
      success: true, committed: true, path: 'file.txt', branch: 'main', commitSha: 'jkl012',
    });

    const res = await request(app)
      .post('/updateFile')
      .send({ repo: 'owner/repo', path: 'file.txt', content: 'new content', message: 'update file' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.commitSha).toBe('jkl012');
  });
});

describe('POST /listBranches', () => {
  it('returns 400 if repo is missing', async () => {
    const res = await request(app)
      .post('/listBranches')
      .send({});
    expect(res.status).toBe(400);
  });

  it('calls listBranches on valid input', async () => {
    const github = require('../src/github');
    github.listBranches.mockResolvedValueOnce({
      success: true, owner: 'owner', repo: 'repo',
      totalBranches: 2,
      branches: [
        { name: 'main', sha: 'aaa', protected: true },
        { name: 'dev', sha: 'bbb', protected: false },
      ],
    });

    const res = await request(app)
      .post('/listBranches')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.branches).toHaveLength(2);
  });
});

describe('POST /createBranch', () => {
  it('returns 400 if branch name is missing', async () => {
    const res = await request(app)
      .post('/createBranch')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('calls createBranch on valid input', async () => {
    const github = require('../src/github');
    github.createBranch.mockResolvedValueOnce({
      success: true, owner: 'owner', repo: 'repo',
      branch: 'feature/test', fromBranch: 'main', sha: 'abc123',
    });

    const res = await request(app)
      .post('/createBranch')
      .send({ repo: 'owner/repo', branch: 'feature/test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.branch).toBe('feature/test');
  });
});

describe('POST /createPR', () => {
  it('returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/createPR')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('calls createPullRequest on valid input', async () => {
    const github = require('../src/github');
    github.createPullRequest.mockResolvedValueOnce({
      success: true, owner: 'owner', repo: 'repo',
      number: 42, url: 'https://github.com/owner/repo/pull/42',
      head: 'feature/test', base: 'main', title: 'Fix things',
    });

    const res = await request(app)
      .post('/createPR')
      .send({ repo: 'owner/repo', title: 'Fix things', head: 'feature/test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.number).toBe(42);
    expect(res.body.url).toContain('pull/42');
  });
});

describe('POST /moveFile', () => {
  it('returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/moveFile')
      .send({ sourceRepo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if destinationPath/newPath missing', async () => {
    const res = await request(app)
      .post('/moveFile')
      .send({ sourceRepo: 'owner/repo', sourcePath: 'old.txt' });
    expect(res.status).toBe(400);
  });

  it('moves a file within the same repo (rename)', async () => {
    const github = require('../src/github');
    github.moveFile.mockResolvedValueOnce({
      ok: true,
      moved: true,
      source: { owner: 'owner', repo: 'repo', branch: 'main', path: 'old.txt', sha: 'abc' },
      destination: { committed: true, owner: 'owner', repo: 'repo', branch: 'main', path: 'new.txt', commitSha: 'def' },
    });

    const res = await request(app)
      .post('/moveFile')
      .send({ sourceRepo: 'owner/repo', sourcePath: 'old.txt', newPath: 'new.txt', message: 'Rename file' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.moved).toBe(true);
    expect(res.body.source.path).toBe('old.txt');
    expect(res.body.destination.path).toBe('new.txt');
  });

  it('moves a file across repos', async () => {
    const github = require('../src/github');
    github.moveFile.mockResolvedValueOnce({
      ok: true,
      moved: true,
      source: { owner: 'org', repo: 'repo-a', branch: 'main', path: 'src/utils.js', sha: 'aaa' },
      destination: { committed: true, owner: 'org', repo: 'repo-b', branch: 'main', path: 'lib/utils.js', commitSha: 'bbb' },
    });

    const res = await request(app)
      .post('/moveFile')
      .send({
        sourceRepo: 'org/repo-a', sourcePath: 'src/utils.js',
        destinationRepo: 'org/repo-b', destinationPath: 'lib/utils.js',
        message: 'Move utils to repo-b',
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.moved).toBe(true);
  });
});

describe('POST /readLines', () => {
  it('returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/readLines')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns line-accurate file data on valid input', async () => {
    const github = require('../src/github');
    github.readFileWithLineMap.mockResolvedValueOnce({
      ok: true,
      owner: 'owner', repo: 'repo', branch: 'main', path: 'file.txt',
      blobSha: 'abc123',
      size: 50,
      totalLines: 3,
      normalized: true,
      content: 'line 1\nline 2\nline 3',
      lines: [
        { lineNumber: 1, text: 'line 1' },
        { lineNumber: 2, text: 'line 2' },
        { lineNumber: 3, text: 'line 3' },
      ],
    });

    const res = await request(app)
      .post('/readLines')
      .send({ repo: 'owner/repo', path: 'file.txt' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.blobSha).toBe('abc123');
    expect(res.body.totalLines).toBe(3);
    expect(res.body.lines).toHaveLength(3);
    expect(res.body.lines[0].lineNumber).toBe(1);
  });

  it('supports line range extraction', async () => {
    const github = require('../src/github');
    github.readFileWithLineMap.mockResolvedValueOnce({
      ok: true,
      owner: 'owner', repo: 'repo', branch: 'main', path: 'file.txt',
      blobSha: 'abc123',
      size: 50,
      totalLines: 10,
      normalized: true,
      startLine: 3,
      endLine: 5,
      content: 'line 3\nline 4\nline 5',
      lines: [
        { lineNumber: 3, text: 'line 3' },
        { lineNumber: 4, text: 'line 4' },
        { lineNumber: 5, text: 'line 5' },
      ],
    });

    const res = await request(app)
      .post('/readLines')
      .send({ repo: 'owner/repo', path: 'file.txt', startLine: 3, endLine: 5 });
    expect(res.status).toBe(200);
    expect(res.body.startLine).toBe(3);
    expect(res.body.endLine).toBe(5);
    expect(res.body.lines).toHaveLength(3);
  });
});

describe('POST /blob', () => {
  it('returns 400 if sha is missing', async () => {
    const res = await request(app)
      .post('/blob')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns blob content on valid input', async () => {
    const github = require('../src/github');
    github.getBlob.mockResolvedValueOnce({
      ok: true,
      owner: 'owner', repo: 'repo',
      sha: 'abc123def456',
      size: 100,
      content: 'file content here',
      encoding: 'utf8',
    });

    const res = await request(app)
      .post('/blob')
      .send({ repo: 'owner/repo', sha: 'abc123def456' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sha).toBe('abc123def456');
    expect(res.body.content).toBe('file content here');
  });
});

describe('POST /search', () => {
  it('returns 400 if query is missing', async () => {
    const res = await request(app)
      .post('/search')
      .send({ repos: ['owner/repo'] });
    expect(res.status).toBe(400);
  });

  it('returns 400 if repos is missing', async () => {
    const res = await request(app)
      .post('/search')
      .send({ query: 'function' });
    expect(res.status).toBe(400);
  });

  it('returns search results on valid input', async () => {
    const github = require('../src/github');
    github.searchRepoContent.mockResolvedValueOnce({
      ok: true,
      query: 'handleError',
      totalCount: 1,
      resultsReturned: 1,
      results: [{
        repo: 'owner/repo',
        path: 'src/error.js',
        blobSha: 'sha123',
        branch: 'main',
        matches: [{
          lineNumber: 15,
          text: 'function handleError(err) {',
          context: { before: ['', '// Error handler'], after: ['  console.error(err);', '}'] },
          reference: {
            ref: 'owner/repo:src/error.js:15',
            owner: 'owner', repo: 'repo',
            path: 'src/error.js', blobSha: 'sha123',
            startLine: 15, endLine: 15,
            githubUrl: 'https://github.com/owner/repo/blob/sha123/src/error.js#L15',
          },
        }],
      }],
    });

    const res = await request(app)
      .post('/search')
      .send({ query: 'handleError', repos: ['owner/repo'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].matches[0].lineNumber).toBe(15);
    expect(res.body.results[0].matches[0].reference.githubUrl).toContain('#L15');
  });
});

describe('POST /symbols', () => {
  it('returns 400 if repos is missing', async () => {
    const res = await request(app)
      .post('/symbols')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns discovered symbols on valid input', async () => {
    const github = require('../src/github');
    github.discoverSymbols.mockResolvedValueOnce({
      ok: true,
      totalSymbols: 2,
      symbols: [
        {
          name: 'readOneFile', type: 'function', lineNumber: 231,
          text: 'async function readOneFile({ owner, repo, branch, path }) {',
          repo: 'owner/repo', path: 'src/github.js', branch: 'main',
          blobSha: 'sha456',
          reference: {
            ref: 'owner/repo:src/github.js:231',
            owner: 'owner', repo: 'repo',
            path: 'src/github.js', blobSha: 'sha456',
            startLine: 231, endLine: 231,
            githubUrl: 'https://github.com/owner/repo/blob/sha456/src/github.js#L231',
          },
        },
        {
          name: 'applyOneFile', type: 'function', lineNumber: 165,
          text: 'async function applyOneFile({ owner, repo, branch, path }) {',
          repo: 'owner/repo', path: 'src/github.js', branch: 'main',
          blobSha: 'sha456',
          reference: {
            ref: 'owner/repo:src/github.js:165',
            owner: 'owner', repo: 'repo',
            path: 'src/github.js', blobSha: 'sha456',
            startLine: 165, endLine: 165,
            githubUrl: 'https://github.com/owner/repo/blob/sha456/src/github.js#L165',
          },
        },
      ],
    });

    const res = await request(app)
      .post('/symbols')
      .send({ repos: ['owner/repo'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.totalSymbols).toBe(2);
    expect(res.body.symbols[0].name).toBe('readOneFile');
    expect(res.body.symbols[0].reference.githubUrl).toContain('#L231');
  });
});

describe('POST /imports', () => {
  it('returns 400 if repo is missing', async () => {
    const res = await request(app)
      .post('/imports')
      .send({ paths: ['src/server.js'] });
    expect(res.status).toBe(400);
  });

  it('returns 400 if paths is missing', async () => {
    const res = await request(app)
      .post('/imports')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns import analysis on valid input', async () => {
    const github = require('../src/github');
    github.analyzeImports.mockResolvedValueOnce({
      ok: true,
      owner: 'owner', repo: 'repo', branch: 'main',
      files: [{
        path: 'src/server.js',
        blobSha: 'sha123',
        imports: [
          { module: './github', symbols: ['readOneFile'], type: 'destructured_require', lineNumber: 3, isRelative: true },
          { module: 'express', symbols: ['express'], type: 'require', lineNumber: 1, isRelative: false },
        ],
        totalImports: 2,
      }],
      totalFiles: 1,
      totalImports: 2,
    });

    const res = await request(app)
      .post('/imports')
      .send({ repo: 'owner/repo', paths: ['src/server.js'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].imports).toHaveLength(2);
    expect(res.body.totalImports).toBe(2);
  });
});

describe('POST /references', () => {
  it('returns 400 if symbol is missing', async () => {
    const res = await request(app)
      .post('/references')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if repo is missing', async () => {
    const res = await request(app)
      .post('/references')
      .send({ symbol: 'readOneFile' });
    expect(res.status).toBe(400);
  });

  it('returns symbol references on valid input', async () => {
    const github = require('../src/github');
    github.findSymbolReferences.mockResolvedValueOnce({
      ok: true,
      symbol: 'readOneFile',
      owner: 'owner', repo: 'repo', branch: 'main',
      totalReferences: 5,
      filesScanned: 10,
      filesWithReferences: 3,
      summary: { definitions: 1, imports: 2, usages: 2 },
      references: [
        { lineNumber: 231, text: 'async function readOneFile({...}) {', type: 'definition', path: 'src/github.js' },
        { lineNumber: 10, text: "const { readOneFile } = require('./github');", type: 'import', path: 'src/server.js' },
        { lineNumber: 55, text: 'const result = await readOneFile({ owner, repo });', type: 'usage', path: 'src/server.js' },
      ],
    });

    const res = await request(app)
      .post('/references')
      .send({ repo: 'owner/repo', symbol: 'readOneFile' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.symbol).toBe('readOneFile');
    expect(res.body.totalReferences).toBe(5);
    expect(res.body.summary.definitions).toBe(1);
    expect(res.body.summary.imports).toBe(2);
    expect(res.body.summary.usages).toBe(2);
    expect(res.body.references).toHaveLength(3);
  });
});

describe('POST /dependencies', () => {
  it('returns 400 if repo is missing', async () => {
    const res = await request(app)
      .post('/dependencies')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns dependency graph on valid input', async () => {
    const github = require('../src/github');
    github.analyzeDependencies.mockResolvedValueOnce({
      ok: true,
      owner: 'owner', repo: 'repo', branch: 'main',
      filesAnalyzed: 3,
      nodes: [
        { path: 'src/server.js', imports: [{ module: './github', resolvedPath: 'src/github.js' }], exports: [], importCount: 1, exportCount: 0 },
        { path: 'src/github.js', imports: [{ module: './normalize', resolvedPath: 'src/normalize.js' }], exports: [], importCount: 1, exportCount: 0 },
        { path: 'src/normalize.js', imports: [], exports: [], importCount: 0, exportCount: 0 },
      ],
      edges: [
        { from: 'src/server.js', to: 'src/github.js', symbols: [] },
        { from: 'src/github.js', to: 'src/normalize.js', symbols: [] },
      ],
      entryPoints: ['src/server.js'],
      leafNodes: ['src/normalize.js'],
      circular: [],
      summary: { totalNodes: 3, totalEdges: 2, entryPoints: 1, leafNodes: 1, circularDependencies: 0 },
    });

    const res = await request(app)
      .post('/dependencies')
      .send({ repo: 'owner/repo' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.nodes).toHaveLength(3);
    expect(res.body.edges).toHaveLength(2);
    expect(res.body.entryPoints).toContain('src/server.js');
    expect(res.body.leafNodes).toContain('src/normalize.js');
    expect(res.body.circular).toHaveLength(0);
    expect(res.body.summary.circularDependencies).toBe(0);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
