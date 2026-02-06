# Repository State

This document summarizes the current state of the repo-bridge repository. AI agents should update this file when the repository structure changes significantly.

**Last Updated:** 2026-02-05 (v1.2.1 schema migration)

## Purpose

repo-bridge is a multi-repo Node.js/Express microservice that bridges AI agents to GitHub operations. It provides REST API endpoints to read, write, list, copy, and batch-read files across multiple GitHub repositories using GitHub App authentication.

## Directory Structure

```
repo-bridge/
├── src/
│   ├── server.js              # Express server, routes, middleware (~525 lines)
│   └── github.js              # GitHub API integration (Octokit)
├── docs/
│   ├── API.md                 # API documentation
│   ├── README_AI.md           # Instructions for AI agents
│   ├── MULTI_REPO_GUIDE.md    # Multi-repo analysis patterns & cross-repo ops
│   ├── AGENT_SETUP.md         # Multi-layer security setup guide
│   ├── STANDARDIZATION_GUIDE.md # Agent repo structure guide
│   ├── REPO_ACCESS_MAP.md     # Access control matrix
│   ├── CHATGPT-AGENT-SETUP-RECS # ChatGPT agent setup guidance
│   ├── PRODUCT.md             # Product positioning
│   ├── CHANGELOG_AI.md        # AI change log (append-only)
│   ├── STATE.md               # This file
│   └── chatgpt-tool-schema.json # OpenAPI 3.1.0 schema (v0.3.0)
├── templates/
│   ├── agent-boot/            # Boot repo templates (rules, protocols)
│   ├── agent-contract/        # Contract repo templates (specs)
│   ├── agent-workspace/       # Workspace repo templates (active state)
│   └── LICENSE-BSL-1.1.txt    # License template
├── develop/                   # Development exploration files
├── archive/                   # Archived old code versions
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── package-lock.json
├── LICENSE                    # BSL 1.1
└── README.md                  # Main documentation
```

## Key Files

| File | Purpose |
|------|---------|
| `src/server.js` | Main entry point. Routes, auth, allowlist checks, multi-repo endpoints |
| `src/github.js` | GitHub API wrapper. App auth, file CRUD, tree listing |
| `docs/API.md` | Full API documentation with examples |
| `docs/MULTI_REPO_GUIDE.md` | Cross-repo patterns, batch operations, permissions guide |
| `docs/chatgpt-tool-schema.json` | OpenAPI schema for ChatGPT/agent integrations |

## API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/` | No | Service info |
| GET | `/health` | No | Health check |
| POST | `/read` | Yes* | Read a file from any repo |
| POST | `/list` | Yes* | List directory contents |
| POST | `/batchRead` | Yes* | Batch read up to 10 files across repos |
| POST | `/copy` | Yes* | Copy file between repos |
| POST | `/apply` | Yes* | Create/update file(s) (oneOf: path+content or changes[]) |
| POST | `/dryRun` | Yes* | Preview changes |
| POST | `/batch/read` | Yes* | Alias for /batchRead (backward compat) |
| POST | `/github/dryrun` | Yes* | Alias for /dryRun (backward compat) |

*Auth required only if `API_AUTH_TOKEN` is set

## Configuration

Environment variables (set in Render or `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | Yes | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | Yes | App private key (PEM) |
| `GITHUB_INSTALLATION_ID` | No | Default installation ID |
| `API_AUTH_TOKEN` | No | Bearer token for API auth |
| `ALLOWED_REPOS` | No | Comma-separated repo allowlist (supports wildcards) |
| `ALLOWED_PATHS` | No | Comma-separated path allowlist (supports wildcards) |
| `READ_ONLY_REPOS` | No | Comma-separated read-only repos |
| `DEFAULT_BRANCH` | No | Default branch (defaults to `main`) |
| `PORT` | No | Server port (defaults to 3000) |

## Current Status

- **Version:** 0.3.0
- **Schema Version:** 1.2.1 (OpenAPI 3.1.0)
- **Node.js:** >=18
- **Deployment Target:** Render
- **Branch:** main
- **Multi-repo:** Fully supported via /batchRead, /copy, /list, /dryRun

## Recent Changes

- Migrated to v1.2.1 schema (ChatGPT-compatible flat format)
- Added `/batchRead` route (camelCase canonical, `/batch/read` kept as alias)
- Added `/dryRun` route (camelCase canonical, `/github/dryrun` kept as alias)
- Enforced oneOf in `/apply`: path+content XOR changes[], not both
- Updated `/copy` to accept v1.2.1 field names (sourceRepo/sourcePath/destinationRepo/destinationPath)
- All branches default internally when omitted

See `docs/CHANGELOG_AI.md` for AI-made changes.
See git log for all changes.
