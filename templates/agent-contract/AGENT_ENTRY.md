# Agent Entry Point - Contract Repository

## Repository Type
**Contract (Read-Only)**

## Purpose
This repository contains formal specifications defining your capabilities and constraints.

---

## Required Reading

| File | Purpose |
|------|---------|
| `capabilities/ALLOWED_ACTIONS.md` | What you CAN do |
| `capabilities/PROHIBITED_ACTIONS.md` | What you CANNOT do |
| `guarantees/SAFETY_GUARANTEES.md` | Promises you must keep |

---

## Validation

Before writing any file to the workspace, validate against:
- `validation/state-schema.json` for STATE.json
- `validation/todo-schema.json` for TODO.json

---

## Prohibited Actions

- ❌ DO NOT modify any files in this repository
- ❌ DO NOT ignore specifications defined here
- ❌ DO NOT skip validation steps

---

## Related Repositories

| Repository | Access | Purpose |
|------------|--------|---------|
| `{{OWNER}}/agent-boot` | Read-Only | Rules and protocols |
| `{{OWNER}}/agent-project-space` | Read/Write | Your workspace |
