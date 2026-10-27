# 06 — Unified Pipeline ("test once, observe everything")

## 1. Why unified

Separate tools (one for E2E, one for API, one for a11y, one for perf...) each crawl, log in, and report on their own. The result is slow runs, duplicated effort, and reports that can't be connected. The platform instead runs **one pipeline with shared knowledge**:

- one **Application Map** feeds every lane,
- one **instrumented browser session** collects functional, accessibility, performance, console, network, and security signals at the same time,
- one **Correlation Engine** merges signals from all lanes into **Findings**,
- one **Gate** and one **document set** summarize everything.

## 2. Stages

```
INTAKE → PREFLIGHT → DISCOVER → MODEL → PLAN → [approval] → EXECUTE (parallel lanes)
       → CORRELATE → ANALYZE → GATE → DOCUMENT → BUNDLE → (PUBLISH/NOTIFY)
```

| Stage | What happens | Output |
|---|---|---|
| **Intake** | Validate Run Request (`05-…`) | `run-request.json`, audit record |
| **Preflight** | Safety, authorization, reachability, credentials | go / reject |
| **Discover** | Clone/analyze repo; crawl site; import OpenAPI; record network calls during crawl; extract routes/endpoints/forms from code | raw discovery data |
| **Model** | Build the **Application Map**: pages, forms, components, endpoints, roles, auth flows, data entities, dependencies between pages and endpoints; compute a **risk score** per node (change recency from git, complexity, past failures from history, business criticality from requirements, exposure) | `app-map.json` |
| **Plan** | Compose the **Test Plan**: choose lanes, generate candidate cases, attach priority and expected duration, drop what the mode forbids | `test-plan.json` (+ human-readable view) |
| **Approval** | `planApproval=review`: human approves/edits/rejects cases in the UI. `auto`: only objective-invariant cases run | `approved-plan.json` |
| **Execute** | Lanes run in parallel under budget, rate limits and circuit breakers (section 4) | raw results + evidence |
| **Correlate** | Merge signals into Findings (section 5) | `findings.json` |
| **Analyze** | Classify, dedupe, compare with baseline, suggest owner and fix direction | enriched findings |
| **Gate** | Quality gates → GO / GO WITH RISKS / NO-GO | `gates` in run summary |
| **Document** | Doc engine (`03-…`) renders the document set | `artifacts/docs/<run-id>/` |
| **Bundle** | Zip + checksums; optional publish/notify | `qa-<run-id>.zip` |

Stages are idempotent and resumable: each writes its output file; a crashed run can resume from the last completed stage. Docs are generated even if a stage failed (`INCOMPLETE`).

## 3. Application Map (shared knowledge)

```jsonc
{
  "nodes": [
    { "type": "page", "id": "page:/checkout", "title": "", "forms": 2, "authRequired": true, "risk": 0.82,
      "riskFactors": ["changed-in-last-10-commits", "handles-payment", "past-failures:3"] },
    { "type": "endpoint", "id": "api:POST /orders", "spec": true, "authRequired": true, "risk": 0.9 },
    { "type": "code", "id": "src/orders/service.ts", "changedRecently": true }
  ],
  "edges": [ { "from": "page:/checkout", "to": "api:POST /orders", "kind": "calls" },
             { "from": "api:POST /orders", "to": "src/orders/service.ts", "kind": "implemented-by" } ]
}
```

Page→endpoint edges come from recorded network traffic; endpoint→code edges come from route extraction (framework-specific parsers; best effort, labeled `inferred` when uncertain). The map powers risk-based ordering, change-based selection, and correlation.

## 4. Lanes (run in parallel, share the session and map)

| Lane | Purpose | Needs | Modes |
|---|---|---|---|
| **repo** | Developer tests (as-is), coverage, lint, static security analysis (e.g. Semgrep), dependency audit, secret scan, license check, test discovery | repo | all (runs in sandbox) |
| **api** | Spec-driven + provided cases: status, schema, auth, validation, idempotency, pagination, boundaries; contract drift | spec or discovered traffic | all (read-only in `prod-safe`) |
| **e2e** | Instrumented journeys: provided rows, generated critical flows, forms (validation behavior), navigation, role access | web URL | all |
| **a11y** | axe scan **inside every visited page state** of the e2e lane (no separate crawl) | e2e session | all |
| **vitals/perf** | Web Vitals, resource sizes, slow requests collected during e2e; optional k6 load scenarios | e2e session; k6 needs approval | vitals: all; load: sandbox/approved staging |
| **visual** | Screenshot baselines per viewport on stable pages | e2e session | all |
| **security-passive** | Headers, TLS, cookie flags, CORS, mixed content, exposed files/info in errors, exposed secrets in JS | web URL | all (passive only) |
| **negative** | Invalid inputs, auth bypass attempts **within documented behavior** (e.g. 401 without token) | api/e2e | sandbox/staging only |

