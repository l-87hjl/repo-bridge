# repo-bridge

A minimal Node.js/Express microservice that bridges AI services (like ChatGPT) to GitHub operations. It provides REST API endpoints to programmatically create or update files in GitHub repositories using GitHub App authentication.

## Features

- Create or update files in GitHub repositories via REST API
- GitHub App authentication (no personal access tokens needed)
- Dry-run mode for previewing changes without committing
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
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_INSTALLATION_ID=12345678  # Optional: can be passed per-request
PORT=3000                         # Optional: defaults to 3000
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
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "branch": "main",
    "path": "test.txt",
    "content": "Hello, World!",
    "message": "Add test file"
  }'
```

### Preview Changes (Dry Run)

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "branch": "main",
    "path": "test.txt",
    "content": "Hello, World!",
    "message": "Add test file",
    "dryRun": true
  }'
```

## Project Structure

```
repo-bridge/
├── src/
│   ├── server.js      # Express server and API routes
│   └── github.js      # GitHub API integration
├── docs/
│   └── API.md         # API documentation
├── archive/           # Archived old code versions
├── .env.example       # Example environment configuration
├── .gitignore
├── package.json
└── README.md
```

## Deployment on Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables:
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY` (paste the entire PEM key; literal `\n` is handled)
   - `GITHUB_INSTALLATION_ID` (optional)

## Troubleshooting

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
