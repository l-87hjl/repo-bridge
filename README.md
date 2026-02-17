# repo-bridge

A multi-repo Node.js/Express microservice that bridges AI agents to GitHub operations. Read, write, list, copy, and batch-read files across **multiple repositories** using GitHub App authentication.

Repo-bridge is designed as a governed interface between AI agents and GitHub, emphasizing explicit authorization, scoped access, reversible changes, and **cross-repo analysis**.

## Features

### Core File Operations
- **Read** files from any accessible GitHub repository (`/read`)
- **Line-accurate read** with CRLF normalization, blob SHA drift detection, line range extraction (`/readLines`)
- **Blob retrieval** by SHA via Git Blobs API — supports files up to 100MB (`/blob`)
- **Create or update** files in GitHub repositories via REST API (`/apply`)
- **Server-side auto-diff** — send full content, server handles diffing (`/updateFile`)
- **Delete files** directly without patch gymnastics (`/deleteFile`)
- **List** directory contents for repository exploration (`/list`)
- **Recursive tree** — full file tree with SHAs in one API call via Git Trees API (`/repoTree`)
- **Batch read** — Read up to 25 files from any combination of repos in one call (`/batchRead`)
- **Cross-repo copy** — Copy files between repositories in a single call (`/copy`)
- **Multi-file writes** — Write multiple files per commit with `changes[]` array

### Patching
- **Search-and-replace** — GPT Actions safe, flat schema (`/patchReplace`)
- **Unified diff** — GPT Actions safe, flat schema (`/patchDiff`)
- **Legacy combined** — Both modes in one endpoint (`/patch`)

### Cross-Repo Intelligence
- **Content search** — Search across repos with line-accurate results (`/search`)
- **Symbol discovery** — Find functions, classes, interfaces across repos (`/symbols`)
- **File comparison** — Compare files between repos or branches (`/compare`)
- **Structure comparison** — Compare directory structures (`/compareStructure`)

### Multi-Repo Coordination
- **List branches** — Discover all branches with commit SHAs (`/listBranches`)
- **Create branches** — Create feature branches from any ref (`/createBranch`)
- **Create pull requests** — Propose changes for review (`/createPR`)

### Observability & Governance
- **Metrics** — Uptime, memory, GitHub rate-limit with warning thresholds (`/metrics`)
- **Diagnostics** — Test connectivity and permissions for any repo (`/diagnose`)
- **Self-diagnosis** — Background health monitoring loop (configurable via `DIAG_INTERVAL_MS`)
- **Patch-only enforcement** — Protect critical files from full overwrites (`PATCH_ONLY_PATHS`)
- **SHA guard** — Optimistic concurrency via `expectedSha` on `/apply`

### Infrastructure
- GitHub App authentication (no personal access tokens needed)
- Dry-run mode for previewing changes without committing (guaranteed safe — no API calls)
- Read-only repository mode for protecting sensitive repos
- API authentication via Bearer token
- Repository and path allowlists for access control
- GPT Actions compatible OpenAPI 3.0.1 schemas (flat, deterministic, no conditional fields)
- Security headers via Helmet
- 75 tests (Jest + Supertest)
- Designed for deployment on Render

## Prerequisites

- Node.js >= 18
- A [GitHub App](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app) with:
  - Repository contents permission: Read and write
  - Installed on the target repository

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd repo-bridge
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your GitHub App credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Optional GitHub config
GITHUB_INSTALLATION_ID=12345678  # Can be passed per-request instead
DEFAULT_BRANCH=main              # Defaults to 'main'

