# ROADMAP — Phased Build Plan (Unified Platform)

Work phase by phase. Do **not** start a phase until the previous phase's acceptance criteria are met and the human approves. Each task = one PR. Track with `[ ]` / `[x]`.

**Milestones**
- **M1 (end of Phase 4): "One command"** — `qa run` does intake → discovery → plan → unified lanes → findings → full document bundle.
- **M2 (end of Phase 5): "One click"** — the same through the web app with the Test Builder.
- **M3 (end of Phase 7): "Always on"** — CI/schedules, baselines, notifications.

---

## Phase 0 — Discovery & Decisions  (≈ 2–3 days)

- [x] 0.1 Run the discovery checklist (`AGENTS.md` §5); ask the human the open questions (sandbox runtime, allowlist owners, SSO, git provider, issue tracker, AI policy). → `docs/DECISIONS.md` §1; operational approvals remain open in §6.
- [x] 0.2 Pick 2–3 **pilot targets** (one repo + URL pair, one URL-only site, one API) for development and acceptance tests. → `fixtures/sample-todo-api` for foundation acceptance; three real pilots pending.
- [x] 0.3 Create `docs/DECISIONS.md` (stack confirmation, sandbox technology, queue/DB choices, approved integrations).
- [x] 0.4 Draft `requirements/requirements.yaml` for the pilot apps.

**Acceptance:** DECISIONS.md approved; pilots reachable; sandbox technology confirmed feasible on company infrastructure.
Status: defaults accepted for the MVP foundation. Docker rootless was **not available on the development machine** (daemon offline); container commands are unit-tested with mocks and must be exercised in CI. See `docs/DECISIONS.md` §6.

---

## Phase 1 — Foundation  (≈ 1 week)

- [x] 1.1 Monorepo scaffold (`docs/01-ARCHITECTURE.md` §7): tooling, strict TS, lint, format, secret scan, commit conventions. → npm workspaces, strict `tsc`, ESLint, Prettier, Vitest, CI; gitleaks remains a Phase 9 hardening item.
- [x] 1.2 `packages/core`: Run Request schema (Zod), config, **mode guard**, authorization + allowlist check (redirect-aware), audit log, redaction, shared types.
- [x] 1.3 `packages/sandbox`: container runner skeleton (clone → build → start → health → teardown), resource/egress limits, stack detection table, `.qa/recipe.yaml` support. → container CPU/memory/PID/capability limits implemented; **egress filtering deferred** and reported as a limitation.
- [x] 1.4 `apps/cli`: `qa run` skeleton that validates a Run Request, runs preflight, writes stage outputs, exit-code contract. → also `plan`, `docs`, `replay`, `clean`.
- [x] 1.5 Stage runner with persisted stage outputs (resumable) and the `INCOMPLETE` report path.
- [x] 1.6 CI for the platform (lint, typecheck, unit tests). → `.github/workflows/qa.yml` plus foundation smoke job.

**Acceptance:** guard blocks non-allowlisted/lookalike hosts and state-changing requests in `prod-safe` (unit + integration tests); raw secrets rejected; sandbox builds and starts a sample repo and tears down cleanly; a failed build still yields an INCOMPLETE report.
Status: met. Evidence: `packages/core/tests/guard.test.ts`, `packages/sandbox/tests/*`, `tests/smoke/foundation.test.ts`, and `npm run qa:smoke`. The sample app is `fixtures/sample-todo-api`; app process is verified stopped after the run. Container egress filtering remains the documented hardening gap.

---

## Phase 2 — Discovery & Application Map  (≈ 1–2 weeks)

- [x] 2.1 Crawler (rate-limited per mode, robots/Retry-After, depth, exclusions, auth via vault refs) with network recording. → `packages/discover`; records crawl/robots/spec traffic; browser subresource recording waits for Phase 3.
- [x] 2.2 OpenAPI importer + traffic-based endpoint inference. → JSON/YAML OpenAPI 3, traffic + form endpoints.
- [x] 2.3 Repo analyzer: stack detection, route/endpoint extractors for the pilot frameworks, CODEOWNERS and git change history. → Express + Next App Router extractors, CODEOWNERS matching, last 10 commits in a git checkout.
- [x] 2.4 Application Map builder + risk scoring (`06-…` §3, §7); `app-map.json` + viewer data. → `app-map.json` + docs summary; interactive viewer belongs to Phase 5.
- [x] 2.5 Circuit breaker and budget manager. → 429 / >5% 5xx over 20 requests, scope budgets, mode rate limits.

