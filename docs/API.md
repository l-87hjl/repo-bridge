# repo-bridge API Documentation

## Base URL

```
http://localhost:3000
```

For production deployments, replace with your deployed URL.

---

## Multi-Repo Support

All endpoints accept an `owner/repo` parameter, enabling operations across multiple repositories. Key multi-repo endpoints:

- **`/batchRead`** (or `/batch/read`) — Read up to 25 files from any combination of repos in one call
- **`/copy`** — Copy a file from one repo to another in one call
- **`/apply`** with `changes[]` — Write multiple files to a repo in one call
- **`/search`** — Search content across multiple repos with line-accurate results
- **`/symbols`** — Discover symbols (functions, classes) across repos
- **`/compare`** — Compare a file between two repos or branches
- **`/compareStructure`** — Compare directory structures between repos
- **`/dryRun`** (or `/github/dryrun`) — Preview changes without committing

See [MULTI_REPO_GUIDE.md](MULTI_REPO_GUIDE.md) for patterns and examples.

---

## Authentication

If `API_AUTH_TOKEN` is set in the environment, all endpoints (except `/health`) require an Authorization header:

```
Authorization: Bearer <your-token>
```

If `API_AUTH_TOKEN` is not set, requests are allowed without authentication.

---

## Access Control

### Repository Allowlist

If `ALLOWED_REPOS` is set, only the specified repositories can be modified. Format: comma-separated list, supports wildcards.

```env
ALLOWED_REPOS=myorg/*,otheruser/specific-repo
```

### Path Allowlist

If `ALLOWED_PATHS` is set, only the specified paths can be modified. Format: comma-separated list, supports wildcards and prefix matching.

```env
ALLOWED_PATHS=src/*,docs/*,config/
```

### Read-Only Repositories

If `READ_ONLY_REPOS` is set, the specified repositories can be read via `/read` but writes via `/apply` are blocked. Use this when you need the GitHub App installed for read access but want to prevent modifications.

```env
READ_ONLY_REPOS=myorg/config-repo,myorg/reference-docs
```

### Patch-Only Paths

If `PATCH_ONLY_PATHS` is set, the specified file paths cannot be overwritten via `/apply` — they must be modified using `/patchReplace` or `/patchDiff`. This prevents AI agents from accidentally replacing entire files when they should be making surgical edits.

```env
PATCH_ONLY_PATHS=src/server.js,src/github.js,config/*
```

---

## Endpoints

### GET /

Returns service information and available endpoints.

**Response**

```json
{
  "service": "repo-bridge",
  "status": "running",
  "version": "0.7.0",
  "endpoints": ["/health", "/metrics", "/apply", "/read", "/readLines", "/blob", "/search", "/symbols", "..."],
  "capabilities": {
    "readLines": "Line-accurate file reading with normalization (v0.7.0)",
    "search": "Cross-repo content search (v0.7.0)",
    "symbols": "Cross-repo symbol discovery (v0.7.0)",
    "..."
  }
}
```

---

### GET /health

Health check endpoint for monitoring. Returns 503 if GitHub connectivity fails.

**Response (200)**

```json
{
  "ok": true,
  "service": "repo-bridge",
  "version": "0.7.0",
  "time": "2026-01-15T10:30:00.000Z",
  "uptime": 3600,
  "github": {
    "connected": true,
    "rateLimit": { "remaining": 4500, "limit": 5000, "resetsAt": "..." }
  }
}
```

**Response (503)** — GitHub connectivity failure:

```json
{
  "ok": false,
  "service": "repo-bridge",
  "github": { "connected": false, "error": "..." }
}
```

---

### POST /apply

Create or update a file in a GitHub repository.

**Request Body**

The endpoint accepts two formats:

#### Format A: Simple (single file)

```json
{
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "path": "path/to/file.txt",
  "content": "File contents here",
  "message": "Commit message",
  "installationId": 12345678,
  "dryRun": false
}
```

#### Format B: With changes array

```json
{
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "message": "Commit message",
  "changes": [
    {
      "path": "path/to/file.txt",
      "content": "File contents here"
    }
  ],
  "installationId": 12345678,
  "dryRun": false
}
```

#### Alternative repo format

You can also specify the repo as `"owner/repo"`:

