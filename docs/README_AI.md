# AI Agent Instructions for repo-bridge

This document provides instructions for AI agents (ChatGPT, Claude, etc.) that use repo-bridge to interact with GitHub repositories.

## Overview

repo-bridge is a multi-repo microservice that lets you read, write, list, copy, move, search, and patch files across **multiple GitHub repositories**. Every API call accepts an `owner/repo` parameter, so you can operate across any accessible repo on any call.

Version: **0.8.0** — 30 endpoints covering file CRUD, line-accurate reading, cross-repo search, symbol discovery, patching, branch management, and PR creation.

## Quick Reference — All Endpoints

### Reading & Discovery

| Endpoint | Purpose |
|----------|---------|
| `POST /read` | Read a single file |
| `POST /readLines` | Read a file with line numbers, blob SHA, and normalization |
| `POST /blob` | Retrieve a raw blob by SHA (up to 100MB) |
| `POST /batchRead` | Read up to 25 files from any combination of repos |
| `POST /list` | List directory contents |
| `POST /repoTree` | Full recursive file tree in one call |
| `POST /search` | Search content across repos with line-accurate results |
| `POST /symbols` | Discover functions, classes, interfaces across repos |
| `POST /compare` | Compare a file between repos or branches |
| `POST /compareStructure` | Compare directory structures between repos |

### Writing & Modifying

| Endpoint | Purpose |
|----------|---------|
| `POST /apply` | Create or update file(s) — full content write |
| `POST /updateFile` | Update a file — server handles diff automatically |
| `POST /patchReplace` | Search-and-replace within a file |
| `POST /patchDiff` | Apply a unified diff to a file |
| `POST /deleteFile` | Delete a file |
| `POST /copy` | Copy a file (same repo or cross-repo) — exact byte-for-byte |
| `POST /moveFile` | Move or rename a file in one call |
| `POST /dryRun` | Preview a write without committing (zero API calls) |

### Branch & PR Management

| Endpoint | Purpose |
|----------|---------|
| `POST /listBranches` | List all branches with commit SHAs |
| `POST /createBranch` | Create a feature branch |
| `POST /createPR` | Create a pull request |

### Observability

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check (returns 503 if GitHub is down) |
| `GET /metrics` | Uptime, memory, rate-limit, diagnostics |
| `POST /diagnose` | Test connectivity and permissions for a repo |

---

## Required Headers

```
Content-Type: application/json
Authorization: Bearer <API_AUTH_TOKEN>
```

---

## File Operations — One Call Each

These are the core operations. Each is a single API call — no multi-step workarounds needed.

### Read a File

```json
POST /read
{ "repo": "owner/repo", "path": "src/server.js" }
```

### Read with Line Numbers (for accurate patching)

Use `/readLines` before any patch operation. It returns line numbers and a `blobSha` for drift detection.

```json
POST /readLines
{ "repo": "owner/repo", "path": "src/server.js", "startLine": 10, "endLine": 50 }
```

Response includes:
- `lines[]` — array of `{ lineNumber, text }` objects
- `blobSha` — use this to detect if the file changed between your read and patch
- `totalLines` — total line count in the file
- `normalized` — whether CRLF was converted to LF

### Write / Create a File

```json
POST /apply
{ "repo": "owner/repo", "path": "new-file.txt", "content": "file contents", "message": "Add new file" }
```

### Update an Existing File (server-side diff)

Instead of computing a diff yourself, just send the full new content. The server reads the current file, diffs it, and commits.

```json
POST /updateFile
{ "repo": "owner/repo", "path": "src/config.js", "content": "updated contents", "message": "Update config" }
```

### Delete a File

```json
POST /deleteFile
{ "repo": "owner/repo", "path": "obsolete.txt", "message": "Remove obsolete file" }
```

### Copy a File (same repo or cross-repo)

Exact byte-for-byte copy. Works within the same repo or across repos.

```json
POST /copy
{
  "sourceRepo": "org/repo-a",
  "sourcePath": "templates/config.json",
  "destinationRepo": "org/repo-b",
  "destinationPath": "config/config.json",
  "message": "Copy config template to repo-b"
}
```

For same-repo copy, set `destinationRepo` to the same repo.

### Move / Rename a File

One call. Within the same repo this is a rename. Across repos it's a cross-repo move.

```json
POST /moveFile
{
  "sourceRepo": "owner/repo",
  "sourcePath": "old/path/file.js",
  "destinationPath": "new/path/file.js",
  "message": "Rename file"
}
```

For cross-repo move, add `destinationRepo`:

```json
POST /moveFile
{
  "sourceRepo": "org/repo-a",
  "sourcePath": "src/utils.js",
  "destinationRepo": "org/repo-b",
  "destinationPath": "lib/utils.js",
  "message": "Move utils to shared repo"
}
```

### Preview Before Writing (Dry Run)

Makes zero GitHub API calls. Always safe.

```json
POST /dryRun
{ "repo": "owner/repo", "path": "file.txt", "content": "...", "message": "..." }
```

---

## Patching — How to Make Surgical Edits

For modifying part of a file without replacing the whole thing, use the patch endpoints.

### Recommended Workflow: readLines → patchReplace

1. **Read the file with line numbers** to see the exact current content:

```json
POST /readLines
{ "repo": "owner/repo", "path": "src/server.js" }
```

2. **Find the exact text you want to change** in the `lines[]` response. Copy it exactly.

3. **Apply search-and-replace:**

```json
POST /patchReplace
{
  "repo": "owner/repo",
  "path": "src/server.js",
  "message": "Change default port",
  "operations": [
    { "search": "const PORT = 3000;", "replace": "const PORT = process.env.PORT || 3000;" }
  ]
}
```

