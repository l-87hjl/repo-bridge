'use strict';

const express = require('express');
const helmet = require('helmet');
const log = require('./logger');

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

// ─── Request logging middleware ───────────────────────────────────────────────
app.use((req, res, next) => {
  const requestId = log.generateRequestId();
  req.requestId = requestId;
  req.startTime = Date.now();

  // Attach requestId to response headers for client-side correlation
  res.setHeader('X-Request-Id', requestId);

  // Log when response finishes
  res.on('finish', () => {
    const durationMs = Date.now() - req.startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level]('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      contentLength: res.getHeader('content-length') || 0,
    });
  });

  next();
});

app.get('/', (req, res) => {
  res.json({
    service: 'repo-bridge',
    status: 'running',
    version: '0.4.0',
    endpoints: ['/health', '/apply', '/read', '/list', '/copy', '/batchRead', '/dryRun', '/batch/read', '/github/dryrun', '/compare', '/compareStructure', '/webhook'],
  });
});

app.get('/health', async (req, res) => {
  const health = {
    ok: true,
    service: 'repo-bridge',
    version: '0.4.0',
    time: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Optionally verify GitHub connectivity
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
    try {
      const { getInstallationOctokit } = require('./github');
      const octokit = await getInstallationOctokit();
      const { data } = await octokit.rest.rateLimit.get();
      health.github = {
        connected: true,
        rateLimit: {
          remaining: data.rate.remaining,
          limit: data.rate.limit,
          resetsAt: new Date(data.rate.reset * 1000).toISOString(),
        },
      };
    } catch (e) {
      health.github = { connected: false, error: e.message };
      health.ok = false;
    }
  }

  const statusCode = health.ok ? 200 : 503;
  res.status(statusCode).json(health);
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
 * Build a structured error response with diagnostic context.
 */
function errorResponse(res, statusCode, errorType, err, context = {}) {
  // Override status code for known GitHub error statuses
  const githubStatus = err?.status;
  if (githubStatus === 403 || githubStatus === 401) {
    statusCode = githubStatus;
  }

  const body = {
    ok: false,
    error: errorType,
    message: err?.message || String(err),
    requestId: context.requestId || null,
  };

  // Include diagnostic hints for common failures
  if (githubStatus === 403) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('resource not accessible') || msg.includes('not accessible by integration')) {
      body.hint = 'The GitHub App is not installed on this repository, or it lacks the required permissions. '
        + 'Go to GitHub > Settings > Developer settings > GitHub Apps > repo-bridge-app > Install App, '
        + 'and ensure this repository is selected.';
      body.diagnosis = 'GITHUB_APP_NOT_INSTALLED_ON_REPO';
    } else {
      body.hint = 'Access denied by GitHub. Check that the GitHub App is installed on this repository and has Contents:read permission.';
      body.diagnosis = 'GITHUB_PERMISSION_DENIED';
    }
  }
  if (githubStatus === 401) {
    body.hint = 'GitHub authentication failed. The installation token may have expired or the GitHub App credentials are misconfigured. Check GITHUB_APP_ID and GITHUB_PRIVATE_KEY.';
    body.diagnosis = 'GITHUB_AUTH_FAILED';
  }
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || (err?.message || '').toLowerCase().includes('clientresponseerror')) {
    body.hint = 'This is a transient network error. The request was retried automatically but all attempts failed. Try again in a few seconds.';
    body.transient = true;
    body.diagnosis = 'TRANSIENT_NETWORK_ERROR';
  }
  if (githubStatus === 429) {
    body.hint = 'GitHub API rate limit exceeded. Wait for the rate limit to reset before retrying.';
    body.transient = true;
    body.diagnosis = 'RATE_LIMIT_EXCEEDED';
  }
  log.error(`${errorType} response`, {
    requestId: context.requestId,
    statusCode,
    ...log.serializeError(err),
    ...context,
  });
  return res.status(statusCode).json(body);
}

/**
 * Auth middleware: requires Bearer token if API_AUTH_TOKEN is set.
 */
