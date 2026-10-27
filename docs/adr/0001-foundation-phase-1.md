# ADR 0001 — Phase 1 foundation

- Status: Accepted
- Date: 2026-10-26

## Context

The repository contained a partial foundation: a mode-guard draft in
`packages/core`, a sandbox runner that did not compile and busy-waited for
health, a duplicated orchestrator under `scripts/` that re-implemented the
schema/guard, dead npm scripts, no CLI, fake `complete/GO` stage stubs, and
stale generated artifacts.

## Decisions

1. **One source of truth for the Run Request.** `@nexus/core` owns the Zod
   schema, allowlist/lookalike checks, authorization rules, raw-secret
   detection, redirect checks, redaction, audit, and run storage. The CLI only
   orchestrates; no duplicated schema or guard.
2. **Honest stage records.** Every stage writes
   `artifacts/runs/<id>/stages/<name>.json` with `ok | failed | skipped` and a
   reason. Stages that are not implemented are `skipped`, never `ok`.
3. **No build step for development.** The CLI runs TypeScript with `tsx`
   (`node --import tsx`). Strict typechecking remains a CI gate. This avoids a
   separate emit pipeline until packaging is needed.
4. **Sandbox isolation matches trust.** Local fixtures use a child process
   (explicitly limited to trusted repositories). Remote repositories require a
   Dockerfile and run in a container with capability, privilege, PID, memory,
   and CPU limits. Container egress filtering is deferred to hardening and is
   reported as a limitation on every container run.
5. **Token handling.** A clone token is resolved from a reference
   (`vault:...` → `QA_VAULT_*`, or an environment variable name) and injected
   only into the clone command. Install/build/start environments only inherit
   an allowlist of non-secret variables.
6. **Docs and bundles are always generated.** The doc engine reads only the run
   summary. It writes Markdown + offline HTML and a deterministic store-only ZIP
   with `checksums.txt`; no external service or AI is involved.
7. **Resume is explicit.** `qa run --resume <run-id>` reuses completed,
   side-effect-free stage outputs. Gate, docs, and bundle are recomputed.
8. **Generated artifacts are disposable.** `artifacts/` is gitignored and
   removed by `npm run clean`; stale outputs from earlier attempts were deleted.

## Consequences

- A foundation run that requests no lanes completes with `GO WITH RISKS`
  because nothing was verified.
- A run whose sandbox fails, or that requests unimplemented lanes, is
  `INCOMPLETE`, exits `3`, and still produces docs and a bundle.
- Remote runs are blocked without Docker; this is intentional until the
  container runner is exercised in CI.