The `search` string must match exactly (byte-for-byte) what's in the file. Using `/readLines` first ensures you have the exact text including whitespace and line endings.

### Unified Diff Patching

If you have a unified diff:

```json
POST /patchDiff
{
  "repo": "owner/repo",
  "path": "src/app.js",
  "message": "Fix bug",
  "patch": "@@ -10,3 +10,4 @@\n const express = require('express');\n-const port = 3000;\n+const port = process.env.PORT || 3000;\n+const host = '0.0.0.0';\n"
}
```

### Why readLines Matters for Patching

The `/readLines` endpoint solves a common problem: **line number mismatch**. Without it:
- GitHub's API returns raw content that may have CRLF line endings
- Line numbers you compute locally may not match the actual file
- Patch operations fail because the search string doesn't match

`/readLines` normalizes line endings (CRLF→LF), returns authoritative line numbers, and provides a `blobSha` so you can detect if the file changed between read and patch.

---

## Cross-Repo Operations

### Batch Read (up to 25 files, any mix of repos)

```json
POST /batchRead
{
  "files": [
    { "repo": "org/agent-boot", "path": "AGENT_ENTRY.md" },
    { "repo": "org/agent-workspace", "path": "STATE.json" },
    { "repo": "org/agent-contract", "path": "ALLOWED_ACTIONS.md" }
  ]
}
```

### Search Across Repos

```json
POST /search
{
  "query": "handleError",
  "repos": ["org/api-server", "org/shared-utils"]
}
```

Returns line-accurate results with `lineNumber`, `context`, and `reference.githubUrl` for each match.

### Discover Symbols (Functions, Classes)

```json
POST /symbols
{
  "repos": ["org/api-server"],
  "options": { "nameFilter": "handle", "extensions": [".js", ".ts"] }
}
```

Returns symbol definitions with line numbers and GitHub URLs. Supports JS/TS, Python, Go, Ruby, Java, Kotlin, C#, Rust.

### Full Repo Tree

Get every file in a repo with SHAs and sizes in one call:

```json
POST /repoTree
{ "repo": "owner/repo" }
```

---

## Branch & PR Workflow

### List Branches

```json
POST /listBranches
{ "repo": "owner/repo" }
```

### Create a Feature Branch

```json
POST /createBranch
{ "repo": "owner/repo", "branch": "feature/my-change", "fromBranch": "main" }
```

### Create a Pull Request

```json
POST /createPR
{
  "repo": "owner/repo",
  "title": "Add new feature",
  "head": "feature/my-change",
  "base": "main",
  "body": "Description of changes"
}
```

---

## Multi-Repo Workflow Pattern

### 1. Orient — Understand the repos

```
POST /repoTree → Full file tree for each repo
POST /batchRead → Read entry points from all repos at once
```

### 2. Discover — Find what you need

```
POST /search → Find code across repos
POST /symbols → Map function/class definitions
POST /readLines → Read specific sections with exact line numbers
```

### 3. Execute — Make changes

```
POST /patchReplace → Surgical edits (preferred for existing files)
POST /updateFile → Full file replacement (server handles diff)
POST /apply → Create new files
POST /copy → Transfer files between repos (byte-for-byte)
POST /moveFile → Relocate files (same repo = rename, cross-repo = move)
POST /deleteFile → Remove files
```

### 4. Govern — Propose and track

```
POST /createBranch → Work on a feature branch
POST /createPR → Propose changes for review
POST /dryRun → Preview any write before committing
```

---

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| 400 Bad Request | Missing required fields | Check request body |
| 401 Unauthorized | Invalid/missing token | Check Authorization header |
| 403 Forbidden | Repo/path not allowed | Check allowlists |
| 403 RepoReadOnly | Repo is read-only | Use a different (writable) repo |
| 403 PatchOnlyPath | Full overwrite blocked | Use `/patchReplace` or `/patchDiff` instead of `/apply` |
| 404 NotFound | File/path not found | Verify path with `/list` or `/repoTree` |
| 409 PatchConflict | Search string not found | Re-read file with `/readLines`, copy exact text |
| 409 ShaConflict | File changed since read | Re-read and retry |
| 500 | Server/GitHub error | Check error message for details |

## Best Practices

1. **Use `/readLines` before patching** — ensures exact text match and catches drift
2. **Use `/repoTree` instead of recursive `/list`** — one call vs many
3. **Use `/batchRead` instead of multiple `/read`** — up to 25 files in one call
4. **Use `/copy` for transfers** — don't manually read-then-apply
5. **Use `/moveFile` for rename/move** — don't manually copy-then-delete
6. **Use `/updateFile` when replacing content** — server handles the diff
7. **Use `/patchReplace` for surgical edits** — safer than full replacement
8. **Use `/dryRun` before writes** — preview with zero risk
9. **Small, focused commits** — one logical change per commit
10. **Update changelogs** — append to `docs/CHANGELOG_AI.md` after commits

## Workflow Rules

### Update CHANGELOG_AI.md After Each Commit

After every successful commit to repo-bridge itself, append an entry:

```markdown
## [YYYY-MM-DD HH:MM UTC] <commitSha short>

**Files Changed:** path/to/file.ext
**Summary:** Brief description of what was changed and why
**Triggered By:** User request / automated pipeline / etc.
```

### Respect Access Levels

- Some repos are **read-only** — you can read but not write
- Some paths are **patch-only** — you must use `/patchReplace` or `/patchDiff` (not `/apply`)
- Check `docs/REPO_ACCESS_MAP.md` for the access matrix

### Commit Message Guidelines

- Start with a verb: Add, Update, Fix, Remove, Refactor
- Be specific: "Add cross-repo copy endpoint" not "Update code"
- Keep under 72 characters for the first line
