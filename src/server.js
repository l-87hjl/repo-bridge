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
  res.json({ service: 'repo-bridge', status: 'running', endpoints: ['/health', '/apply', '/read', '/list', '/copy', '/batchRead', '/dryRun', '/batch/read', '/github/dryrun'] });
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

  const hasPathContent = b.path && typeof b.content === 'string';
  const hasChanges = Array.isArray(b.changes) && b.changes.length > 0;

  // Enforce oneOf: reject if both path+content and changes[] are provided
  if (hasPathContent && hasChanges) {
    return { error: 'Provide either path+content (single file) or changes[] (multi-file), not both.' };
  }

  if (hasChanges) {
    if (b.changes.length === 1) {
      // Single-file shorthand: flatten into top-level fields
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
    // Multi-file: return all changes for batch processing
    return {
      owner: b.owner,
      repo: b.repo,
      branch,
      changes: b.changes,
      message: b.message,
      installationId: b.installationId,
      dryRun: b.dryRun,
      multi: true,
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

// Shared handler for dry-run preview
function handleDryRun(req, res) {
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
}

app.post('/dryRun', requireAuth, handleDryRun);
app.post('/github/dryrun', requireAuth, handleDryRun);

app.post('/apply', requireAuth, async (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);

    const { owner, repo, branch, message, installationId, dryRun } = b;

    // Multi-file apply
    if (b.multi && Array.isArray(b.changes)) {
      if (!owner || !repo || !message) {
        return badRequest(res, 'Required for multi-file: owner, repo, message, changes[{path, content}]');
      }
      if (!isRepoAllowed(owner, repo)) {
        return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
      }
      if (isRepoReadOnly(owner, repo)) {
        return res.status(403).json({ ok: false, error: 'RepoReadOnly', message: `Repository ${owner}/${repo} is configured as read-only` });
      }
      for (const c of b.changes) {
        if (!c.path || typeof c.content !== 'string') {
          return badRequest(res, 'Each change must have path and content(string)');
        }
        if (!isPathAllowed(c.path)) {
          return forbidden(res, `Path ${c.path} is not in the allowlist`);
        }
      }

      if (dryRun) {
        const { dryRunOneFile } = require('./github');
        const results = b.changes.map(c => dryRunOneFile({ owner, repo, branch, path: c.path, content: c.content, message }));
        return res.json({ ok: true, wouldApply: results.map(r => r.wouldApply) });
      }

      const { applyOneFile } = require('./github');
      const results = [];
      for (const c of b.changes) {
        const result = await applyOneFile({ owner, repo, branch, path: c.path, content: c.content, message, installationId });
        results.push(result);
      }
      return res.json({ ok: true, results });
    }

    // Single-file apply
    const { path, content } = b;

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

app.post('/list', requireAuth, async (req, res) => {
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
    const path = b.path || '';
    const installationId = b.installationId;

    if (!owner || !repo) {
      return badRequest(res, 'Required: owner, repo. Optional: path (defaults to root), branch (defaults to main)');
    }

    // Check allowlists
    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }

    const { listTree } = require('./github');
    const result = await listTree({ owner, repo, branch, path, installationId });
    return res.json(result);
  } catch (e) {
    const status = e?.status;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'Path not found' });
    }
    console.error(e);
    return res.status(500).json({ ok: false, error: 'ListFailed', message: e?.message || String(e) });
  }
});

/**
 * POST /copy - Copy a file from one repo to another in a single call.
 * Reads from source repo, writes to destination repo.
 *
 * Accepts field names in multiple formats for compatibility:
 *   v1.2.1 schema: sourceRepo, sourcePath, sourceBranch, destinationRepo, destinationPath, destinationBranch
 *   v1.2.0 schema: source (owner/repo), srcPath, srcBranch, destination (owner/repo), destPath, destBranch
 *   Verbose:       srcOwner+srcRepo, destOwner+destRepo
 */
