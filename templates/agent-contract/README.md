# ai-agent-contract

Formal specifications and guarantees for AI agent behavior.

## Purpose

This repository contains the formal contract that defines:
- What the agent is capable of doing
- What the agent is prohibited from doing
- Guarantees the agent must provide
- Validation rules for agent outputs

## Access Level

**Read-Only** - Agents can read this repository but cannot modify it.

## Structure

```
ai-agent-contract/
├── README.md                 # This file
├── LICENSE                   # BSL 1.1
├── AGENT_ENTRY.md           # Agent's starting point
├── capabilities/
│   ├── ALLOWED_ACTIONS.md   # What agent CAN do
│   └── PROHIBITED_ACTIONS.md # What agent CANNOT do
├── guarantees/
│   ├── SAFETY_GUARANTEES.md # Promises agent must keep
│   ├── AUDIT_REQUIREMENTS.md # What must be logged
│   └── ROLLBACK_PROCEDURES.md # How to undo mistakes
└── validation/
    ├── state-schema.json    # Schema for STATE.json
    └── todo-schema.json     # Schema for TODO.json
```

## Related Repositories

| Repository | Purpose | Access |
|------------|---------|--------|
| [agent-boot](../agent-boot) | Boot contract and rules | Read-only |
| [agent-project-space](../agent-project-space) | Active workspace | Read/Write |

## License

Business Source License 1.1 - See [LICENSE](./LICENSE)
