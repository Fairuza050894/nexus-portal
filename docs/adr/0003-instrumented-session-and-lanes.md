# ADR 0003 — Instrumented session and lane MVP

- Status: Accepted
- Date: 2026-10-27

## Context

Phase 3 needs one browser pass to produce functional, accessibility, Web Vitals,
console/network, screenshot, and passive-security evidence, then run API and repo
lanes without duplicating crawls or letting one lane abort the run. The app
started by the sandbox must stay alive until lanes finish.

## Decisions

1. **Sandbox sessions.** `startSandbox()` returns a session with `stop()`;
   `runSandbox()` remains a convenience wrapper. The pipeline starts the app,
   discovers, models, plans, and executes lanes, then tears down in one place.
   Resume only reuses intake/preflight; discovery and lanes always re-run.
2. **One Playwright context.** `packages/session` launches Chromium once, uses a
   single context with an init script for LCP/CLS, and one page per journey.
   Probes are passive listeners; navigation to non-allowlisted hosts is aborted,
   while third-party subresources may load passively.
3. **Auth scope.** Credentials are injected through the Playwright route handler
   only for the original target host. Redirects to another host receive no
   credentials.
4. **Axe inside the page.** axe-core is injected into the already-loaded page,
   so the a11y lane never crawls again. `packages/lanes` converts violations to
   findings and a per-page critical/serious test.
5. **API lane is read-only.** It selects parameter-free GET endpoints from the
   Application Map and validates status plus OpenAPI JSON schema with Ajv.
   Endpoints marked `authRequired` get an unauthenticated 401/403 check.
   Automatic POST/PUT/PATCH/DELETE is intentionally not performed.
6. **Repo lane is static in this phase.** It scans for hardcoded secrets,
   discovers manifests/license/tests, and reports missing coverage as
   `needs-review`. Executing developer tests and coverage inside the sandbox is
   deferred and recorded as skipped.
7. **Per-lane isolation.** Session and API run concurrently; browser-derived
   lanes share the session result; each lane is wrapped individually. A lane
   error becomes an `error` lane and gate reason, not a pipeline abort.
8. **Findings are first-class.** Findings carry severity, confidence, affected
   evidence, and global IDs. Security-header and Web Vitals thresholds produce
   findings but do not fail the run by themselves (Phase 4 owns gate policy).
9. **Evidence is bundled.** Screenshots live under `evidence/session/` and are
   included in the ZIP with `lanes.json`, `session.json`, and `findings.json`.

## Consequences

- Phase 4 can build correlation on stable lane/finding data.
- Visual baseline comparison and Test Builder journeys remain future work.
- The repo lane's honesty depends on its documented `skipped` cases; it must
  not claim developer tests ran when they did not.
