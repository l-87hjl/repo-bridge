# Multi-Repository Analysis & Cross-Repo Operations

This guide covers repo-bridge's multi-repo capabilities: how an AI agent can see, compare, and operate across multiple repositories simultaneously.

---

## Core Concept

repo-bridge is **not** locked to a single repository. Every API call accepts an `owner/repo` parameter, meaning the agent can target **any accessible repository** on **any call**. The key endpoints for multi-repo work:

| Endpoint | Purpose | Multi-Repo Role |
|----------|---------|-----------------|
| `POST /list` | List directory contents | Explore structure across repos |
| `POST /read` | Read one file | Inspect any repo's files |
| `POST /batch/read` | Read up to 10 files at once | Compare files across repos simultaneously |
| `POST /copy` | Copy a file between repos | Transfer files in a single call |
| `POST /apply` | Write file(s) to a repo | Multi-file writes with `changes[]` |

---

## Patterns for Multi-Repo Analysis

### Pattern 1: Explore Multiple Repos

List the root of each repo to understand their structure:

```json
// List agent-boot structure
POST /list
{ "repo": "myorg/agent-boot" }

// List agent-workspace structure
POST /list
{ "repo": "myorg/agent-workspace" }

// List ai-agent-contract structure
POST /list
{ "repo": "myorg/ai-agent-contract" }
```

### Pattern 2: Batch Read Across Repos

Read entry points from all three repos in one call:

```json
POST /batch/read
{
  "files": [
    { "repo": "myorg/agent-boot", "path": "AGENT_ENTRY.md" },
    { "repo": "myorg/agent-workspace", "path": "AGENT_ENTRY.md" },
    { "repo": "myorg/ai-agent-contract", "path": "AGENT_ENTRY.md" }
  ]
}
```

Compare configurations:

```json
POST /batch/read
{
  "files": [
    { "repo": "myorg/agent-boot", "path": "contract/AGENT_RULES.md" },
    { "repo": "myorg/agent-workspace", "path": "agent/STATE.json" },
    { "repo": "myorg/ai-agent-contract", "path": "capabilities/ALLOWED_ACTIONS.md" },
    { "repo": "myorg/repo-bridge", "path": "docs/REPO_ACCESS_MAP.md" }
  ]
}
```

### Pattern 3: Cross-Repo File Copy

Copy a template from boot repo to workspace:

```json
POST /copy
{
  "source": "myorg/agent-boot",
  "srcPath": "templates/STATE.template.json",
  "destination": "myorg/agent-workspace",
  "destPath": "agent/STATE.json",
  "message": "Initialize workspace state from boot template"
}
```

### Pattern 4: Multi-File Write

Write multiple files to a repo in one call:

```json
POST /apply
{
  "repo": "myorg/agent-workspace",
  "message": "Initialize workspace with state and todo files",
  "changes": [
    { "path": "agent/STATE.json", "content": "{...}" },
    { "path": "agent/TODO.json", "content": "{...}" },
    { "path": "CHANGELOG.md", "content": "# Changelog\n..." }
  ]
}
```

---

## Understanding Multi-Repo Architecture

The agent mechanism ecosystem uses three types of repositories that relate to each other:

```
┌─────────────────────┐     ┌─────────────────────┐
│   agent-boot        │     │  ai-agent-contract   │
│   (read-only)       │     │  (read-only)         │
│                     │     │                      │
│  Rules, protocols,  │     │  Formal specs,       │
│  templates          │     │  allowed/prohibited  │
└────────┬────────────┘     └────────┬─────────────┘
         │                           │
         │   ┌───────────────────┐   │
         └──►│ agent-workspace   │◄──┘
             │ (read/write)      │
             │                   │
             │ Active workspace  │
             │ STATE, TODO, etc. │
             └───────────────────┘
```

To understand this architecture, the agent should:

1. **List all three repos** to see their structure
2. **Batch read entry points** (`AGENT_ENTRY.md` from each)
3. **Read AGENT_LINK.md** in the workspace to see how repos connect
4. **Compare rules vs. state** by batch-reading boot rules and workspace state

### Recommended Boot Sequence for Multi-Repo Agents

```
Step 1: /batch/read → Read AGENT_ENTRY.md from all three repos
Step 2: /list       → List workspace repo to find current state
Step 3: /batch/read → Read STATE.json, TODO.json, CHANGELOG.md from workspace
Step 4: /read       → Read specific rules from boot repo as needed
Step 5: (begin work using workspace as read/write target)
```

---

## Access Control for Multi-Repo

### Recommended Configuration

```env
# Allow access to all repos under the org
ALLOWED_REPOS=myorg/*

# Boot and contract repos are read-only
READ_ONLY_REPOS=myorg/agent-boot,myorg/ai-agent-contract

# Workspace is read/write (not in READ_ONLY_REPOS)
# repo-bridge itself might be read-only too
READ_ONLY_REPOS=myorg/agent-boot,myorg/ai-agent-contract,myorg/repo-bridge
```

### Access Matrix

| Repository | /list | /read | /batch/read | /copy (as source) | /copy (as dest) | /apply |
|-----------|-------|-------|-------------|-------------------|-----------------|--------|
| agent-boot (read-only) | Yes | Yes | Yes | Yes | No | No |
| ai-agent-contract (read-only) | Yes | Yes | Yes | Yes | No | No |
| agent-workspace (read/write) | Yes | Yes | Yes | Yes | Yes | Yes |
| repo-bridge (read-only) | Yes | Yes | Yes | Yes | No | No |

---

## GitHub App Permissions for Multi-Repo

### Minimum Required
- **Repository contents**: Read and write (on the GitHub App)

The GitHub App must be **installed on every repository** the agent needs to access. The App installation determines the absolute boundary of access — repos without the App installed are invisible.

### Additional Useful Permissions

| Permission | Level | Use Case |
|-----------|-------|----------|
| **Contents** | Read & Write | Required. File read/write operations |
| **Metadata** | Read | Recommended. Discover repos, branches, tags |
| **Pull Requests** | Read | Optional. Understand PR context during analysis |
| **Issues** | Read | Optional. Understand issue context for tasks |
| **Actions** | Read | Optional. Check CI/CD status of repos |
| **Commit statuses** | Read | Optional. Verify build status before writing |

### Permission Escalation Paths

If you need capabilities beyond file read/write:

1. **Repository discovery** → Add `metadata:read` permission to your GitHub App, then use the GitHub API (not repo-bridge) to list available repos
2. **PR-aware operations** → Add `pull_requests:read` to understand PR context
3. **CI/CD integration** → Add `actions:read` and `statuses:read` to verify builds

---

## Limitations and Workarounds

### Current Limitations

1. **No recursive directory listing** — `/list` returns one directory level at a time. Workaround: call `/list` for each subdirectory.
2. **10-file batch limit** — `/batch/read` accepts max 10 files. Workaround: make multiple batch calls.
3. **Single-repo writes per /apply call** — You can write multiple files, but all must be in the same repo. Workaround: make separate `/apply` calls per repo, or use `/copy` for cross-repo transfers.
4. **No diff endpoint** — No built-in file comparison. Workaround: batch-read both versions and compare in the agent.
5. **No search endpoint** — Cannot search file contents across repos. Workaround: use `/list` to discover files, then `/read` or `/batch/read` to inspect them.

### Future Considerations

- **`POST /batch/list`** — List directories across multiple repos in one call
- **`POST /diff`** — Compare a file between two repos or branches
- **`POST /search`** — Search file contents across repos (would require GitHub Search API permission)
- **`POST /batch/copy`** — Copy multiple files between repos in one call