app.post('/copy', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};

    // Parse source — accept sourceRepo (v1.2.1), source (v1.2.0), from, or srcOwner+srcRepo
    let srcOwner = b.srcOwner || b.sourceOwner;
    let srcRepo = b.srcRepo || b.sourceRepo;
    const sourceRepoField = b.sourceRepo || b.source || b.from;
    if (!srcOwner && typeof sourceRepoField === 'string' && sourceRepoField.includes('/')) {
      const [o, r] = sourceRepoField.split('/');
      srcOwner = o;
      srcRepo = r;
    }
    const srcBranch = b.srcBranch || b.sourceBranch || DEFAULT_BRANCH;
    const srcPath = b.srcPath || b.sourcePath;

    // Parse destination — accept destinationRepo (v1.2.1), destination (v1.2.0), to, or destOwner+destRepo
    let destOwner = b.destOwner || b.destinationOwner;
    let destRepo = b.destRepo || b.destinationRepo;
    const destRepoField = b.destinationRepo || b.destination || b.to;
    if (!destOwner && typeof destRepoField === 'string' && destRepoField.includes('/')) {
      const [o, r] = destRepoField.split('/');
      destOwner = o;
      destRepo = r;
    }
    const destBranch = b.destBranch || b.destinationBranch || DEFAULT_BRANCH;
    const destPath = b.destPath || b.destinationPath || srcPath;
    const message = b.message || `Copy ${srcPath} from ${srcOwner}/${srcRepo} to ${destOwner}/${destRepo}`;
    const installationId = b.installationId;

    // Validate
    if (!srcOwner || !srcRepo || !srcPath) {
      return badRequest(res, 'Required: sourceRepo (owner/repo), sourcePath. Accepts sourceRepo or source or srcOwner+srcRepo.');
    }
    if (!destOwner || !destRepo) {
      return badRequest(res, 'Required: destinationRepo (owner/repo). Accepts destinationRepo or destination or destOwner+destRepo.');
    }

    // Check allowlists
    if (!isRepoAllowed(srcOwner, srcRepo)) {
      return forbidden(res, `Source repository ${srcOwner}/${srcRepo} is not in the allowlist`);
    }
    if (!isRepoAllowed(destOwner, destRepo)) {
      return forbidden(res, `Destination repository ${destOwner}/${destRepo} is not in the allowlist`);
    }
    if (!isPathAllowed(destPath)) {
      return forbidden(res, `Destination path ${destPath} is not in the allowlist`);
    }
    if (isRepoReadOnly(destOwner, destRepo)) {
      return res.status(403).json({ ok: false, error: 'RepoReadOnly', message: `Destination repository ${destOwner}/${destRepo} is configured as read-only` });
    }

    const { readOneFile, applyOneFile } = require('./github');

    // Read from source
    const readResult = await readOneFile({ owner: srcOwner, repo: srcRepo, branch: srcBranch, path: srcPath, installationId });

    // Write to destination
    const applyResult = await applyOneFile({
      owner: destOwner,
      repo: destRepo,
      branch: destBranch,
      path: destPath,
      content: readResult.content,
      message,
      installationId,
    });

    return res.json({
      ok: true,
      copied: true,
      source: { owner: srcOwner, repo: srcRepo, branch: srcBranch, path: srcPath, sha: readResult.sha },
      destination: { ...applyResult },
    });
  } catch (e) {
    console.error(e);
    const status = e?.status;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'Source file not found' });
    }
    return res.status(500).json({ ok: false, error: 'CopyFailed', message: e?.message || String(e) });
  }
});

/**
 * POST /batchRead and /batch/read - Read multiple files from one or more repos in a single call.
 * Supports cross-repo reads for multi-repo analysis.
 * /batchRead is the canonical route (v1.2.1 schema), /batch/read is kept for backward compatibility.
 */
async function handleBatchRead(req, res) {
  try {
    const b = req.body || {};
    const files = b.files;

    if (!Array.isArray(files) || files.length === 0) {
      return badRequest(res, 'Required: files[] array with objects containing repo (owner/name) and path');
    }

    if (files.length > 10) {
      return badRequest(res, 'Maximum 10 files per batch read request');
    }

    // Validate all entries first
    const parsed = [];
    for (const f of files) {
      let owner = f.owner;
      let repo = f.repo;
      if (!owner && typeof repo === 'string' && repo.includes('/')) {
        const [o, r] = repo.split('/');
        owner = o;
        repo = r;
      }
      const branch = f.branch || DEFAULT_BRANCH;
      const path = f.path;

      if (!owner || !repo || !path) {
        return badRequest(res, `Each file must have repo (owner/name) and path. Got: ${JSON.stringify(f)}`);
      }
      if (!isRepoAllowed(owner, repo)) {
        return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
      }
      if (!isPathAllowed(path)) {
        return forbidden(res, `Path ${path} is not in the allowlist`);
      }
      parsed.push({ owner, repo, branch, path, installationId: f.installationId || b.installationId });
    }

    const { readOneFile } = require('./github');

    // Read all files concurrently
    const results = await Promise.allSettled(
      parsed.map(p => readOneFile(p))
    );

    const output = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      return {
        ok: false,
        owner: parsed[i].owner,
        repo: parsed[i].repo,
        path: parsed[i].path,
        error: r.reason?.message || 'ReadFailed',
      };
    });

    return res.json({ ok: true, files: output });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'BatchReadFailed', message: e?.message || String(e) });
  }
}

app.post('/batchRead', requireAuth, handleBatchRead);
app.post('/batch/read', requireAuth, handleBatchRead);

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'ServerError' });
});

app.listen(PORT, () => console.log(`repo-bridge listening on ${PORT}`));
