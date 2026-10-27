# 01 — Architecture & Tech Stack

## 1. Goals of the architecture

- **One config, one command**: everything driven by `qa.config.ts` and `npm run qa`.
- **Separation of concerns**: test code, framework core, and documentation engine are independent modules.
- **Evidence by default**: every run leaves traces, screenshots, logs, and machine-readable results.
- **Portable**: runs the same locally, in Docker, and in CI.

## 2. Default tech stack (confirm in Phase 0; record changes in `docs/DECISIONS.md`)

| Concern | Default | Why | Acceptable alternatives |
|---|---|---|---|
| Language | TypeScript (Node 20 LTS+) | Type safety, great tooling | Python (pytest + Playwright) |
| UI E2E | Playwright Test | Auto-wait, trace viewer, parallel, multi-browser | Cypress, Selenium/WebDriver |
| API tests | Playwright `APIRequestContext` + Zod | Same runner and reports | Supertest, REST-assured, pytest+httpx |
| Contract check | OpenAPI validation against the spec | Detect API drift | Pact |
| Accessibility | `@axe-core/playwright` | Standard engine (WCAG) | Pa11y |
| Performance (opt.) | k6 | Scriptable, CI-friendly | JMeter, Gatling |
| Visual (opt.) | Playwright `toHaveScreenshot` | No extra tool | Percy, Applitools (needs approval) |
| Reports | Playwright HTML + JSON + JUnit + Allure | Human + machine formats | ReportPortal |
| Doc engine | Custom Node module, Nunjucks templates → MD/HTML → PDF (via Playwright) | No heavy extra dependency | Pandoc, Docusaurus |
| Lint/format | ESLint + Prettier + `tsc --noEmit` | Standard | Biome |
| CI | Match company CI | — | GitHub Actions, GitLab CI, Jenkins, Azure DevOps |
| Containers | Official Playwright Docker image | Reproducible browsers | — |

> If the app under test is **mobile native**, add Appium/Maestro as a separate package under `tests/mobile/` and keep the same metadata + doc pipeline.

## 3. Component map

```
┌────────────────────────────── npm run qa ──────────────────────────────┐
│                                                                        │
│  Orchestrator (scripts/qa.ts)                                          │
│    1 preflight (env, config, connectivity, safety check)               │
│    2 static checks (lint, typecheck)                                   │
│    3 test runners ──► e2e | api | a11y | perf | visual                 │
│    4 collectors   ──► results.json, junit.xml, traces, screenshots     │
│    5 doc engine   ──► report, catalogue, traceability, summary, trend  │
│    6 quality gate ──► go / no-go + exit code                           │
│    7 bundler      ──► artifacts/bundle/qa-<run-id>.zip                 │
└────────────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|---|---|
| **Config loader** | Validates `qa.config.ts` + env vars (Zod). Fails fast with readable errors. |
| **Safety guard** | Blocks runs against non-allowlisted hosts (e.g. production). |
| **Fixtures** | Authenticated sessions (storage state reuse), API client, data factory, logger, per-test cleanup. |
| **Page Objects / Components** | UI abstraction. No business-rule assertions inside them, only actions and state queries. |
| **API clients + schemas** | Typed wrappers per service; response schemas validated on every call. |
| **Data factory** | Synthetic data builders (faker), unique per test (run-id + worker-id suffix). |
| **Metadata helper** | `testMeta({...})` attaches ID, requirement, severity, feature, owner to a test. |
| **Collectors** | Normalize results from all runners into one `run-summary.json` model. |
| **Doc engine** | Pure function: `run-summary.json` + `requirements.yaml` + history → documents. Deterministic. |
| **Quality gate** | Evaluates thresholds from `qa.config.ts`, outputs Go/No-Go with reasons. |
| **Notifier (opt.)** | Teams/Slack/email message with link to bundle. |

## 4. Repository layout

```
qa-platform/
├── AGENTS.md
├── README.md
├── docs/                      # project docs (these specs, DECISIONS.md, ADRs, runbook)
├── rules/
├── tasks/
├── prompts/
├── qa.config.ts               # single source of config (envs, suites, gates, doc settings)
├── playwright.config.ts       # derived from qa.config.ts
├── package.json
├── Dockerfile
├── Makefile                   # make qa / make docs / make clean (thin wrappers)
├── requirements/
│   └── requirements.yaml      # requirement IDs for traceability
├── src/
│   ├── core/                  # config, fixtures, logger, metadata, safety guard
│   ├── pages/                 # Page Objects
│   ├── components/            # Reusable UI components (table, modal, datepicker…)
│   ├── api/                   # API clients + schemas
│   ├── data/                  # factories, static fixtures
│   └── utils/
├── tests/
│   ├── smoke/
│   ├── e2e/<feature>/
│   ├── api/<service>/
│   ├── a11y/
│   ├── perf/                  # k6 scripts
│   └── visual/
├── docs-engine/
│   ├── collectors/
│   ├── generators/
│   ├── templates/             # Nunjucks .njk + CSS for HTML/PDF
│   ├── i18n/                  # id.json, en.json
│   └── index.ts
├── scripts/                   # qa.ts, preflight.ts, bundle.ts, open-report.ts
├── .github/workflows/ | .gitlab-ci.yml | Jenkinsfile
└── artifacts/                 # generated, gitignored
    ├── results/               # raw runner output
    ├── traces/ screenshots/ videos/
    ├── docs/<run-id>/ and docs/latest/
    ├── history/history.json   # trend data (persisted via CI cache/artifact)
    └── bundle/