### Instrumented journeys (the key efficiency feature)

Every E2E journey runs with probes attached, so a single pass produces:
- step results (for documentation),
- console errors/warnings, uncaught exceptions,
- failed/slow network requests (status ≥ 400, timeouts, slow p95), with request/response metadata (bodies redacted),
- axe violations per page state,
- Web Vitals (LCP, CLS, INP, TTFB) and resource weight,
- screenshots at each step (and on failure),
- security header/cookie observations,
- HTML validity hints (optional).

Probes are passive observers and must never change page behavior.

### Lane scheduling

- Lanes start as soon as their inputs exist (e.g. API lane starts after spec import while the crawler is still running).
- Shared state is read-only except per-lane data created with the `qa_auto_<runId>_` prefix.
- A global **budget manager** allocates time per lane by risk; low-risk areas are sampled, high-risk areas covered fully.
- Per-lane failure never aborts other lanes.

## 5. Correlation Engine

Goal: turn many raw signals into few, actionable **Findings**.

Correlation keys: URL/page node, endpoint node, request ID/trace ID (if available), timestamp window, code file (via map edges), test ID.

Examples:
- E2E step fails + same page shows API `POST /orders → 500` + that endpoint's code file changed in the latest commit → **one Finding**: "Checkout fails: POST /orders returns 500 (suspect `src/orders/service.ts`, changed in `abc123`)", with all evidence attached.
- 40 pages each with the same missing `alt` in a shared component → **one Finding** with 40 affected pages.
- Repeated console error across journeys → one Finding with occurrence count.
- A failure appearing only in one browser → Finding tagged `browser-specific`.

### Unified Finding model

```jsonc
{
  "id": "F-0042",
  "title": "",
  "severity": "critical|high|medium|low|info",
  "confidence": "verified|auto-discovered|needs-review",
  "category": "app-bug|test-bug|environment|data|flaky|security|accessibility|performance|quality-debt",
  "lanes": ["e2e", "api"],
  "affected": [{ "page": "/checkout", "endpoint": "POST /orders", "component": "" }],
  "occurrences": 3,
  "evidence": [{ "type": "trace|screenshot|har-lite|log|axe|diff", "path": "" }],
  "reproduction": ["step 1", "step 2"],
  "expected": "", "actual": "",
  "codeRefs": [{ "file": "", "line": 0, "lastChangedBy": "", "commit": "" }],
  "requirements": ["REQ-CHK-02"],
  "status": "new|recurring|fixed|regressed|known-defect|accepted-risk",
  "firstSeenRun": "", "lastSeenRun": "",
  "fingerprint": "v2:<sha256>",
  "replay": { "result": "confirmed|not-reproduced|inconclusive", "runId": "", "evidence": [] },
  "provenance": { "tool": "", "version": "", "ruleId": "", "rawSeverity": "" },
  "suggestedOwner": "from CODEOWNERS / git history",
  "suggestedFix": "direction only, never auto-applied"
}
```

### Confidence labels (honesty rules)

| Label | Meaning | Examples |
|---|---|---|
| `verified` | Asserted against a requirement, spec, approved test, or user-provided row | Expected status 422 but got 200; row says "Dashboard tampil" but not shown |
| `auto-discovered` | Objectively detectable anomaly without knowing business intent | 5xx response, console exception, broken link, a11y violation, missing security header, schema mismatch vs spec |
| `needs-review` | Heuristic or inferred; may be a false positive | "Form accepted empty required-looking field", layout diff, suspicious copy, inferred code mapping |

Reports must never present `auto-discovered` or `needs-review` items as confirmed defects, and the gate counts them differently (configurable; default: only `verified` and high-severity `auto-discovered` can produce NO-GO).

### 5.1 Fingerprint and dedupe

Finding identity is a **fingerprint v2**:

```
sha256(category | rule-or-check-id | normalized-target | component)
```

Normalization removes volatile data before hashing:

- lowercase and trim; keep the target path, drop the Run Request host when it matches
  the configured target;
- drop query strings, fragments, and volatile parameters;
- replace numeric path/query IDs with `:id`, UUIDs with `:uuid`, and tokens with
  `:token`;
- exclude timestamps, run IDs, request IDs, ephemeral ports, scanner instance IDs,
  and retry counts;
- repository findings use repo-relative file + normalized rule ID.

Rules:

- Same rule on different endpoints/pages must **not** merge.
- Different rule IDs on the same target must **not** merge.
- Repeated occurrences of the same fingerprint collapse into one finding with
  `occurrences` and a deduplicated `affected[]`.
- False-merge tests are mandatory.
- Historical summaries using the pre-v2 fingerprint are matched with a legacy
  fallback for one schema transition; statuses are not silently rewritten.

### 5.2 False-positive replay

`replayFinding(finding)` returns:

