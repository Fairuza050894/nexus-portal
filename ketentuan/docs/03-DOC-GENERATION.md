# 03 — One-Click Documentation Generation

## 1. Principle

Documentation is a **build artifact**, not a manual task. It is generated from three sources only:

1. **Run results** (`artifacts/results/` → normalized to `run-summary.json`)
2. **Test metadata** (`testMeta()` + `test.step()` names)
3. **Requirements** (`requirements/requirements.yaml`) and **history** (`artifacts/history/history.json`)

No document may contain facts that are not derived from these sources (no invented results).

## 2. Trigger

- `npm run qa` → runs tests, then docs, then bundle.
- `npm run docs` → docs only, from the latest results.
- CI "manual run" button → same as `npm run qa` with inputs (env, suite, browser).
- Docs **always** generate, even if tests failed or the run was aborted midway (mark the report `INCOMPLETE` in that case).

## 3. Output set

All outputs go to `artifacts/docs/<run-id>/` and are mirrored to `artifacts/docs/latest/`. The bundle `artifacts/bundle/qa-<run-id>.zip` contains everything.

| # | Document | Formats | Audience | Content |
|---|---|---|---|---|
| 1 | **Executive Summary** (1 page) | HTML, PDF, MD | Managers, PO | Go/No-Go, gate results, pass rate, top risks, trend sparkline, env + build version |
| 2 | **Test Execution Report** | HTML (self-contained), PDF | QA, Dev | Totals, per-suite and per-feature results, failures with evidence, flaky list, durations, environment details |
| 3 | **Test Case Catalogue** | HTML, MD, CSV/XLSX | QA, Audit | Every test: ID, title, feature, severity, requirements, preconditions, steps (from `test.step`), expected result, last status |
| 4 | **Traceability Matrix** | HTML, CSV/XLSX | QA, Audit, BA | Requirement ↔ test cases ↔ last status; uncovered requirements highlighted |
| 5 | **Failure Analysis** | HTML, MD | Dev, QA | Failures grouped by root-cause category, evidence links, reproduction steps, suspected owner |
| 6 | **Defect Drafts** | MD (one per failure, Jira-ready) | QA | Title, steps, expected vs actual, evidence, env, severity |
| 7 | **Trend & Stability Report** | HTML | QA lead | Pass-rate trend, duration trend, flaky leaderboard, quarantine list |
| 8 | **Coverage Report** | HTML | QA lead | Requirement coverage, feature coverage, test-type distribution, gaps |
| 9 | **Run Manifest** | JSON | Machines | `run-summary.json`, run id, git SHA, build version, env, tool versions, gate results |
| 10 | **Raw evidence** | traces, screenshots, videos, JUnit, Allure | Dev | Linked from reports with relative paths |

Optional (config flag): Allure report, Confluence/SharePoint publish, Teams/Slack notification.

## 4. Normalized data model (`run-summary.json`)

```jsonc
{
  "schemaVersion": "1.0",
  "run": { "id": "2026-10-26T04-18-00Z_ab12cd", "startedAt": "", "finishedAt": "", "durationMs": 0,
           "trigger": "manual|pr|nightly|release", "status": "complete|incomplete" },
  "environment": { "name": "staging", "baseUrl": "", "apiUrl": "", "buildVersion": "", "gitSha": "", "gitBranch": "",
                   "browsers": ["chromium"], "os": "", "nodeVersion": "", "toolVersions": {} },
  "totals": { "total": 0, "passed": 0, "failed": 0, "flaky": 0, "skipped": 0, "quarantined": 0, "knownDefects": 0 },
  "tests": [{
    "id": "TC-AUTH-001", "title": "", "feature": "", "type": "e2e", "severity": "critical",
    "requirements": ["REQ-AUTH-01"], "owner": "", "tags": [], "preconditions": [],
    "steps": [{ "title": "", "status": "passed", "durationMs": 0 }],
    "status": "passed|failed|flaky|skipped|quarantined|known-defect",
    "durationMs": 0, "retries": 0, "browser": "chromium", "file": "tests/...", "line": 0,
    "error": { "message": "", "stack": "", "category": "app-bug|test-bug|environment|data|flaky|unknown" },
    "evidence": { "trace": "", "screenshots": [], "video": "", "networkLog": "" }
  }],
  "a11y": [{ "page": "", "violations": [{ "id": "", "impact": "", "nodes": 0, "helpUrl": "" }] }],
  "perf": [{ "name": "", "p95Ms": 0, "errorRate": 0, "thresholds": {} }],
  "gates": { "decision": "GO|GO_WITH_RISKS|NO_GO", "results": [{ "name": "", "threshold": "", "actual": "", "pass": true }] },
  "coverage": { "requirementsTotal": 0, "requirementsCovered": 0, "uncovered": [] }
}
```

Validate with a Zod/JSON schema on write and on read. Schema changes bump `schemaVersion` and are covered by tests.

## 5. Pipeline stages

```
collect → normalize → enrich → analyze → gate → render → bundle → (publish) → (notify)
```

