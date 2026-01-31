'use strict';

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function getInstallationOctokit() {
  const appId = Number(requireEnv('GITHUB_APP_ID'));
  const installationId = Number(requireEnv('GITHUB_INSTALLATION_ID'));
  const privateKey = requireEnv('GITHUB_PRIVATE_KEY');

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

async function getExistingFileShaAndContent({ octokit, owner, repo, branch, path }) {
  try {
    const r = await octokit.repos.getContent({ owner, repo, path, ref: branch });

    // If it's a directory, GitHub returns an array; we only support files here.
    if (Array.isArray(r.data)) {
      throw new Error(`Path is a directory, not a file: ${path}`);
    }

    const sha = r.data.sha;
    const encoding = r.data.encoding || 'base64';
    const content = r.data.content
      ? Buffer.from(r.data.content, encoding).toString('utf8')
      : null;

    return { exists: true, sha, content };
  } catch (e) {
    if (e.status === 404) return { exists: false, sha: null, content: null };
    throw e;
  }
}

async function dryRunOneFile({ owner, repo, branch, path, content }) {
  const octokit = await getInstallationOctokit();

  const existing = await getExistingFileShaAndContent({
    octokit,
    owner,
    repo,
    branch,
    path,
  });

  const wouldChange = !existing.exists || existing.content !== content;

  return {
    owner,
    repo,
    branch,
    path,
    exists: existing.exists,
    wouldChange,
    oldBytes: existing.content ? Buffer.byteLength(existing.content, 'utf8') : 0,
    newBytes: Buffer.byteLength(content, 'utf8'),
  };
}

async function applyOneFile({ owner, repo, branch, path, content, message }) {
  const octokit = await getInstallationOctokit();

  // Determine if file exists (to include sha for updates)
  const existing = await getExistingFileShaAndContent({
    octokit,
    owner,
    repo,
    branch,
    path,
  });

  const b64 = Buffer.from(content, 'utf8').toString('base64');

  const params = {
    owner,
    repo,
    path,
    message,
    content: b64,
    branch,
  };

  if (existing.exists && existing.sha) {
    params.sha = existing.sha;
  }

  const r = await octokit.repos.createOrUpdateFileContents(params);

  return {
    committed: true,
    branch,
    path,
    commitSha: r?.data?.commit?.sha || null,
    contentSha: r?.data?.content?.sha || null,
    updated: existing.exists,
    created: !existing.exists,
  };
}

module.exports = {
  getInstallationOctokit,
  dryRunOneFile,
  applyOneFile,
};