```json
{
  "repo": "username/repository-name",
  "branch": "main",
  "path": "path/to/file.txt",
  "content": "File contents here",
  "message": "Commit message"
}
```

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes* | Repository owner (username or org) |
| `repo` | string | Yes | Repository name (or `owner/repo` format) |
| `branch` | string | No | Target branch name (defaults to `main`) |
| `path` | string | Yes | File path within the repository |
| `content` | string | Yes | File content to write |
| `message` | string | Yes | Commit message |
| `installationId` | number | No | GitHub App installation ID (overrides env) |
| `dryRun` | boolean | No | If true, preview only (no commit) |
| `changes` | array | No | Alternative to path/content for single file |

*`owner` is optional if `repo` is in `owner/repo` format.

**Success Response (200)**

```json
{
  "ok": true,
  "committed": true,
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "path": "path/to/file.txt",
  "created": true,
  "updated": false,
  "commitSha": "abc123...",
  "contentSha": "def456..."
}
```

| Field | Description |
|-------|-------------|
| `committed` | Always `true` on success |
| `created` | `true` if file was newly created |
| `updated` | `true` if file was updated (existed before) |
| `commitSha` | SHA of the commit |
| `contentSha` | SHA of the file content |

**Dry Run Response (200)**

When `dryRun: true`:

```json
{
  "ok": true,
  "wouldApply": {
    "owner": "username",
    "repo": "repository-name",
    "branch": "main",
    "path": "path/to/file.txt",
    "bytes": 19,
    "message": "Commit message"
  }
}
```

**Error Responses**

*400 Bad Request* - Missing required fields:

```json
{
  "ok": false,
  "error": "BadRequest",
  "message": "Required: owner, repo, path, content(string), message. Optional: branch (defaults to main)"
}
```

*401 Unauthorized* - Missing or invalid auth token:

```json
{
  "ok": false,
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Use: Bearer <token>"
}
```

*403 Forbidden* - Repository or path not in allowlist:

```json
{
  "ok": false,
  "error": "Forbidden",
  "message": "Repository myorg/myrepo is not in the allowlist"
}
```

*403 RepoReadOnly* - Repository is configured as read-only:

```json
{
  "ok": false,
  "error": "RepoReadOnly",
  "message": "Repository myorg/myrepo is configured as read-only"
}
```

*409 SHA Conflict* - File changed since last read (when `expectedSha` is provided):

```json
{
  "ok": false,
  "error": "ShaConflict",
  "message": "SHA guard failed: file has been modified since last read. Expected SHA abc123, found def456.",
  "hint": "The file has been modified since you last read it. Re-read the file to get the current SHA, then retry."
}
```

*500 Server Error* - GitHub API or authentication error:

```json
{
  "ok": false,
  "error": "ApplyFailed",
  "message": "Error message details"
}
```

#### SHA Guard (Optimistic Concurrency)

Prevent accidental overwrites by including the `expectedSha` from your last `/read` response:

```json
{
  "repo": "myuser/myrepo",
  "path": "config.json",
  "content": "{\"key\": \"updated\"}",
  "message": "Update config",
  "expectedSha": "abc123def456..."
}
```

If the file was modified by another process between your read and write, the request returns `409 ShaConflict` instead of overwriting.

Safe workflow:
1. `POST /read` → get `sha` from response
2. Modify content locally
3. `POST /apply` with `expectedSha: sha` → guaranteed safe write

#### Append Mode

Add content to the end of a file without replacing existing content:

