Agent Taxonomy

This document defines the authoritative repository taxonomy used by the agent at boot time.

The taxonomy is operational, not descriptive: each category carries concrete behavioral semantics that govern how the agent reads, writes, reasons, and coordinates across repositories.

The agent must load and apply this taxonomy before any other action.


---

Boot Anchor

Authoritative boot repository:

l-87hjl/agent-boot

Rules:

Read first, always

Treated as authoritative

Read-only by default

Defines the taxonomy and boot sequence



---

Taxonomy Overview

Repositories are grouped by role, not by language, size, or activity level.

Each role implies:

Risk profile

Expected change velocity

Allowed agent behaviors

Cross-repo interaction rules



---

Multi-Repo Agent Project

Purpose: Infrastructure, coordination, and meta-reasoning across repositories.

l-87hjl/repo-bridge
l-87hjl/research-assistant-levelup
l-87hjl/pep-counterfactual-self
l-87hjl/multirepo-agent-changelog
l-87hjl/architectural-consultant
l-87hjl/agent-boot
l-87hjl/ai-agent-contract
l-87hjl/agent-project-space
l-87hjl/paradigm-shift-fleet-officer

Behavioral semantics:

High systemic impact

Read frequently

Write cautiously

Never treated as content or output


Special rules:

agent-boot: read-only unless explicitly authorized

multirepo-agent-changelog: append-only

agent-project-space: designated scratch / staging workspace



---

Covenant AI Architecture

Purpose: Foundational theory, philosophy, and architectural constraints.

l-87hjl/covenant-pure
l-87hjl/covenant-legacy
l-87hjl/ai-emergence-under-constraint
l-87hjl/covenant-core

Behavioral semantics:

Slow-moving

High downstream impact

Analysis-first, write-last


Special rules:

covenant-legacy: historical reference, no new development

covenant-pure: conceptual baseline

covenant-core: active but guarded


Assumption:

> Errors in this category propagate system-wide.




---

Content Creation

Purpose: Production-oriented creative tools and workflows.

l-87hjl/horror-generator-rule-based
l-87hjl/story-grader
l-87hjl/novel-completer

Behavioral semantics:

Output-oriented

Iteration expected

Breakage acceptable and reversible

Fast write / refactor cycles allowed



---

Content Creation > Frontier / Anomaly-Driven Science

Purpose: Exploratory, speculative, and publication-facing work.

l-87hjl/3i-atlas-public-data
l-87hjl/Medium

Behavioral semantics:

Preserve uncertainty

Separate speculation from claims

Maintain provenance

Avoid premature cleanup or over-optimization


Assumption:

> Messiness is a feature, not a bug.




---

Lone Projects

Purpose: Isolated, self-contained work with no expected integration.

l-87hjl/PNP

Behavioral semantics:

No cross-repo assumptions

No shared abstractions

Treated as a sealed system



---

Delete Once Cloned Repo Is Verified

Purpose: Transitional repositories pending decommission.

l-87hjl/rule-based-horror

Behavioral semantics:

Read-only

No new work

Used only for comparison or verification



---

Delete

Purpose: Deprecated or invalid repositories.

l-87hjl/covenant-core-

Behavioral semantics:

Must never be read or written

Treated as hazardous if referenced

Agent must warn and redirect to the correct repository



---

Enforcement Rules

Before any action, the agent must internally answer:

1. Which taxonomy category does this repository belong to?


2. Is the action read, write, or structural?


3. Is this action permitted by default for this category?


4. Does the action introduce cross-category contamination?



If the answer is unclear or negative, the agent must stop and request clarification.


---

Design Principle

This taxonomy encodes intent into structure.

It replaces ad-hoc caution with architectural guarantees, enabling safe multi-repo reasoning and delegation by default.
