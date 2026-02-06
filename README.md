# repo-bridge

A multi-repo Node.js/Express microservice that bridges AI agents to GitHub operations. Read, write, list, copy, and batch-read files across **multiple repositories** using GitHub App authentication.

Repo-bridge is designed as a governed interface between AI agents and GitHub, emphasizing explicit authorization, scoped access, reversible changes, and **cross-repo analysis**.

## Features

- **Multi-repo operations** — Every endpoint accepts `owner/repo`, enabling cross-repo workflows
- **Batch read** — Read up to 10 files from any combination of repos in one call (`/batch/read`)
- **Cross-repo copy** — Copy files between repositories in a single call (`/copy`)
- **Multi-file writes** — Write multiple files per commit with `changes[]` array
- **Read** files from any accessible GitHub repository
- **List** directory contents for repository exploration
- **Create or update** files in GitHub repositories via REST API
- GitHub App authentication (no personal access tokens needed)
- Dry-run mode for previewing changes without committing (guaranteed safe - no API calls)
- Read-only repository mode for protecting sensitive repos
- API authentication via Bearer token
- Repository and path allowlists for access control
- Security headers via Helmet
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

# Optional server config
PORT=3000                         # Defaults to 3000
```

### 3. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info and available endpoints |
| GET | `/health` | Health check with timestamp |
| POST | `/read` | Read a file from any accessible repo |
| POST | `/list` | List directory contents of any repo |
| POST | `/batchRead` | Read up to 10 files from multiple repos |
| POST | `/copy` | Copy a file between repositories |
| POST | `/apply` | Create or update file(s) in a repo |
| POST | `/dryRun` | Preview changes without committing |

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
│   ├── server.js              # Express server and API routes
│   └── github.js              # GitHub API integration
├── docs/
│   ├── API.md                 # API documentation
│   ├── README_AI.md           # Instructions for AI agents
│   ├── MULTI_REPO_GUIDE.md    # Multi-repo analysis patterns
│   ├── AGENT_SETUP.md         # Multi-layer security setup
│   ├── STANDARDIZATION_GUIDE.md # Agent repo structure guide
│   ├── REPO_ACCESS_MAP.md     # Access control matrix
│   ├── CHATGPT-AGENT-SETUP-RECS # ChatGPT agent setup guidance
│   ├── CHANGELOG_AI.md        # AI change log (append-only)
│   ├── STATE.md               # Repository state summary
│   └── chatgpt-tool-schema.json  # OpenAPI schema for integrations
├── templates/                 # Agent mechanism repo templates
│   ├── agent-boot/            # Boot repo templates (rules, protocols)
│   ├── agent-contract/        # Contract repo templates (specs)
│   └── agent-workspace/       # Workspace repo templates (active state)
├── archive/                   # Archived old code versions
├── .env.example               # Example environment configuration
├── .gitignore
├── package.json
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