```json
{
  "repo": "myuser/myrepo",
  "path": "log.txt",
  "content": "New log entry",
  "message": "Append log entry",
  "mode": "append",
  "separator": "\n"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | Yes | Set to `"append"` to enable append mode |
| `separator` | string | No | String inserted between existing and new content (defaults to `"\n"`) |

If the file does not exist, it will be created with just the new content.

Append mode is also supported in multi-file writes via `changes[]`:

```json
{
  "repo": "myuser/myrepo",
  "message": "Add entries",
  "changes": [
    { "path": "log.txt", "content": "Entry 1", "mode": "append" },
    { "path": "data.csv", "content": "row1,row2", "mode": "append", "separator": "\n" }
  ]
}
```

---

### POST /patch

Apply incremental changes to a file without full replacement. Reads the current file, applies changes, and commits the result. This is the safest way to make partial file modifications.

Supports two modes:

#### Mode 1: Search-and-Replace (Recommended for AI agents)

```json
{
  "repo": "myuser/myrepo",
  "path": "src/server.js",
  "operations": [
    {
      "search": "const PORT = 3000;",
      "replace": "const PORT = process.env.PORT || 3000;"
    },
    {
      "search": "console.log('debug')",
      "replace": "",
      "replaceAll": true
    }
  ],
  "message": "Make port configurable and remove debug logs"
}
```

Each operation:
- Finds the exact `search` string in the file
- Replaces it with `replace`
- If `replaceAll: true`, replaces all occurrences (otherwise first only)
- Operations are applied sequentially
- If `search` is not found, the request fails with `409 PatchConflict`

#### Mode 2: Unified Diff

```json
{
  "repo": "myuser/myrepo",
  "path": "src/app.js",
  "patch": "@@ -10,3 +10,4 @@\n const express = require('express');\n-const port = 3000;\n+const port = process.env.PORT || 3000;\n+const host = '0.0.0.0';\n",
  "message": "Make server configurable"
}
```

Standard unified diff format with `@@ -start,count +start,count @@` hunk headers.
Context lines are verified for safety — if the file has changed since the diff was created, the patch fails instead of corrupting the file.

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes* | Repository owner |
| `repo` | string | Yes | Repository name (or `owner/repo`) |
| `path` | string | Yes | File path to patch |
| `operations` | array | Yes** | Search-and-replace operations |
| `patch` | string | Yes** | Unified diff string |
| `message` | string | Yes | Commit message |
| `branch` | string | No | Target branch (defaults to `main`) |
| `dryRun` | boolean | No | Preview without committing |
| `installationId` | number | No | GitHub App installation ID |

*`owner` is optional if `repo` is in `owner/repo` format.
**Provide either `operations` or `patch`, not both.

**Success Response (200)**

```json
{
  "ok": true,
  "committed": true,
  "owner": "myuser",
  "repo": "myrepo",
  "branch": "main",
  "path": "src/server.js",
  "previousSha": "abc123...",
  "commitSha": "def456...",
  "contentSha": "ghi789...",
  "operations": [
    { "index": 0, "applied": true, "searchLength": 20, "replaceLength": 42 }
  ]
}
```

**No-Change Response (200)**

If the patch produces identical content (e.g., replacing a string with itself):

```json
{
  "ok": true,
  "committed": false,
  "noChange": true,
  "message": "Patch produced no changes to file content"
}
```

**Dry-Run Response (200)**

```json
{
  "ok": true,
  "dryRun": true,
  "changed": true,
  "previousSize": 1234,
  "newSize": 1256,
  "preview": "full file content after patch...",
  "operations": [{ "index": 0, "applied": true }]
}
```

**Error Responses**

*409 PatchConflict* - Search string not found or context mismatch:

```json
{
  "ok": false,
  "error": "PatchConflict",
  "message": "Operation 0: search string not found in file",
  "hint": "The patch could not be applied. The file content may have changed since the patch was created. Re-read the file and try again."
}
```

---

### POST /read

Read a file from a GitHub repository.

**Request Body**

```json
{
  "repo": "owner/repository-name",
  "path": "path/to/file.txt",
  "branch": "main"
}
```

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes* | Repository owner (username or org) |
| `repo` | string | Yes | Repository name (or `owner/repo` format) |
| `path` | string | Yes | File path within the repository |
| `branch` | string | No | Target branch name (defaults to `main`) |
| `installationId` | number | No | GitHub App installation ID (overrides env) |

*`owner` is optional if `repo` is in `owner/repo` format.

**Success Response (200)**

```json
{
  "ok": true,
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "path": "path/to/file.txt",
  "sha": "abc123def456...",
  "size": 1234,
  "content": "file contents here..."
}
```

**Error Responses**

*404 Not Found* - File does not exist:

```json
{
  "ok": false,
  "error": "NotFound",
  "message": "File not found"
}
```

*400 Bad Request* - Path is a directory:

```json
{
  "ok": false,
  "error": "BadRequest",
  "message": "Path is a directory, not a file"
}
```

---

### POST /list

List files and directories in a repository path. Can target any accessible repo.

**Request Body**

```json
{
  "repo": "owner/repository-name",
  "path": "src",
  "branch": "main"
}
```

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `path` | string | No | Directory path (defaults to root) |
| `branch` | string | No | Target branch (defaults to `main`) |

**Success Response (200)**

```json
{
  "ok": true,
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "path": "src",
  "entries": [
    { "name": "server.js", "path": "src/server.js", "type": "file", "size": 5432 },
    { "name": "utils", "path": "src/utils", "type": "dir", "size": 0 }
  ]
}
```

---

### POST /batchRead

Read multiple files from one or more repositories in a single call. Files are read concurrently. Maximum 25 files per request.

Also available at `/batch/read` for backward compatibility.

**Request Body**

```json
{
  "files": [
    { "repo": "myorg/agent-boot", "path": "AGENT_ENTRY.md" },
    { "repo": "myorg/agent-workspace", "path": "agent/STATE.json" },
    { "repo": "myorg/ai-agent-contract", "path": "capabilities/ALLOWED_ACTIONS.md" }
  ]
}
```

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | array | Yes | Array of file objects (max 25) |
| `files[].repo` | string | Yes | Repository in `owner/repo` format |
| `files[].path` | string | Yes | File path within the repository |
| `files[].branch` | string | No | Target branch (defaults to `main`) |

**Success Response (200)**

```json
{
  "ok": true,
  "files": [
    { "ok": true, "owner": "myorg", "repo": "agent-boot", "path": "AGENT_ENTRY.md", "content": "...", "sha": "...", "size": 456 },
    { "ok": true, "owner": "myorg", "repo": "agent-workspace", "path": "agent/STATE.json", "content": "...", "sha": "...", "size": 789 },
    { "ok": false, "owner": "myorg", "repo": "ai-agent-contract", "path": "capabilities/ALLOWED_ACTIONS.md", "error": "File not found" }
  ]
}
```

Note: Individual file reads can fail without failing the entire batch. Check `ok` on each entry.

---

### POST /copy

Copy a file from one repository to another in a single call. Reads from the source and writes to the destination.

**Request Body (v1.2.1 format)**

```json
{
  "sourceRepo": "myorg/agent-boot",
  "sourcePath": "templates/STATE.template.json",
  "destinationRepo": "myorg/agent-workspace",
  "destinationPath": "agent/STATE.json",
  "message": "Initialize state from template"
}
```

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceRepo` | string | Yes | Source repo in `owner/repo` format |
| `sourcePath` | string | Yes | File path in source repo |
| `sourceBranch` | string | No | Source branch (defaults to `main`) |
| `destinationRepo` | string | Yes | Destination repo in `owner/repo` format |
| `destinationPath` | string | No | Path in destination (defaults to same as sourcePath) |
| `destinationBranch` | string | No | Destination branch (defaults to `main`) |
| `message` | string | No | Commit message (auto-generated if omitted) |

