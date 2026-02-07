# repo-bridge — Agent Reference Document

Upload this file directly to your AI agent (ChatGPT custom GPT, Claude project, etc.) so it understands what repo-bridge is and how to use it correctly.

---

## What You Are

You are an AI agent with access to **repo-bridge**, a multi-repository gateway that connects you to GitHub repositories. This means you can read, write, list, copy, and compare files across **multiple GitHub repos** in a single session — something most AI agents cannot do natively.

## Why This Matters

Most AI coding assistants are limited to one repository at a time, or rely on users pasting file contents. With repo-bridge, you can:

- **Read any file** from any connected repository
- **Write files** to writable repositories (with commit messages)
- **List directories** to discover repo structure
- **Batch read** up to 10 files from different repos simultaneously
- **Compare files** between repos or branches with automatic diffing
- **Compare directory structures** across repos
- **Copy files** between repositories in a single operation

You operate across repos the same way a developer with multiple terminal tabs open does — you can see and modify any accessible repo at any time.

---

## Your Owner

All repositories belong to: **l-87hjl**

When making API calls, always use this as the owner. For example:
- `"repo": "l-87hjl/repo-bridge"`
- `"repo": "l-87hjl/research-assistant-levelup"`
- `"repo": "l-87hjl/agent-workspace"`

---

## Available Operations

### 1. Read a File (`readFile` / POST /read)

Read a single file's contents from any accessible repository.

```json
{
  "repo": "l-87hjl/repo-name",
  "path": "path/to/file.ext",
  "branch": "main"
}
```

**Returns:** File content as UTF-8 text, plus SHA and size metadata.

### 2. List a Directory (`listDirectory` / POST /list)

See what files and subdirectories exist at a given path.

```json
{
  "repo": "l-87hjl/repo-name",
  "path": "src",
  "branch": "main"
}
```

**Returns:** Array of entries (name, path, type, size). Use `"path": ""` for root.

**Note:** This lists one directory level. To explore subdirectories, call `/list` again with the subdirectory path.

### 3. Batch Read (`batchRead` / POST /batchRead)

Read up to 10 files from any combination of repos in one call. All reads happen concurrently.

```json
{
  "files": [
    { "repo": "l-87hjl/repo-a", "path": "README.md" },
    { "repo": "l-87hjl/repo-b", "path": "README.md" },
    { "repo": "l-87hjl/repo-c", "path": "config.json", "branch": "develop" }
  ]
}
```

**Returns:** Array of results. Individual files can fail without failing the whole batch.

**When to use:** Always prefer `/batchRead` over multiple `/read` calls when you need 2+ files. It's faster and uses fewer API calls.

### 4. Compare Files (`POST /compare`)

Compare the same file (or different files) between two repos or branches. Returns content from both sides and a line-by-line diff.

```json
{
  "source": { "repo": "l-87hjl/repo-a", "path": "config.json", "branch": "main" },
  "target": { "repo": "l-87hjl/repo-b", "path": "config.json", "branch": "main" },
  "options": { "includeContent": true }
}
```

**Returns:**
- `identical`: boolean — are the files exactly the same?
- `diff.status`: "identical" | "different" | "source_missing" | "target_missing"
- `diff.added`, `diff.removed`, `diff.unchanged`: line counts
- `diff.lines`: array of `{ op: "add"|"remove", lineNum, line }` entries
- Optionally includes full content of both files

**Use cases:**
- Check if a config file drifted between repos
- Compare a template with its instantiation
- Verify a copy operation succeeded
- Compare versions across branches

### 5. Compare Directory Structures (`POST /compareStructure`)

Compare what files and folders exist in two repo directories without reading file contents.

```json
{
  "source": { "repo": "l-87hjl/repo-a", "path": "", "branch": "main" },
  "target": { "repo": "l-87hjl/repo-b", "path": "", "branch": "main" }
}
```

**Returns:**
- `comparison.onlyInSource`: files/dirs that exist only in the source
- `comparison.onlyInTarget`: files/dirs that exist only in the target
- `comparison.inBoth`: files/dirs present in both
- `comparison.sizeDifferences`: files in both but with different sizes

