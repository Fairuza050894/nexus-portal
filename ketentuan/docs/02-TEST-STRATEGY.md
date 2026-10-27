# 02 — Test Strategy

## 1. Test types

| Type | Scope | Tag | Runs on | Target share |
|---|---|---|---|---|
| Smoke | Critical paths, "is the build alive" | `@smoke` | every PR, every deploy | ~5–10% |
| API | Endpoints, contracts, auth, errors, boundaries | `@api` | every PR | ~40% |
| E2E (UI) | Key user journeys only | `@e2e` | PR (critical), nightly (all) | ~30% |
| Regression | Broader coverage of existing behavior | `@regression` | nightly, release | — |
| Accessibility | WCAG 2.1 AA checks on key pages | `@a11y` | nightly | per key page |
| Visual (opt.) | Layout drift on stable pages | `@visual` | nightly | few |
| Performance (opt.) | Baseline latency/throughput | `@perf` | scheduled, **with approval** | few |
| Negative / security-lite | Auth bypass, input validation basics | `@negative` | nightly | within API/E2E |

Prefer the lowest layer that can prove the behavior (API before UI).

## 2. What to automate / not automate

**Automate:** repeatable, high-value, stable flows; regression of fixed bugs; data-driven validation; cross-browser basics.
**Do not automate (yet):** one-off exploratory checks, rapidly changing UI, third-party captcha/MFA flows (use official test bypass), visual judgments needing humans.

Selection score per candidate (1–5 each): business risk, frequency of use, stability of feature, manual effort saved, technical feasibility. Automate when `risk + frequency ≥ 7` and feasibility ≥ 3.

## 3. Priority & severity

| Level | Meaning | Gate rule |
|---|---|---|
| `critical` (P0) | Business cannot operate, money/data loss | 100% must pass |
| `high` (P1) | Major feature broken | ≥ 98% pass |
| `medium` (P2) | Feature degraded, workaround exists | ≥ 95% pass |
| `low` (P3) | Cosmetic / minor | tracked, non-blocking |

## 4. Test design techniques

Equivalence partitioning, boundary values, decision tables, state transitions, pairwise for combinations, error-guessing for known weak spots. Each test case records its technique in metadata when non-trivial.

## 5. Test case metadata (mandatory)

```ts
test('Login succeeds with valid credentials', async ({ page }) => {
  testMeta({
    id: 'TC-AUTH-001',               // unique, format TC-<AREA>-<NNN>
    requirements: ['REQ-AUTH-01'],   // from requirements.yaml
    severity: 'critical',
    feature: 'Authentication',
    owner: 'qa-team',
    type: 'e2e',
    preconditions: ['Active user exists'],
    tags: ['smoke'],
  });
  await test.step('Open login page', async () => { /* ... */ });
  await test.step('Submit valid credentials', async () => { /* ... */ });
  await test.step('Verify dashboard is shown', async () => { /* ... */ }); // expected result
});
```

Rules: `test.step` names are the **documented steps**; write them as human-readable actions; the last step(s) state the expected result. The doc engine extracts them as-is, so a test with no steps produces poor documentation and fails review.

## 6. Test data strategy

- Synthetic only. Unique per test (`{prefix}-{runId}-{worker}-{counter}`).
- Create via API in fixtures; delete in teardown (even on failure).
- Shared reference data (read-only) lives in `src/data/static/`.
- Never depend on pre-existing mutable records.

## 7. Environments

| Env | Purpose | Automated tests allowed |
|---|---|---|
| local/dev | Development of tests | yes |
| qa/staging | Main execution target | yes |
| uat | Business validation | smoke / read-only only, unless approved |
| production | — | **never** (guard blocks it) |

## 8. Flaky test policy

1. A test that fails then passes on retry is marked **flaky** in reports and recorded in `history.json`.
2. Flaky rate target ≤ 2%. A test flaky in ≥ 3 of the last 10 runs is auto-listed under "Quarantine candidates".
3. Quarantine = tag `@quarantine` + ticket + expiry (max 14 days). Quarantined tests still run but do not block gates; they are listed in every report.
4. Fix the root cause (wait condition, data collision, locator, env). Never make "add a longer timeout" the first move.

## 9. Quality gates (defaults, configurable in `qa.config.ts`)

| Gate | Default threshold |
|---|---|
| Critical tests pass rate | 100% |
| Overall pass rate (excluding quarantined) | ≥ 95% |
| Flaky rate | ≤ 2% |
| A11y violations (critical/serious) on key pages | 0 |
| Requirement coverage (requirements with ≥ 1 automated test) | ≥ 80% (raise over time) |
| API schema violations | 0 |
| New unreviewed `skip` / `fixme` | 0 |

Result: **GO**, **GO WITH RISKS**, or **NO-GO**, each with a list of reasons.

## 10. Metrics shown in the report

Pass/fail/flaky/skipped counts, duration (total + slowest 10), pass-rate trend (last 30 runs), requirement coverage, defects found by automation, flaky leaderboard, suite stability index.

## 11. Entry / exit criteria

- **Entry:** build deployed to target env, health check OK, test accounts valid, config validated.
- **Exit:** all planned suites executed, gates evaluated, docs bundle generated and archived.

## 12. Addendum v2 — Test sources and confidence

Tests now come from five sources; every test case records its `source` and `confidence`:

| Source | Example | Default confidence |
|---|---|---|
| `user` (Test Builder rows / hand-written) | "Login with valid credentials → dashboard shown" | `verified` once asserted |
| `requirement` | Derived from requirement acceptance criteria | `verified` after human approval |
| `spec` | OpenAPI schema/status/auth rules | `verified` for schema/status, `needs-review` for inferred semantics |
| `crawl` / `repo-route` | Generated navigation, form, and endpoint checks | `auto-discovered` / `needs-review` |
| `invariant` | No uncaught JS errors, no 5xx, links resolve, no critical a11y violations | `auto-discovered` |

Quality gates (section 9) apply per confidence tier as defined in `06-UNIFIED-PIPELINE.md` §5. Mode restrictions from `05-…` override any test selection: a test not allowed in the current mode is skipped and reported, never silently run.
