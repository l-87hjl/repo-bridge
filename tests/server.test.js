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
  invalidateTokenCache: jest.fn(),
  isTransientError: jest.fn(),
  withRetry: jest.fn(),
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
    expect(res.body.version).toBe('0.6.0');
    expect(res.body.endpoints).toContain('/metrics');
    expect(res.body.endpoints).toContain('/patchReplace');
    expect(res.body.endpoints).toContain('/patchDiff');
    expect(res.body.endpoints).toContain('/repoTree');
    expect(res.body.endpoints).toContain('/deleteFile');
    expect(res.body.endpoints).toContain('/updateFile');
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
    expect(res.body.version).toBe('0.6.0');
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

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
