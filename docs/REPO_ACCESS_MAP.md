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

These repos have the GitHub App installed but are listed in `READ_ONLY_REPOS`.

| Repository | Purpose | Why Read-Only |
|------------|---------|---------------|
| `l-87hjl/agent-boot` | Boot contract, rules, templates | Agent follows rules but cannot change them |

### Read/Write (Full Agent Access)

These repos have the GitHub App installed and are NOT in `READ_ONLY_REPOS`.

| Repository | Purpose |
|------------|---------|
| `l-87hjl/agent-project-space` | Active workspace for agent tasks |
| `l-87hjl/rule-based-horror` | Story project - agent workspace |
| `l-87hjl/ai-agent-contract` | Contract definitions (TBD: should this be read-only?) |

### Unclassified (Need to Determine)

These repos were visible in your GitHub. Please categorize:

| Repository | Recommended Access | Notes |
|------------|-------------------|-------|
| `l-87hjl/horror-generator-rule-based` | ? | Related to rule-based-horror? |
| `l-87hjl/Medium` | ? | Blog content? |
| `l-87hjl/3i-atlas-public-data` | ? | Public data? |
| `l-87hjl/PNP` | ? | Unknown |
| `l-87hjl/covenant-core` | ? | Covenant system |
| `l-87hjl/Covenant` | ? | Covenant system |
| `l-87hjl/story-grader` | ? | Story evaluation tool |
| `l-87hjl/novel-completer` | ? | Novel completion tool |
| `l-87hjl/covenant-core-` | ? | Variant of covenant-core? |
| `l-87hjl/architectural-consultant` | ? | Architecture tool |
| `l-87hjl/covenant-legacy` | ? | Legacy covenant code |
| `l-87hjl/covenant-pure` | ? | Pure covenant implementation |
| `l-87hjl/ai-emergence-under-constraint` | ? | AI research |
| `l-87hjl/ai_emergence_simulator` | ? | AI research |

---

## Current Render Configuration

```env
# Repositories the agent can read but not write
READ_ONLY_REPOS=l-87hjl/agent-boot

# (If using allowlist instead of wildcard)
# ALLOWED_REPOS=l-87hjl/agent-project-space,l-87hjl/rule-based-horror,...
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
- [ ] `API_AUTH_TOKEN` is set in Render
- [ ] All agent-accessible repos are intentionally chosen
- [ ] This document is up to date

---

## Notes

- The agent must specify `owner/repo` explicitly for every operation
- The agent cannot discover which repos it has access to—it only knows when it tries
- Read-only repos return `403 RepoReadOnly` on write attempts
- Repos without the app return GitHub API errors (no installation found)