1. **collect**: read Playwright JSON, JUnit, k6 summary, axe results, Git info, env info.
2. **normalize**: map to `run-summary.json`; fail loudly on missing mandatory metadata (list offending tests in the report instead of crashing).
3. **enrich**: join requirements; compute coverage; load history; compute trends.
4. **analyze**: classify failures with deterministic heuristics (see §6).
5. **gate**: evaluate thresholds, produce decision + reasons.
6. **render**: Nunjucks templates → MD/HTML → PDF (Playwright `page.pdf()`); CSV/XLSX for tabular docs.
7. **bundle**: zip + checksum file.
8. **publish / notify**: only if enabled and approved in `docs/DECISIONS.md`.

## 6. Failure classification heuristics (deterministic, no AI by default)

| Category | Signals |
|---|---|
| `environment` | Timeouts to base URL, 502/503/504, DNS/TLS errors, health check failed, many unrelated tests failing together |
| `data` | 409/duplicate, "not found" for seeded records, uniqueness errors |
| `flaky` | Passed on retry, or failing intermittently in history |
| `test-bug` | Locator not found with unchanged app version, strict-mode violation, TypeError in test code |
| `app-bug` | Assertion mismatch on stable locator/data, 5xx from business endpoint, schema violation, a11y regression |
| `unknown` | Everything else — never guess; list as unknown |

Show the **evidence** behind each classification. Allow manual override via `requirements/failure-overrides.yaml`.

**AI-assisted summaries** are optional, **off by default** (`docs.ai.enabled=false`), and only allowed if the company-approved AI endpoint is recorded in `docs/DECISIONS.md`. Test artifacts may contain sensitive data; see `rules/security-and-data.md`.

## 7. Configuration (in `qa.config.ts`)

```ts
docs: {
  language: 'id',                 // 'id' | 'en'
  company: { name: '', logo: './docs-engine/templates/assets/logo.png' },
  formats: ['html', 'pdf', 'md', 'xlsx'],
  historyRuns: 30,
  includeVideos: false,           // size control
  redaction: { enabled: true, patterns: [/* tokens, emails, ids */] },
  publish: { confluence: false, sharepoint: false, artifactPath: null },
  notify: { teams: false, slack: false, email: false },
  ai: { enabled: false }
}
```

## 8. Document quality rules

- Executive Summary fits **one A4 page**; leads with the decision and reasons.
- Every failure entry has: test ID, title, step that failed, error message (trimmed), evidence link, category + reason.
- Every table is sortable/filterable in HTML (vanilla JS, no CDN — must work offline).
- HTML reports are **self-contained** (inline CSS/JS; images by relative path or base64 for small ones).
- Accessible output: semantic HTML, sufficient contrast, print stylesheet for PDF.
- Timestamps in ISO 8601 with timezone (default `Asia/Jakarta`, configurable).
- i18n through `docs-engine/i18n/*.json`; no hard-coded strings in templates.
- Deterministic ordering (by feature, then ID).

## 9. Testing the doc engine itself

- Unit tests with fixture results (`docs-engine/__fixtures__/`): all-pass, with failures, with flaky, incomplete run, missing metadata, zero tests.
- Snapshot tests on rendered HTML structure (not on timestamps).
- A `docs:verify` step checks: all links resolve, all required files exist, PDF opens, no template placeholders left (`{{`), no secrets matched by redaction patterns.

## 10. Unified additions (see `06-UNIFIED-PIPELINE.md`)

The doc engine consumes **Findings** (not only test results) and adds these documents to the output set (items 11–15):

| # | Document | Formats | Content |
|---|---|---|---|
| 11 | **Findings Register** | HTML, XLSX, MD | All findings with severity, **confidence label**, category, lanes, affected pages/endpoints, evidence, reproduction, code refs, suggested owner, status vs baseline |
| 12 | **Application Map** | HTML (interactive, offline), JSON | Pages, endpoints, relations, risk scores, coverage overlay (what was tested / not tested) |
| 13 | **Run Comparison** | HTML | New / fixed / regressed findings, pass-rate and vitals deltas, newly discovered pages/endpoints |
| 14 | **Plan & Approval Record** | HTML, PDF | Generated plan, who approved/rejected what and when, sources of each case |
| 15 | **Not Covered & Skipped** | section in Execution Report + Executive Summary | Everything skipped or reduced and why (mode, budget, missing input, failure) |

Rules:
- Executive Summary shows the gate decision, counts **by confidence label**, top correlated findings, and the "not covered" headline.
- Never mix confidence labels: `verified` and `auto-discovered` are separate sections/columns; `needs-review` is visually distinct.
- Repo-lane results (developer test results, coverage, static findings, dependency/license audit, secret scan) appear in the Execution Report as their own section and feed Findings.
- Every finding page links to its raw evidence and to the affected nodes in the Application Map.
- `run-summary.json` gains: `request` (sanitized Run Request), `mode`, `scope`, `authorization` (who approved), `lanes[]` (status, duration, skipped reasons), `findings[]`, `appMap` reference, `baseline` reference.