function requireAuth(req, res, next) {
  if (!API_AUTH_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or invalid Authorization header. Use: Bearer <token>');
  }

  const token = authHeader.slice(7);
  if (token !== API_AUTH_TOKEN) {
    return unauthorized(res, 'Invalid auth token');
  }

  next();
}

/**
 * Check if a repo is in the allowlist.
 */
function isRepoAllowed(owner, repo) {
  if (!ALLOWED_REPOS) return true;
  const fullName = `${owner}/${repo}`.toLowerCase();
  return ALLOWED_REPOS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(fullName);
    }
    return pattern === fullName;
  });
}

/**
 * Check if a path is in the allowlist.
 */
function isPathAllowed(filePath) {
  if (!ALLOWED_PATHS) return true;
  return ALLOWED_PATHS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }
    return filePath === pattern || filePath.startsWith(pattern.endsWith('/') ? pattern : pattern + '/');
  });
}

/**
 * Check if a repo is configured as read-only.
 */
function isRepoReadOnly(owner, repo) {
  if (READ_ONLY_REPOS.length === 0) return false;
  const fullName = `${owner}/${repo}`.toLowerCase();
  return READ_ONLY_REPOS.includes(fullName);
}

/**
 * Parse owner/repo from flexible input formats.
 */
function parseOwnerRepo(body) {
  let owner = body.owner;
  let repo = body.repo;
  if (!owner && typeof repo === 'string' && repo.includes('/')) {
    const [o, r] = repo.split('/');
    owner = o;
    repo = r;
  }
  return { owner, repo };
}

function normalizeApplyBody(body) {
  const b = body || {};

  if (!b.owner && typeof b.repo === 'string' && b.repo.includes('/')) {
    const [o, r] = b.repo.split('/');
    b.owner = o;
    b.repo = r;
  }

  const branch = b.branch || DEFAULT_BRANCH;

  const hasPathContent = b.path && typeof b.content === 'string';
  const hasChanges = Array.isArray(b.changes) && b.changes.length > 0;

  if (hasPathContent && hasChanges) {
    return { error: 'Provide either path+content (single file) or changes[] (multi-file), not both.' };
  }

  if (hasChanges) {
    if (b.changes.length === 1) {
      const c0 = b.changes[0] || {};
      return {
        owner: b.owner, repo: b.repo, branch,
        path: c0.path, content: c0.content,
        message: b.message, installationId: b.installationId, dryRun: b.dryRun,
      };
    }
    return {
      owner: b.owner, repo: b.repo, branch,
      changes: b.changes, message: b.message,
      installationId: b.installationId, dryRun: b.dryRun, multi: true,
    };
  }

  return {
    owner: b.owner, repo: b.repo, branch,
    path: b.path, content: b.content,
    message: b.message, installationId: b.installationId, dryRun: b.dryRun,
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

    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }
    if (!isPathAllowed(path)) {
      return forbidden(res, `Path ${path} is not in the allowlist`);
    }

    const { dryRunOneFile } = require('./github');
    return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
  } catch (e) {
    return errorResponse(res, 500, 'ServerError', e, { requestId: req.requestId });
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

    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }
    if (!isPathAllowed(path)) {
      return forbidden(res, `Path ${path} is not in the allowlist`);
    }

    if (isRepoReadOnly(owner, repo)) {
      return res.status(403).json({
        ok: false,
        error: 'RepoReadOnly',
        message: `Repository ${owner}/${repo} is configured as read-only`
      });
    }

    if (dryRun) {
      const { dryRunOneFile } = require('./github');
      return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
    }

    const { applyOneFile } = require('./github');
    const result = await applyOneFile({ owner, repo, branch, path, content, message, installationId });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(res, 500, 'ApplyFailed', e, { requestId: req.requestId });
  }
});

app.post('/read', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const { owner, repo } = parseOwnerRepo(b);
    const branch = b.branch || DEFAULT_BRANCH;
    const path = b.path;
    const installationId = b.installationId;

    if (!owner || !repo || !path) {
      return badRequest(res, 'Required: owner, repo, path. Optional: branch (defaults to main)');
    }

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
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'File not found. Verify the path exists by calling /list first.', requestId: req.requestId });
    }
    if (status === 400) {
      return res.status(400).json({ ok: false, error: 'BadRequest', message: e?.message || String(e), requestId: req.requestId });
    }
    return errorResponse(res, 500, 'ReadFailed', e, { requestId: req.requestId, owner: b.owner || b.repo, path: b.path });
  }
});

