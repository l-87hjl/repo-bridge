'use strict';

const express = require('express');
const helmet = require('helmet');

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

app.post('/apply', (req, res) => {
  res.status(501).json({
    ok: false,
    error: 'NotImplemented',
    message: 'POST /apply is a placeholder.'
  });
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'NotFound' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'ServerError' });
});

app.listen(PORT, () => console.log(`repo-bridge listening on ${PORT}`));