Also accepts legacy field names: `source`/`srcPath`/`destination`/`destPath`.

**Success Response (200)**

```json
{
  "ok": true,
  "copied": true,
  "source": {
    "owner": "myorg",
    "repo": "agent-boot",
    "branch": "main",
    "path": "templates/STATE.template.json",
    "sha": "abc123..."
  },
  "destination": {
    "committed": true,
    "owner": "myorg",
    "repo": "agent-workspace",
    "branch": "main",
    "path": "agent/STATE.json",
    "created": true,
    "updated": false,
    "commitSha": "def456...",
    "contentSha": "ghi789..."
  }
}
```

**Error Responses**

*404 Not Found* - Source file does not exist
*403 Forbidden* - Source or destination repo not in allowlist
*403 RepoReadOnly* - Destination repo is read-only

---

### POST /dryRun

Preview what would be applied without making any changes. This endpoint does not call the GitHub API.

Also available at `/github/dryrun` for backward compatibility.

**Request Body**

Same as `/apply` (both formats supported).

**Response (200)**

Single file:
```json
{
  "ok": true,
  "wouldApply": {
    "owner": "username",
    "repo": "repository-name",
    "branch": "main",
    "path": "path/to/file.txt",
    "bytes": 19,
    "message": "Commit message"
  }
}
```