| Result | Meaning |
|---|---|
| `confirmed` | Stored reproduction steps executed and the same expected-vs-actual mismatch was observed. |
| `not-reproduced` | Steps executed and the mismatch did not occur. The finding is not deleted; it is flagged for human triage. |
| `inconclusive` | The lane has no executable replay (e.g. repo/static/security-external), inputs are missing, or the environment cannot reproduce safely. |

- Phase 4 implements replay for e2e and api findings; other lanes return `inconclusive`.
- The replay result and its evidence are recorded on the finding.
- `confirmed` replay is evidence, not business intent. It does **not** by itself
  promote an `auto-discovered` finding to `verified`; `verified` still requires a
  requirement, spec, approved test row, or human-approved assertion.
- A scanner/tool claim is never treated as replay or verification.

### 5.3 External findings

Findings from approved external tools enter the same model with lane
`security-external` and provenance (`tool`, `version`, `ruleId`, raw severity).
Severity/confidence mapping, SARIF import, forbidden options, and sandbox rules are
defined in `09-EXTERNAL-TOOLS-INTEGRATION.md`. External findings are deduped with the
same fingerprint v2 and are never presented as `verified` without an assertion
source plus replay/human confirmation.

## 6. Test generation rules

1. **Universal invariants** may be auto-generated and run without approval (in `auto` mode): page loads (2xx/3xx), no uncaught JS errors, no failed first-party requests (≥ 500), links resolve, images load, no critical axe violations, security headers present, API responses conform to the spec schema, auth endpoints reject missing/invalid tokens as documented.
2. **Business-level assertions** (calculations, workflows, permissions, copy) are generated **only** from requirements, specs with examples, or user rows — and are marked `needs-review` until a human approves them in Plan Review.
3. Generated tests are plain Playwright/API test files using the same metadata and conventions as hand-written ones (`coding-standards.md`), stored in `generated/` until approved, then **promoted** to `tests/` (permanent regression suite) via PR.
4. Never invent expected values. If expected behavior is unknown, assert only invariants and record the gap in the coverage report ("behavior not specified").
5. Every generated case lists its source (`spec | crawl | repo-route | requirement | invariant`) in metadata.

## 7. Change-based and risk-based selection

- If `repo.ref` and a baseline ref are known: compute changed files → map to endpoints/pages through the Application Map → raise their priority and always include their tests.
- Risk score = weighted sum (defaults editable): change recency 0.25, business criticality 0.25, past failure rate 0.2, complexity 0.1, exposure (public/auth/payment) 0.1, lack of existing coverage 0.1.
- Reports show "covered by risk tier" so stakeholders see that the riskiest 20% got the most attention.

## 8. Baseline & comparison

- Each run can be compared to a baseline (previous successful run, or a chosen run).
- Findings get status `new | recurring | fixed | regressed`.
- Report section "What changed since baseline": new/fixed/regressed findings, pass-rate delta, performance deltas (vitals p75), new a11y violations, new endpoints/pages discovered.
- **`retest-new`** keeps/report only findings that are new or regressed relative to
  the selected baseline. It is a reporting/selection mode, not a gate bypass:
  - recurring verified findings remain in an appendix and still count in the gate;
  - fixed findings are counted but not deleted from history;
  - the run summary records `baselineRunId`, mode `retest-new`, and the filtered
    counts so the report cannot hide the rest.
- Fingerprint v2 (see §5.1) determines identity; legacy fallback applies for old
  summaries.
- `retest-new` never changes quality-gate thresholds.

## 9. Learning loop

`history.json` feeds the planner: flaky tests get retries/isolation or quarantine; areas with frequent failures get deeper coverage; stable low-risk areas get sampled. Never silently drop coverage: every reduction is listed in "Not covered / reduced coverage".

## 10. Self-healing (report-only)

When a locator fails but a clear candidate exists (same role/name, moved element), the platform **suggests** a patch as a diff in the report and (optionally) opens a PR. It never auto-applies a fix, and never lets a "healed" test count as `verified`.

## 11. Non-negotiables for the pipeline

- No lane may bypass mode restrictions or the circuit breaker.
- All evidence passes through redaction before storage.
- Every skipped or reduced item is recorded with the reason (mode, budget, missing input, failure).
- Deterministic where possible: seeds and ordering recorded in the run manifest so a run can be replayed (`qa replay <run-id>`).
- External/plugin lanes are disabled by default, sandbox-only, opt-in, approver-signed, audited, pinned, egress-restricted, and fail closed. Forbidden evasion/CAPTCHA/TLS/WAF/brute-force/autonomous-attack options are forced off (`09-EXTERNAL-TOOLS-INTEGRATION.md`).
- No target data leaves the platform; external AI/telemetry/update checks are disabled unless an endpoint is approved in `docs/DECISIONS.md`.
