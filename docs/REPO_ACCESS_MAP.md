# Repository Access Map

This document tracks which repositories are accessible to AI agents via repo-bridge, and at what level.

**Last Updated:** 2026-02-02

---

## Access Levels

| Level | GitHub App | READ_ONLY_REPOS | Agent Can |
|-------|------------|-----------------|-----------|
| **None** | Not installed | N/A | Nothing |
| **Read-Only** | Installed | Listed | Read files only |
| **Read/Write** | Installed | Not listed | Read and write files |

---

## Repository Access Matrix

### Infrastructure (No Agent Access)

These repos do NOT have the GitHub App installed. Agents cannot access them at all.

| Repository | Purpose | Why No Access |
|------------|---------|---------------|
| `l-87hjl/repo-bridge` | Bridge infrastructure | Agent should not modify its own bridge |

### Read-Only (Agent Can Read, Cannot Write)

These repos have the GitHub App installed but are listed in `READ_ONLY_REPOS`. The agent can read these to load context, rules, and contracts but cannot modify them.

| Repository | Purpose | Why Read-Only |
|------------|---------|---------------|
| `l-87hjl/agent-boot` | Boot contract, rules, templates | Agent follows rules but cannot change them |
| `l-87hjl/ai-agent-contract` | Formal contract definitions | Agent reads contracts but cannot alter terms |

### Read/Write (Agent Workspace)

These repos have the GitHub App installed and are NOT in `READ_ONLY_REPOS`. These are specifically designed as agent workspaces within the repo-bridge/agent mechanism.

| Repository | Purpose |
|------------|---------|
| `l-87hjl/agent-project-space` | Active workspace for agent tasks, state, and outputs |

### Other Repositories (Not Part of Agent Mechanism)

These repositories exist in the GitHub account but are not part of the repo-bridge/agent infrastructure. They may or may not have the GitHub App installed depending on other needs.

| Repository | Notes |
|------------|-------|
| `l-87hjl/rule-based-horror` | Story project (separate from agent mechanism) |
| `l-87hjl/horror-generator-rule-based` | Story generation tool |
| `l-87hjl/Medium` | Blog content |
| `l-87hjl/3i-atlas-public-data` | Public data |
| `l-87hjl/PNP` | Project |
| `l-87hjl/covenant-core` | Covenant system |
| `l-87hjl/Covenant` | Covenant system |
| `l-87hjl/story-grader` | Story evaluation tool |
| `l-87hjl/novel-completer` | Novel completion tool |
| `l-87hjl/covenant-core-` | Covenant variant |
| `l-87hjl/architectural-consultant` | Architecture tool |
| `l-87hjl/covenant-legacy` | Legacy covenant code |
| `l-87hjl/covenant-pure` | Pure covenant implementation |
| `l-87hjl/ai-emergence-under-constraint` | AI research |
| `l-87hjl/ai_emergence_simulator` | AI research |

---

## Current Render Configuration

```env
# Repositories the agent can read but not write
READ_ONLY_REPOS=l-87hjl/agent-boot,l-87hjl/ai-agent-contract

# (If using allowlist instead of wildcard)
# ALLOWED_REPOS=l-87hjl/agent-project-space,...
```

---

## How to Update Access

### To grant agent access to a new repo:
1. Install the GitHub App on that repo (GitHub → Settings → Applications)
2. (Optional) If using `ALLOWED_REPOS` without wildcard, add repo to the list in Render

### To make a repo read-only:
1. Ensure GitHub App is installed
2. Add repo to `READ_ONLY_REPOS` in Render environment

### To revoke all agent access:
1. Uninstall the GitHub App from that repo
2. (Or remove from `ALLOWED_REPOS` if not using wildcard)

---

## Security Checklist

- [ ] `repo-bridge` does NOT have GitHub App installed
- [ ] `agent-boot` is in `READ_ONLY_REPOS`
- [ ] `ai-agent-contract` is in `READ_ONLY_REPOS`
- [ ] `API_AUTH_TOKEN` is set in Render
- [ ] All agent-accessible repos are intentionally chosen
- [ ] This document is up to date

---

## Notes

- The agent must specify `owner/repo` explicitly for every operation
- The agent cannot discover which repos it has access to—it only knows when it tries
- Read-only repos return `403 RepoReadOnly` on write attempts
- Repos without the app return GitHub API errors (no installation found)
