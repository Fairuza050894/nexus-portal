# 07 — Web App & Test Builder UI

The primary interface is an internal **web app** (with CLI parity). It collects a Run Request (`05-…`), lets the user choose test types by button, shows a **dynamic form + table per type**, reviews the generated plan, runs the pipeline (`06-…`), and delivers the document bundle with one click.

## 1. Screens

| # | Screen | Purpose |
|---|---|---|
| 1 | **New Run** | Enter repo link and/or web URL(s) and/or API spec; choose mode (sandbox / staging / prod-safe) and scope (quick / standard / deep / custom); authorization confirmation; see estimated duration and request count; **"Run everything"** primary button |
| 2 | **Test Builder** | Buttons per test type (Playwright E2E, API, Accessibility, Performance, Visual, Security passive; extensible). Selecting a type shows its global fields and its table of test rows. Optional: user adds own rows on top of auto-generated ones |
| 3 | **Plan Review** | Auto-generated plan: table of cases with source, confidence, priority, lane, expected duration; approve / edit / reject (bulk actions); coverage preview and "not covered" list |
| 4 | **Live Run** | Stage timeline, per-lane progress, live log, request counters, circuit-breaker status, stop button |
| 5 | **Results** | Gate decision, executive summary, findings board (filter by lane, severity, confidence, status), evidence viewer (trace/screenshot), **"Download bundle"** and individual documents |
| 6 | **History & Trends** | Runs list, baseline comparison, trend charts, flaky leaderboard, coverage over time |
| 7 | **Settings (admin)** | Host allowlist, environments, credential references (vault aliases), quality-gate thresholds, doc branding and language, integrations, users and roles |

Default UX flow for a non-technical user: **New Run → Run everything → Results** (the planner decides; Plan Review is skipped only when `planApproval=auto`).

## 2. Test Builder — dynamic forms from a registry

Forms are **data-driven**: each test type is a JSON definition in `apps/web/src/registry/<type>.json`. Adding a new type = adding one file (no UI code). The same registry validates the CLI/API input.

### Registry schema

```jsonc
{
  "type": "e2e",
  "label": { "id": "Playwright E2E", "en": "Playwright E2E" },
  "icon": "world",
  "help": { "id": "...", "en": "..." },
  "lane": "e2e",
  "modes": { "sandbox": true, "staging": true, "prodSafe": true },   // prodSafe:false hides/blocks the type
  "requiresApproval": false,
  "globals": [ /* field[] */ ],
  "columns": [ /* field[] for table rows */ ],
  "defaults": [ /* sample rows */ ],
  "validators": [ "atLeastOneRow", "urlOnAllowlist" ],
  "importTemplate": "templates/e2e.xlsx"
}
```

Field definition: `{ key, label, kind: text|select|multiselect|number|url|path|json|secretRef, required, options, placeholder, help, min, max, pattern, width, showIf }`.

### Registered types (initial)

| Type | Global fields | Table columns |
|---|---|---|
| **e2e** | url\*, environment, browser, login | id, scenario, steps, expected result, severity, requirement |
| **api** | baseUrl\*, environment, auth type, OpenAPI URL | method, endpoint, body/params, expected status, schema check, severity |
| **a11y** | url\*, environment, standard (WCAG 2.1 AA / 2.2 AA / 2.1 A), login | page name, path, wait-for element, fail threshold (critical/serious/moderate) |
| **perf** | url\*, environment, tool (k6 / Lighthouse), load (VU/duration) | scenario, endpoint/page, p95 max (ms), error-rate max (%) |
| **visual** | url\*, environment, browser, login | path, viewport (desktop/tablet/mobile), masked areas, tolerance (%) |
| **security-passive** | url\*, environment, authorization confirmation\*, login | check (headers / TLS / cookies / CORS / info leak), path, severity |

(\* required). The prototype shown during planning is the reference for layout and behavior.

### Behaviors (mandatory)

