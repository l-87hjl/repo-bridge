'use strict';

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const log = require('./logger');
const { normalizeContent, searchContent, findSymbols, buildLineReference } = require('./normalize');

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
    const result = applySearchReplace(content, operations);
    content = result.content;
    appliedOps.push(...result.operations);
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
 * Pure search-and-replace engine. Applies operations[] to content string.
 * Returns { content, operations } or throws on validation/conflict.
 */
function applySearchReplace(content, operations) {
  const appliedOps = [];
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

    appliedOps.push({
      index: i,
      applied: before !== content,
      searchLength: op.search.length,
      replaceLength: op.replace.length,
    });
  }
  return { content, operations: appliedOps };
}

/**
 * Single-purpose: apply search-and-replace operations, read file, commit result.
 * No conditional input — accepts only operations[].
 */
async function patchReplace({ owner, repo, branch, path, operations, message, installationId }) {
  const context = { operation: 'patchReplace', owner, repo, branch, path };
  log.info('Applying search-and-replace patch', context);
  const startMs = Date.now();

  const current = await readOneFile({ owner, repo, branch, path, installationId });
  const result = applySearchReplace(current.content, operations);

  if (result.content === current.content) {
    const durationMs = Date.now() - startMs;
    log.info('Patch resulted in no changes', { ...context, durationMs });
    return {
      success: true,
      committed: false,
      path, branch,
      message: 'Patch produced no changes to file content',
    };
  }

  const octokit = await getInstallationOctokit({ installationId });
  const r = await withRetry(
    () => octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(result.content, 'utf8').toString('base64'),
      branch,
      ...(current.sha ? { sha: current.sha } : {}),
    }),
    { ...context, step: 'createOrUpdateFileContents' }
  );

  const durationMs = Date.now() - startMs;
  log.info('Search-and-replace patch committed', { ...context, durationMs });

  return {
    success: true,
    committed: true,
    path, branch,
    commitSha: r?.data?.commit?.sha || null,
  };
}

/**
 * Single-purpose: apply a unified diff patch, read file, commit result.
 * No conditional input — accepts only a patch string.
 */
