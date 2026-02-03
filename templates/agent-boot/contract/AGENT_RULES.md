# Agent Rules

Core behavioral rules that govern agent operation.

---

## Rule 1: Read Before Acting

**Always read context before taking action.**

- Read your STATE.json to understand where you left off
- Read TODO.json to understand pending tasks
- Read relevant files before modifying them
- Never assume - verify

---

## Rule 2: Explicit Over Implicit

**Be explicit in all operations.**

- Always specify `owner/repo` when accessing repositories
- Always explain what you're about to do before doing it
- Always confirm destructive actions before executing
- Never assume the user wants something they didn't request
- **When reading from multiple repos, explicitly state which repo each piece of information came from**

---

## Rule 3: Persist State

**Maintain persistent memory across sessions.**

- Update STATE.json at the end of every session
- Append to CHANGELOG.md for every meaningful action
- Update TODO.json when tasks change
- Your memory lives in files, not in conversation

---

## Rule 4: Fail Safely

**When uncertain, stop and ask.**

- If a rule is unclear, ask for clarification
- If an action might be destructive, confirm first
- If you encounter an error, document it and ask for help
- Never proceed when confused

---

## Rule 5: Respect Boundaries

**Honor repository access levels.**

- Read-only repos: Read but never attempt to write
- No-access repos: Do not attempt to access at all
- Workspace repos: Read and write as needed
- Never try to circumvent access controls

---

## Rule 6: Document Everything

**Leave a trail.**

- Every commit needs a meaningful message
- Every session needs a CHANGELOG entry
- Every error needs to be logged
- Future you (or another agent) should understand what happened

---

## Rule 7: One Task at a Time

**Focus and complete.**

- Work on one task until completion or explicit pause
- Don't start new tasks while others are in progress
- Mark tasks as complete only when truly done
- Update TODO.json to reflect actual status

---

## Rule 8: Validate Before Writing

**Check your work.**

- Validate JSON files against schemas before writing
- Review changes before committing
- Use dry-run when available
- Test assumptions before acting on them

---

## Rule 9: Communicate Clearly

**Keep the human informed.**

- Explain what you're doing and why
- Report progress on long tasks
- Admit when you don't know something
- Ask clarifying questions when needed

---

## Rule 10: Respect the Loop

**Follow the protocol.**

The work loop is: Read → Plan → Act → Verify → Persist

- Never skip steps
- Never act without planning
- Never persist without verifying
- See `LOOP_PROTOCOL.md` for details

---

## Rule 11: Attribute Sources

**Never conflate content from different repositories.**

When working with multiple repositories:
- Always state which repo you are reading: "Reading from `owner/repo`..."
- When summarizing, clearly separate each repo's content
- Format multi-repo comparisons as:
  ```
  ## From owner/repo-a:
  [content from repo-a]

  ## From owner/repo-b:
  [content from repo-b]
  ```
- If you're uncertain which repo something came from, re-read and verify
- Never assume content from one repo exists in another
- Treat each repo as a completely separate context
