# AI Agent Instructions for repo-bridge

This document provides instructions for AI agents (ChatGPT, Claude, etc.) that use repo-bridge to modify repositories.

## Overview

repo-bridge is a microservice that allows you to create or update files in GitHub repositories via REST API. You interact with it through the `/apply` endpoint.

## How to Use repo-bridge

### Endpoint

```
POST https://<your-render-url>/apply
```

### Required Headers

```
Content-Type: application/json
Authorization: Bearer <API_AUTH_TOKEN>
```

### Request Format

```json
{
  "repo": "owner/repo-name",
  "path": "path/to/file.ext",
  "content": "file contents here",
  "message": "Commit message describing the change"
}
```

- `branch` is optional and defaults to `main`
- `repo` can be split into `owner` and `repo` fields if preferred

### Response

Success:
```json
{
  "ok": true,
  "committed": true,
  "commitSha": "abc123...",
  "created": true,
  "updated": false
}
```

## Workflow Rules

### 1. Always Dry-Run First

Before making any changes, use dry-run to preview:

```json
{
  "repo": "owner/repo",
  "path": "file.txt",
  "content": "...",
  "message": "...",
  "dryRun": true
}
```

This makes NO API calls to GitHub and is guaranteed safe.

### 2. Update CHANGELOG_AI.md After Each Commit

After every successful commit, append an entry to `docs/CHANGELOG_AI.md`:

```markdown
## [YYYY-MM-DD HH:MM UTC] <commitSha short>

**Files Changed:** path/to/file.ext
**Summary:** Brief description of what was changed and why
**Triggered By:** User request / automated pipeline / etc.
```

### 3. Update STATE.md When Repo Structure Changes

If you add, remove, or significantly restructure files, update `docs/STATE.md` to reflect the current state.

### 4. Commit Message Guidelines

- Start with a verb: Add, Update, Fix, Remove, Refactor
- Be specific: "Add user authentication endpoint" not "Update code"
- Keep under 72 characters for the first line
- Reference issues/tasks if applicable

### 5. Allowed Paths

You may only modify files in paths configured in `ALLOWED_PATHS`. Attempting to modify other paths will return a 403 error.

Typical allowed paths:
- `src/*` - Source code
- `docs/*` - Documentation
- `config/*` - Configuration files

### 6. Rollback Instructions

If you make a mistake:

1. Read the current file content from GitHub
2. Identify the previous correct state
3. Apply the corrected content with a message like: "Revert: <original commit message>"

For complex rollbacks, request human intervention.

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| 401 Unauthorized | Invalid/missing token | Check Authorization header |
| 403 Forbidden | Repo/path not allowed | Check ALLOWED_REPOS/ALLOWED_PATHS |
| 400 Bad Request | Missing required fields | Check request body |
| 500 ApplyFailed | GitHub API error | Check error message, may be permissions |

## Best Practices

1. **Small, focused changes** - One logical change per commit
2. **Test with dry-run** - Always preview before committing
3. **Document changes** - Update CHANGELOG_AI.md religiously
4. **Preserve state** - Keep STATE.md current
5. **Ask when uncertain** - If unsure, request human clarification