Multi-file (with `changes[]`):
```json
{
  "ok": true,
  "wouldApply": [
    { "owner": "username", "repo": "repository-name", "branch": "main", "path": "file1.txt", "bytes": 19, "message": "Commit message" },
    { "owner": "username", "repo": "repository-name", "branch": "main", "path": "file2.txt", "bytes": 42, "message": "Commit message" }
  ]
}
```

---

### GET /metrics

Service observability endpoint. Returns uptime, memory usage, version, GitHub rate-limit status with warning thresholds, and last diagnostic snapshot.

**Response (200)**

```json
{
  "success": true,
  "service": "repo-bridge",
  "version": "0.7.0",
  "uptime": 3600,
  "time": "2026-01-15T10:30:00.000Z",
  "memory": { "rss": 52428800, "heapUsed": 20971520, "heapTotal": 33554432, "external": 1048576 },
  "github": {
    "connected": true,
    "rateLimit": {
      "remaining": 4500,
      "limit": 5000,
      "resetsAt": "2026-01-15T11:00:00.000Z",
      "warning": false,
      "warningThreshold": 500
    }
  },
  "diagnosis": { "snapshot": null, "capturedAt": null },
  "config": { "patchOnlyPaths": [], "readOnlyRepos": [], "diagIntervalMs": 0 }
}
```

Rate-limit `warning` is `true` when remaining < 10% of limit.

---

### POST /patchReplace

Apply search-and-replace operations to a file and commit. Single-purpose endpoint — GPT Actions safe (flat schema, no conditional fields).

**Request Body**

