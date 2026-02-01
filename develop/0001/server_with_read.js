'use strict';

const express = require('express');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get('/', (req, res) => {
  res.json({ service: 'repo-bridge', status: 'running', endpoints: ['/health', '/apply', '/read', '/github/dryrun'] });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'repo-bridge', time: new Date().toISOString() });
});

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: 'BadRequest', message });
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: 'Unauthorized', message: 'Missing or invalid token' });
}

function forbidden(res, message) {
  return res.status(403).json({ ok: false, error: 'Forbidden', message });
}

function requireAuth(req, res) {
  const token = process.env.API_AUTH_TOKEN;
  if (!token) return true;
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) { unauthorized(res); return false; }
  if (m[1].trim() !== token) { unauthorized(res); return false; }
  return true;
}

function splitCsv(v) {
  return String(v || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function globToRegExp(glob) {
  // very small glob: * matches any chars
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\$&');
  const re = '^' + esc.replace(/\*/g, '.*') + '$';
  return new RegExp(re);
}

function isAllowedRepo(owner, repo) {
  const allowed = splitCsv(process.env.ALLOWED_REPOS);
  if (allowed.length === 0) return true;
  const full = `${owner}/${repo}`;
  return allowed.some(p => {
    if (p.endsWith('/*')) return full.startsWith(p.slice(0, -1));
    return p === full;
  });
}

function isAllowedPath(path) {
  const allowed = splitCsv(process.env.ALLOWED_PATHS);
  if (allowed.length === 0) return true;
  return allowed.some(g => globToRegExp(g).test(path));
}

function withDefaults(b) {
  const out = { ...b };
  out.branch = out.branch || process.env.DEFAULT_BRANCH || 'main';
  return out;
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
    return withDefaults({
      owner: b.owner,
      repo: b.repo,
      branch: b.branch,
      path: c0.path,
      content: c0.content,
      message: b.message,
      installationId: b.installationId,
      dryRun: b.dryRun,
    });
  }

  return withDefaults({
    owner: b.owner,
    repo: b.repo,
    branch: b.branch,
    path: b.path,
    content: b.content,
    message: b.message,
    installationId: b.installationId,
    dryRun: b.dryRun,
  });
}

app.post('/github/dryrun', (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);
    if (!requireAuth(req, res)) return;

    const { owner, repo, branch, path, content, message } = b;
    if (!isAllowedRepo(owner, repo)) return forbidden(res, 'Repo not allowed');
    if (!isAllowedPath(path)) return forbidden(res, 'Path not allowed');
    if (!owner || !repo || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, path, content(string), message');
    }

    const { dryRunOneFile } = require('./github');
    return res.json(dryRunOneFile({ owner, repo, branch, path, content, message }));
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ServerError', message: e?.message || String(e) });
  }
});


app.post('/read', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const b0 = req.body || {};

    // Allow repo like "owner/name" too
    let owner = b0.owner;
    let repo = b0.repo;
    if (!owner && typeof repo === 'string' && repo.includes('/')) {
      const [o, r] = repo.split('/');
      owner = o;
      repo = r;
    }

    const branch = b0.branch || process.env.DEFAULT_BRANCH || 'main';
    const path = b0.path;
    const installationId = b0.installationId;

    if (!owner || !repo || !path) {
      return badRequest(res, 'Required: owner, repo, path (branch optional)');
    }

    if (!isAllowedRepo(owner, repo)) return forbidden(res, 'Repo not allowed');
    if (!isAllowedPath(path)) return forbidden(res, 'Path not allowed');

    const { readOneFile } = require('./github');
    const result = await readOneFile({ owner, repo, branch, path, installationId });
    return res.json(result);
  } catch (e) {
    const status = e?.status;
    if (status == 404) {
      return res.status(404).json({ ok: false, error: 'NotFound', message: 'File not found' });
    }
    if (status == 400) {
      return res.status(400).json({ ok: false, error: 'BadRequest', message: e?.message || String(e) });
    }
    return res.status(500).json({ ok: false, error: 'ServerError', message: e?.message || String(e) });
  }
});

app.post('/apply', async (req, res) => {
  try {
    const b = normalizeApplyBody(req.body);
    if (b.error) return badRequest(res, b.error);
    if (!requireAuth(req, res)) return;

    const { owner, repo, branch, path, content, message, installationId, dryRun } = b;
    if (!isAllowedRepo(owner, repo)) return forbidden(res, 'Repo not allowed');
    if (!isAllowedPath(path)) return forbidden(res, 'Path not allowed');

    if (!owner || !repo || !path || typeof content !== 'string' || !message) {
      return badRequest(res, 'Required: owner, repo, path, content(string), message');
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