# Optional security (recommended for production)
API_AUTH_TOKEN=your-secret-token  # Require Bearer token auth
ALLOWED_REPOS=myorg/*,user/repo   # Restrict to specific repos
ALLOWED_PATHS=src/*,docs/*        # Restrict to specific paths
READ_ONLY_REPOS=myorg/config      # Allow read but block writes

# Optional governance
PATCH_ONLY_PATHS=src/server.js,config/* # Block full overwrites, require /patchReplace or /patchDiff

# Optional observability
DIAG_INTERVAL_MS=300000           # Background self-diagnosis every 5min (0=disabled)

# Optional server config
PORT=3000                         # Defaults to 3000
```

### 3. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description | Since |
|--------|----------|-------------|-------|
| GET | `/` | Service info, endpoints, and capabilities | v0.1 |
| GET | `/health` | Health check with GitHub connectivity status | v0.1 |
| GET | `/metrics` | Uptime, memory, rate-limit, diagnostics | v0.6 |
| POST | `/read` | Read a file from any accessible repo | v0.1 |
| POST | `/readLines` | Line-accurate read with normalization and blob SHA | v0.7 |
| POST | `/blob` | Retrieve a raw blob by SHA (up to 100MB) | v0.7 |
| POST | `/list` | List directory contents of any repo | v0.1 |
| POST | `/repoTree` | Full recursive file tree in one API call | v0.6 |
| POST | `/batchRead` | Read up to 25 files from multiple repos | v0.1 |
| POST | `/apply` | Create or update file(s) in a repo | v0.1 |
| POST | `/updateFile` | Update with server-side auto-diff | v0.6 |
| POST | `/deleteFile` | Delete a file from a repo | v0.6 |
| POST | `/patchReplace` | Search-and-replace patch (GPT Actions safe) | v0.5 |
| POST | `/patchDiff` | Unified diff patch (GPT Actions safe) | v0.5 |
| POST | `/patch` | Combined patch (legacy, both modes) | v0.5 |
| POST | `/copy` | Copy a file between repositories | v0.1 |
| POST | `/search` | Cross-repo content search with line references | v0.7 |
| POST | `/symbols` | Cross-repo symbol discovery | v0.7 |
| POST | `/compare` | Compare a file between repos/branches | v0.4 |
| POST | `/compareStructure` | Compare directory structures | v0.4 |
| POST | `/listBranches` | List all branches for a repo | v0.7 |
| POST | `/createBranch` | Create a new branch from a ref | v0.7 |
| POST | `/createPR` | Create a pull request | v0.7 |
| POST | `/diagnose` | Test connectivity and permissions | v0.3 |
| POST | `/dryRun` | Preview changes without committing | v0.1 |

See [docs/API.md](docs/API.md) for detailed API documentation.

## Basic Usage

### Read a File

```bash
curl -X POST http://localhost:3000/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "repo": "your-username/your-repo",
    "path": "src/index.js"
  }'
```

Response:
```json
{
  "ok": true,
  "owner": "your-username",
  "repo": "your-repo",
  "branch": "main",
  "path": "src/index.js",
  "sha": "abc123...",
  "size": 1234,
  "content": "// file contents here..."
}
```

### Create or Update a File

```bash
# Without auth (if API_AUTH_TOKEN is not set)
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "path": "test.txt",
    "content": "Hello, World!",
    "message": "Add test file"
  }'

# With auth (if API_AUTH_TOKEN is set)
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "repo": "your-username/your-repo",
    "path": "test.txt",
    "content": "Hello, World!",
    "message": "Add test file"
  }'
```

Note: `branch` defaults to `main` if not specified.

### Preview Changes (Dry Run)

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "path": "test.txt",
    "content": "Hello, World!",
    "message": "Add test file",
    "dryRun": true
  }'
```

Dry-run mode is guaranteed safe - it makes no GitHub API calls and only returns what would be applied.

## Project Structure

```
repo-bridge/
├── src/
│   ├── server.js              # Express server with all route handlers
│   ├── github.js              # GitHub API service functions
│   ├── normalize.js           # Content normalization, symbol discovery, line mapping
│   └── logger.js              # Structured JSON logging
├── tests/
│   ├── server.test.js         # Integration tests (33 tests, Jest + Supertest)
│   └── normalize.test.js      # Normalize module tests (42 tests)
├── docs/
│   ├── API.md                 # API documentation
│   ├── CHANGELOG_AI.md        # AI change log (append-only)
│   ├── chatgpt-tool-schema.json           # Primary OpenAPI schema (GPT Actions safe, 3.0.1)
│   ├── chatgpt-tool-schema-working-step01.json  # Mirror of primary schema
│   ├── chatgpt-tool-schema-detailed-backup.json # Backup schema with typed responses (3.1.0)
│   ├── README_AI.md           # Instructions for AI agents
│   ├── MULTI_REPO_GUIDE.md    # Multi-repo analysis patterns
│   ├── AGENT_SETUP.md         # Multi-layer security setup
│   ├── STANDARDIZATION_GUIDE.md # Agent repo structure guide
│   ├── REPO_ACCESS_MAP.md     # Access control matrix
│   └── STATE.md               # Repository state summary
├── templates/                 # Agent mechanism repo templates
│   ├── agent-boot/            # Boot repo templates (rules, protocols)
│   ├── agent-contract/        # Contract repo templates (specs)
│   └── agent-workspace/       # Workspace repo templates (active state)
├── .env.example               # Example environment configuration
├── .gitignore
├── package.json               # v0.7.0
└── README.md
```

## AI Integration

For AI agents (ChatGPT, Claude, etc.) using repo-bridge:

1. **Read** [docs/README_AI.md](docs/README_AI.md) for operational instructions
2. **Read** [docs/MULTI_REPO_GUIDE.md](docs/MULTI_REPO_GUIDE.md) for multi-repo patterns
3. **Import** [docs/chatgpt-tool-schema.json](docs/chatgpt-tool-schema.json) as a custom tool/action
4. **Upload** TAXONOMY.md and README.md from repo-boot as reference files for the agent
5. **Update** [docs/CHANGELOG_AI.md](docs/CHANGELOG_AI.md) after each commit
6. **Maintain** [docs/STATE.md](docs/STATE.md) when repo structure changes

### Multi-Repo Setup Tips

- Upload reference files (like TAXONOMY.md from repo-boot) to give the agent context about repo relationships
- Use `/batch/read` in the agent's boot sequence to load context from multiple repos simultaneously
- Configure `READ_ONLY_REPOS` to protect boot and contract repos while allowing workspace writes
- See [docs/CHATGPT-AGENT-SETUP-RECS](docs/CHATGPT-AGENT-SETUP-RECS) for instruction/file/action division guidance

## Testing

```bash
npm test
```

Runs 75 tests across 2 test suites:
- **tests/server.test.js** — 33 integration tests covering all endpoints (mocked GitHub API)
- **tests/normalize.test.js** — 42 unit tests for content normalization, line mapping, symbol discovery

## Deployment on Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables:
   - `GITHUB_APP_ID` (required)
   - `GITHUB_PRIVATE_KEY` (required - paste the entire PEM key; literal `\n` is handled)
   - `GITHUB_INSTALLATION_ID` (optional)
   - `API_AUTH_TOKEN` (recommended for production)
   - `ALLOWED_REPOS` (recommended - restrict which repos can be modified)
   - `ALLOWED_PATHS` (optional - restrict which paths can be modified)
   - `READ_ONLY_REPOS` (optional - allow read but block writes on specific repos)
   - `PATCH_ONLY_PATHS` (optional - require patch endpoints for protected files)
   - `DIAG_INTERVAL_MS` (optional - background self-diagnosis interval in ms)

## Troubleshooting

### "Missing or invalid Authorization header"
If `API_AUTH_TOKEN` is set, you must include the header:
```
Authorization: Bearer <your-token>
```

### "Repository X is not in the allowlist"
The repository is not in `ALLOWED_REPOS`. Either add it to the allowlist or remove the restriction.

### "Path X is not in the allowlist"
The file path is not in `ALLOWED_PATHS`. Either add it to the allowlist or remove the restriction.

### "Repository X is configured as read-only"
The repository is in `READ_ONLY_REPOS`. The `/read` endpoint works but `/apply` is blocked. Remove the repo from `READ_ONLY_REPOS` to enable writes.

### "Missing required env var: GITHUB_APP_ID"
Ensure you have set the `GITHUB_APP_ID` environment variable.

### "Missing installationId (param) or env GITHUB_INSTALLATION_ID"
Either set `GITHUB_INSTALLATION_ID` in your environment or include `installationId` in your request body.

### "Bad credentials" or authentication errors
1. Verify your `GITHUB_APP_ID` is correct
2. Check that your private key is properly formatted
3. Ensure the GitHub App is installed on the target repository
5. Verify the installation ID is correct

### "Resource not accessible by integration"
Your GitHub App doesn't have the required permissions. Ensure it has:
- Repository contents: Read and write

## License

This project is licensed under the **Business Source License 1.1 (BSL 1.1)**.

- Non-commercial use, evaluation, research, and internal review are permitted.
- Commercial use requires a separate license prior to the Change Date.
- On **January 1, 2030**, this project will automatically convert to the **Apache License 2.0**.

See the [LICENSE](./LICENSE) file for full terms.