```

## 5. Key design decisions

1. **Session reuse**: log in once per worker/project via API or UI, store `storageState`, reuse across tests. The login flow itself has its own dedicated test.
2. **Data via API, assertions via UI**: arrange test data through APIs (fast, stable); use the UI only for what the test is verifying.
3. **Environment abstraction**: tests never contain URLs; they read `config.env.baseUrl` / `apiUrl`.
4. **Parallelism**: tests run in parallel by default; workers are CPU-based locally and fixed in CI. Tests needing exclusivity are tagged `@serial` and justified.
5. **Retries**: 0 locally, 1 in CI. A test that passes only on retry is reported as **flaky** (never silently green).
6. **Single results model**: all runners map to the same `TestResult` shape so docs treat UI/API/a11y uniformly.
7. **ADRs**: every significant decision gets a short ADR in `docs/adr/NNNN-title.md`.

## 6. Non-functional requirements of the platform itself

- `npm run qa` for smoke scope ≤ 10 min; full regression ≤ 60 min with sharding.
- Doc generation ≤ 60 s for 1,000 tests.
- Zero manual steps between "start" and "documents ready".
- Doc generation works offline (no external calls; fonts/CSS bundled).
- Reproducible: same inputs → same docs (except timestamps).

## 7. Addendum v2 — Unified platform layout (supersedes the single-repo layout in §4 where different)

The product is a **monorepo** with an app layer and reusable packages. The earlier `qa-platform/` layout (§4) becomes the **permanent regression suite package** (`packages/qa-suite`).

```
qa-platform/
├── apps/
│   ├── web/            # React UI: New Run, Test Builder, Plan Review, Live Run, Results, History, Settings
│   ├── api/            # REST API, auth, validation, queue producers, SSE
│   ├── worker/         # Stage executor inside the sandbox; runs the pipeline
│   └── cli/            # `qa` command (same pipeline)
├── packages/
│   ├── core/           # Run Request schema, config, mode guard, authorization, audit, redaction, types
│   ├── sandbox/        # Container runner, recipes (stack detection), resource/egress limits
│   ├── discover/       # Crawler, OpenAPI importer, repo analyzer, route extractors, network recorder
│   ├── app-map/        # Application Map builder + risk scoring
│   ├── planner/        # Test Plan composer, generators (invariants, spec, crawl, requirement-based)
│   ├── lanes/          # repo, api, e2e (instrumented), a11y, vitals-perf, visual, security-passive, negative
│   ├── correlate/      # Correlation engine, classification, baseline comparison
│   ├── gate/           # Quality gates
│   ├── doc-engine/     # Collectors, generators, templates, i18n (from 03-DOC-GENERATION.md)
│   ├── registry/       # Test Builder form definitions (JSON) + validators
│   └── qa-suite/       # Permanent regression tests (Playwright/API), page objects, fixtures
├── docs/ rules/ tasks/ prompts/
├── deploy/             # docker-compose.yml, Dockerfiles, Helm (later)
└── artifacts/          # generated (gitignored) or object storage
```

### New components

| Component | Responsibility |
|---|---|
| **Run Request intake** | Validate input, enforce mode/authorization/allowlist, audit |
| **Sandbox runner** | Safely clone, build, start, and tear down target apps from repos |
| **Discovery engine** | Crawl + spec import + repo analysis + network recording |
| **Application Map** | Shared model of pages/endpoints/code with risk scores |
| **Planner** | Compose Test Plan from map, inputs, mode, scope, history; human approval gate |
| **Instrumented session** | One browser session observed by all probes (functional, a11y, vitals, console, network, security) |
| **Correlation engine** | Merge multi-lane signals into Findings with confidence labels |
| **Budget manager & circuit breaker** | Time/rate control and automatic stop on target distress |
| **Web app & registry** | UI and data-driven Test Builder forms |

Data flow: `Run Request → Preflight → Discover → Map → Plan → Approval → Lanes → Correlate → Gate → Docs → Bundle`.
Each stage persists JSON outputs so runs are resumable, replayable, and auditable.
