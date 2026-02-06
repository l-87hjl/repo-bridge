'use strict';

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const log = require('./logger');

// --- Configuration ---
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 30000;
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;
const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS) || 1000;

// Cache installation tokens to avoid re-authenticating on every request.
// Tokens are cached by installationId and expire after 50 minutes (GitHub tokens last 60).
const tokenCache = new Map();
const TOKEN_TTL_MS = 50 * 60 * 1000;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizePrivateKey(pem) {
  // Render/GitHub often store PEM with literal \n sequences
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

/**
 * Classify whether an error is transient (worth retrying).
 */
function isTransientError(err) {
  if (!err) return false;
  const status = err.status || err.response?.status;
  // 429 = rate limited, 500/502/503/504 = server errors
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  // Network-level errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, etc.)
  const code = err.code || '';
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;
  // aiohttp/fetch style: message contains "ClientResponseError" or network keywords
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('clientresponseerror') || msg.includes('socket hang up') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')) return true;
  return false;
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry + exponential backoff for transient errors.
 * @param {Function} fn - Async function to execute
 * @param {object} context - Logging context (operation, owner, repo, path)
 * @returns {Promise<*>} Result of fn()
 */
async function withRetry(fn, context = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isTransientError(err)) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn('Transient error, retrying', {
          ...context,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
          ...log.serializeError(err),
        });
        await sleep(delayMs);
      } else {
        // Non-transient or exhausted retries
        if (attempt > 0) {
          log.error('All retries exhausted', {
            ...context,
            totalAttempts: attempt + 1,
            ...log.serializeError(err),
          });
        }
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Create an Octokit client authenticated as a GitHub App installation.
 * Caches tokens per installationId to avoid redundant auth round-trips.
 */
async function getInstallationOctokit({ installationId } = {}) {
  const appId = requireEnv('GITHUB_APP_ID');
  const privateKey = normalizePrivateKey(requireEnv('GITHUB_PRIVATE_KEY'));
  const installId = installationId || process.env.GITHUB_INSTALLATION_ID;
  if (!installId) throw new Error('Missing installationId (param) or env GITHUB_INSTALLATION_ID');

  const cacheKey = String(installId);
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < TOKEN_TTL_MS) {
    log.debug('Using cached installation token', { installationId: cacheKey });
    return cached.octokit;
  }

  log.debug('Creating new installation token', { installationId: cacheKey });
  const auth = createAppAuth({
    appId,
    privateKey,
    installationId: Number(installId),
  });

  const { token } = await auth({ type: 'installation' });
  const octokit = new Octokit({
    auth: token,
    request: { timeout: REQUEST_TIMEOUT_MS },
  });

  tokenCache.set(cacheKey, { octokit, createdAt: Date.now() });
  return octokit;
}

/**
 * Get file SHA if it exists, else return null.
 */
async function getExistingFileSha(octokit, { owner, repo, path, branch }) {
  const context = { operation: 'getExistingFileSha', owner, repo, path, branch };
  try {
    const r = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
    if (r?.data && !Array.isArray(r.data) && r.data.sha) return r.data.sha;
    return null;
  } catch (e) {
    if (e && e.status === 404) return null;
    // Log permission errors explicitly instead of swallowing them
    if (e && e.status === 403) {
      log.warn('Permission denied while checking file SHA (may indicate GitHub App missing repo access)', {
        ...context,
        ...log.serializeError(e),
      });
    }
    throw e;
  }
}

/**
 * Apply (create/update) exactly one file on a repo/branch.
 */
async function applyOneFile({ owner, repo, branch, path, content, message, installationId }) {
  const context = { operation: 'applyOneFile', owner, repo, branch, path };
  log.info('Applying file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const sha = await withRetry(
    () => getExistingFileSha(octokit, { owner, repo, path, branch }),
    { ...context, step: 'getExistingFileSha' }
  );

  const r = await withRetry(
    () => octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
    { ...context, step: 'createOrUpdateFileContents' }
  );

  const durationMs = Date.now() - startMs;
  log.info('File applied successfully', { ...context, durationMs, created: !sha, updated: !!sha });

  return {
    committed: true,
    owner, repo, branch, path,
    created: !sha,
    updated: !!sha,
    commitSha: r?.data?.commit?.sha || null,
    contentSha: r?.data?.content?.sha || null,
  };
}

/**
 * Dry-run helper: returns what would be applied, but does NOT touch GitHub.
 * IMPORTANT: This function is intentionally pure/synchronous and makes NO API calls.
 */
function dryRunOneFile({ owner, repo, branch, path, content, message }) {
  return {
    ok: true,
    wouldApply: { owner, repo, branch, path, bytes: Buffer.byteLength(content || '', 'utf8'), message },
  };
}

/**
 * Read exactly one file from a repo/branch.
 * Returns decoded UTF-8 content.
 */
async function readOneFile({ owner, repo, branch, path, installationId }) {
  const context = { operation: 'readOneFile', owner, repo, branch, path };
  log.debug('Reading file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const r = await withRetry(
    () => octokit.rest.repos.getContent({ owner, repo, path, ref: branch }),
    context
  );

  if (!r || !r.data) throw new Error('Empty response from GitHub');
  if (Array.isArray(r.data)) {
    const err = new Error('Path is a directory, not a file');
    err.status = 400;
    throw err;
  }

  const encoding = r.data.encoding || 'base64';
  const raw = r.data.content || '';
  let content = raw;

  if (encoding === 'base64') {
    const cleaned = raw.replace(/\n/g, '');
    content = Buffer.from(cleaned, 'base64').toString('utf8');
  }

  const durationMs = Date.now() - startMs;
  log.debug('File read successfully', { ...context, durationMs, size: r.data.size });

  return {
    ok: true,
    owner, repo, branch, path,
    sha: r.data.sha || null,
    size: typeof r.data.size === 'number' ? r.data.size : null,
    content,
  };
}

/**
 * List the file tree of a repo/branch.
 */
async function listTree({ owner, repo, branch, path, installationId }) {
  const context = { operation: 'listTree', owner, repo, branch, path: path || '/' };
  log.debug('Listing tree', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });
  const targetPath = path || '';

  const r = await withRetry(
    () => octokit.rest.repos.getContent({ owner, repo, path: targetPath, ref: branch }),
    context
  );

  if (!r || !r.data) throw new Error('Empty response from GitHub');

  const durationMs = Date.now() - startMs;

  if (!Array.isArray(r.data)) {
    log.debug('Listed single file', { ...context, durationMs });
    return {
      ok: true, owner, repo, branch,
      path: targetPath || '/',
      entries: [{
        name: r.data.name,
        path: r.data.path,
        type: 'file',
        size: r.data.size || 0,
      }],
    };
  }

  const entries = r.data.map(item => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    size: item.size || 0,
  }));

  log.debug('Listed directory', { ...context, durationMs, entryCount: entries.length });

  return {
    ok: true, owner, repo, branch,
    path: targetPath || '/',
    entries,
  };
}

module.exports = {
  getInstallationOctokit,
  applyOneFile,
  dryRunOneFile,
  readOneFile,
  listTree,
  // Exported for testing
  isTransientError,
  withRetry,
};
