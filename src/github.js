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

/**
 * Invalidate cached token for an installation.
 * Called when we get a 403 that might be due to a stale token scope
 * (e.g., repos added to installation after token was generated).
 */
function invalidateTokenCache(installationId) {
  const key = String(installationId || process.env.GITHUB_INSTALLATION_ID);
  if (tokenCache.has(key)) {
    log.info('Invalidating cached token', { installationId: key });
    tokenCache.delete(key);
  }
}

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
 * If expectedSha is provided, verifies the file's current SHA matches before writing.
 * This prevents accidental overwrites if the file changed since it was last read.
 */
async function applyOneFile({ owner, repo, branch, path, content, message, installationId, expectedSha }) {
  const context = { operation: 'applyOneFile', owner, repo, branch, path };
  log.info('Applying file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const sha = await withRetry(
    () => getExistingFileSha(octokit, { owner, repo, path, branch }),
    { ...context, step: 'getExistingFileSha' }
  );

  // SHA guard: if expectedSha is provided, verify it matches the current file SHA
  if (expectedSha) {
    if (!sha) {
      const err = new Error(`SHA guard failed: file does not exist but expectedSha was provided (${expectedSha}). The file may have been deleted.`);
      err.status = 409;
      throw err;
    }
    if (sha !== expectedSha) {
      const err = new Error(`SHA guard failed: file has been modified since last read. Expected SHA ${expectedSha}, found ${sha}. Re-read the file and try again.`);
      err.status = 409;
      throw err;
    }
    log.debug('SHA guard passed', { ...context, expectedSha, currentSha: sha });
  }

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
    previousSha: sha || null,
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
async function readOneFile({ owner, repo, branch, path, installationId, _retryOnAuth = true }) {
  const context = { operation: 'readOneFile', owner, repo, branch, path };
  log.debug('Reading file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  let r;
  try {
    r = await withRetry(
      () => octokit.rest.repos.getContent({ owner, repo, path, ref: branch }),
      context
    );
  } catch (e) {
    // On 403, the cached token may be scoped to an older set of repos.
    // Invalidate cache and retry once with a fresh token.
    if (e.status === 403 && _retryOnAuth) {
      log.warn('Got 403, invalidating token cache and retrying with fresh token', context);
      invalidateTokenCache(installationId);
      return readOneFile({ owner, repo, branch, path, installationId, _retryOnAuth: false });
    }
    throw e;
  }

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
async function listTree({ owner, repo, branch, path, installationId, _retryOnAuth = true }) {
  const context = { operation: 'listTree', owner, repo, branch, path: path || '/' };
  log.debug('Listing tree', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });
  const targetPath = path || '';

  let r;
  try {
    r = await withRetry(
      () => octokit.rest.repos.getContent({ owner, repo, path: targetPath, ref: branch }),
      context
    );
  } catch (e) {
    if (e.status === 403 && _retryOnAuth) {
      log.warn('Got 403, invalidating token cache and retrying with fresh token', context);
      invalidateTokenCache(installationId);
      return listTree({ owner, repo, branch, path, installationId, _retryOnAuth: false });
    }
    throw e;
  }

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

/**
 * Patch a file in-place: read current content, apply operations, write result.
 * Supports two modes:
 *   1. Search-and-replace operations: [{ search, replace, replaceAll? }]
 *   2. Unified diff patch string
 *
 * Returns commit info plus a summary of what changed.
 */
async function patchOneFile({ owner, repo, branch, path, operations, patch, message, installationId }) {
  const context = { operation: 'patchOneFile', owner, repo, branch, path };
  log.info('Patching file', context);
  const startMs = Date.now();

  // Read the current file
  const current = await readOneFile({ owner, repo, branch, path, installationId });
  let content = current.content;
  const originalContent = content;
  const appliedOps = [];

  if (operations && Array.isArray(operations)) {
    // Mode 1: Search-and-replace operations
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op.search || typeof op.search !== 'string') {
        const err = new Error(`Operation ${i}: 'search' must be a non-empty string`);
        err.status = 400;
        throw err;
      }
      if (typeof op.replace !== 'string') {
        const err = new Error(`Operation ${i}: 'replace' must be a string`);
        err.status = 400;
        throw err;
      }

      const before = content;
      if (op.replaceAll) {
        content = content.split(op.search).join(op.replace);
      } else {
        const idx = content.indexOf(op.search);
        if (idx === -1) {
          const err = new Error(`Operation ${i}: search string not found in file. Search: ${JSON.stringify(op.search.substring(0, 100))}${op.search.length > 100 ? '...' : ''}`);
          err.status = 409;
          throw err;
        }
        content = content.substring(0, idx) + op.replace + content.substring(idx + op.search.length);
      }

      const changed = before !== content;
      appliedOps.push({
        index: i,
        applied: changed,
        searchLength: op.search.length,
        replaceLength: op.replace.length,
      });
    }
  } else if (patch && typeof patch === 'string') {
    // Mode 2: Unified diff patch
    const patchResult = applyUnifiedDiff(content, patch);
    if (!patchResult.ok) {
      const err = new Error(`Patch failed: ${patchResult.error}`);
      err.status = 409;
      throw err;
    }
    content = patchResult.content;
    appliedOps.push({ type: 'unified_diff', hunksApplied: patchResult.hunksApplied });
  } else {
    const err = new Error('Provide either operations[] (search-and-replace) or patch (unified diff string)');
    err.status = 400;
    throw err;
  }

  if (content === originalContent) {
    const durationMs = Date.now() - startMs;
    log.info('Patch resulted in no changes', { ...context, durationMs });
    return {
      ok: true,
      committed: false,
      noChange: true,
      owner, repo, branch, path,
      message: 'Patch produced no changes to file content',
      operations: appliedOps,
    };
  }

  // Write the patched content
  const octokit = await getInstallationOctokit({ installationId });
  const sha = current.sha;

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
  log.info('File patched successfully', { ...context, durationMs });

  return {
    ok: true,
    committed: true,
    owner, repo, branch, path,
    previousSha: current.sha,
    commitSha: r?.data?.commit?.sha || null,
    contentSha: r?.data?.content?.sha || null,
    operations: appliedOps,
  };
}

/**
 * Apply a unified diff patch to file content.
 * Supports standard unified diff format with @@ hunk headers.
 * Verifies context lines match for safety.
 */
function applyUnifiedDiff(content, patch) {
  const lines = content.split('\n');
  const patchLines = patch.split('\n');
  let hunksApplied = 0;

  // Parse hunks from the patch
  const hunks = [];
  let currentHunk = null;

  for (const pline of patchLines) {
    // Skip file headers (--- a/file, +++ b/file)
    if (pline.startsWith('--- ') || pline.startsWith('+++ ') || pline.startsWith('diff ') || pline.startsWith('index ')) {
      continue;
    }

    const hunkMatch = pline.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      if (pline.startsWith('+') || pline.startsWith('-') || pline.startsWith(' ') || pline === '') {
        currentHunk.lines.push(pline);
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  if (hunks.length === 0) {
    return { ok: false, error: 'No valid hunks found in patch. Expected @@ -start,count +start,count @@ format.' };
  }

  // Apply hunks in reverse order so line numbers stay valid
  const result = [...lines];
  const reversedHunks = [...hunks].reverse();

  for (const hunk of reversedHunks) {
    const startIdx = hunk.oldStart - 1; // Convert 1-based to 0-based

    // Verify context lines match
    const oldLines = [];
    const newLines = [];

    for (const hl of hunk.lines) {
      if (hl.startsWith('-')) {
        oldLines.push(hl.substring(1));
      } else if (hl.startsWith('+')) {
        newLines.push(hl.substring(1));
      } else if (hl.startsWith(' ')) {
        oldLines.push(hl.substring(1));
        newLines.push(hl.substring(1));
      } else if (hl === '') {
        // Empty line in diff = context empty line
        oldLines.push('');
        newLines.push('');
      }
    }

    // Verify old lines match current content
    for (let i = 0; i < oldLines.length; i++) {
      const lineIdx = startIdx + i;
      if (lineIdx >= result.length) {
        return { ok: false, error: `Hunk at line ${hunk.oldStart}: file has ${result.length} lines but hunk expects line ${lineIdx + 1}` };
      }
      if (result[lineIdx] !== oldLines[i]) {
        return {
          ok: false,
          error: `Context mismatch at line ${lineIdx + 1}: expected ${JSON.stringify(oldLines[i])}, found ${JSON.stringify(result[lineIdx])}. File may have changed since patch was created.`,
        };
      }
    }

    // Apply: replace old lines with new lines
    result.splice(startIdx, oldLines.length, ...newLines);
    hunksApplied++;
  }

  return { ok: true, content: result.join('\n'), hunksApplied };
}

/**
 * Append content to an existing file (or create with content if new).
 * Reads current content, appends new content, writes back.
 */
async function appendToFile({ owner, repo, branch, path, content, separator, message, installationId }) {
  const context = { operation: 'appendToFile', owner, repo, branch, path };
  log.info('Appending to file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });
  let existingContent = '';
  let sha = null;

  // Try to read existing file
  try {
    const current = await readOneFile({ owner, repo, branch, path, installationId });
    existingContent = current.content;
    sha = current.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
    // File doesn't exist yet — will create it
  }

  const sep = typeof separator === 'string' ? separator : '\n';
  const newContent = existingContent ? existingContent + sep + content : content;

  const r = await withRetry(
    () => octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(newContent, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
    { ...context, step: 'createOrUpdateFileContents' }
  );

  const durationMs = Date.now() - startMs;
  log.info('File appended successfully', { ...context, durationMs, created: !sha });

  return {
    ok: true,
    committed: true,
    owner, repo, branch, path,
    created: !sha,
    appended: !!sha,
    previousSize: Buffer.byteLength(existingContent, 'utf8'),
    newSize: Buffer.byteLength(newContent, 'utf8'),
    commitSha: r?.data?.commit?.sha || null,
    contentSha: r?.data?.content?.sha || null,
  };
}

module.exports = {
  getInstallationOctokit,
  applyOneFile,
  dryRunOneFile,
  readOneFile,
  listTree,
  patchOneFile,
  appendToFile,
  invalidateTokenCache,
  // Exported for testing
  isTransientError,
  withRetry,
  applyUnifiedDiff,
};
