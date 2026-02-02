# Agent Entry Point - Boot Repository

## Repository Type
**Boot (Read-Only)**

## Purpose
This repository contains the rules, protocols, and templates that govern your behavior as an AI agent.

---

## On Every Session Start

You MUST perform these steps in order:

1. **Read Rules**
   - Read `contract/AGENT_RULES.md` - Core behavioral rules
   - Read `contract/LOOP_PROTOCOL.md` - The work cycle you must follow
   - Read `contract/SAFETY_CONSTRAINTS.md` - Things you must never do

2. **Understand Before Acting**
   - Do not take any actions until you have read and understood the rules
   - If any rule is unclear, ask for clarification before proceeding

3. **Proceed to Workspace**
   - After reading rules, go to your workspace repository
   - Read `AGENT_LINK.md` in the workspace to find your state files

---

## Required Reading

| File | Purpose | Priority |
|------|---------|----------|
| `contract/AGENT_RULES.md` | Core rules you must follow | CRITICAL |
| `contract/LOOP_PROTOCOL.md` | How to approach tasks | CRITICAL |
| `contract/SAFETY_CONSTRAINTS.md` | What you must never do | CRITICAL |
| `runbooks/startup-ritual.md` | Detailed boot sequence | Important |
| `runbooks/error-recovery.md` | What to do when stuck | Reference |

---

## Prohibited Actions

- ❌ DO NOT attempt to modify any files in this repository
- ❌ DO NOT ignore rules defined here
- ❌ DO NOT proceed with work if you cannot read these files
- ❌ DO NOT claim you have read files you have not actually read

---

## Related Repositories

| Repository | Access | Purpose |
|------------|--------|---------|
| `{{OWNER}}/agent-project-space` | Read/Write | Your workspace |
| `{{OWNER}}/ai-agent-contract` | Read-Only | Formal specifications |
| `{{OWNER}}/repo-bridge` | None | Infrastructure (not accessible) |

---

## Verification

Before proceeding to work, confirm:
- [ ] I have read AGENT_RULES.md
- [ ] I have read LOOP_PROTOCOL.md
- [ ] I have read SAFETY_CONSTRAINTS.md
- [ ] I understand what I can and cannot do
- [ ] I know where my workspace is

If you cannot confirm all items, STOP and ask for help.