**Use cases:**
- Check if two repos follow the same structure
- Find missing files after a copy operation
- Audit repo standardization

### 6. Write a File (`applyFile` / POST /apply)

**This is how you write to GitHub.** Create or update a file in a writable repository. Every call creates a real Git commit. Do NOT use /dryRun — use /apply directly to commit files.

```json
{
  "repo": "l-87hjl/repo-name",
  "path": "path/to/file.ext",
  "content": "file contents here",
  "message": "Describe what changed and why",
  "branch": "main"
}
```

**Multi-file writes:**
```json
{
  "repo": "l-87hjl/repo-name",
  "message": "Add initial workspace files",
  "changes": [
    { "path": "state.json", "content": "{}" },
    { "path": "README.md", "content": "# Workspace" }
  ]
}
```

**Important:** Some repos are read-only. If you get a `RepoReadOnly` error, you cannot write to that repo.

### 7. Copy Between Repos (`copyFile` / POST /copy)

Copy a file from one repo to another in a single call (reads source, writes to destination).

```json
{
  "sourceRepo": "l-87hjl/source-repo",
  "sourcePath": "templates/config.json",
  "destinationRepo": "l-87hjl/dest-repo",
  "destinationPath": "config.json",
  "message": "Copy config template to workspace"
}
```

### 8. Health Check (GET /health)

Check if repo-bridge is running and connected to GitHub.

**Returns:** Service status, uptime, GitHub rate limit info.

---

## Error Handling

### Error Types You May See

| Error | HTTP Code | Meaning | What To Do |
|-------|-----------|---------|------------|
| `BadRequest` | 400 | Missing or invalid fields | Check your request body |
| `Unauthorized` | 401 | Invalid auth token | Check Authorization header |
| `Forbidden` | 403 | Repo or path not in allowlist | Use an allowed repo/path |
| `RepoReadOnly` | 403 | Repo is read-only | You cannot write to this repo |
| `ReadFailed` | 403 | GitHub App not installed on repo | See "Diagnosis Fields" below — tell user to install app on this repo |
| `NotFound` | 404 | File or path doesn't exist | Verify with `/list` first |
| `ReadFailed` | 500 | GitHub API error on read | Check `hint` and `transient` fields |
| `ApplyFailed` | 500 | GitHub API error on write | Check `hint` and `transient` fields |
| `CompareFailed` | 500 | Comparison error | One or both files may not exist |
| `CompareStructureFailed` | 500 | Structure comparison error | One or both paths may not exist |

### Diagnosis Fields (v0.4.0+)

Error responses include a `diagnosis` field that tells you exactly what went wrong:

| Diagnosis | Meaning | What To Tell the User |
|-----------|---------|----------------------|
| `GITHUB_APP_NOT_INSTALLED_ON_REPO` | The GitHub App isn't installed on this specific repository | "The repo-bridge GitHub App needs to be installed on this repository. Go to GitHub Settings > Developer settings > GitHub Apps > repo-bridge-app > Install App, and make sure this repo is selected." |
| `GITHUB_PERMISSION_DENIED` | App is installed but lacks required permissions | "The repo-bridge GitHub App needs Contents:read permission on this repository." |
| `GITHUB_AUTH_FAILED` | Installation token expired or credentials wrong | "There may be a configuration issue with the GitHub App. Check the server's GITHUB_APP_ID and GITHUB_PRIVATE_KEY." |
| `TRANSIENT_NETWORK_ERROR` | Network blip between repo-bridge and GitHub | "This is a temporary error. Wait 10 seconds and retry." |
| `RATE_LIMIT_EXCEEDED` | Hit GitHub's 5,000 requests/hour limit | "GitHub rate limit hit. Wait a few minutes and retry." |

**Important:** If you see `GITHUB_APP_NOT_INSTALLED_ON_REPO`, this is NOT a transient error — retrying will not help. The user must install the GitHub App on that repository.

### Transient Errors

When a response includes `"transient": true`, it means the failure was a temporary network or infrastructure issue. These errors include:
- Connection resets (ECONNRESET)
- Timeouts (ETIMEDOUT)
- ClientResponseError (transport layer failure)
- Rate limiting (HTTP 429)
- GitHub server errors (500-504)

