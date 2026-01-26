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

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

module.exports = { getInstallationOctokit };