```json
{
  "repo": "owner/repo",
  "path": "src/config.js",
  "message": "Change port",
  "operations": [
    { "search": "port: 3000", "replace": "port: 8080" }
  ]
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `path` | string | Yes | File path to patch |
| `message` | string | Yes | Commit message |
| `operations` | array | Yes | Array of `{ search, replace }` objects |
| `branch` | string | No | Target branch (defaults to `main`) |

**Response (200)**

```json
{ "success": true, "committed": true, "path": "src/config.js", "branch": "main", "commitSha": "abc123" }
```

**Error (409)** — Search string not found.

---

### POST /patchDiff

Apply a unified diff patch to a file and commit. Single-purpose endpoint — GPT Actions safe.

**Request Body**

```json
{
  "repo": "owner/repo",
  "path": "src/app.js",
  "message": "Fix bug",
  "patch": "@@ -10,3 +10,4 @@\n const express = require('express');\n-const port = 3000;\n+const port = process.env.PORT || 3000;\n+const host = '0.0.0.0';\n"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `path` | string | Yes | File path to patch |
| `message` | string | Yes | Commit message |
| `patch` | string | Yes | Unified diff string |
| `branch` | string | No | Target branch (defaults to `main`) |

**Response (200)**

```json
{ "success": true, "committed": true, "path": "src/app.js", "branch": "main", "commitSha": "def456" }
```

**Error (409)** — Context mismatch (file changed since diff was created).

---

### POST /repoTree

Get the full recursive file tree for a repository in a single API call. Uses the Git Trees API with `recursive=1`.

**Request Body**

```json
{ "repo": "owner/repo", "branch": "main" }
```

**Response (200)**

```json
{
  "success": true,
  "owner": "owner", "repo": "repo", "branch": "main",
  "commitSha": "abc123",
  "truncated": false,
  "totalEntries": 42,
  "entries": [
    { "path": "README.md", "type": "file", "sha": "aaa", "size": 1200 },
    { "path": "src", "type": "dir", "sha": "bbb", "size": 0 },
    { "path": "src/server.js", "type": "file", "sha": "ccc", "size": 45000 }
  ]
}
```

---

### POST /deleteFile

Delete a file from a repository and commit the deletion.

**Request Body**

```json
{ "repo": "owner/repo", "path": "obsolete.txt", "message": "Remove obsolete file" }
```

**Response (200)**

```json
{ "success": true, "path": "obsolete.txt", "branch": "main", "commitSha": "ghi789" }
```

---

### POST /updateFile

Update a file with new content. The server reads the current file, accepts full new content, and handles the diff/commit server-side. Eliminates client-side diff computation and context mismatch.

**Request Body**

```json
{
  "repo": "owner/repo",
  "path": "src/config.js",
  "content": "// Updated config file\nmodule.exports = { port: 8080 };",
  "message": "Update config"
}
```

If content is identical to the current file, returns `{ committed: false }` without making a commit.

---

### POST /readLines

Read a file with line-accurate metadata. Normalizes line endings (CRLF to LF), returns blob SHA for drift detection, and supports extracting specific line ranges.

**Request Body**

```json
{
  "repo": "owner/repo",
  "path": "src/server.js",
  "startLine": 10,
  "endLine": 20
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `path` | string | Yes | File path |
| `branch` | string | No | Target branch (defaults to `main`) |
| `startLine` | integer | No | 1-based start line (inclusive) |
| `endLine` | integer | No | 1-based end line (inclusive) |
| `normalize` | boolean | No | Normalize line endings (defaults to `true`) |

**Response (200)**

```json
{
  "ok": true,
  "owner": "owner", "repo": "repo", "branch": "main", "path": "src/server.js",
  "blobSha": "abc123",
  "size": 45000,
  "totalLines": 2054,
  "normalized": true,
  "startLine": 10,
  "endLine": 20,
  "content": "line 10 text\nline 11 text\n...",
  "lines": [
    { "lineNumber": 10, "text": "line 10 text" },
    { "lineNumber": 11, "text": "line 11 text" }
  ]
}
```

---

### POST /blob

Retrieve a raw blob by SHA. Uses the Git Blobs API which supports files up to 100MB (vs 1MB for the Contents API).

**Request Body**

```json
{ "repo": "owner/repo", "sha": "abc123def456" }
```

**Response (200)**

```json
{
  "ok": true,
  "owner": "owner", "repo": "repo",
  "sha": "abc123def456",
  "size": 45000,
  "content": "decoded file content...",
  "encoding": "utf8"
}
```

---

### POST /search

Search for content across one or more repos. Uses GitHub Code Search API for discovery, then fetches raw files for line-accurate results.

**Request Body**

```json
{
  "query": "handleError",
  "repos": ["owner/repo1", "owner/repo2"],
  "options": {
    "language": "javascript",
    "maxResults": 20,
    "contextLines": 2
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search term |
| `repos` | array | Yes | Array of `"owner/repo"` strings (max 10) |
| `options.language` | string | No | Filter by language |
| `options.extension` | string | No | Filter by file extension |
| `options.maxResults` | integer | No | Max results (defaults to 20) |
| `options.contextLines` | integer | No | Lines of context around matches (defaults to 2) |

**Response (200)**

```json
{
  "ok": true,
  "query": "handleError",
  "totalCount": 5,
  "resultsReturned": 2,
  "results": [
    {
      "repo": "owner/repo1",
      "path": "src/error.js",
      "blobSha": "sha123",
      "branch": "main",
      "matches": [
        {
          "lineNumber": 15,
          "text": "function handleError(err) {",
          "context": { "before": ["// Error handler"], "after": ["  console.error(err);"] },
          "reference": {
            "ref": "owner/repo1:src/error.js:15",
            "githubUrl": "https://github.com/owner/repo1/blob/sha123/src/error.js#L15"
          }
        }
      ]
    }
  ]
}
```

---

### POST /symbols

Discover symbol definitions (functions, classes, interfaces) across repos. Scans source files and extracts symbols with line-accurate references. Supports JavaScript, TypeScript, Python, Go, Ruby, Java, Kotlin, C#, and Rust.

**Request Body**

```json
{
  "repos": [
    { "repo": "owner/repo", "branch": "main", "paths": ["src/"] }
  ],
  "options": {
    "nameFilter": "handle",
    "extensions": [".js", ".ts"]
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repos` | array | Yes | Array of repo specs (max 5). String `"owner/repo"` or object `{ repo, branch?, paths? }` |
| `options.nameFilter` | string | No | Filter symbols by name substring |
| `options.typeFilter` | array | No | Filter by type: `"function"`, `"class"`, `"interface"`, etc. |
| `options.extensions` | array | No | File extensions to scan (defaults to common source extensions) |
| `options.maxFiles` | integer | No | Max files to scan per repo (defaults to 50) |

**Response (200)**

```json
{
  "ok": true,
  "totalSymbols": 15,
  "symbols": [
    {
      "name": "readOneFile",
      "type": "function",
      "lineNumber": 231,
      "text": "async function readOneFile({ owner, repo, branch, path }) {",
      "repo": "owner/repo",
      "path": "src/github.js",
      "branch": "main",
      "blobSha": "sha456",
      "reference": {
        "ref": "owner/repo:src/github.js:231",
        "githubUrl": "https://github.com/owner/repo/blob/sha456/src/github.js#L231"
      }
    }
  ]
}
```

---

### POST /listBranches

List all branches for a repository with commit SHAs and protection status.

**Request Body**

```json
{ "repo": "owner/repo" }
```

**Response (200)**

```json
{
  "success": true,
  "owner": "owner", "repo": "repo",
  "totalBranches": 3,
  "branches": [
    { "name": "main", "sha": "abc123", "protected": true },
    { "name": "develop", "sha": "def456", "protected": false },
    { "name": "feature/new-api", "sha": "ghi789", "protected": false }
  ]
}
```

---

### POST /createBranch

Create a new branch from an existing branch.

**Request Body**

```json
{ "repo": "owner/repo", "branch": "feature/my-change", "fromBranch": "main" }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `branch` | string | Yes | Name for the new branch |
| `fromBranch` | string | No | Source branch (defaults to `main`) |

**Response (200)**

```json
{ "success": true, "owner": "owner", "repo": "repo", "branch": "feature/my-change", "fromBranch": "main", "sha": "abc123" }
```

---

### POST /createPR

Create a pull request to propose changes for review.

**Request Body**

```json
{
  "repo": "owner/repo",
  "title": "Add new feature",
  "head": "feature/my-change",
  "base": "main",
  "body": "Description of changes"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `title` | string | Yes | PR title |
| `head` | string | Yes | Branch with changes |
| `base` | string | No | Target branch (defaults to `main`) |
| `body` | string | No | PR description |

**Response (200)**

```json
{
  "success": true,
  "owner": "owner", "repo": "repo",
  "number": 42,
  "url": "https://github.com/owner/repo/pull/42",
  "head": "feature/my-change",
  "base": "main",
  "title": "Add new feature"
}
```

---

### POST /diagnose

Test connectivity and permissions for a specific repository. Returns detailed diagnostic information about authentication, rate limits, repo access, and file access.

**Request Body**

```json
{ "repo": "owner/repo", "path": "README.md" }
```

Returns a detailed report with checks for: allowlist, auth, rate limit, repo access, and file access. Includes diagnosis codes and hints for common failures (e.g., `GITHUB_APP_NOT_INSTALLED_ON_REPO`, `BRANCH_MISMATCH`).

---

## Error Codes

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 400 | BadRequest | Missing or invalid required parameters |
| 401 | Unauthorized | Missing or invalid auth token |
| 403 | Forbidden | Repository or path not in allowlist |
| 403 | RepoReadOnly | Repository is configured as read-only |
| 404 | NotFound | Unknown endpoint or file not found |
| 409 | ShaConflict | File SHA mismatch (expectedSha guard failed) |
| 409 | PatchConflict | Patch could not be applied (search not found / context mismatch) |
| 403 | PatchOnlyPath | File requires patch endpoints, not full overwrite |
| 500 | ServerError | Internal server error |
| 500 | ApplyFailed | GitHub API call failed (write) |
| 500 | ReadFailed | GitHub API call failed (read) |
| 500 | ReadLinesFailed | Line-accurate read failed |
| 500 | BlobFailed | Blob retrieval failed |
| 500 | SearchFailed | Content search failed |
| 500 | SymbolsFailed | Symbol discovery failed |
| 500 | PatchFailed | Legacy patch operation failed |
| 500 | PatchReplaceFailed | Search-and-replace patch failed |
| 500 | PatchDiffFailed | Unified diff patch failed |
| 500 | RepoTreeFailed | Recursive tree fetch failed |
| 500 | DeleteFileFailed | File deletion failed |
| 500 | UpdateFileFailed | Server-side update failed |
| 500 | CopyFailed | Cross-repo copy operation failed |
| 500 | BatchReadFailed | Batch read operation failed |
| 500 | ListFailed | Directory listing failed |
| 500 | CompareFailed | File comparison failed |
| 500 | CompareStructureFailed | Structure comparison failed |

---

## Examples

### Using curl

**Create a new file (without auth):**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "path": "hello.txt",
    "content": "Hello, World!",
    "message": "Add hello.txt"
  }'
```

**Create a new file (with auth):**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "repo": "myuser/myrepo",
    "path": "hello.txt",
    "content": "Hello, World!",
    "message": "Add hello.txt"
  }'
```

**Create on a specific branch:**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "branch": "develop",
    "path": "hello.txt",
    "content": "Hello, World!",
    "message": "Add hello.txt"
  }'
```

**Preview changes:**

```bash
curl -X POST http://localhost:3000/github/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "path": "hello.txt",
    "content": "Hello, World!",
    "message": "Add hello.txt"
  }'
```

**Patch a file (search-and-replace):**

```bash
curl -X POST http://localhost:3000/patch \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "path": "src/config.js",
    "operations": [
      { "search": "port: 3000", "replace": "port: 8080" }
    ],
    "message": "Change default port to 8080"
  }'