**repo-bridge automatically retries** transient errors up to 3 times with exponential backoff before returning the error to you.

**If you receive a transient error:**
1. Wait 10 seconds
2. Retry the exact same request once
3. If it fails again, inform the user that the bridge is temporarily unavailable
4. Offer to work with pasted content as a fallback

**Do NOT:**
- Retry in a tight loop
- Assume the bridge is permanently broken
- Give up without explaining what happened

### Request IDs

Every response includes a `requestId` (also in the `X-Request-Id` header). When reporting errors, always include this ID — it allows tracing the exact request through the server logs.

---

## Best Practices

### 1. Explore Before Acting

Always orient yourself before making changes:
```
Step 1: /list → See what's in the repo
Step 2: /batchRead → Read key files (README, config, etc.)
Step 3: /compare or /compareStructure → Understand differences
Step 4: /apply → Write the change (creates a real Git commit)
```

### 2. Use Batch Operations

- Need 2+ files? Use `/batchRead`, not multiple `/read` calls.
- Need to compare? Use `/compare`, not read-both-and-diff-manually.
- Need to see structure differences? Use `/compareStructure`.

### 3. Specify Branch Explicitly

Always include `"branch": "main"` (or whatever branch you intend). Omitting it defaults to `main`, but being explicit avoids confusion.

### 4. Handle Partial Failures

`/batchRead` can return mixed results — some files succeed, others fail. Always check the `ok` field on each entry in the `files` array.

### 5. Write Good Commit Messages

When using `/apply`, write messages that explain *why*, not just *what*:
- Good: `"Add agent state tracking for multi-repo sessions"`
- Bad: `"Update file"`

### 6. Respect Read-Only Repos

Some repos are configured as read-only (e.g., boot repos, contract repos). You can read from them but not write to them. If you need to modify something from a read-only repo, copy it to a writable repo first using `/copy`.

---

## Multi-Repo Architecture Concepts

If you're operating across multiple repos, understand these patterns:

### Typical Repository Roles

| Role | Access | Purpose |
|------|--------|---------|
| **Boot repo** | Read-only | Contains rules, protocols, templates |
| **Contract repo** | Read-only | Formal specifications, allowed actions |
| **Workspace repo** | Read/write | Active working area, state, results |
| **Bridge repo** | Read-only | repo-bridge itself (this service) |

### Cross-Repo Workflow

1. Read rules from boot/contract repos
2. Read current state from workspace repo
3. Execute work according to rules
4. Write results back to workspace repo
5. Update state (STATE.json, CHANGELOG.md, etc.)

### Why Multi-Repo Matters

Multi-repo agents are relatively new. Most AI tools assume single-repo context. What makes repo-bridge different:

- **No context switching** — you don't need to "change repos"; every call can target any repo
- **Atomic cross-repo reads** — `/batchRead` fetches from multiple repos in one round-trip
- **Built-in comparison** — `/compare` and `/compareStructure` let you diff across repos without manual work
- **Copy as a primitive** — `/copy` transfers files cross-repo in one call instead of read+write

The key insight is that **every API call is repo-scoped**, not session-scoped. You're not "in" a repo — you're accessing a repo. This means you can interleave operations across any number of repos naturally.

---

## Quick Reference Card

```
READ    → POST /read         { repo, path, branch }
LIST    → POST /list         { repo, path, branch }
BATCH   → POST /batchRead    { files: [{ repo, path, branch }] }
COMPARE → POST /compare      { source: { repo, path, branch }, target: { repo, path, branch } }
STRUCT  → POST /compareStructure { source: { repo, path, branch }, target: { repo, path, branch } }
WRITE   → POST /apply        { repo, path, content, message, branch }
MULTI   → POST /apply        { repo, changes: [{ path, content }], message }
COPY    → POST /copy         { sourceRepo, sourcePath, destinationRepo, destinationPath, message }
HEALTH  → GET  /health
```

**Owner for all calls:** `l-87hjl`
**Default branch:** `main`
**Max batch size:** 10 files
**Max payload:** 512KB
