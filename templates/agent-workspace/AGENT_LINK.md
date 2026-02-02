# Agent Link Configuration

This file links this workspace to its boot and contract repositories.

---

## Boot Repository

| Field | Value |
|-------|-------|
| Repo | `{{OWNER}}/agent-boot` |
| Branch | `main` |
| Entry | `AGENT_ENTRY.md` |
| Purpose | Rules, protocols, templates |
| Access | Read-Only |

---

## Contract Repository

| Field | Value |
|-------|-------|
| Repo | `{{OWNER}}/ai-agent-contract` |
| Branch | `main` |
| Entry | `AGENT_ENTRY.md` |
| Purpose | Formal specifications |
| Access | Read-Only |

---

## This Workspace

| Field | Value |
|-------|-------|
| Repo | `{{OWNER}}/agent-project-space` |
| Branch | `main` |
| Type | Workspace |
| Access | Read/Write |

---

## Memory Files

| Purpose | Path |
|---------|------|
| State | `agent/STATE.json` |
| Tasks | `agent/TODO.json` |
| Context | `agent/CONTEXT.md` |
| History | `CHANGELOG.md` |

---

## Startup Sequence

1. Read this file (`AGENT_LINK.md`)
2. Read boot repo → `{{OWNER}}/agent-boot/AGENT_ENTRY.md`
3. Read boot rules → `{{OWNER}}/agent-boot/contract/AGENT_RULES.md`
4. Read state → `agent/STATE.json`
5. Read tasks → `agent/TODO.json`
6. Ready to work
