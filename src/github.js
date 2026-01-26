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
    installationId
  });

  async function dryRunOneFile({ owner, repo, branch, path, content }) {
  const octokit = await getInstallationOctokit();

  let existing = null;
  try {
    const r = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if (!Array.isArray(r.data) && r.data.content) {
      const buf = Buffer.from(r.data.content, r.data.encoding || 'base64');
      existing = buf.toString('utf8');
    }
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  const wouldChange = existing !== content;

  return {
    owner, repo, branch, path,
    exists: existing !== null,
    wouldChange,
    oldBytes: existing ? Buffer.byteLength(existing, 'utf8') : 0,
    newBytes: Buffer.byteLength(content, 'utf8')
  };
}

module.exports = { getInstallationOctokit, applyOneFile, dryRunOneFile };

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

module.exports = { getInstallationOctokit };