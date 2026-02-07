# Branch Archive

Historical record of development branches in repo-bridge. These branches have all been merged into `main` and can be safely deleted.

Archived: 2026-02-07

---

## claude/add-readonly-repos-WDLZL

**Created:** ~2026-02-02
**Status:** Merged into main
**Purpose:** Added READ_ONLY_REPOS feature and product documentation.

Key commits:
- Add READ_ONLY_REPOS env var to block writes on specific repos
- Document READ_ONLY_REPOS feature in README and API docs
- Add product positioning documentation
- Add /read endpoint to read files from GitHub
- Add AI persistent memory system and ChatGPT tool schema

---

## claude/add-agent-docs-WDLZL

**Created:** ~2026-02-04
**Status:** Merged into main
**Purpose:** Added agent documentation, setup guides, and behavioral rules.

Key commits:
- Add agent setup guide and repo access map documentation
- Add standardization guide and repository templates
- Add Rule 11: Attribute Sources — prevent repo content conflation
- Add /list endpoint for directory listing
- Add Rule 12: Reflect on Process — agent self-reflection logging

---

## claude/multi-repo-analysis-mV3aA

**Created:** ~2026-02-05
**Status:** Merged into main
**Purpose:** Added multi-repo analysis capabilities and migrated to v1.2.1 schema.

Key commits:
- Add multi-repo analysis: /copy, /batch/read, multi-file writes
- Create CHATGPT-AGENT-SETUP-RECS
- Fix schema to use ChatGPT-compatible flat format
- Migrate backend to v1.2.1 schema routes and conventions

---

## claude/fix-repo-bridge-issues-axNkc

**Created:** ~2026-02-07
**Status:** Merged into main
**Purpose:** Bug fixes and operational improvements across multiple PRs.

Key commits:
- Add /webhook endpoint and document GitHub App webhook fix
- Fix webhook 404: add /github/webhook route to match GitHub App config
- Add explicit 403 diagnosis for GitHub App not installed on repo
- Add /diagnose endpoint and fix stale token cache on 403
- Add /diagnose to OpenAPI schema so ChatGPT can call it (v1.4.0)
- Fix critical scoping bug in /read and /list error handlers
- Fix /apply gate ordering: allow dry-run previews on read-only repos
- Remove dryRun from agent-facing schema and instructions (v1.5.0)

---

## claude/document-branches-cleanup-qVAYF

**Created:** 2026-02-07
**Status:** Active (this branch created this archive)
**Purpose:** Document branches for archival, clean up superseded files in docs/user-uploaded.

Key changes:
- Created this BRANCH-ARCHIVE.md
- Improved docs/user-uploaded/FOLDER-PURPOSE.md
- Removed superseded files from docs/user-uploaded/2026-02-07/