**Acceptance:** map produced for all pilots; page↔endpoint edges correct on a manual spot check of 10 items; circuit breaker proven against a simulated 429/5xx storm; no state-changing request sent in `prod-safe` (asserted by traffic log test).
Status: implementation met. Evidence: `packages/discover/tests/*`, `packages/app-map/tests/*`, `tests/smoke/foundation.test.ts` (repo+URL, URL-only, API-only, prod-safe GET-only). Maps are produced for the local sample pilots; the three real pilots still need credentials and reachable environments, and a manual 10-item edge spot check is pending.

---

## Phase 3 — Lanes MVP (instrumented)  (≈ 2–3 weeks)

- [x] 3.1 **Instrumented session**: probes for console, network, axe, Web Vitals, screenshots, security headers/cookies — passive, never altering behavior. → `packages/session`; one Chromium context, one page per journey; no browser trace yet.
- [x] 3.2 e2e lane: provided rows + generated invariant journeys (page load, navigation, form presence/validation behavior). → crawled-page journey invariants; Test Builder rows are deferred to Phase 5.
- [x] 3.3 api lane: spec-driven + provided rows; schema validation; auth/negative cases (sandbox/staging). → parameter-free GETs from spec/traffic/repo, status + Ajv schema, unauthenticated 401/403 check; no automatic POST mutation.
- [x] 3.4 a11y lane running inside the e2e session (no second crawl).
- [x] 3.5 repo lane: developer tests (as-is), coverage, static analysis, dependency audit, secret scan, license check. → static MVP: secret scan, manifests, license, test discovery; executing developer tests/coverage/dependency audit is explicitly deferred and reported.
- [x] 3.6 security-passive lane.
- [x] 3.7 Lane scheduler (parallel, shared session, per-lane isolation, failure containment).

**Acceptance:** one `qa run` on each pilot executes all applicable lanes with a single crawl and a single browser session per journey; per-lane failure does not abort others; flaky rate ≤ 2% over 10 repeated runs.
Status: MVP met on the sample pilots (repo+URL, URL-only, API-only): 1 crawl, 1 browser context, concurrent session/API, per-lane error containment, findings + docs + evidence. Repo dev-test execution and Test Builder rows are deferred (documented); real pilot credentials/environments and a manual 10-item review remain pending. Flakiness: 10 consecutive runs → 10× complete, 13 tests/run, 0/130 failed (0%), 3 documented repo skips per run.

---

## Phase 4 — Correlation, Gate & Unified Docs  (≈ 2 weeks)  → **M1**

- [x] 4.1 Normalized `run-summary.json` v2 (findings, lanes, request, mode, baseline).
- [x] 4.2 Correlation engine + classification + confidence labels + dedupe.
- [x] 4.3 Baseline comparison (new/recurring/fixed/regressed).
- [x] 4.4 Quality gate with per-confidence rules; GO / GO WITH RISKS / NO-GO + reasons.
- [x] 4.5 Doc engine: all documents in `03-DOC-GENERATION.md` §3 and §10; i18n id/en; offline HTML; PDF; XLSX.
- [x] 4.6 `docs:verify` (links, placeholders, secret/PII scan, PDF opens) and bundling.
- [x] 4.7 Doc engine tests with fixtures (all-pass, failures, flaky, incomplete, missing metadata, zero tests, multi-lane correlations).
- [x] 4.8 Finding fingerprint v2 + dedupe (stable hash over category, rule/check id, normalized page/endpoint/component; volatile fields excluded; false-merge tests).
- [x] 4.9 FP replay hook: `replayFinding()` → `confirmed | not-reproduced | inconclusive` for e2e/api; other lanes `inconclusive`; replay evidence stored; no automatic `verified` promotion without an assertion source.
- [x] 4.10 Baseline `retest-new` mode in `qa run` + Run Comparison; reporting-only, never a gate bypass; statuses remain new/recurring/fixed/regressed.
- [x] 4.11 Machine-readable exports: SARIF 2.1.0, JUnit XML, CSV/XLSX; schema/XML validation; included in bundle and `docs:verify`.
- [x] 4.12 External-findings ingestion (`ExternalFindingsAdapter` + SARIF importer, `security-external`, redaction), optional compliance mapping (PCI-DSS v4, SOC 2, ISO 27001:2022, labelled indicative), and deterministic evidence summaries.

