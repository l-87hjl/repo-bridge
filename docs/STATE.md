# Repository State

This document summarizes the current state of the repo-bridge repository. AI agents should update this file when the repository structure changes significantly.

**Last Updated:** 2026-02-01

## Purpose

repo-bridge is a Node.js/Express microservice that bridges AI services to GitHub operations. It allows programmatic file creation/updates via REST API using GitHub App authentication.

## Directory Structure

```
repo-bridge/
├── src/
│   ├── server.js          # Express server, routes, middleware
│   └── github.js          # GitHub API integration (Octokit)
├── docs/
│   ├── API.md             # API documentation
│   ├── README_AI.md       # Instructions for AI agents
│   ├── CHANGELOG_AI.md    # AI change log (append-only)
│   └── STATE.md           # This file
├── archive/               # Archived old code versions
│   ├── server_old_001.js
│   └── github_old_001.js
├── .env.example           # Environment variable template
├── .gitignore
├── package.json
├── package-lock.json
└── README.md              # Main documentation
```

## Key Files

| File | Purpose |
|------|---------|
| `src/server.js` | Main entry point. Defines routes, auth middleware, allowlist checks |
| `src/github.js` | GitHub API wrapper. Handles App auth, file create/update |
| `docs/API.md` | Full API documentation with examples |

## API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/` | No | Service info |
| GET | `/health` | No | Health check |
| POST | `/apply` | Yes* | Create/update file |
| POST | `/github/dryrun` | Yes* | Preview changes |

*Auth required only if `API_AUTH_TOKEN` is set

## Configuration

Environment variables (set in Render or `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | Yes | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | Yes | App private key (PEM) |
| `GITHUB_INSTALLATION_ID` | No | Default installation ID |
| `API_AUTH_TOKEN` | No | Bearer token for API auth |
| `ALLOWED_REPOS` | No | Comma-separated repo allowlist |
| `ALLOWED_PATHS` | No | Comma-separated path allowlist |
| `DEFAULT_BRANCH` | No | Default branch (defaults to `main`) |
| `PORT` | No | Server port (defaults to 3000) |

## Current Status

- **Version:** 0.1.0
- **Node.js:** >=18
- **Deployment Target:** Render
- **Branch:** main

## Recent Changes

See `docs/CHANGELOG_AI.md` for AI-made changes.
See git log for all changes.
