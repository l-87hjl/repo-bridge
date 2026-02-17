# AI Changelog

This file tracks all changes made by AI agents through repo-bridge. Entries are append-only.

---

<!-- AI agents: Append new entries below this line. Format:

## [YYYY-MM-DD HH:MM UTC] <commit-sha-short>

**Files Changed:** path/to/file1.ext, path/to/file2.ext
**Summary:** Brief description of what changed and why
**Triggered By:** Description of what initiated this change

-->

## Initial Setup

This changelog was created as part of the repo-bridge persistent memory system.
AI agents should append entries here after each successful commit.

## [2026-02-17] GPT Actions Schema Compatibility Notes

**Summary:** Documented recurring schema failures when using repo-bridge with ChatGPT GPT Actions.

**Problem:** GPT Actions does not reliably tolerate conditional or mutually-exclusive schemas.
The original `/patch` endpoint accepted `operations[]` OR `patch` (not both), with optional
`dryRun` and `replaceAll` flags. This schema shape caused GPT parser rejection *before requests
reached the backend* — meaning the API was functionally unreachable via GPT Actions.

**Root Cause:** OpenAPI supports `oneOf`, conditional `required`, and optional behavioral flags.
GPT Actions' schema parser does not. Specifically, these patterns caused failures:
- Mutually exclusive fields ("provide X or Y, not both")
- Optional behavior flags (`dryRun`, `replaceAll`)
- Nested options objects
- Schema enums controlling mode selection
- Conditional required fields

**Resolution:** Split `/patch` into `/patchReplace` (operations-only) and `/patchDiff` (diff-only).
Each endpoint has a flat, deterministic schema with only required fields. All behavioral validation
moved backend-side. The working schema (`chatgpt-tool-schema-working-step01.json`) confirmed this
approach succeeds.

**Design Principle:** Separate transport contract (agent-facing API) from behavioral engine (backend
logic). GPT sees a stable RPC surface. Backend retains intelligence and enforcement.

## [2026-02-17] v0.5.0 — GPT Actions Safe Endpoints

**Files Changed:** src/server.js, src/github.js, docs/chatgpt-tool-schema.json
**Summary:** Split `/patch` into `/patchReplace` and `/patchDiff` for GPT Actions compatibility.
Each has a flat, deterministic schema — no conditional fields, no enums, no optional mode flags.
Extracted `applySearchReplace()` as a pure function for testability.

## [2026-02-17] v0.6.0 — Observability, Governance, and New Endpoints

**Files Changed:** src/server.js, src/github.js, tests/server.test.js, package.json, docs/chatgpt-tool-schema.json
**Summary:** Major feature release:
- `/repoTree` — full recursive file tree via Git Trees API (`recursive=1`), O(1) traversal
- `/deleteFile` — direct file deletion, no patch gymnastics
- `/updateFile` — server-side auto-diff, eliminates client-side context mismatch
- `GET /metrics` — uptime, memory, version, GitHub rate-limit with warning thresholds, last diagnostic snapshot
- Background self-diagnosis loop (configurable via `DIAG_INTERVAL_MS`)
- `PATCH_ONLY_PATHS` enforcement — blocks full overwrites on protected paths
- batchRead limit raised from 10 to 25 files
- Jest + Supertest integration tests (21 tests)
- OpenAPI schema managed as flat GPT-safe primary (3.0.1), detailed backup (3.1.0)

## [2026-02-17] v0.7.0 — Multi-Repo Coordination + Line-Accuracy Features

**Files Changed:** src/server.js, src/github.js, src/normalize.js (new), tests/server.test.js, tests/normalize.test.js (new), package.json, docs/chatgpt-tool-schema.json
**Summary:** Integrates features from two parallel branches into a unified v0.7.0 release:

**Multi-repo coordination (from this branch):**
- `/listBranches` — list all branches with commit SHAs and protection status
- `/createBranch` — create feature branches from any existing ref
- `/createPR` — create pull requests for governance-safe change proposals

**Line-accuracy features (integrated from `claude/fix-line-number-accuracy-gq86H`):**
- `/readLines` — line-accurate file reading with CRLF→LF normalization, blob SHA drift detection, line range extraction
- `/blob` — direct blob retrieval by SHA via Git Blobs API (supports files up to 100MB)
- `/search` — cross-repo content search via GitHub Code Search API with line-accurate results
- `/symbols` — cross-repo symbol discovery (functions, classes, interfaces) for JS/TS, Python, Go, Ruby, Java/Kotlin/C#, Rust

**New module:** `src/normalize.js` — content normalization, line mapping, multi-language symbol patterns, drift detection

**Test coverage:** 75 tests (42 normalize + 33 server integration)