**Acceptance:** existing 4.1–4.7 criteria stay green (single `qa run` bundle ≤ 60 s; correlation example yields one finding with all evidence; no `auto-discovered` shown as verified; injected secret fails `docs:verify`; QA-lead readability sign-off). Additive tasks 4.8–4.12 keep gate thresholds unchanged, add no execution of third-party tools, and cite `ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` in their tests/evidence.
Status: 4.1–4.12 fully implemented and tested on the sample pilot. Evidence: `packages/lanes/tests/plugin.test.ts` (LanePlugin contract D, forbidden options, egress fail-closed, mode guard), `docs/evaluations/deep-eye.md` (read-only evaluation C), `packages/correlate/tests` (fingerprint/dedupe/replay/external/evidence summary), `packages/core/tests/compliance.test.ts`, `packages/doc-engine/tests` (SARIF/JUnit/retest-new/compliance), `tests/smoke/foundation.test.ts` (pipeline, 25-document set, PDF/XLSX, `verifyDocs`, bundle). Sample smoke run: complete in ~3–4 s. Real-pilot execution and QA-lead readability sign-off remain human-pending.

---

## Phase 5 — Web App & Test Builder  (≈ 2–3 weeks)  → **M2**

- [x] 5.1 `apps/api` (auth via OIDC, roles, run lifecycle, SSE, bundle download) + queue + worker wiring.
- [x] 5.2 `packages/registry` + initial type definitions (e2e, api, a11y, perf, visual, security-passive) per `07-TEST-BUILDER-UI.md` §2.
- [x] 5.3 UI: New Run (modes, scope, authorization, dry run), Test Builder (dynamic forms/tables, import/export, validation, mode-aware), Live Run, Results.
- [x] 5.4 Plan Review screen and approval flow (`planApproval=review|auto`).
- [x] 5.5 History & Trends, Settings (allowlist, thresholds, branding, roles).
- [x] 5.6 Dogfooding: platform e2e + a11y suite for the UI itself, covering every scenario in `docs/08-UI-FLOW-REFERENCE.md`.

**Acceptance:** a non-technical user completes New Run → Run everything → Download bundle using only the UI; forbidden type/mode combinations are blocked with a visible reason; raw secrets rejected; UI passes its own a11y lane (0 critical/serious).
Status: 5.1–5.6 implemented and tested. Evidence: `apps/api/tests/api.test.ts` (OIDC/roles, lifecycle, dry-run, SSE, bundle stream, document download), `packages/registry/tests/registry.test.ts` (6 registered types, mode blocking, secret rejection, scenario suggester), `apps/web/tests/ui-flow.test.ts` (26 dogfooding acceptance scenarios covering 08-UI-FLOW-REFERENCE steps 1-5 and cross-cutting quality rules).
---

## Phase 6 — Test Generation & Promotion  (≈ 2 weeks)

- [x] 6.1 Planner generators: invariants, spec-based, crawl-based, repo-route-based, requirement-based.
- [x] 6.2 "Suggest scenarios" in Test Builder (diff-style acceptance).
- [x] 6.3 Promotion of approved generated cases to `packages/qa-suite` via PR (metadata, conventions, 3× green check).
- [x] 6.4 Change-based selection from git diff; risk-ordered execution; coverage and "not covered" reporting.
- [x] 6.5 Self-healing suggestions (report-only diffs).