async function patchDiff({ owner, repo, branch, path, patch, message, installationId }) {
  const context = { operation: 'patchDiff', owner, repo, branch, path };
  log.info('Applying unified diff patch', context);
  const startMs = Date.now();

  const current = await readOneFile({ owner, repo, branch, path, installationId });
  const patchResult = applyUnifiedDiff(current.content, patch);
  if (!patchResult.ok) {
    const err = new Error(`Patch failed: ${patchResult.error}`);
    err.status = 409;
    throw err;
  }

  if (patchResult.content === current.content) {
    const durationMs = Date.now() - startMs;
    log.info('Diff patch resulted in no changes', { ...context, durationMs });
    return {
      success: true,
      committed: false,
      path, branch,
      message: 'Diff produced no changes to file content',
    };
  }

  const octokit = await getInstallationOctokit({ installationId });
  const r = await withRetry(
    () => octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(patchResult.content, 'utf8').toString('base64'),
      branch,
      ...(current.sha ? { sha: current.sha } : {}),
    }),
    { ...context, step: 'createOrUpdateFileContents' }
  );

  const durationMs = Date.now() - startMs;
  log.info('Diff patch committed', { ...context, durationMs });

  return {
    success: true,
    committed: true,
    path, branch,
    commitSha: r?.data?.commit?.sha || null,
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

/**
 * Get the full recursive tree of a repo/branch in a single GitHub API call.
 * Uses the Git Trees API with recursive=1 for O(1) traversal.
 * Returns flat list of all files with paths, SHAs, sizes, and types.
 */
async function getRepoTree({ owner, repo, branch, installationId }) {
  const context = { operation: 'getRepoTree', owner, repo, branch };
  log.info('Fetching recursive repo tree', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  // Get the branch ref to find the tree SHA
  const refData = await withRetry(
    () => octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
    { ...context, step: 'getRef' }
  );
  const commitSha = refData.data.object.sha;

  // Fetch the full recursive tree
  const treeData = await withRetry(
    () => octokit.rest.git.getTree({ owner, repo, tree_sha: commitSha, recursive: '1' }),
    { ...context, step: 'getTree' }
  );

  const entries = treeData.data.tree.map(item => ({
    path: item.path,
    type: item.type === 'tree' ? 'dir' : 'file',
    sha: item.sha,
    size: item.size || 0,
  }));

  const durationMs = Date.now() - startMs;
  log.info('Repo tree fetched', { ...context, durationMs, entryCount: entries.length, truncated: !!treeData.data.truncated });

  return {
    success: true,
    owner, repo, branch,
    commitSha,
    truncated: !!treeData.data.truncated,
    totalEntries: entries.length,
    entries,
  };
}

/**
 * Delete a single file from a repo/branch.
 * Reads the file first to get the current SHA (required by GitHub API).
 */
async function deleteOneFile({ owner, repo, branch, path, message, installationId }) {
  const context = { operation: 'deleteOneFile', owner, repo, branch, path };
  log.info('Deleting file', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  // Must get the current SHA to delete
  const sha = await withRetry(
    () => getExistingFileSha(octokit, { owner, repo, path, branch }),
    { ...context, step: 'getExistingFileSha' }
  );

  if (!sha) {
    const err = new Error(`File not found: ${path}`);
    err.status = 404;
    throw err;
  }

  const r = await withRetry(
    () => octokit.rest.repos.deleteFile({
      owner, repo, path, message, sha, branch,
    }),
    { ...context, step: 'deleteFile' }
  );

  const durationMs = Date.now() - startMs;
  log.info('File deleted', { ...context, durationMs });

  return {
    success: true,
    path, branch,
    commitSha: r?.data?.commit?.sha || null,
  };
}

/**
 * Server-side auto-diff update: reads current file, accepts new content,
 * computes diff server-side, and commits. Eliminates client-side diff computation.
 * The client never needs to construct patch hunks or worry about context mismatch.
 */
async function updateFile({ owner, repo, branch, path, content, message, installationId }) {
  const context = { operation: 'updateFile', owner, repo, branch, path };
  log.info('Updating file (server-side diff)', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  // Read current file to get SHA (required for update)
  const current = await readOneFile({ owner, repo, branch, path, installationId });

  if (current.content === content) {
    const durationMs = Date.now() - startMs;
    log.info('Update resulted in no changes', { ...context, durationMs });
    return {
      success: true,
      committed: false,
      path, branch,
      message: 'Content identical to current file — no changes committed',
    };
  }

  const r = await withRetry(
    () => octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(current.sha ? { sha: current.sha } : {}),
    }),
    { ...context, step: 'createOrUpdateFileContents' }
  );

  const durationMs = Date.now() - startMs;
  log.info('File updated', { ...context, durationMs });

  return {
    success: true,
    committed: true,
    path, branch,
    commitSha: r?.data?.commit?.sha || null,
  };
}

/**
 * List branches for a repository.
 * Returns branch names and their commit SHAs.
 */
async function listBranches({ owner, repo, installationId }) {
  const context = { operation: 'listBranches', owner, repo };
  log.info('Listing branches', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const branches = [];
  let page = 1;
  const perPage = 100;

  // Paginate through all branches
  while (true) {
    const r = await withRetry(
      () => octokit.rest.repos.listBranches({ owner, repo, per_page: perPage, page }),
      { ...context, step: 'listBranches', page }
    );
    for (const b of r.data) {
      branches.push({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected,
      });
    }
    if (r.data.length < perPage) break;
    page++;
  }

  const durationMs = Date.now() - startMs;
  log.info('Branches listed', { ...context, durationMs, count: branches.length });

  return {
    success: true,
    owner, repo,
    totalBranches: branches.length,
    branches,
  };
}

/**
 * Create a new branch from an existing ref (branch name or commit SHA).
 * Uses the Git Refs API.
 */
async function createBranch({ owner, repo, branch, fromBranch, installationId }) {
  const context = { operation: 'createBranch', owner, repo, branch, fromBranch };
  log.info('Creating branch', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  // Resolve the source branch to a commit SHA
  const refData = await withRetry(
    () => octokit.rest.git.getRef({ owner, repo, ref: `heads/${fromBranch}` }),
    { ...context, step: 'getRef' }
  );
  const sha = refData.data.object.sha;

  // Create the new branch
  const r = await withRetry(
    () => octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha }),
    { ...context, step: 'createRef' }
  );

  const durationMs = Date.now() - startMs;
  log.info('Branch created', { ...context, durationMs, sha });

  return {
    success: true,
    owner, repo,
    branch,
    fromBranch,
    sha,
  };
}

/**
 * Create a pull request.
 * Requires the head branch to already exist with commits.
 */
async function createPullRequest({ owner, repo, title, body, head, base, installationId }) {
  const context = { operation: 'createPullRequest', owner, repo, head, base };
  log.info('Creating pull request', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const r = await withRetry(
    () => octokit.rest.pulls.create({ owner, repo, title, body: body || '', head, base }),
    { ...context, step: 'createPull' }
  );

  const durationMs = Date.now() - startMs;
  log.info('Pull request created', { ...context, durationMs, number: r.data.number });

  return {
    success: true,
    owner, repo,
    number: r.data.number,
    url: r.data.html_url,
    head,
    base,
    title,
  };
}

/**
 * Read a file with line-accurate metadata using raw blob retrieval.
 *
 * This is the core function that solves the line-mismatch problem:
 *   1. Retrieves the raw file content via GitHub Contents API
 *   2. Normalizes line endings (CRLF → LF)
 *   3. Computes line numbers locally from the normalized content
 *   4. Returns blob SHA for drift detection
 *   5. Optionally extracts a specific line range
 *
 * @param {object} params
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {string} params.branch
 * @param {string} params.path
 * @param {string} [params.installationId]
 * @param {number} [params.startLine] - 1-based start line (inclusive)
 * @param {number} [params.endLine] - 1-based end line (inclusive)
 * @param {boolean} [params.normalize=true] - Whether to normalize line endings
 * @returns {Promise<object>} File content with line metadata
 */
async function readFileWithLineMap({ owner, repo, branch, path, installationId, startLine, endLine, normalize: doNormalize = true }) {
  const context = { operation: 'readFileWithLineMap', owner, repo, branch, path };
  log.debug('Reading file with line map', context);
  const startMs = Date.now();

  // Read the raw file
  const fileResult = await readOneFile({ owner, repo, branch, path, installationId });
  let content = fileResult.content;

  // Normalize content for consistent line counting
  if (doNormalize) {
    content = normalizeContent(content);
  }

  const allLines = content.split('\n');
  const totalLines = allLines.length;

  // Build response
  const result = {
    ok: true,
    owner, repo, branch, path,
    blobSha: fileResult.sha,
    size: fileResult.size,
    totalLines,
    normalized: doNormalize,
  };

  // Extract line range if requested
  if (startLine) {
    const start = Math.max(1, startLine);
    const end = Math.min(totalLines, endLine || startLine);
    const lines = [];
    for (let i = start; i <= end; i++) {
      lines.push({ lineNumber: i, text: allLines[i - 1] });
    }
    result.startLine = start;
    result.endLine = end;
    result.lines = lines;
    result.content = lines.map(l => l.text).join('\n');
  } else {
    // Return full content with line count
    result.content = content;
    result.lines = allLines.map((text, i) => ({ lineNumber: i + 1, text }));
  }

  const durationMs = Date.now() - startMs;
  log.debug('File read with line map', { ...context, durationMs, totalLines });

  return result;
}

/**
 * Get a raw blob by SHA from a repo.
 *
 * Uses the Git Blobs API which supports files up to 100MB (vs 1MB for Contents API).
 * Returns decoded content with the authoritative blob SHA.
 *
 * @param {object} params
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {string} params.sha - Blob SHA to retrieve
 * @param {string} [params.installationId]
 * @returns {Promise<object>} Decoded blob content
 */
async function getBlob({ owner, repo, sha, installationId }) {
  const context = { operation: 'getBlob', owner, repo, sha };
  log.debug('Fetching blob', context);
  const startMs = Date.now();

  const octokit = await getInstallationOctokit({ installationId });

  const r = await withRetry(
    () => octokit.rest.git.getBlob({ owner, repo, file_sha: sha }),
    context
  );

  let content = r.data.content || '';
  if (r.data.encoding === 'base64') {
    content = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
  }

  const durationMs = Date.now() - startMs;
  log.debug('Blob fetched', { ...context, durationMs, size: r.data.size });

  return {
    ok: true,
    owner, repo,
    sha: r.data.sha,
    size: r.data.size,
    content,
    encoding: 'utf8',
  };
}

/**
 * Search for content across one or more repos using GitHub Code Search API.
 *
 * Search is used for discovery (radar), then raw blob retrieval provides
 * exact line numbers (microscope).
 *
 * @param {object} params
 * @param {string} params.query - Search term
 * @param {Array<{owner: string, repo: string}>} params.repos - Repos to search in
 * @param {string} [params.installationId]
 * @param {object} [params.options]
 * @param {string} [params.options.language] - Filter by language
 * @param {string} [params.options.extension] - Filter by file extension
 * @param {number} [params.options.maxResults=20] - Max results to return
 * @param {number} [params.options.contextLines=2] - Lines of context around matches
 * @param {string} [params.options.branch] - Branch to search (for content verification)
 * @returns {Promise<object>} Search results with line-accurate references
 */
async function searchRepoContent({ query, repos, installationId, options = {} }) {
  const context = { operation: 'searchRepoContent', query, repoCount: repos.length };
  log.info('Searching repo content', context);
  const startMs = Date.now();

  const {
    language,
    extension,
    maxResults = 20,
    contextLines = 2,
    branch,
  } = options;

  const octokit = await getInstallationOctokit({ installationId });

  // Build the search query
  const repoQualifiers = repos.map(r => `repo:${r.owner}/${r.repo}`).join(' ');
  let q = `${query} ${repoQualifiers}`;
  if (language) q += ` language:${language}`;
  if (extension) q += ` extension:${extension}`;

  // Execute GitHub Code Search
  let searchResults;
  try {
    searchResults = await withRetry(
      () => octokit.rest.search.code({ q, per_page: Math.min(maxResults, 100) }),
      { ...context, step: 'searchCode' }
    );
  } catch (e) {
    // GitHub search can return 422 for invalid queries
    if (e.status === 422) {
      const err = new Error(`Invalid search query: ${e.message}`);
      err.status = 400;
      throw err;
    }
    throw e;
  }

  const items = searchResults.data.items || [];
  const totalCount = searchResults.data.total_count || 0;

  // For each search result, fetch the actual file and compute exact line numbers
  const results = [];
  const fetchLimit = Math.min(items.length, maxResults);

  for (let i = 0; i < fetchLimit; i++) {
    const item = items[i];
    const [itemOwner, itemRepo] = item.repository.full_name.split('/');
    const itemPath = item.path;

    try {
      // Read the actual file content for line-accurate results
      const targetBranch = branch || 'main';
      const fileData = await readOneFile({
        owner: itemOwner,
        repo: itemRepo,
        branch: targetBranch,
        path: itemPath,
        installationId,
      });

      const normalizedContent = normalizeContent(fileData.content);

      // Search within the actual content for exact line matches
      const matches = searchContent(normalizedContent, query, {
        contextLines,
        maxResults: 10, // limit matches per file
      });

      if (matches.length > 0) {
        results.push({
          repo: `${itemOwner}/${itemRepo}`,
          path: itemPath,
          blobSha: fileData.sha,
          branch: targetBranch,
          matches: matches.map(m => ({
            lineNumber: m.lineNumber,
            text: m.text,
            context: m.context,
            reference: buildLineReference({
              owner: itemOwner,
              repo: itemRepo,
              path: itemPath,
              blobSha: fileData.sha,
              startLine: m.lineNumber,
            }),
          })),
        });
      }
    } catch (fileErr) {
      // File might not be readable on the specified branch — include as partial result
      log.debug('Could not fetch file for search result', {
        owner: itemOwner, repo: itemRepo, path: itemPath,
        error: fileErr.message,
      });
      results.push({
        repo: `${itemOwner}/${itemRepo}`,
        path: itemPath,
        blobSha: null,
        error: `File not readable: ${fileErr.message}`,
        matches: [],
      });
    }
  }

  const durationMs = Date.now() - startMs;
  log.info('Search completed', { ...context, durationMs, totalCount, resultsReturned: results.length });

  return {
    ok: true,
    query,
    totalCount,
    resultsReturned: results.length,
    results,
  };
}

/**
 * Discover symbols (functions, classes, interfaces, etc.) across one or more repos.
 *
 * @param {object} params
 * @param {Array<{owner: string, repo: string, branch?: string, paths?: string[]}>} params.repos
 * @param {string} [params.installationId]
 * @param {object} [params.options]
 * @param {string} [params.options.nameFilter] - Filter symbols by name
 * @param {string[]} [params.options.typeFilter] - Filter by type ('function', 'class', etc.)
 * @param {string[]} [params.options.extensions] - File extensions to scan (e.g., ['.js', '.ts'])
 * @param {number} [params.options.maxFiles=50] - Max files to scan per repo
 * @returns {Promise<object>} Discovered symbols with line-accurate references
 */
async function discoverSymbols({ repos, installationId, options = {} }) {
  const context = { operation: 'discoverSymbols', repoCount: repos.length };
  log.info('Discovering symbols', context);
  const startMs = Date.now();

  const {
    nameFilter,
    typeFilter,
    extensions = ['.js', '.ts', '.py', '.go', '.rb', '.java', '.rs'],
    maxFiles = 50,
  } = options;

  const allSymbols = [];

  for (const repoSpec of repos) {
    const { owner, repo, branch: repoBranch, paths: targetPaths } = repoSpec;
    const branch = repoBranch || 'main';

    try {
      // Get the file tree to find scannable files
      const tree = await getRepoTree({ owner, repo, branch, installationId });

      // Filter to files with matching extensions
      let filesToScan = tree.entries.filter(entry => {
        if (entry.type !== 'file') return false;
        const ext = entry.path.includes('.') ? '.' + entry.path.split('.').pop().toLowerCase() : '';
        if (!extensions.some(e => e.toLowerCase() === ext)) return false;
        // If specific paths requested, filter by prefix
        if (targetPaths && targetPaths.length > 0) {
          return targetPaths.some(p => entry.path.startsWith(p));
        }
        return true;
      });

      // Limit files scanned
      filesToScan = filesToScan.slice(0, maxFiles);

      // Read each file and extract symbols
      for (const file of filesToScan) {
        try {
          const fileData = await readOneFile({
            owner, repo, branch, path: file.path, installationId,
          });

          const content = normalizeContent(fileData.content);
          const symbols = findSymbols(content, file.path, { nameFilter, typeFilter });

          for (const sym of symbols) {
            allSymbols.push({
              ...sym,
              repo: `${owner}/${repo}`,
              path: file.path,
              branch,
              blobSha: fileData.sha,
              reference: buildLineReference({
                owner, repo, path: file.path,
                blobSha: fileData.sha,
                startLine: sym.lineNumber,
              }),
            });
          }
        } catch (fileErr) {
          log.debug('Could not read file for symbol discovery', {
            owner, repo, path: file.path, error: fileErr.message,
          });
        }
      }
    } catch (treeErr) {
      log.warn('Could not get repo tree for symbol discovery', {
        owner, repo, branch, error: treeErr.message,
      });
    }
  }

  const durationMs = Date.now() - startMs;
  log.info('Symbol discovery completed', { ...context, durationMs, symbolCount: allSymbols.length });

  return {
    ok: true,
    totalSymbols: allSymbols.length,
    symbols: allSymbols,
  };
}

module.exports = {
  getInstallationOctokit,
  applyOneFile,
  dryRunOneFile,
  readOneFile,
  listTree,
  patchOneFile,
  patchReplace,
  patchDiff,
  appendToFile,
  getRepoTree,
  deleteOneFile,
  updateFile,
  listBranches,
  createBranch,
  createPullRequest,
  invalidateTokenCache,
  // New: line-accurate reading and blob retrieval
  readFileWithLineMap,
  getBlob,
  // New: cross-repo search and symbol discovery
  searchRepoContent,
  discoverSymbols,
  // Exported for testing
  isTransientError,
  withRetry,
  applyUnifiedDiff,
  applySearchReplace,
};