app.post('/list', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const { owner, repo } = parseOwnerRepo(b);
    const branch = b.branch || DEFAULT_BRANCH;
    const path = b.path || '';
    const installationId = b.installationId;

    if (!owner || !repo) {
      return badRequest(res, 'Required: owner, repo. Optional: path (defaults to root), branch (defaults to main)');
    }

    if (!isRepoAllowed(owner, repo)) {
      return forbidden(res, `Repository ${owner}/${repo} is not in the allowlist`);
    }

    const { listTree } = require('./github');
    const result = await listTree({ owner, repo, branch, path, installationId });
    return res.json(result);
  } catch (e) {
    const status = e?.status;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'Path not found. Check that the branch exists and the path is correct.', requestId: req.requestId });
    }
    return errorResponse(res, 500, 'ListFailed', e, { requestId: req.requestId, owner: b.owner || b.repo, path: b.path });
  }
});

/**
 * POST /copy - Copy a file from one repo to another in a single call.
 */
app.post('/copy', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};

    // Parse source
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

    // Parse destination
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

    if (!srcOwner || !srcRepo || !srcPath) {
      return badRequest(res, 'Required: sourceRepo (owner/repo), sourcePath. Accepts sourceRepo or source or srcOwner+srcRepo.');
    }
    if (!destOwner || !destRepo) {
      return badRequest(res, 'Required: destinationRepo (owner/repo). Accepts destinationRepo or destination or destOwner+destRepo.');
    }

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

    const readResult = await readOneFile({ owner: srcOwner, repo: srcRepo, branch: srcBranch, path: srcPath, installationId });

    const applyResult = await applyOneFile({
      owner: destOwner, repo: destRepo, branch: destBranch,
      path: destPath, content: readResult.content, message, installationId,
    });

    return res.json({
      ok: true,
      copied: true,
      source: { owner: srcOwner, repo: srcRepo, branch: srcBranch, path: srcPath, sha: readResult.sha },
      destination: { ...applyResult },
    });
  } catch (e) {
    const status = e?.status;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'Source file not found', requestId: req.requestId });
    }
    return errorResponse(res, 500, 'CopyFailed', e, { requestId: req.requestId });
  }
});

/**
 * POST /batchRead and /batch/read - Read multiple files from one or more repos in a single call.
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

    const parsed = [];
    for (const f of files) {
      const { owner, repo } = parseOwnerRepo(f);
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
    return errorResponse(res, 500, 'BatchReadFailed', e, { requestId: req.requestId });
  }
}

app.post('/batchRead', requireAuth, handleBatchRead);
app.post('/batch/read', requireAuth, handleBatchRead);

// ─── Compare endpoints ───────────────────────────────────────────────────────

/**
 * POST /compare - Compare a single file between two repos or branches.
 *
 * Returns both file contents plus a line-by-line diff summary.
 * This solves the "no diff endpoint" limitation documented in MULTI_REPO_GUIDE.md.
 *
 * Body:
 *   source:  { repo: "owner/repo", path: "file.txt", branch?: "main" }
 *   target:  { repo: "owner/repo", path: "file.txt", branch?: "main" }
 *   options?: { includeContent?: boolean }  // defaults to true
 */
