# repo-bridge Usage Guide

How to talk to your AI agent so it uses repo-bridge reliably.

---

## Setup Assumption

Your agent instructions should include a line like:

> All repositories belong to the user **l-87hjl**. When calling repo-bridge, always use `l-87hjl` as the owner.

This tells the agent the correct owner prefix for every API call.

---

## The Golden Rule: Always Use `owner/repo` Format

Every repo-bridge call requires a repository reference. The most reliable format is:

```
"repo": "l-87hjl/repo-name"
```

**Do this:**
- `"repo": "l-87hjl/research-assistant-levelup"`
- `"repo": "l-87hjl/agent-workspace"`

**Not this:**
- `"repo": "research-assistant-levelup"` (missing owner — will fail)
- `"repo": "Research-Assistant-Levelup"` (case mismatch — may fail)

---

## How to Phrase Requests

### Reading a file

> "Use repo-bridge to read the file `README.md` from `l-87hjl/research-assistant-levelup` on the `main` branch."

The agent should call:
```json
POST /read
{ "repo": "l-87hjl/research-assistant-levelup", "path": "README.md", "branch": "main" }
```

### Listing a directory

> "Use repo-bridge to list the root directory of `l-87hjl/agent-workspace`."

```json
POST /list
{ "repo": "l-87hjl/agent-workspace", "path": "" }
```

### Reading multiple files at once

> "Use repo-bridge batchRead to read `README.md` from both `l-87hjl/repo-bridge` and `l-87hjl/research-assistant-levelup`."

```json
POST /batchRead
{
  "files": [
    { "repo": "l-87hjl/repo-bridge", "path": "README.md" },
    { "repo": "l-87hjl/research-assistant-levelup", "path": "README.md" }
  ]
}
```

### Comparing files between repos

> "Use repo-bridge to compare `README.md` between `l-87hjl/repo-bridge` and `l-87hjl/agent-workspace`."

```json
POST /compare
{
  "source": { "repo": "l-87hjl/repo-bridge", "path": "README.md" },
  "target": { "repo": "l-87hjl/agent-workspace", "path": "README.md" }
}
```

### Comparing directory structures

> "Use repo-bridge to compare the folder structure of `l-87hjl/repo-bridge` and `l-87hjl/agent-workspace`."

```json
POST /compareStructure
{
  "source": { "repo": "l-87hjl/repo-bridge" },
  "target": { "repo": "l-87hjl/agent-workspace" }
}
```

### Writing a file

> "Use repo-bridge to create a file `notes/summary.md` in `l-87hjl/agent-workspace` with this content: ..."

```json
POST /apply
{
  "repo": "l-87hjl/agent-workspace",
  "path": "notes/summary.md",
  "content": "# Summary\n...",
  "message": "Add summary notes"
}
```

### Copying a file between repos

> "Use repo-bridge to copy `templates/boot.md` from `l-87hjl/agent-boot` to `l-87hjl/agent-workspace`."

```json
POST /copy
{
  "sourceRepo": "l-87hjl/agent-boot",
  "sourcePath": "templates/boot.md",
  "destinationRepo": "l-87hjl/agent-workspace",
  "destinationPath": "templates/boot.md",
  "message": "Copy boot template to workspace"
}
```

---

## Troubleshooting Transient Errors

The most common error you will see is a **transport-layer failure** like `ClientResponseError`. This is what the ChatGPT error in your session was.

### What causes it

| Cause | Frequency | Fix |
|-------|-----------|-----|
| Render free-tier cold start | Common | Wait 30-60 seconds, retry |
| GitHub App webhook failures | Common | Set webhook URL to `https://your-render-url/webhook` or disable webhooks entirely (see below) |
| GitHub API rate limit (5,000/hr) | Occasional | Wait for reset; check `/health` |
| Network blip between agent platform and Render | Occasional | Retry automatically (v0.4.0+) |
| GitHub outage | Rare | Check https://githubstatus.com |
| Render service sleeping (free tier) | Common | First request wakes it; retry after ~30s |

### Fix: GitHub App Webhook Configuration

If you see failed webhook deliveries in your GitHub App's **Advanced** tab (like `installation_repositories.added` with a warning icon), it means GitHub is trying to POST events to your app but the Render service is asleep.

**Option A (Recommended):** In your GitHub App settings under **General**, set the Webhook URL to either:
```
https://repo-bridge.onrender.com/github/webhook
```
or:
```
https://repo-bridge.onrender.com/webhook
```
Both paths work. repo-bridge v0.4.0 includes webhook endpoints that acknowledge all events with HTTP 200, stopping the failed-delivery warnings.

