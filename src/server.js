'use strict';

const express = require('express');
const helmet = require('helmet');
const { getInstallationOctokit } = require('./github');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get('/', (req, res) => {
  res.json({ service: 'repo-bridge', status: 'running', endpoints: ['/health', '/apply'] });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'repo-bridge', time: new Date().toISOString() });
});
function parseRepo(full) {
  const [owner, repo] = String(full || '').split('/');
  if (!owner || !repo) throw new Error('repo must be "owner/name"');
  return { owner, repo };
}

app.post('/github/dryrun', (req, res) => {
  try {
    const { repo, title, head, base, files } = req.body || {};
    parseRepo(repo);
    if (!title || !head || !base) throw new Error('title, head, base required');
    if (!Array.isArray(files) || files.length < 1) throw new Error('files must be a non-empty array');

    for (const f of files) {
      if (!f.path || typeof f.content !== 'string') {
        throw new Error('each file must have path + content');
      }
    }

    res.json({
      ok: true,
      wouldDo: {
        repo,
        base,
        head,
        title,
        filesChanged: files.length
      }
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/apply', async (req, res) => {
  try {
    const {
      owner,
      repo,
      branch,        // e.g. "claude/horror-story-generator-DTAVx" or "main"
      path,          // e.g. "README.md"
      content,       // raw text
      message        // commit message
    } = req.body || {};

    if (!owner || !repo || !branch || !path || typeof content !== 'string' || !message) {
      return res.status(400).json({
        ok: false,
        error: "BadRequest",
        message: "Required: owner, repo, branch, path, content(string), message"
      });
    }

    const { applyOneFile } = require('./github');
    const result = await applyOneFile({ owner, repo, branch, path, content, message });

    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: "ApplyFailed",
      message: e?.message || String(e)
    });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'ServerError' });
});

app.listen(PORT, () => console.log(`repo-bridge listening on ${PORT}`));