app.post('/compare', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const source = b.source || {};
    const target = b.target || {};
    const options = b.options || {};
    const includeContent = options.includeContent !== false;

    // Parse source
    const src = parseOwnerRepo(source);
    const srcBranch = source.branch || DEFAULT_BRANCH;
    const srcPath = source.path;

    // Parse target
    const tgt = parseOwnerRepo(target);
    const tgtBranch = target.branch || DEFAULT_BRANCH;
    const tgtPath = target.path || srcPath;

    if (!src.owner || !src.repo || !srcPath) {
      return badRequest(res, 'Required: source.repo (owner/repo), source.path');
    }
    if (!tgt.owner || !tgt.repo) {
      return badRequest(res, 'Required: target.repo (owner/repo). target.path defaults to source.path if omitted.');
    }

    // Allowlist checks
    if (!isRepoAllowed(src.owner, src.repo)) {
      return forbidden(res, `Source repository ${src.owner}/${src.repo} is not in the allowlist`);
    }
    if (!isRepoAllowed(tgt.owner, tgt.repo)) {
      return forbidden(res, `Target repository ${tgt.owner}/${tgt.repo} is not in the allowlist`);
    }
    if (!isPathAllowed(srcPath)) {
      return forbidden(res, `Source path ${srcPath} is not in the allowlist`);
    }
    if (!isPathAllowed(tgtPath)) {
      return forbidden(res, `Target path ${tgtPath} is not in the allowlist`);
    }

    const { readOneFile } = require('./github');
    const installationId = b.installationId;

    // Read both files concurrently
    const [srcResult, tgtResult] = await Promise.allSettled([
      readOneFile({ owner: src.owner, repo: src.repo, branch: srcBranch, path: srcPath, installationId }),
      readOneFile({ owner: tgt.owner, repo: tgt.repo, branch: tgtBranch, path: tgtPath, installationId }),
    ]);

    const srcOk = srcResult.status === 'fulfilled';
    const tgtOk = tgtResult.status === 'fulfilled';

    if (!srcOk && !tgtOk) {
      return res.status(404).json({
        ok: false,
        error: 'BothFilesNotFound',
        message: 'Neither source nor target file could be read',
        source: { error: srcResult.reason?.message },
        target: { error: tgtResult.reason?.message },
        requestId: req.requestId,
      });
    }

    const srcContent = srcOk ? srcResult.value.content : null;
    const tgtContent = tgtOk ? tgtResult.value.content : null;

    // Compute diff summary
    const diff = computeLineDiff(srcContent, tgtContent);

    const response = {
      ok: true,
      identical: srcContent === tgtContent,
      source: {
        repo: `${src.owner}/${src.repo}`,
        branch: srcBranch,
        path: srcPath,
        exists: srcOk,
        sha: srcOk ? srcResult.value.sha : null,
        size: srcOk ? srcResult.value.size : null,
        ...(srcOk && !srcOk ? {} : {}),
        ...((!srcOk) ? { error: srcResult.reason?.message } : {}),
      },
      target: {
        repo: `${tgt.owner}/${tgt.repo}`,
        branch: tgtBranch,
        path: tgtPath,
        exists: tgtOk,
        sha: tgtOk ? tgtResult.value.sha : null,
        size: tgtOk ? tgtResult.value.size : null,
        ...((!tgtOk) ? { error: tgtResult.reason?.message } : {}),
      },
      diff,
    };

    if (includeContent) {
      response.source.content = srcContent;
      response.target.content = tgtContent;
    }

    return res.json(response);
  } catch (e) {
    return errorResponse(res, 500, 'CompareFailed', e, { requestId: req.requestId });
  }
});

/**
 * POST /compareStructure - Compare directory structures between two repos.
 *
 * Returns which files/dirs exist only in source, only in target, or in both.
 *
 * Body:
 *   source: { repo: "owner/repo", path?: "", branch?: "main" }
 *   target: { repo: "owner/repo", path?: "", branch?: "main" }
 */
