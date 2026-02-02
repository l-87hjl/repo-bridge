# Loop Protocol

The standard work cycle for agent operation.

---

## The Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    ┌──────┐    ┌──────┐    ┌─────┐    ┌────────┐       │
│    │ READ │───▶│ PLAN │───▶│ ACT │───▶│ VERIFY │       │
│    └──────┘    └──────┘    └─────┘    └────────┘       │
│        ▲                                   │            │
│        │         ┌─────────┐               │            │
│        └─────────│ PERSIST │◀──────────────┘            │
│                  └─────────┘                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: READ

**Purpose:** Understand current context before taking action.

### At Session Start
1. Read `AGENT_LINK.md` to find boot and contract repos
2. Read boot repo's `AGENT_ENTRY.md` and rules
3. Read contract repo's specifications
4. Read workspace `STATE.json` to restore context
5. Read workspace `TODO.json` to find pending tasks
6. Read any relevant files for current task

### During Work
- Read files before modifying them
- Read error messages carefully
- Read user instructions completely

### Checklist
- [ ] I know what repositories I have access to
- [ ] I know what my current state is
- [ ] I know what tasks are pending
- [ ] I understand the current request

---

## Phase 2: PLAN

**Purpose:** Think before acting.

### Steps
1. Understand the goal clearly
2. Break down into specific steps
3. Identify files that will be affected
4. Consider what could go wrong
5. Determine validation criteria

### Questions to Answer
- What exactly am I trying to accomplish?
- What files will I need to read?
- What files will I need to modify?
- What could fail?
- How will I know if I succeeded?

### Output
- Clear list of steps to take
- Expected outcome for each step
- Rollback plan if something fails

---

## Phase 3: ACT

**Purpose:** Execute the plan.

### Guidelines
- Execute one step at a time
- Verify each step before proceeding to next
- Stop immediately if something unexpected happens
- Use dry-run mode when available
- Keep the user informed of progress

### For File Operations
1. Read the current file state
2. Make the modification
3. Verify the modification is correct
4. Commit with a meaningful message

### For Multi-Step Tasks
- Complete each step fully before moving on
- Update TODO.json as steps complete
- Document progress in case of interruption

---

## Phase 4: VERIFY

**Purpose:** Confirm the action succeeded.

### Verification Steps
1. Check that files contain expected content
2. Validate JSON/YAML against schemas
3. Confirm no unintended changes occurred
4. Test functionality if applicable
5. Review for errors or warnings

### If Verification Fails
1. Stop immediately
2. Document what went wrong
3. Attempt rollback if possible
4. Ask for help if needed

---

## Phase 5: PERSIST

**Purpose:** Save state for future sessions.

### Required Updates
1. **STATE.json** - Update with current context
   - Current task/phase
   - Last action taken
   - Any errors encountered
   - Timestamp

2. **TODO.json** - Update task statuses
   - Mark completed tasks
   - Add new discovered tasks
   - Update priorities if needed

3. **CHANGELOG.md** - Append session summary
   - What was accomplished
   - What files were changed
   - Any issues encountered

### At Session End
- Ensure all state is persisted
- Leave clear notes for next session
- Commit all changes with meaningful message

---

## Loop Examples

### Example: Simple File Edit
```
READ    → Read the file to be edited
PLAN    → Determine specific changes needed
ACT     → Make the edit
VERIFY  → Confirm edit is correct
PERSIST → Commit with message, update state
```

### Example: Multi-File Task
```
READ    → Read all relevant files, understand scope
PLAN    → List all changes needed, order them
ACT     → Make change #1
VERIFY  → Confirm change #1
ACT     → Make change #2
VERIFY  → Confirm change #2
...
PERSIST → Commit all, update TODO, update state
```

### Example: Error Recovery
```
ACT     → Attempt action
VERIFY  → Verification fails!
READ    → Read error details
PLAN    → Plan recovery steps
ACT     → Execute recovery
VERIFY  → Confirm recovery worked
PERSIST → Document error and recovery
```

---

## Critical Rules

1. **Never skip READ** - Always understand before acting
2. **Never skip PLAN** - Always think before doing
3. **Never skip VERIFY** - Always check your work
4. **Never skip PERSIST** - Always save your state
5. **When in doubt, stop** - Ask rather than guess
