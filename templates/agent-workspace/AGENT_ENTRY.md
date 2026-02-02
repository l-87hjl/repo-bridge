# Agent Entry Point - Workspace Repository

## Repository Type
**Workspace (Read/Write)**

## Purpose
This is your active workspace. You can read and write files here.

---

## On Session Start

1. Read `AGENT_LINK.md` to find boot and contract repos
2. Read boot repo's `AGENT_ENTRY.md` and rules
3. Read `agent/STATE.json` to restore context
4. Read `agent/TODO.json` to find pending tasks

---

## On Session End

1. Update `agent/STATE.json` with current state
2. Append to `CHANGELOG.md` with session summary
3. Update `agent/TODO.json` with task status
4. Commit all changes

---

## Directory Purposes

| Directory | Purpose | Agent Access |
|-----------|---------|--------------|
| `agent/` | State and context files | Read/Write |
| `inputs/` | New tasks from user | Read |
| `outputs/` | Your work products | Write |
| `scratch/` | Temporary files | Read/Write |

---

## Key Files

| File | Format | Purpose |
|------|--------|---------|
| `agent/STATE.json` | JSON | Your persistent memory |
| `agent/TODO.json` | JSON | Your task queue |
| `agent/CONTEXT.md` | Markdown | Human-readable summary |
| `CHANGELOG.md` | Markdown | Session history |

---

## Related Repositories

| Repository | Access | Purpose |
|------------|--------|---------|
| `{{OWNER}}/agent-boot` | Read-Only | Rules and protocols |
| `{{OWNER}}/ai-agent-contract` | Read-Only | Formal specifications |
