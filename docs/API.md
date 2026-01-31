# repo-bridge API Documentation

## Base URL

```
http://localhost:3000
```

For production deployments, replace with your deployed URL.

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
| `branch` | string | Yes | Target branch name |
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
  "message": "Required: owner, repo, branch, path, content(string), message"
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
| 404 | NotFound | Unknown endpoint |
| 500 | ServerError | Internal server error |
| 500 | ApplyFailed | GitHub API call failed |

---

## Examples

### Using curl

**Create a new file:**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "branch": "main",
    "path": "hello.txt",
    "content": "Hello, World!",
    "message": "Add hello.txt"
  }'
```

**Update an existing file:**

```bash
curl -X POST http://localhost:3000/apply \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "branch": "main",
    "path": "hello.txt",
    "content": "Hello, Updated World!",
    "message": "Update hello.txt"
  }'
```

**Preview changes:**

```bash
curl -X POST http://localhost:3000/github/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myuser/myrepo",
    "branch": "main",
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
  },
  body: JSON.stringify({
    owner: 'myuser',
    repo: 'myrepo',
    branch: 'main',
    path: 'hello.txt',
    content: 'Hello, World!',
    message: 'Add hello.txt',
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
    json={
        'owner': 'myuser',
        'repo': 'myrepo',
        'branch': 'main',
        'path': 'hello.txt',
        'content': 'Hello, World!',
        'message': 'Add hello.txt',
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

1. **Authentication**: The service uses GitHub App authentication, which is more secure than personal access tokens
2. **Helmet**: Security headers are automatically added via Helmet middleware
3. **No secrets in requests**: Authentication is handled server-side via environment variables
4. **Payload limit**: Request body is limited to 512KB

For production use, consider:
- Adding authentication to the API endpoints
- Implementing request rate limiting
- Using HTTPS (handled by Render or your reverse proxy)