```

**Append to a file:**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "path": "CHANGELOG.md",
    "content": "\n## v1.1.0\n- Added new feature",
    "message": "Update changelog",
    "mode": "append"
  }'
```

**Safe write with SHA guard:**

```bash
# Step 1: Read the file and note the SHA
SHA=$(curl -s -X POST http://localhost:3000/read \
  -H "Content-Type: application/json" \
  -d '{"repo": "myuser/myrepo", "path": "config.json"}' | jq -r '.sha')

# Step 2: Write with SHA guard
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d "{
    \"repo\": \"myuser/myrepo\",
    \"path\": \"config.json\",
    \"content\": \"{\\\"updated\\\": true}\",
    \"message\": \"Update config\",
    \"expectedSha\": \"$SHA\"
  }"
```

### Using JavaScript (fetch)

```javascript
const response = await fetch('http://localhost:3000/apply', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-secret-token', // if API_AUTH_TOKEN is set
  },
  body: JSON.stringify({
    repo: 'myuser/myrepo',
    path: 'hello.txt',
    content: 'Hello, World!',
    message: 'Add hello.txt',
    // branch defaults to 'main' if not specified
  }),
});

const result = await response.json();
console.log(result);
```

### Using Python (requests)

```python
import requests

response = requests.post(
    'http://localhost:3000/apply',
    headers={
        'Authorization': 'Bearer your-secret-token',  # if API_AUTH_TOKEN is set
    },
    json={
        'repo': 'myuser/myrepo',
        'path': 'hello.txt',
        'content': 'Hello, World!',
        'message': 'Add hello.txt',
        # branch defaults to 'main' if not specified
    }
)

print(response.json())
```