app.post('/compareStructure', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const source = b.source || {};
    const target = b.target || {};

    const src = parseOwnerRepo(source);
    const srcBranch = source.branch || DEFAULT_BRANCH;
    const srcPath = source.path || '';

    const tgt = parseOwnerRepo(target);
    const tgtBranch = target.branch || DEFAULT_BRANCH;
    const tgtPath = target.path || '';

    if (!src.owner || !src.repo) {
      return badRequest(res, 'Required: source.repo (owner/repo)');
    }
    if (!tgt.owner || !tgt.repo) {
      return badRequest(res, 'Required: target.repo (owner/repo)');
    }

    if (!isRepoAllowed(src.owner, src.repo)) {
      return forbidden(res, `Source repository ${src.owner}/${src.repo} is not in the allowlist`);
    }
    if (!isRepoAllowed(tgt.owner, tgt.repo)) {
      return forbidden(res, `Target repository ${tgt.owner}/${tgt.repo} is not in the allowlist`);
    }

    const { listTree } = require('./github');
    const installationId = b.installationId;

    const [srcResult, tgtResult] = await Promise.allSettled([
      listTree({ owner: src.owner, repo: src.repo, branch: srcBranch, path: srcPath, installationId }),
      listTree({ owner: tgt.owner, repo: tgt.repo, branch: tgtBranch, path: tgtPath, installationId }),
    ]);

    const srcOk = srcResult.status === 'fulfilled';
    const tgtOk = tgtResult.status === 'fulfilled';

    if (!srcOk && !tgtOk) {
      return res.status(404).json({
        ok: false,
        error: 'BothPathsNotFound',
        message: 'Neither source nor target path could be listed',
        requestId: req.requestId,
      });
    }

    const srcEntries = srcOk ? srcResult.value.entries : [];
    const tgtEntries = tgtOk ? tgtResult.value.entries : [];

    const srcMap = new Map(srcEntries.map(e => [e.name, e]));
    const tgtMap = new Map(tgtEntries.map(e => [e.name, e]));

    const onlyInSource = [];
    const onlyInTarget = [];
    const inBoth = [];
    const sizeDifferences = [];

    for (const [name, entry] of srcMap) {
      if (tgtMap.has(name)) {
        const tgtEntry = tgtMap.get(name);
        inBoth.push({ name, type: entry.type, sourceSize: entry.size, targetSize: tgtEntry.size });
        if (entry.type === 'file' && tgtEntry.type === 'file' && entry.size !== tgtEntry.size) {
          sizeDifferences.push({ name, sourceSize: entry.size, targetSize: tgtEntry.size });
        }
      } else {
        onlyInSource.push({ name, type: entry.type, size: entry.size });
      }
    }

    for (const [name, entry] of tgtMap) {
      if (!srcMap.has(name)) {
        onlyInTarget.push({ name, type: entry.type, size: entry.size });
      }
    }

    return res.json({
      ok: true,
      source: {
        repo: `${src.owner}/${src.repo}`,
        branch: srcBranch,
        path: srcPath || '/',
        exists: srcOk,
        entryCount: srcEntries.length,
        ...((!srcOk) ? { error: srcResult.reason?.message } : {}),
      },
      target: {
        repo: `${tgt.owner}/${tgt.repo}`,
        branch: tgtBranch,
        path: tgtPath || '/',
        exists: tgtOk,
        entryCount: tgtEntries.length,
        ...((!tgtOk) ? { error: tgtResult.reason?.message } : {}),
      },
      comparison: {
        identical: onlyInSource.length === 0 && onlyInTarget.length === 0 && sizeDifferences.length === 0,
        onlyInSource,
        onlyInTarget,
        inBoth,
        sizeDifferences,
      },
    });
  } catch (e) {
    return errorResponse(res, 500, 'CompareStructureFailed', e, { requestId: req.requestId });
  }
});

// ─── Diff utility ─────────────────────────────────────────────────────────────

/**
 * Compute a line-by-line diff summary between two strings.
 * Returns added/removed/changed counts and the actual diff lines.
 * Keeps output bounded: if diff is very large, truncates with a note.
 */
