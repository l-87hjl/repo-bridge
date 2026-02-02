# Agent Setup Guide

How to configure AI agents (ChatGPT, Claude, etc.) to use repo-bridge for GitHub operations.

---

## Overview

repo-bridge acts as a secure intermediary between AI agents and GitHub. The agent makes HTTP requests to repo-bridge, which authenticates via GitHub App and performs the requested operations.

```
┌─────────────┐     HTTPS      ┌──────────────┐    GitHub API   ┌────────────┐
│  AI Agent   │───────────────▶│  repo-bridge │───────────────▶│   GitHub   │
│  (ChatGPT)  │◀───────────────│  (Render)    │◀───────────────│   Repos    │
└─────────────┘                └──────────────┘                └────────────┘
```

---

## Setting Up ChatGPT Custom GPT

### 1. Create Custom GPT Action

In your Custom GPT configuration, add an Action with this OpenAPI schema:

```yaml
openapi: 3.1.0
info:
  title: repo-bridge
  version: 1.0.0
servers:
  - url: https://your-repo-bridge.onrender.com
paths:
  /read:
    post:
      operationId: readFile
      summary: Read a file from GitHub
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [repo, path]
              properties:
                repo:
                  type: string
                  description: "Repository in owner/repo format"
                path:
                  type: string
                  description: "File path within repository"
                branch:
                  type: string
                  default: "main"
      responses:
        '200':
          description: File content returned
  /apply:
    post:
      operationId: applyFile
      summary: Create or update a file in GitHub
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [repo, path, content, message]
              properties:
                repo:
                  type: string
                  description: "Repository in owner/repo format"
                path:
                  type: string
                  description: "File path within repository"
                content:
                  type: string
                  description: "File content to write"
                message:
                  type: string
                  description: "Commit message"
                branch:
                  type: string
                  default: "main"
      responses:
        '200':
          description: File committed successfully
```

### 2. Configure Authentication

Add the Authorization header in your GPT's Action configuration:

```
Authorization: Bearer YOUR_API_AUTH_TOKEN
```

This token must match the `API_AUTH_TOKEN` environment variable in your repo-bridge deployment.

### 3. Agent Behavior: Explicit Repo Specification

**Important:** The agent must explicitly specify `owner/repo` for every operation.

ChatGPT will not assume which repository to use. You must invoke operations like:

```
Read the file README.md from l-87hjl/rule-based-horror
```

or

```
Write this content to l-87hjl/agent-project-space at path docs/notes.md
```

The agent will prompt you to specify the repository if you don't include it. This is a safety feature—it prevents accidental writes to the wrong repository.

---

## Security Architecture

repo-bridge implements defense-in-depth with multiple security layers:

### Layer 1: GitHub App Installation (Strongest)

**If the GitHub App is not installed on a repository, repo-bridge cannot access it at all.**

This is the strongest form of access control. Use this for:
- Repositories containing secrets or credentials
- Infrastructure/deployment repositories
- The repo-bridge repository itself

```
┌─────────────────────────────────────────────────────────────┐
│  NO APP INSTALLED = ZERO ACCESS                             │
│  Agent cannot read or write. Period.                        │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2: Read-Only Repositories

**For repos where the agent needs read access but should never write.**

Set in Render environment:
```
READ_ONLY_REPOS=l-87hjl/agent-boot,l-87hjl/reference-docs
```

Use this for:
- Boot/contract repositories (agent reads rules but can't modify them)
- Reference documentation
- Shared configuration templates

```
┌─────────────────────────────────────────────────────────────┐
│  READ_ONLY_REPOS = READ YES, WRITE NO                       │
│  Agent can read files but /apply returns 403 RepoReadOnly   │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Repository Allowlist

**Explicitly list which repositories can be accessed.**

Set in Render environment:
```
ALLOWED_REPOS=l-87hjl/project-a,l-87hjl/project-b
```

Or use wildcards:
```
ALLOWED_REPOS=l-87hjl/*
```

**Trade-offs:**

| Approach | Pros | Cons |
|----------|------|------|
| Explicit list | Maximum security, clear audit trail | Must update Render for each new repo |
| Wildcard `owner/*` | Convenient, automatic for new repos | Broader access, relies on Layer 1 |

