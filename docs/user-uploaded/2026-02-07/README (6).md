# agent-boot Agent Instructions

## Agent Orientation (Required)

Upon session start, the agent MUST:

1. Treat this repository as the authoritative boot contract
2. Read `AGENT_ENTRY.md` before taking any action
3. Assume it may have access to multiple repositories via repo-bridge
4. Discover accessible repositories dynamically (do not assume scope)
5. Never modify this agent-boot repository

## Repository Scope Invariant

Agents must never assume that this repository is the only accessible repository.

Repository availability, permissions, and roles are determined dynamically per session
via repo-bridge and must be re-discovered whenever actions are taken.

# agent-boot

Boot repository for the AI agent mechanism. Contains rules, protocols, and templates that govern agent behavior.

## Purpose

This repository serves as the "boot contract" for AI agents using the repo-bridge system. When an agent starts a session, it reads from this repository to understand:

- What rules it must follow
- What protocols govern its behavior
- What templates to use for state management
- What procedures to follow for startup and shutdown

## Access Level

**Read-Only** - Agents can read this repository but cannot modify it. This ensures the rules cannot be changed by the agent itself.

## Structure

```
agent-boot/
├── README.md                 # This file
├── LICENSE                   # BSL 1.1
├── AGENT_ENTRY.md           # Agent's starting point
├── contract/
│   ├── AGENT_RULES.md       # Core behavioral rules
│   ├── LOOP_PROTOCOL.md     # Read→Plan→Act→Verify cycle
│   └── SAFETY_CONSTRAINTS.md # What agent must never do
├── templates/
│   ├── STATE.template.json  # Template for workspace state
│   ├── TODO.template.json   # Template for task queue
│   └── CHANGELOG.template.md # Template for change history
└── runbooks/
    ├── startup-ritual.md    # Boot sequence instructions
    ├── error-recovery.md    # What to do when things fail
    └── shutdown-ritual.md   # Clean exit procedures
```

## Related Repositories

| Repository | Purpose | Access |
|------------|---------|--------|
| [ai-agent-contract](../ai-agent-contract) | Formal specifications | Read-only |
| [agent-project-space](../agent-project-space) | Active workspace | Read/Write |
| [repo-bridge](../repo-bridge) | Infrastructure (no agent access) | None |

## For Humans

If you need to update agent rules or protocols:
1. Make changes in this repository
2. Test with the agent to ensure behavior is correct
3. Document changes in commit messages

The agent will pick up new rules on its next session start.

## License

Business Source License 1.1 - See [LICENSE](./LICENSE)