function computeLineDiff(sourceContent, targetContent) {
  if (sourceContent === null && targetContent === null) {
    return { status: 'both_missing', added: 0, removed: 0, unchanged: 0, lines: [] };
  }
  if (sourceContent === null) {
    const lines = (targetContent || '').split('\n');
    return { status: 'source_missing', added: lines.length, removed: 0, unchanged: 0, lines: lines.slice(0, 200).map(l => ({ op: 'add', line: l })) };
  }
  if (targetContent === null) {
    const lines = (sourceContent || '').split('\n');
    return { status: 'target_missing', added: 0, removed: lines.length, unchanged: 0, lines: lines.slice(0, 200).map(l => ({ op: 'remove', line: l })) };
  }
  if (sourceContent === targetContent) {
    return { status: 'identical', added: 0, removed: 0, unchanged: sourceContent.split('\n').length, lines: [] };
  }

  const srcLines = sourceContent.split('\n');
  const tgtLines = targetContent.split('\n');

  // Simple LCS-based diff for reasonable-sized files
  // For very large files, fall back to summary-only
  const MAX_DIFF_LINES = 500;
  if (srcLines.length > MAX_DIFF_LINES || tgtLines.length > MAX_DIFF_LINES) {
    return computeLargeDiffSummary(srcLines, tgtLines);
  }

  const diffLines = [];
  let added = 0, removed = 0, unchanged = 0;

  // Simple line-by-line comparison using longest common subsequence approach
  const lcs = computeLCS(srcLines, tgtLines);
  let si = 0, ti = 0, li = 0;

  while (si < srcLines.length || ti < tgtLines.length) {
    if (li < lcs.length && si < srcLines.length && ti < tgtLines.length && srcLines[si] === lcs[li] && tgtLines[ti] === lcs[li]) {
      unchanged++;
      si++;
      ti++;
      li++;
    } else if (si < srcLines.length && (li >= lcs.length || srcLines[si] !== lcs[li])) {
      diffLines.push({ op: 'remove', lineNum: si + 1, line: srcLines[si] });
      removed++;
      si++;
    } else if (ti < tgtLines.length) {
      diffLines.push({ op: 'add', lineNum: ti + 1, line: tgtLines[ti] });
      added++;
      ti++;
    }
  }

  return {
    status: 'different',
    added,
    removed,
    unchanged,
    lines: diffLines.slice(0, 200),
    ...(diffLines.length > 200 ? { truncated: true, totalChanges: diffLines.length } : {}),
  };
}

/**
 * For large files, just compute summary stats without full diff lines.
 */
function computeLargeDiffSummary(srcLines, tgtLines) {
  const srcSet = new Set(srcLines);
  const tgtSet = new Set(tgtLines);
  let onlyInSource = 0, onlyInTarget = 0, shared = 0;

  for (const line of srcLines) {
    if (tgtSet.has(line)) shared++;
    else onlyInSource++;
  }
  for (const line of tgtLines) {
    if (!srcSet.has(line)) onlyInTarget++;
  }

  return {
    status: 'different',
    added: onlyInTarget,
    removed: onlyInSource,
    unchanged: shared,
    lines: [],
    truncated: true,
    note: `Files too large for line-by-line diff (${srcLines.length} vs ${tgtLines.length} lines). Summary only.`,
  };
}

/**
 * Compute longest common subsequence of two string arrays.
 * Uses standard DP approach, bounded for performance.
 */
function computeLCS(a, b) {
  const m = a.length, n = b.length;
  // For very large inputs, skip full LCS
  if (m * n > 250000) return [];

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

// ─── GitHub webhook handler ───────────────────────────────────────────────────
// repo-bridge is pull-based (agent calls us, we call GitHub), so it does NOT
// require webhooks. However, if you configure a webhook URL in your GitHub App
// settings, GitHub will POST events here. We accept them gracefully to avoid
// failed-delivery warnings in your App's Advanced tab.

function handleWebhook(req, res) {
  const event = req.headers['x-github-event'] || 'unknown';
  const deliveryId = req.headers['x-github-delivery'] || 'unknown';
  log.info('Webhook received (acknowledged, not processed)', {
    event,
    deliveryId,
    action: req.body?.action || null,
  });
  // Return 200 so GitHub marks the delivery as successful
  res.status(200).json({ ok: true, event, message: 'Webhook acknowledged. repo-bridge is pull-based and does not process webhook events.' });
}

// Accept webhooks at both paths — GitHub App is configured to POST to /github/webhook
app.post('/webhook', handleWebhook);
app.post('/github/webhook', handleWebhook);

// ─── Catch-all and error handler ──────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, _next) => {
  log.error('Unhandled server error', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ...log.serializeError(err),
  });
  res.status(500).json({ ok: false, error: 'ServerError', requestId: req.requestId });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let server;

function shutdown(signal) {
  log.info(`Received ${signal}, shutting down gracefully`);
  if (server) {
    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => {
      log.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server = app.listen(PORT, () => {
  log.info('repo-bridge started', { port: PORT, version: '0.4.0' });
});
