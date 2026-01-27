'use strict';

const express = require('express');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get('/', (req, res) => {
  res.json({ service: 'repo-bridge', status: 'running', endpoints: ['/health', '/apply', '/github/dryrun'] });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'repo-bridge', time: new Date().toISOString() });
});

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: 'BadRequest', message });
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

  if (Array.isArray(b.changes) && b.changes.length > 0) {
    if (b.changes.length !== 1) {
      return { error: 'For now, changes[] must contain exactly 1 file.' };
    }
    const c0 = b.changes[0] || {};
    return {
      owner: b.owner,
      repo: b.repo,
      branch: b.branch,
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
    branch: b.branch,
    path: b.path,
    content: b.content,
    message: b.message,
    installationId: b.installationId,
    dryRun: b.dryRun,
  };
}

app.post('/github/dryrun', (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);

    const { owner, repo, branch, path, content, message } = b;
    if (!owner || !repo || !branch || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, branch, path, content(string), message');
    }

    const { dryRunOneFile } = require('./github');
    return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ServerError', message: e?.message || String(e) });
  }
});

app.post('/apply', async (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);

    const { owner, repo, branch, path, content, message, installationId, dryRun } = b;

    if (!owner || !repo || !branch || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, branch, path, content(string), message');
    }

    if (dryRun) {
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

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'ServerError' });
});

app.listen(PORT, () => console.log(`repo-bridge listening on ${PORT}`));
