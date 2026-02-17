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
