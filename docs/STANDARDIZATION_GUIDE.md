# Agent Repository Standardization Guide

This guide defines the standard structure and required files for repositories in the agent mechanism ecosystem.

---

## Overview

The agent mechanism consists of three types of repositories:

| Type | Example | Access | Purpose |
|------|---------|--------|---------|
| **Boot** | `agent-boot` | Read-only | Rules, contracts, templates the agent follows |
| **Contract** | `ai-agent-contract` | Read-only | Formal specifications and guarantees |
| **Workspace** | `agent-project-space` | Read/Write | Active workspace for agent tasks and state |

Each type has specific requirements and structure.

---

## Universal Requirements (All Repos)

Every repo in the agent mechanism MUST have:

### 1. README.md
Human-readable documentation explaining:
- What the repo is
- Its role in the agent mechanism
- How it relates to other repos
- How to use it

### 2. LICENSE
Legal terms. Recommended: BSL 1.1 (same as repo-bridge) for infrastructure repos.

### 3. AGENT_ENTRY.md
The agent's starting point. This file tells the agent:
- What this repo is for
- What files to read
- What actions are allowed/prohibited
- Links to related repos

**This is the most critical file for agent operation.**

---

## Boot Repository Structure

**Purpose:** Contains rules, protocols, and templates that govern agent behavior. The agent reads these but cannot modify them.

**Example:** `agent-boot`

### Required Structure

```
agent-boot/
├── README.md                 # Human documentation
├── LICENSE                   # BSL 1.1 recommended
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

### Key Files

**AGENT_ENTRY.md** should contain:
```markdown
# Agent Entry Point - Boot Repository

## Repository Type
Boot (Read-Only)

## Purpose
This repository contains the rules, protocols, and templates that govern your behavior.

## On Every Session Start
1. Read contract/AGENT_RULES.md
2. Read contract/LOOP_PROTOCOL.md
3. Understand your constraints before taking any action

## Prohibited Actions
- DO NOT attempt to modify any files in this repository
- DO NOT ignore rules defined here
- DO NOT proceed if you cannot read these files

## Related Repositories
- Workspace: l-87hjl/agent-project-space (read/write)
- Contract: l-87hjl/ai-agent-contract (read-only)
```

---

## Contract Repository Structure

**Purpose:** Formal specifications defining what the agent can/cannot do, guarantees it must provide, and validation criteria.

**Example:** `ai-agent-contract`

### Required Structure

```
ai-agent-contract/
├── README.md                 # Human documentation
├── LICENSE                   # BSL 1.1 recommended
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
    ├── todo-schema.json     # Schema for TODO.json
    └── VALIDATION_RULES.md  # How to validate before acting
```

### Key Files

**AGENT_ENTRY.md** should contain:
```markdown
# Agent Entry Point - Contract Repository

## Repository Type
Contract (Read-Only)

## Purpose
This repository contains formal specifications and guarantees you must follow.

## Required Reading
1. capabilities/ALLOWED_ACTIONS.md - Know what you can do
2. capabilities/PROHIBITED_ACTIONS.md - Know what you must never do
3. guarantees/SAFETY_GUARANTEES.md - Promises you must keep

## Validation
Before writing any file, validate against schemas in validation/

## Prohibited Actions
- DO NOT modify any files in this repository
- DO NOT ignore specifications defined here
- DO NOT skip validation steps

## Related Repositories
- Boot: l-87hjl/agent-boot (read-only)
- Workspace: l-87hjl/agent-project-space (read/write)
```

---

## Workspace Repository Structure

**Purpose:** Active workspace where the agent performs tasks, maintains state, and produces outputs.

**Example:** `agent-project-space`

### Required Structure

```
agent-project-space/
├── README.md                 # Human documentation
├── LICENSE                   # Can be different from BSL
├── AGENT_ENTRY.md           # Agent's starting point
├── AGENT_LINK.md            # Links to boot and contract repos
├── agent/
│   ├── STATE.json           # Current agent state
│   ├── TODO.json            # Task queue
│   ├── CONTEXT.md           # Human-readable context summary
│   └── last-run.log         # Debug info from last session
├── CHANGELOG.md             # Append-only history of changes
├── inputs/                  # User drops tasks here
├── outputs/                 # Agent writes results here
└── scratch/                 # Temporary working files
```

### Key Files

**AGENT_ENTRY.md** should contain:
```markdown
# Agent Entry Point - Workspace Repository

## Repository Type
Workspace (Read/Write)

## Purpose
This is your active workspace. You can read and write files here.