- Type buttons switch the form without losing rows entered in other types (drafts autosaved per run).
- Row table: add, delete, duplicate, reorder, inline edit, keyboard navigation, paste from Excel, **import/export XLSX/CSV** using downloadable templates.
- **"Suggest scenarios"** button asks the platform to propose rows from the Application Map/spec; suggestions appear as a diff the user accepts row-by-row (never auto-inserted silently).
- Inline validation: required fields, URL format, on-allowlist check, severity values, unique IDs, status code format. Errors are shown next to the field (sentence case, plain language) and block **Run**, not typing.
- **Mode-aware**: types or rows forbidden by the selected mode are disabled with a visible reason (e.g. perf under `prod-safe`); security-passive requires the authorization confirmation.
- **Secrets**: `secretRef` fields accept vault aliases only; any text that looks like a token/password is rejected with a hint.
- **Dry run**: validates everything and shows exactly which hosts/endpoints would be contacted, estimated requests and duration, without sending traffic.
- Production-like hosts display a persistent banner: "Observe-only mode: no data will be changed."
- Test rows become test cases with metadata (ID auto-generated if empty, `TC-<AREA>-<NNN>`), steps become `test.step` names, expected results become assertions or documented checks.

## 3. Plan Review

Columns: select, ID, title, lane, source (`user | spec | crawl | repo-route | requirement | invariant`), confidence, priority/risk, est. duration, mode compatibility, status. Actions: approve, reject, edit, "promote to regression suite after run". Summary header: counts by lane and confidence, estimated total time, **requirement coverage preview**, and **"Not covered"** list with reasons.

## 4. Results screen

- Top: gate decision with reasons; run metadata (target, mode, scope, build/commit, duration).
- Findings board with filters; each finding opens evidence + reproduction + code refs + suggested owner; actions: create Jira/Azure DevOps issue (if connector approved), mark accepted risk (with expiry), assign.
- Buttons: **Download everything (zip)**, individual documents (Executive Summary PDF, Execution Report, Catalogue, Traceability, Findings Register, Application Map, Run Comparison), **Re-run failed only**, **Re-run with same plan**.

## 5. Architecture of the app

| Part | Default choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | i18n (id/en), accessible components, form engine driven by registry |
| API | Node + Fastify (or NestJS) | OpenAPI-documented, Zod validation shared with the registry |
| Queue | BullMQ + Redis (MVP alternative: Postgres/SQLite-based queue) | One job per run; stages as steps |
| Workers | Docker-based sandbox workers (see `05-…` §3) | Autoscale by queue depth |
| DB | PostgreSQL (MVP: SQLite) | runs, plans, findings, history, audit, settings |
| Artifact storage | Local volume or S3-compatible bucket | retention policy, redaction before write |
| Realtime | Server-Sent Events for live run | `GET /runs/:id/events` |
| Auth | Company SSO (OIDC); roles: `viewer`, `runner`, `approver`, `admin` | `approver` required for `staging`/`prod-safe` runs and perf/active tests |
| Packaging | `docker compose up` (web, api, worker, redis, postgres) | Helm chart later if the company uses Kubernetes |

### API (REST, JSON)

```
POST   /api/runs                    create run from Run Request (validates, preflight)
GET    /api/runs/:id                status + summary
GET    /api/runs/:id/events         live events (SSE)
POST   /api/runs/:id/dry-run        validate and estimate only
POST   /api/runs/:id/plan/approve   approve/reject cases
POST   /api/runs/:id/stop
GET    /api/runs/:id/bundle         zip download
GET    /api/runs/:id/docs/:name     single document
GET    /api/findings?...            filter findings
POST   /api/runs/:id/rerun          {mode: "failed-only" | "same-plan"}
GET    /api/registry                form registry (types, fields)
POST   /api/import/:type            parse XLSX/CSV rows → validated rows
```

### CLI parity

```
qa run --repo <url> --ref main --url https://staging.app.co.id --mode staging --scope standard --yes
qa run --config run-request.json
qa docs --run <id>          # regenerate docs
qa replay <id>              # re-run with same plan and seeds
qa plan --config ... --out plan.json   # generate plan only
```

## 6. UX & quality rules

- Sentence case, plain language, Indonesian default, English switchable; no jargon without a tooltip.
- Primary action is single and obvious ("Run everything"); destructive actions confirm.
- Accessible (WCAG 2.1 AA): keyboard navigable tables, labels, focus management, contrast.
- Responsive for laptop screens; tables scroll horizontally inside their container, never the page.
- Every error says what happened and what to do next; no raw stack traces to end users.
- The UI itself is tested by the platform's own e2e + a11y lanes ("dogfooding") and is part of the acceptance criteria.
