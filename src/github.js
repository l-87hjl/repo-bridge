'use strict';

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

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
 * Create an Octokit client authenticated as a GitHub App installation.
 * Uses env:
 *  - GITHUB_APP_ID
 *  - GITHUB_PRIVATE_KEY (PEM; may contain literal \n)
 * Optional env:
 *  - GITHUB_INSTALLATION_ID (if you don't pass installationId param)
 */
async function getInstallationOctokit({ installationId } = {}) {
  const appId = requireEnv('GITHUB_APP_ID');
  const privateKey = normalizePrivateKey(requireEnv('GITHUB_PRIVATE_KEY'));
  const installId = installationId || process.env.GITHUB_INSTALLATION_ID;
  if (!installId) throw new Error('Missing installationId (param) or env GITHUB_INSTALLATION_ID');

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId: Number(installId),
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

/**
 * Get file SHA if it exists, else return null.
 */
async function getExistingFileSha(octokit, { owner, repo, path, branch }) {
  try {
    const r = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    // If path is a file, it will be an object with sha
    if (r?.data && !Array.isArray(r.data) && r.data.sha) return r.data.sha;
    return null;
  } catch (e) {
    // 404 means file doesn't exist yet (that's OK)
    if (e && e.status === 404) return null;
    throw e;
  }
}

/**
 * Apply (create/update) exactly one file on a repo/branch.
 * Params:
 *  - owner, repo, branch, path, content, message
 *  - installationId (optional; defaults to env)
 */
async function applyOneFile({ owner, repo, branch, path, content, message, installationId }) {
  const octokit = await getInstallationOctokit({ installationId });

  const sha = await getExistingFileSha(octokit, { owner, repo, path, branch });

  const r = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });

  return {
    committed: true,
    owner,
    repo,
    branch,
    path,
    created: !sha,
    updated: !!sha,
    commitSha: r?.data?.commit?.sha || null,
    contentSha: r?.data?.content?.sha || null,
  };
}

/**
 * Dry-run helper: returns what would be applied, but does NOT touch GitHub.
 *
 * IMPORTANT: This function is intentionally pure/synchronous and makes NO API calls.
 * It only computes and returns metadata about what would happen.
 * This guarantees that dry-run mode can never accidentally commit anything.
 */
function dryRunOneFile({ owner, repo, branch, path, content, message }) {
  // No API calls here - purely local computation
  return {
    ok: true,
    wouldApply: { owner, repo, branch, path, bytes: Buffer.byteLength(content || '', 'utf8'), message },
  };
}

module.exports = {
  getInstallationOctokit,
  applyOneFile,
  dryRunOneFile,
};
