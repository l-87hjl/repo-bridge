# repo-bridge

A minimal Node.js/Express microservice that bridges AI services (like ChatGPT) to GitHub operations. It provides REST API endpoints to programmatically create or update files in GitHub repositories using GitHub App authentication.

## Features

- Create or update files in GitHub repositories via REST API
- GitHub App authentication (no personal access tokens needed)
- Dry-run mode for previewing changes without committing (guaranteed safe - no API calls)
- Default branch targeting (`main` by default)
- API authentication via Bearer token
- Repository and path allowlists for access control
- Support for multiple request formats
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
| POST | `/apply` | Create or update a file in GitHub |
| POST | `/github/dryrun` | Preview changes without committing |

See [docs/API.md](docs/API.md) for detailed API documentation.

## Basic Usage

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
│   ├── CHANGELOG_AI.md        # AI change log (append-only)
│   ├── STATE.md               # Repository state summary
│   └── chatgpt-tool-schema.json  # OpenAPI schema for ChatGPT
├── archive/                   # Archived old code versions
├── .env.example               # Example environment configuration
├── .gitignore
├── package.json
└── README.md
```

## AI Integration

For AI agents (ChatGPT, Claude, etc.) using repo-bridge:

1. **Read** [docs/README_AI.md](docs/README_AI.md) for operational instructions
2. **Import** [docs/chatgpt-tool-schema.json](docs/chatgpt-tool-schema.json) as a custom tool/action
3. **Update** [docs/CHANGELOG_AI.md](docs/CHANGELOG_AI.md) after each commit
4. **Maintain** [docs/STATE.md](docs/STATE.md) when repo structure changes

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

### "Missing required env var: GITHUB_APP_ID"
Ensure you have set the `GITHUB_APP_ID` environment variable.

### "Missing installationId (param) or env GITHUB_INSTALLATION_ID"
Either set `GITHUB_INSTALLATION_ID` in your environment or include `installationId` in your request body.

### "Bad credentials" or authentication errors
1. Verify your `GITHUB_APP_ID` is correct
2. Check that your private key is properly formatted
3. Ensure the GitHub App is installed on the target repository
4. Verify the installation ID is correct

### "Resource not accessible by integration"
Your GitHub App doesn't have the required permissions. Ensure it has:
- Repository contents: Read and write

## License

ISC