## On Session Start
1. Read AGENT_LINK.md to find boot and contract repos
2. Read boot repo's AGENT_ENTRY.md and rules
3. Read agent/STATE.json to restore context
4. Read agent/TODO.json to find pending tasks

## On Session End
1. Update agent/STATE.json with current state
2. Append to CHANGELOG.md with what you did
3. Update agent/TODO.json with completed/new tasks

## File Purposes
- agent/STATE.json - Your persistent memory
- agent/TODO.json - Your task queue
- inputs/ - Check here for new tasks from user
- outputs/ - Put your work products here
- scratch/ - Temporary files (can be deleted)

## Related Repositories
- Boot: l-87hjl/agent-boot (read-only)
- Contract: l-87hjl/ai-agent-contract (read-only)
```

**AGENT_LINK.md** should contain:
```markdown
# Agent Link Configuration

## Boot Repository
- Repo: l-87hjl/agent-boot
- Branch: main
- Entry: AGENT_ENTRY.md
- Purpose: Rules and protocols

## Contract Repository
- Repo: l-87hjl/ai-agent-contract
- Branch: main
- Entry: AGENT_ENTRY.md
- Purpose: Formal specifications

## This Workspace
- Repo: l-87hjl/agent-project-space
- Branch: main
- Type: Read/Write
- Purpose: Active workspace

## Memory Files
- State: agent/STATE.json
- Queue: agent/TODO.json
- Context: agent/CONTEXT.md
- History: CHANGELOG.md
```

---

## File Format Specifications

### STATE.json

```json
{
  "version": "1.0",
  "lastUpdated": "2026-02-02T10:00:00Z",
  "lastCommitSha": "abc123...",
  "currentPhase": "active",
  "currentTask": "T001",
  "context": {
    "projectName": "agent-project-space",
    "summary": "Brief description of current state"
  },
  "errors": [],
  "metadata": {
    "totalSessions": 0,
    "lastSuccessfulSession": null
  }
}
```

### TODO.json

```json
{
  "version": "1.0",
  "lastUpdated": "2026-02-02T10:00:00Z",
  "tasks": [
    {
      "id": "T001",
      "title": "Task description",
      "status": "pending",
      "priority": "high",
      "created": "2026-02-02T10:00:00Z",
      "dependencies": [],
      "notes": ""
    }
  ]
}
```

### CHANGELOG.md

```markdown
# Changelog

All notable changes to this workspace are documented here.

## [Unreleased]

## 2026-02-02

### Session: abc123
- **Started:** 10:00 UTC
- **Ended:** 10:30 UTC
- **Tasks Completed:** T001
- **Changes:**
  - Created initial workspace structure
  - Added STATE.json and TODO.json
- **Notes:** First session, initialized workspace
```

---

## Implementation Checklist

### For agent-boot:
- [ ] Create README.md
- [ ] Create LICENSE (BSL 1.1)
- [ ] Create AGENT_ENTRY.md
- [ ] Create contract/AGENT_RULES.md
- [ ] Create contract/LOOP_PROTOCOL.md
- [ ] Create templates/ directory with templates
- [ ] Create runbooks/ with procedures

### For ai-agent-contract:
- [ ] Create README.md
- [ ] Create LICENSE (BSL 1.1)
- [ ] Create AGENT_ENTRY.md
- [ ] Create capabilities/ with allowed/prohibited
- [ ] Create guarantees/ with safety rules
- [ ] Create validation/ with schemas

### For agent-project-space:
- [ ] Create README.md
- [ ] Create LICENSE
- [ ] Create AGENT_ENTRY.md
- [ ] Create AGENT_LINK.md
- [ ] Create agent/ directory with STATE.json, TODO.json
- [ ] Create CHANGELOG.md
- [ ] Create inputs/, outputs/, scratch/ directories

---

## Usage Instructions

### Option 1: Copy Templates Directly
1. Go to `templates/` directory in this repo
2. Copy the appropriate template folder contents to your target repo
3. Customize the placeholders (repo names, etc.)

### Option 2: Share with Claude (Non-Code)
1. Share this guide with Claude
2. Ask Claude to generate customized files for your specific repo
3. Copy the generated content to your repos

### Option 3: New Claude Code Session
1. Start a new Claude Code session pointing at the target repo
2. Share this guide or reference it
3. Ask Claude to implement the structure

---

## Template Files

Ready-to-use template files are available in:
- `templates/agent-boot/` - Boot repository templates
- `templates/agent-contract/` - Contract repository templates
- `templates/agent-workspace/` - Workspace repository templates
- `templates/LICENSE-BSL-1.1.txt` - License template

Copy these directly or use as reference.