**Option B:** If you don't need webhooks at all (repo-bridge is pull-based), uncheck the "Active" checkbox under Webhook in your GitHub App settings. This stops GitHub from sending events entirely.

### Most Common Error: "client error" / 403 on a Specific Repo

If repo-bridge is working for some repos but failing on others (like the `agent-project-space` example), the cause is almost always:

**The GitHub App is not installed on that repository.**

The GitHub App must be explicitly installed on **every repo** the agent needs to access. Having it installed on `repo-bridge` does NOT automatically grant access to `agent-project-space`.

**How to fix:**

1. Go to **GitHub > Settings > Developer settings > GitHub Apps > repo-bridge-app**
2. Click **Install App** in the left sidebar
3. Select your account (`l-87hjl`)
4. Choose either:
   - **All repositories** — easiest, auto-covers new repos
   - **Only select repositories** — pick each repo individually
5. Make sure the repo that's failing (`agent-project-space`, etc.) is checked
6. Click **Save**

After saving, the agent should immediately be able to read from that repo.

**How to verify:** Call `/health` — if it returns `github.connected: true`, the app auth is working. Then call `/list` on the specific repo. If you get a 403, that repo isn't in the installation.

### What v0.4.0 does about it

repo-bridge v0.4.0 now includes:

1. **Automatic retry with exponential backoff** — transient errors (429, 500-504, ECONNRESET, ETIMEDOUT, ClientResponseError) are retried up to 3 times with 1s/2s/4s delays.
2. **Request timeouts** — each GitHub API call times out after 30 seconds instead of hanging indefinitely.
3. **Token caching** — installation tokens are reused for 50 minutes, eliminating redundant auth round-trips.
4. **Diagnostic error responses** — errors now include a `hint` field explaining what went wrong and whether retrying makes sense.
5. **Request correlation IDs** — every response has an `X-Request-Id` header for tracing.

### How to tell your agent to handle errors

Add this to your agent instructions:

> If a repo-bridge call fails with a transient error (the response will include `"transient": true`), wait 10 seconds and retry once. If it fails again, tell the user that repo-bridge is temporarily unavailable and offer to work with pasted content instead.

---

## Recommended Agent Instructions Template

Paste this into your agent's system instructions:

```
## repo-bridge Access

You have access to repo-bridge, a service that lets you read, write, list, copy, and compare files across GitHub repositories.

All repositories belong to the user `l-87hjl`. When calling repo-bridge, always use `l-87hjl` as the owner.

### Available Operations

| Operation | Endpoint | Use When |
|-----------|----------|----------|
| Read a file | `readFile` / POST /read | You need to see file contents |
| List a directory | `listDirectory` / POST /list | You need to see what files exist |
| Batch read | `batchRead` / POST /batchRead | You need multiple files at once (max 10) |
| Compare files | POST /compare | You need to diff a file between repos/branches |
| Compare structures | POST /compareStructure | You need to diff directory layouts |
| Write a file | `applyFile` / POST /apply | You need to create or update a file |
| Copy between repos | `copyFile` / POST /copy | You need to transfer a file cross-repo |
| Preview a write | `dryRun` / POST /dryRun | You want to preview without committing |

### Rules

1. Always specify branch explicitly (usually `main`).
2. Always use `"repo": "l-87hjl/repo-name"` format.
3. Use `/batchRead` instead of multiple `/read` calls when reading 2+ files.
4. Use `/compare` instead of manually reading two files and comparing.
5. Use `/dryRun` before any write to preview the change.
6. If a call fails with a transient error, wait 10 seconds and retry once.
7. Do not retry more than once — ask the user to paste content instead.
```

---

## Quick Reference: All Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service status + GitHub connectivity |
| `/read` | POST | Read one file |
| `/list` | POST | List directory contents |
| `/batchRead` | POST | Read up to 10 files from any repos |
| `/compare` | POST | Diff a file between two repos or branches |
| `/compareStructure` | POST | Diff directory layouts between two repos |
| `/apply` | POST | Create/update file(s) |
| `/copy` | POST | Copy file between repos |
| `/dryRun` | POST | Preview a write (zero API calls) |

---

## Version History

| Version | Key Changes |
|---------|-------------|
| 0.3.0 | Initial multi-repo support, batchRead, copy |
| 0.4.0 | Retry logic, error logging, /compare, /compareStructure, graceful shutdown |
