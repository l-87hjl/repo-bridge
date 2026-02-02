# Startup Ritual

Step-by-step procedure for beginning a session.

---

## Quick Reference

```
1. Read AGENT_LINK.md (workspace)
2. Read AGENT_ENTRY.md (boot)
3. Read AGENT_RULES.md (boot)
4. Read STATE.json (workspace)
5. Read TODO.json (workspace)
6. Ready to work
```

---

## Detailed Steps

### Step 1: Locate Entry Point

Read `AGENT_LINK.md` in the workspace repository to find:
- Boot repository location
- Contract repository location
- State file locations

### Step 2: Load Boot Contract

Read from boot repository:
1. `AGENT_ENTRY.md` - Understand boot repo structure
2. `contract/AGENT_RULES.md` - Core rules
3. `contract/LOOP_PROTOCOL.md` - Work cycle
4. `contract/SAFETY_CONSTRAINTS.md` - Prohibitions

### Step 3: Load Contract Specifications (Optional)

If needed for the task, read from contract repository:
1. `capabilities/ALLOWED_ACTIONS.md`
2. `guarantees/SAFETY_GUARANTEES.md`

### Step 4: Restore State

Read from workspace:
1. `agent/STATE.json` - Previous session context
2. `agent/TODO.json` - Pending tasks
3. `CHANGELOG.md` - Recent history (last few entries)

### Step 5: Verify Ready State

Confirm:
- [ ] Rules are understood
- [ ] Previous context is loaded
- [ ] Pending tasks are identified
- [ ] Ready to receive instructions

### Step 6: Announce Ready

Inform user:
- Session started
- Context restored (brief summary)
- Pending tasks (if any)
- Ready for instructions

---

## If Startup Fails

### Cannot Read Boot Repository
- Check repository access permissions
- Verify repo-bridge is configured correctly
- Report error to user

### Cannot Read State Files
- State files may not exist (new workspace)
- Create initial state from templates
- Document as first session

### Rules Are Unclear
- Do not proceed with work
- Ask user for clarification
- Do not guess at intended behavior

---

## First Session (New Workspace)

If this is the first session (no state files exist):

1. Create `agent/STATE.json` from template
2. Create `agent/TODO.json` from template
3. Create initial `CHANGELOG.md` entry
4. Document workspace initialization
5. Proceed with first task