**Recommendation:** Use wildcards (`l-87hjl/*`) combined with Layer 1 (selective app installation). This gives you convenience while maintaining strong security—repos without the app installed remain completely inaccessible.

### Layer 4: Path Allowlist

**Restrict which file paths can be modified.**

```
ALLOWED_PATHS=docs/*,src/*,config/*
```

Use this to:
- Prevent modification of CI/CD files (`.github/workflows/`)
- Protect configuration files
- Limit agent to specific directories

### Layer 5: Bearer Token Authentication

**Requires valid token for all requests.**

```
API_AUTH_TOKEN=your-secret-token
```

Without this token, all requests return `401 Unauthorized`.

---

## Security Decision Matrix

| Scenario | Recommended Approach |
|----------|---------------------|
| Repo should never be accessed by agent | Don't install GitHub App |
| Agent needs to read but never write | Install app + add to `READ_ONLY_REPOS` |
| Agent needs full read/write access | Install app + (optionally) add to `ALLOWED_REPOS` |
| Protect specific files/folders | Use `ALLOWED_PATHS` |
| Prevent unauthorized clients | Set `API_AUTH_TOKEN` |

---

## Repository Access Configuration

### Example Configuration for Multi-Repo Agent System

```env
# Render Environment Variables

# Authentication (REQUIRED for production)
API_AUTH_TOKEN=your-64-char-random-token

# GitHub App credentials
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_INSTALLATION_ID=12345678

# Repository access control
ALLOWED_REPOS=l-87hjl/*

# Read-only repositories (app installed, writes blocked)
READ_ONLY_REPOS=l-87hjl/agent-boot

# Path restrictions (optional)
ALLOWED_PATHS=docs/*,src/*,*.md,*.json
```

### Documenting Your Repository Access

Create a table documenting which repos have which access level:

| Repository | App Installed | Access Level | Purpose |
|------------|---------------|--------------|---------|
| `repo-bridge` | No | None | Bridge infrastructure - no agent access |
| `agent-boot` | Yes | Read-only | Agent reads boot contract, cannot modify |
| `agent-project-space` | Yes | Read/Write | Active workspace for agent tasks |
| `rule-based-horror` | Yes | Read/Write | Project repository |
| `ai-agent-contract` | Yes | Read-only | Contract definitions |
| `personal-notes` | No | None | Private, not for agent access |

---

## Verifying Access

### Test Read Access

```bash
curl -X POST https://your-repo-bridge.onrender.com/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"repo": "owner/repo", "path": "README.md"}'
```

### Test Write Access (Dry Run)

```bash
curl -X POST https://your-repo-bridge.onrender.com/apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "repo": "owner/repo",
    "path": "test.md",
    "content": "test",
    "message": "test commit",
    "dryRun": true
  }'
```

### Expected Responses

| Scenario | Response |
|----------|----------|
| Success | `{"ok": true, ...}` |
| No app installed | `500` - GitHub API error (no installation) |
| Read-only repo | `403` - `{"error": "RepoReadOnly"}` |
| Not in allowlist | `403` - `{"error": "Forbidden"}` |
| Bad token | `401` - `{"error": "Unauthorized"}` |

---

## Troubleshooting

### "Agent won't access my repo"

1. Check if GitHub App is installed on that repo
2. Check if repo is in `ALLOWED_REPOS` (if set)
3. Verify you're specifying `owner/repo` format

### "Agent can read but not write"

1. Check if repo is in `READ_ONLY_REPOS`
2. Check if path is in `ALLOWED_PATHS` (if set)

### "Getting 401 Unauthorized"

1. Verify `API_AUTH_TOKEN` is set in Render
2. Verify agent is sending `Authorization: Bearer <token>` header
3. Check token matches exactly (no extra spaces)

---

## Next Steps

1. Install GitHub App on repositories you want the agent to access
2. Configure `READ_ONLY_REPOS` for repos that should be read-only
3. Set `API_AUTH_TOKEN` to secure your endpoint
4. Test with dry-run before enabling writes
5. Document your repo access matrix (see template above)
