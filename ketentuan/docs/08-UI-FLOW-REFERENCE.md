# 08 — UI Flow Reference & Acceptance Scenarios

Reference for the web app flow validated in the interactive prototype (5 steps). It complements `07-TEST-BUILDER-UI.md`: 07 defines the architecture and registry; this file defines **observable behavior** that must be covered by the platform's own e2e + a11y tests (dogfooding, Phase 5.6).

The prototype is a visual and behavioral reference, not code to copy. All numbers, findings, and heuristics shown in it are simulated.

## 1. Flow

```
1 Target → (2 Test builder, optional) → 3 Plan review → 4 Run → 5 Results
```

Step navigation: a step button is enabled only up to the furthest step reached. "Run everything" on step 1 validates, builds the plan, and opens step 3 (plan approval stays in the loop unless `planApproval=auto`).

## 2. Acceptance scenarios

### Step 1 — Target

| # | Given | When | Then |
|---|---|---|---|
| 1.1 | Neither repo nor web URL filled | Click "Run everything" | Inline error: provide a repo link or web URL; stay on step 1 |
| 1.2 | Web URL without `http://` / `https://` | Click "Run everything" | Inline error about URL format |
| 1.3 | Mode = sandbox, no repo | Click "Run everything" | Error: sandbox needs a repo to start the app |
| 1.4 | Mode = staging or prod-safe, authorization not confirmed or approver empty | Click "Run everything" | Error naming the missing confirmation/approver; no plan is built |
| 1.5 | Mode = sandbox | View step 1 | Authorization block is hidden |
| 1.6 | Mode = staging or prod-safe | View step 1 | Authorization block (confirmation checkbox + "approved by") is shown |
| 1.7 | Repo and/or URL entered | Change inputs | "Active lanes" chips update: repo → Repo and code; URL → E2E, Accessibility, Web Vitals, Passive security; URL or spec → API |
| 1.8 | Any scope selected | View estimate | Shows estimated minutes and request count; prod-safe shows max 2 req/s and a note that state-changing tests are skipped |
| 1.9 | Raw password/token typed into any field | Submit | Rejected (secret references only) — see `05-…` §6 |

### Step 2 — Test builder

| # | Given | When | Then |
|---|---|---|---|
| 2.1 | Any type selected | Click another type button | Form and table switch to that type's registry definition; rows of the previous type are kept |
| 2.2 | Mode = prod-safe | Select Performance | Visible block message: not allowed in prod-safe |
| 2.3 | Mode ≠ sandbox and authorization not confirmed | Select Passive security | Visible message to confirm authorization in step 1 |
| 2.4 | Table with rows | Add / delete / edit a row | Changes persist when switching types and returning |
| 2.5 | Any type | Click "Suggest scenarios" | Suggestions are requested from the platform and shown as a diff to accept row-by-row (never silently inserted) |
| 2.6 | URL filled in step 1 and builder URL empty | Open builder | Builder URL is pre-filled from step 1 |

### Step 3 — Plan review

| # | Given | When | Then |
|---|---|---|---|
| 3.1 | Plan built | View summary | Counters: candidates, to run, needs approval, skipped by mode |
| 3.2 | Case with confidence `needs-review` | Plan opens | Checkbox is **unchecked** by default and counted under "needs approval" |
| 3.3 | Mode = prod-safe, case mutates data (non-GET API, checkout/submit flows) | Plan opens | Case shows "Skipped by mode", has no checkbox, never runs |
| 3.4 | Repo not provided | Plan opens | No repo-lane cases are present |
| 3.5 | Plan visible | Click "Approve all safe ones" | All non-locked, non-`needs-review` cases become checked |
| 3.6 | No case checked | Click "Approve and run" | Inline error: approve at least one case; no run starts |
| 3.7 | Case from user rows | View row | Source = `user`, confidence = `verified` unless the platform cannot source the expected behavior |
| 3.8 | Each row | View row | Shows ID, title, lane, source, confidence badge, priority |

### Step 4 — Run

| # | Given | When | Then |
|---|---|---|---|
| 4.1 | Run started | Observe | Stage chips advance: Preflight → Discover → App map → Execute lanes → Correlate → Docs |
| 4.2 | Approved cases in N lanes | Observe | Exactly those lanes show a progress bar; lanes with no approved case are absent |
| 4.3 | Run in progress | Observe | Request counter increases; circuit breaker status visible |
| 4.4 | Run completes | — | "View results" action appears (and in the real app, results are available even if lanes failed → `INCOMPLETE` flag) |
| 4.5 | User navigates to another step mid-run | — | Live updates stop cleanly without errors (real app: run continues server-side and is resumable) |

### Step 5 — Results

| # | Given | When | Then |
|---|---|---|---|
| 5.1 | Run finished | View top | Gate decision with reasons; NO-GO if any `verified` critical finding, otherwise GO WITH RISKS/GO per gate rules |
| 5.2 | Findings exist | View metrics | Counts by confidence: verified, auto-discovered, needs-review |
| 5.3 | Findings exist | View list | Each finding shows ID, severity, confidence badge, lanes, title, correlated evidence summary |
| 5.4 | Mode = prod-safe | View results | No finding that required a state-changing request; "Not covered" lists tests skipped by mode |
| 5.5 | Some cases were not approved | View results | "Not covered" lists them with reason (needs approval) |
| 5.6 | Results | Click "Download everything (zip)" | Bundle download starts (prototype: message only); individual document buttons available per `03-…` |
| 5.7 | Results | Click "Start a new run" | Returns to step 1 keeping previous inputs |

### Cross-cutting

| # | Requirement |
|---|---|
| X.1 | Confidence labels always use the same three values and colors: verified (success), auto-discovered (accent), needs-review (warning) |
| X.2 | Sentence case, plain-language messages in Indonesian (default) and English; errors say what happened and what to do |
| X.3 | Keyboard accessible: all buttons, checkboxes, and table inputs reachable and labelled; contrast meets WCAG 2.1 AA |
| X.4 | Tables scroll horizontally inside their container, never the page |
| X.5 | The UI passes the platform's own a11y lane with 0 critical/serious violations |

## 3. Example Run Request (pilot: online store)

```json
{
  "schemaVersion": "1.0",
  "name": "Toko online – pemeriksaan rilis 4.2",
  "mode": "staging",
  "scope": "standard",
  "repo": { "url": "https://git.perusahaan.id/tim/toko-online.git", "ref": "main", "tokenRef": "vault:git/readonly" },
  "web": { "urls": ["https://staging.toko.co.id"], "maxDepth": 3, "excludePaths": ["/logout"] },
  "api": { "baseUrl": "https://api.staging.toko.co.id", "specUrl": "/openapi.json", "authType": "bearer" },
  "auth": { "ref": "vault:qa/toko-staging-user", "roles": ["user"] },
  "requirements": { "source": "yaml", "location": "requirements/requirements.yaml" },
  "testRows": {
    "e2e": [
      { "id": "TC-AUTH-001", "scenario": "Login valid", "steps": "Buka login; isi kredensial; kirim", "expected": "Dashboard tampil", "severity": "critical", "requirement": "REQ-AUTH-01" }
    ],
    "api": [
      { "method": "POST", "endpoint": "/orders", "body": "{\"qty\":0}", "expectedStatus": "422", "schemaCheck": true, "severity": "critical" }
    ]
  },
  "lanes": { "repo": true, "api": true, "e2e": true, "a11y": true, "visual": false, "perf": false, "security": true },
  "planApproval": "review",
  "authorization": { "ownerConfirmed": true, "approvedBy": "nama@perusahaan.id", "ticket": "CHG-123" }
}
```