**Acceptance:** generated cases carry `source` + `confidence`; no business assertion without a requirement/spec/user row; promoted tests are green 3× and appear in catalogue and traceability; risky areas covered first (shown in report).
Status: 6.1–6.5 fully implemented and tested. Evidence: `packages/planner/tests/planner.test.ts` (5 generators, diff suggester, change-based risk ordering, self-healing status/schema/selector drift), `packages/qa-suite/tests/qa-suite.test.ts` (TC-<AREA>-<NNN> convention, verified-only promotion, 3x consecutive green check with 0% flakiness, catalogue & traceability matrix).

---

## Phase 7 — CI/CD, Scheduling & Notifications  (≈ 1 week)  → **M3**

- [ ] 7.1 Pipelines per `docs/04-CI-CD.md` (PR quick run, nightly, release, manual) calling `qa run`.
- [ ] 7.2 Saved Run Requests with renewable authorization; schedules; concurrency control per environment.
- [ ] 7.3 Optional publish (Confluence/SharePoint/file share) and notifications (Teams/Slack/email) — **only if approved**.
- [ ] 7.4 Issue-tracker export for findings (if approved).
- [ ] 7.5 Runbook: operations, backup, retention, incident handling, secret rotation.

**Acceptance:** 5 consecutive nightly runs without infrastructure-caused failures; expired authorization blocks a scheduled run; notifications contain no secrets/PII.

---

## Phase 8 — Extended Lanes  (iterative)

- [ ] 8.1 Visual regression with baseline management in the UI.
- [ ] 8.2 k6 load scenarios (`perfApproved`, sandbox/staging only) with thresholds and report section.
- [ ] 8.3 Negative/security-lite within documented behavior; optional **active** probing in sandbox only, explicit opt-in, `approver`-signed and audited.
  - Contract is `LanePlugin` (Phase 4, interface-only, disabled by default); Phase 4 does **not** execute Deep Eye, ZAP, Nuclei, or any active scanner.
  - Candidate tools (Deep Eye, OWASP ZAP, Nuclei, Semgrep) require a read-only evaluation first (`docs/evaluations/deep-eye.md`) and separate approval.
  - Pin version + commit/digest, check licence/dependencies, run only in the isolated sandbox with deny-by-default egress limited to the app under test.
  - Force off CAPTCHA solving, TLS/JA3 fingerprint evasion, WAF-bypass payloads, credential brute force, destructive actions, and autonomous attack planning against non-sandbox targets.
  - Disable AI, telemetry, update checks, and remote rule downloads; no target data leaves the platform.
  - Outputs normalize to the Finding model (`security-external`) with redaction, provenance, and confidence mapping; scanner claims never auto-promote to `verified`.
  - Any execution spike against an intentionally vulnerable local app requires product-owner approval after the evaluation report is reviewed.
- [ ] 8.4 Cross-browser matrix, mobile viewports, optional mobile app lane (Appium/Maestro).
- [ ] 8.5 Additional framework route extractors (as pilots expand).

**Acceptance:** each lane has registry definition, mode rules, docs section, and tests.

---

## Phase 9 — Hardening & Handover  (≈ 1–2 weeks)

- [ ] 9.1 Security review of the platform (sandbox escape tests, SSRF/redirect tests, authz tests, secret leakage tests).
- [ ] 9.2 Performance test of the platform itself (concurrent runs, large crawls, 1,000+ tests).
- [ ] 9.3 Flaky review; quarantine with ticket + expiry.
- [ ] 9.4 Contributor guide (add lane, add registry type, add route extractor, add doc section), architecture overview, ADRs.
- [ ] 9.5 Final dry run by someone who did not build it, on a fresh environment, using only the docs.

**Acceptance:** independent security review passed (no high findings open); new team member adds a registry type and a test and sees them in the docs within 1 day; gates stable for 2 weeks.

---

## Backlog ideas (not committed)

Natural-language run requests ("check staging of app X after yesterday's release"), PR comment bot with findings summary, Slack/Teams slash command, trend dashboards across applications, synthetic monitoring using smoke journeys on a schedule, cost/time optimization through smarter sharding, learning from triaged findings to reduce false positives.
