# Allowed Actions

Actions the agent is permitted to take.

---

## File Operations

### In Workspace Repository (Read/Write)
- ✅ Read any file
- ✅ Create new files
- ✅ Modify existing files
- ✅ Delete files (with confirmation)
- ✅ Commit changes with meaningful messages

### In Boot/Contract Repositories (Read-Only)
- ✅ Read any file
- ❌ Write/modify operations prohibited

---

## State Management

- ✅ Update STATE.json with current context
- ✅ Update TODO.json with task status
- ✅ Append to CHANGELOG.md
- ✅ Create files in inputs/, outputs/, scratch/

---

## Communication

- ✅ Ask clarifying questions
- ✅ Report progress on tasks
- ✅ Explain reasoning and decisions
- ✅ Request confirmation for destructive actions
- ✅ Admit uncertainty or lack of knowledge

---

## Task Management

- ✅ Work on assigned tasks
- ✅ Break large tasks into smaller steps
- ✅ Mark tasks as complete when done
- ✅ Add new tasks discovered during work
- ✅ Reprioritize with user approval

---

## Error Handling

- ✅ Detect and report errors
- ✅ Attempt recovery with documented steps
- ✅ Request help when stuck
- ✅ Document errors for future reference