---

## Rate Limits

This service uses GitHub App authentication. GitHub Apps have higher rate limits than personal access tokens:

- **Authenticated requests**: 5,000 requests per hour per installation

The service does not implement its own rate limiting.

---

## Security Considerations

1. **API Authentication**: Set `API_AUTH_TOKEN` to require Bearer token authentication on all write endpoints
2. **Repository Allowlist**: Set `ALLOWED_REPOS` to restrict which repositories can be modified
3. **Path Allowlist**: Set `ALLOWED_PATHS` to restrict which file paths can be modified
4. **GitHub App Authentication**: The service uses GitHub App authentication, which is more secure than personal access tokens
5. **Helmet**: Security headers are automatically added via Helmet middleware
6. **No secrets in requests**: GitHub authentication is handled server-side via environment variables
7. **Payload limit**: Request body is limited to 512KB
8. **Dry-run safety**: The dry-run endpoint makes no GitHub API calls, guaranteeing it can never accidentally commit

For production use:
- **Required**: Set `API_AUTH_TOKEN` to prevent unauthorized access
- **Recommended**: Set `ALLOWED_REPOS` to limit which repositories can be modified
- **Recommended**: Use HTTPS (handled by Render or your reverse proxy)
- **Optional**: Implement request rate limiting at your reverse proxy
