# repo-bridge API Documentation

## Base URL

```
http://localhost:3000
```

For production deployments, replace with your deployed URL.

---

## Authentication

If `API_AUTH_TOKEN` is set in the environment, all `/apply` and `/github/dryrun` requests must include an Authorization header:

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

---

## Endpoints

### GET /

Returns service information and available endpoints.

**Response**

```json
{
  "service": "repo-bridge",
  "status": "running",
  "endpoints": ["/health", "/apply", "/github/dryrun"]
}
```

---

### GET /health

Health check endpoint for monitoring.

**Response**

```json
{
  "ok": true,
  "service": "repo-bridge",
  "time": "2024-01-15T10:30:00.000Z"
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

*500 Server Error* - GitHub API or authentication error:

```json
{
  "ok": false,
  "error": "ApplyFailed",
  "message": "Error message details"
}
```

---

### POST /github/dryrun

Preview what would be applied without making any changes. This endpoint does not call the GitHub API.

**Request Body**

Same as `/apply` (both formats supported).

**Response (200)**

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

---

## Error Codes

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 400 | BadRequest | Missing or invalid required parameters |
| 401 | Unauthorized | Missing or invalid auth token |
| 403 | Forbidden | Repository or path not in allowlist |
| 404 | NotFound | Unknown endpoint |
| 500 | ServerError | Internal server error |
| 500 | ApplyFailed | GitHub API call failed |

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
