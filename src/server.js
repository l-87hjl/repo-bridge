'use strict';

const express = require('express');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH || 'main';
const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN;

// Parse allowlists from environment (comma-separated)
const ALLOWED_REPOS = process.env.ALLOWED_REPOS
  ? process.env.ALLOWED_REPOS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : null; // null means allow all
const ALLOWED_PATHS = process.env.ALLOWED_PATHS
  ? process.env.ALLOWED_PATHS.split(',').map(s => s.trim()).filter(Boolean)
  : null; // null means allow all

// Parse read-only repos from environment (comma-separated owner/repo)
// These repos can be read but not written to via /apply
const READ_ONLY_REPOS = (process.env.READ_ONLY_REPOS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

app.get('/', (req, res) => {
  res.json({ service: 'repo-bridge', status: 'running', endpoints: ['/health', '/apply', '/read', '/github/dryrun'] });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'repo-bridge', time: new Date().toISOString() });
});

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: 'BadRequest', message });
}

function unauthorized(res, message) {
  return res.status(401).json({ ok: false, error: 'Unauthorized', message });
}

function forbidden(res, message) {
  return res.status(403).json({ ok: false, error: 'Forbidden', message });
}

/**
 * Auth middleware: requires Bearer token if API_AUTH_TOKEN is set.
 */
function requireAuth(req, res, next) {
  if (!API_AUTH_TOKEN) {
    // No token configured, allow all requests
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or invalid Authorization header. Use: Bearer <token>');
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  if (token !== API_AUTH_TOKEN) {
    return unauthorized(res, 'Invalid auth token');
  }

  next();
}

/**
 * Check if a repo is in the allowlist.
 * Returns true if allowed, false otherwise.
 */
function isRepoAllowed(owner, repo) {
  if (!ALLOWED_REPOS) return true; // No allowlist = allow all
  const fullName = `${owner}/${repo}`.toLowerCase();
  return ALLOWED_REPOS.some(pattern => {
    if (pattern.includes('*')) {
      // Simple wildcard: owner/* matches any repo from that owner
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(fullName);
    }
    return pattern === fullName;
  });
}

/**
 * Check if a path is in the allowlist.
 * Returns true if allowed, false otherwise.
 */
function isPathAllowed(filePath) {
  if (!ALLOWED_PATHS) return true; // No allowlist = allow all
  return ALLOWED_PATHS.some(pattern => {
    if (pattern.includes('*')) {
      // Simple wildcard matching
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }
    // Exact match or prefix match (for directories)
    return filePath === pattern || filePath.startsWith(pattern.endsWith('/') ? pattern : pattern + '/');
  });
}

/**
 * Check if a repo is configured as read-only.
 * Returns true if the repo is read-only (writes blocked), false otherwise.
 */
function isRepoReadOnly(owner, repo) {
  if (READ_ONLY_REPOS.length === 0) return false;
  const fullName = `${owner}/${repo}`.toLowerCase();
  return READ_ONLY_REPOS.includes(fullName);
}

function normalizeApplyBody(body) {
  // Accept two shapes:
  // A) { owner, repo, branch, path, content, message, installationId? }
  // B) { owner, repo, branch, message, changes:[{path, content}], installationId?, dryRun? }
  const b = body || {};

  // Allow repo like "owner/name" too
  if (!b.owner && typeof b.repo === 'string' && b.repo.includes('/')) {
    const [o, r] = b.repo.split('/');
    b.owner = o;
    b.repo = r;
  }

  // Default branch to 'main' if not specified
  const branch = b.branch || DEFAULT_BRANCH;

  if (Array.isArray(b.changes) && b.changes.length > 0) {
    if (b.changes.length !== 1) {
      return { error: 'For now, changes[] must contain exactly 1 file.' };
    }
    const c0 = b.changes[0] || {};
    return {
      owner: b.owner,
      repo: b.repo,
      branch,
      path: c0.path,
      content: c0.content,
      message: b.message,
      installationId: b.installationId,
      dryRun: b.dryRun,
    };
  }

  return {
    owner: b.owner,
    repo: b.repo,
    branch,
    path: b.path,
    content: b.content,
    message: b.message,
    installationId: b.installationId,
    dryRun: b.dryRun,
  };
}

app.post('/github/dryrun', requireAuth, (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);

    const { owner, repo, branch, path, content, message } = b;
    if (!owner || !repo || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, path, content(string), message. Optional: branch (defaults to main)');
    }

    // Check allowlists
    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }
    if (!isPathAllowed(path)) {
      return forbidden(res, `Path ${path} is not in the allowlist`);
    }

    // dryRunOneFile never touches GitHub - it only returns what would be applied
    const { dryRunOneFile } = require('./github');
    return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ServerError', message: e?.message || String(e) });
  }
});

app.post('/apply', requireAuth, async (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);

    const { owner, repo, branch, path, content, message, installationId, dryRun } = b;

    if (!owner || !repo || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, path, content(string), message. Optional: branch (defaults to main)');
    }

    // Check allowlists
    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }
    if (!isPathAllowed(path)) {
      return forbidden(res, `Path ${path} is not in the allowlist`);
    }

    // Check if repo is read-only (blocks writes via /apply)
    if (isRepoReadOnly(owner, repo)) {
      return res.status(403).json({
        ok: false,
        error: 'RepoReadOnly',
        message: `Repository ${owner}/${repo} is configured as read-only`
      });
    }

    if (dryRun) {
      // dryRunOneFile never touches GitHub - it only returns what would be applied
      const { dryRunOneFile } = require('./github');
      return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
    }

    const { applyOneFile } = require('./github');
    const result = await applyOneFile({ owner, repo, branch, path, content, message, installationId });
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'ApplyFailed', message: e?.message || String(e) });
  }
});

app.post('/read', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};

    // Allow repo like "owner/name" too
    let owner = b.owner;
    let repo = b.repo;
    if (!owner && typeof repo === 'string' && repo.includes('/')) {
      const [o, r] = repo.split('/');
      owner = o;
      repo = r;
    }

    const branch = b.branch || DEFAULT_BRANCH;
    const path = b.path;
    const installationId = b.installationId;

    if (!owner || !repo || !path) {
      return badRequest(res, 'Required: owner, repo, path. Optional: branch (defaults to main)');
    }

    // Check allowlists
    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }
    if (!isPathAllowed(path)) {
      return forbidden(res, `Path ${path} is not in the allowlist`);
    }

    const { readOneFile } = require('./github');
    const result = await readOneFile({ owner, repo, branch, path, installationId });
    return res.json(result);
  } catch (e) {
    const status = e?.status;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'File not found' });
    }
    if (status === 400) {
      return res.status(400).json({ ok: false, error: 'BadRequest', message: e?.message || String(e) });
    }
    console.error(e);
    return res.status(500).json({ ok: false, error: 'ReadFailed', message: e?.message || String(e) });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'ServerError' });
});

app.listen(PORT, () => console.log(`repo-bridge listening on ${PORT}`));
