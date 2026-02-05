# AI Agent Instructions for repo-bridge

This document provides instructions for AI agents (ChatGPT, Claude, etc.) that use repo-bridge to interact with GitHub repositories.

## Overview

repo-bridge is a multi-repo microservice that lets you read, write, list, copy, and batch-read files across **multiple GitHub repositories**. You are not limited to one repository at a time — every API call accepts an `owner/repo` parameter, so you can operate across any accessible repo on any call.

## Available Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/read` | POST | Read a file from any accessible repo |
| `/list` | POST | List directory contents of any repo |
| `/batch/read` | POST | Read up to 10 files from any combination of repos |
| `/copy` | POST | Copy a file from one repo to another |
| `/apply` | POST | Create/update file(s) in a repo |
| `/github/dryrun` | POST | Preview a write without committing |
| `/health` | GET | Health check |

## How to Use repo-bridge

### Required Headers

```
Content-Type: application/json
Authorization: Bearer <API_AUTH_TOKEN>
```

### Read a File

```json
POST /read
{
  "repo": "owner/repo-name",
  "path": "path/to/file.ext"
}
```

### List a Directory

```json
POST /list
{
  "repo": "owner/repo-name",
  "path": "src"
}
```

### Batch Read (Multi-Repo)

Read files from multiple repos simultaneously:

```json
POST /batch/read
{
  "files": [
    { "repo": "myorg/agent-boot", "path": "AGENT_ENTRY.md" },
    { "repo": "myorg/agent-workspace", "path": "agent/STATE.json" },
    { "repo": "myorg/ai-agent-contract", "path": "capabilities/ALLOWED_ACTIONS.md" }
  ]
}
```

### Copy Between Repos

```json
POST /copy
{
  "source": "myorg/agent-boot",
  "srcPath": "templates/STATE.template.json",
  "destination": "myorg/agent-workspace",
  "destPath": "agent/STATE.json",
  "message": "Initialize state from template"
}
```

### Write a File

```json
POST /apply
{
  "repo": "owner/repo-name",
  "path": "path/to/file.ext",
  "content": "file contents here",
  "message": "Commit message describing the change"
}
```

### Write Multiple Files

```json
POST /apply
{
  "repo": "owner/repo-name",
  "message": "Initialize workspace files",
  "changes": [
    { "path": "agent/STATE.json", "content": "{...}" },
    { "path": "agent/TODO.json", "content": "{...}" }
  ]
}
```

### Dry Run (Preview)

```json
POST /apply
{
  "repo": "owner/repo",
  "path": "file.txt",
  "content": "...",
  "message": "...",
  "dryRun": true
}
```

## Multi-Repo Workflow

You can and should operate across multiple repos. Here is the recommended pattern:

### 1. Orient Yourself

```
/list  → List each repo's root to understand structure
/batch/read → Read entry points (AGENT_ENTRY.md) from all repos
```

### 2. Understand Relationships

```
/read  → Read AGENT_LINK.md in workspace to see repo connections
/batch/read → Compare rules (boot) with state (workspace) and specs (contract)
```

### 3. Execute Work

```
/copy  → Transfer files between repos (e.g., templates to workspace)
/apply → Write results to the workspace repo
```

### 4. Persist State

```
/apply → Update STATE.json, TODO.json, CHANGELOG.md in workspace
```

## Workflow Rules

### 1. Always Dry-Run Before Writes

Before making changes, use `dryRun: true` to preview. This makes zero GitHub API calls.

### 2. Update CHANGELOG_AI.md After Each Commit

After every successful commit to repo-bridge itself, append an entry to `docs/CHANGELOG_AI.md`:

```markdown
## [YYYY-MM-DD HH:MM UTC] <commitSha short>

**Files Changed:** path/to/file.ext
**Summary:** Brief description of what was changed and why
**Triggered By:** User request / automated pipeline / etc.
```

### 3. Update STATE.md When Repo Structure Changes

If you add, remove, or significantly restructure files, update `docs/STATE.md`.

### 4. Commit Message Guidelines

- Start with a verb: Add, Update, Fix, Remove, Refactor
- Be specific: "Add cross-repo copy endpoint" not "Update code"
- Keep under 72 characters for the first line

### 5. Respect Access Levels

- Some repos are **read-only** — you can `/read`, `/list`, `/batch/read`, and use as `/copy` source, but cannot `/apply` or use as `/copy` destination
- Check the repo access map in `docs/REPO_ACCESS_MAP.md`

### 6. Rollback Instructions

If you make a mistake:

1. Read the current file content
2. Identify the previous correct state
3. Apply the corrected content with message: "Revert: <original commit message>"

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| 401 Unauthorized | Invalid/missing token | Check Authorization header |
| 403 Forbidden | Repo/path not allowed | Check allowlists |
| 403 RepoReadOnly | Repo is read-only | Use a different (writable) repo |
| 400 Bad Request | Missing required fields | Check request body |
| 404 NotFound | File/path not found | Verify path exists with /list |
| 500 ApplyFailed | GitHub API error | Check error message |
| 500 CopyFailed | Cross-repo copy error | Check source exists, dest is writable |
| 500 BatchReadFailed | Batch read error | Check individual file errors in response |

## Best Practices

1. **Explore before acting** — Use `/list` and `/batch/read` to understand repos before writing
2. **Use batch operations** — Prefer `/batch/read` over multiple `/read` calls
3. **Use /copy for transfers** — Don't manually read-then-apply; use `/copy` instead
4. **Small, focused changes** — One logical change per commit
5. **Test with dry-run** — Always preview before committing
6. **Document changes** — Update changelogs and state files
7. **Ask when uncertain** — If unsure, request human clarification
