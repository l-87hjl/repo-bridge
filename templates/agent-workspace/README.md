# agent-project-space

Active workspace for AI agent tasks and state management.

## Purpose

This repository serves as the agent's workspace where it:
- Maintains persistent state across sessions
- Tracks tasks and progress
- Stores work outputs
- Records history of actions

## Access Level

**Read/Write** - The agent can read and modify files in this repository.

## Structure

```
agent-project-space/
├── README.md                 # This file
├── LICENSE                   # License terms
├── AGENT_ENTRY.md           # Agent's starting point
├── AGENT_LINK.md            # Links to boot and contract repos
├── agent/
│   ├── STATE.json           # Current agent state
│   ├── TODO.json            # Task queue
│   └── CONTEXT.md           # Human-readable context
├── CHANGELOG.md             # History of changes
├── inputs/                  # New tasks from user
├── outputs/                 # Agent work products
└── scratch/                 # Temporary files
```

## Key Files

| File | Purpose |
|------|---------|
| `AGENT_LINK.md` | Points to boot and contract repos |
| `agent/STATE.json` | Agent's persistent memory |
| `agent/TODO.json` | Task queue |
| `CHANGELOG.md` | Session history |

## Related Repositories

| Repository | Purpose | Access |
|------------|---------|--------|
| [agent-boot](../agent-boot) | Boot contract and rules | Read-only |
| [ai-agent-contract](../ai-agent-contract) | Formal specifications | Read-only |

## For Humans

- Drop new tasks in `inputs/`
- Find agent outputs in `outputs/`
- Review history in `CHANGELOG.md`
- Check current state in `agent/STATE.json`

## License

See [LICENSE](./LICENSE)
