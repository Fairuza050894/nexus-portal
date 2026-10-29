# nexus-portal

Unified QA automation platform. One run request discovers a target, executes the
applicable lanes, correlates results, and produces a documentation bundle.

**Current status: All Phases 0–9 Complete (Full Platform Release).**
Intake, mode guard, sandbox, discovery, Application Map, Playwright session
per run with multi-browser (`chromium`, `firefox`, `webkit`) and mobile viewports,
repo/API/E2E/a11y/Web Vitals/passive-security lanes, visual regression with
baseline storage and split-screen diff slider, k6 load testing with SLA
thresholds, extended framework extractors (Express, Next.js, Laravel, FastAPI,
Spring Boot), database schema reconstruction (Prisma / SQL DDL / PII tagging),
full-stack data lineage, REST API server (`apps/api`), Test Builder registry
(`packages/registry`), unslop engineering console (`apps/web`), multi-source test
planner (`packages/planner`), regression suite promotion (`packages/qa-suite`),
automated flaky test quarantine, comprehensive security tests, CI/CD suite,
and operational Runbook (`docs/RUNBOOK.md`) are fully implemented and verified.

The platform delivers all three core milestones: M1 ("One command"), M2 ("One click"), and M3 ("Always on").

The product specification and phase plan live in [`ketentuan/`](ketentuan/README.md).

## Requirements

- Node.js 20+ and npm 10+
- Docker only for remote repositories (container isolation). Local fixtures use
  process isolation and are limited to trusted repositories.

## Quick start

```bash
npm ci
npx playwright install chromium   # browser used by the instrumented session
npm test                 # unit + pipeline smoke tests (launches Chromium)
npm run qa:smoke         # run the bundled sample app through all lanes
npm run docs             # regenerate docs for the latest run
npm run docs:open        # regenerate + open artifacts/docs/latest/index.html
```

`npm run setup` does `npm ci` plus the Chromium install.

One-click platform checks (lint → typecheck → tests → smoke run):

```bash
npm run qa
```

## Web Console & REST API

Start the interactive web dashboard and backend API server:

```bash
npm run api
```

Open `http://127.0.0.1:3000` in any web browser. The console is fully interactive client-side:

- **01 TARGET & MODE**: Select execution mode (`sandbox`, `staging`, `prod-safe`), configure repo or target URLs, dynamic active lanes calculation, and one-click "Jalankan Semua (Run Everything)" or "Uji Kering (Dry Run)".
- **02 TEST BUILDER**: Data-driven test authoring across 6 types (`e2e`, `api`, `a11y`, `perf`, `visual`, `security-passive`) with inline table editing and "Sarankan Skenario (Suggest)".
- **03 REVIEW PLAN**: Review auto-generated cases, toggle checkboxes (`needs-review` unchecked by default), "Setujui Semua Kasus Aman", and "Setujui dan Jalankan Rencana".
- **04 LIVE RUN**: Real-time pipeline stage timeline and live log streaming via Server-Sent Events (SSE).
- **05 HASIL & DOKUMEN**: Quality gate verdict (GO / GO WITH RISKS / NO-GO) with explicit reasons, confidence metrics, findings board, interactive Before/After visual diff slider, and one-click ZIP bundle download.
- **06 ARSITEKTUR & DATABASE**: Live Security Sandbox Monitor (Host Allowlist Radar, Egress Boundary, Data Redaction counter), interactive multi-tier SVG topology canvas, and searchable Full-Stack Data Lineage table (`UI Page -> Endpoint -> Handler -> DB Table`).

## CLI

The examples below use `qa` as shorthand for
`node --import tsx apps/cli/src/index.ts`.

```bash
qa run --config run-requests/smoke.json
qa run --config run-requests/smoke.json --retest-new latest
qa run --repo https://git.example.com/team/app.git --url https://staging.example.com --mode staging
qa plan --config run-requests/smoke.json
qa docs --run <run-id>
qa docs:verify [--run <run-id>]
qa replay <run-id>
qa clean --yes
```

Use the CLI through the package scripts or with the local TypeScript runtime:

```bash
node --import tsx apps/cli/src/index.ts run --config run-requests/smoke.json
```

Exit codes: `0` ok, `1` test failures (or failed docs verification), `2` quality gate failed, `3`
infrastructure/config/incomplete (also used for rejected requests).

`qa docs` regenerates a run's documentation, PDFs, SARIF and JUnit exports;
`qa docs:verify` checks required files, link resolution, unrendered
placeholders, missing metadata, secret/PII leaks, PDF headers, SARIF 2.1.0
schema validity, and JUnit well-formedness. A failing verification makes the
run `INCOMPLETE` and the bundle carries the verification errors in its
limitations.

`retest-new` compares against an explicit baseline, highlights new/regressed
findings, and keeps recurring findings in an appendix. It never bypasses the
gate. External SARIF from approved tools can be imported into the
`security-external` lane with `importSarifFindings`; no third-party tool is
executed by the platform.

Staging and prod-safe requests need `authorization.ownerConfirmed`; prod-safe
also needs a named `approvedBy` and is observe-only. Every target host — web,
API, spec, and repository — must be on the allowlist in
[`qa.config.ts`](qa.config.ts), so add your Git host before using `--repo`.
Raw secrets are rejected — only references are accepted (`vault:...` or an
environment variable name). Discovery resolves them from the process
environment: `vault:qa/app` → `QA_VAULT_QA_APP`, whose value may be a bearer
token, `Bearer …`/`Basic …`, or JSON `{ "username": "...", "password": "..." }`.
Credentials are sent only to the original target host, never across redirects.

## Discovery

- Crawler: GET-only BFS, same-origin, depth/exclusion limits, `robots.txt` in
  `prod-safe`, `Retry-After` for transient 503s, mode-based rate limiting
  (sandbox 20 req/s, staging 10, prod-safe 2), request budget, and a circuit
  breaker that stops on 429 or >5% 5xx over 20 requests.
- OpenAPI 3 importer (JSON/YAML) and traffic/form endpoint discovery.
- Repo analyzer: Express and Next App Router routes, pages, CODEOWNERS, git
  recent changes, and test-file discovery. Repo text is treated as data.
- Application Map: pages/endpoints/code nodes, inferred edges, and risk scores
  using change recency, criticality, complexity, exposure, and coverage.
  Written to `artifacts/runs/<run-id>/app-map.json` and summarized in docs.
- Audit/traffic evidence is redacted before it is stored.

## Lanes

One Chromium context and one page per journey collect console/page errors,
failed/5xx requests, axe violations, Web Vitals, a screenshot, and security
headers/cookies. Lanes share that session:

| Lane       | Behaviour                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `repo`     | static secret scan, dependency manifest, license, test discovery (execution deferred)                    |
| `api`      | parameter-free GET endpoints from spec/traffic/repo, status + JSON schema, unauthenticated 401/403 check |
| `e2e`      | page-load invariants, console/page/network errors                                                        |
| `a11y`     | axe WCAG 2A/AA inside the E2E session                                                                    |
| `perf`     | LCP/CLS/TTFB from the same load (load testing stays opt-in)                                              |
| `security` | passive headers, cookies, mixed content, server disclosure                                               |
| `visual`   | screenshots and baseline comparison (with visual diff slider in web console)                             |

Lanes run in parallel where possible; a lane error does not abort the others.
Findings carry `confidence` labels; docs never present inferred items as
verified defects.

## Findings, exports & compliance

- Fingerprint v2 (`category + ruleId + normalized targets`) dedupes findings and
  drives baseline statuses; pre-v2 baselines use a one-transition fallback.
- `replayFinding()` supports e2e/api findings with injected executors; a
  confirmed replay alone never promotes `auto-discovered` to `verified`.
- Exports: `findings.sarif` (SARIF 2.1.0), `junit.xml`, CSV/XLSX, and the human
  reports. SARIF is file-only by default.
- External SARIF (e.g. Semgrep output) is imported as `security-external` with
  provenance, severity/confidence mapping, redaction, and fingerprint dedupe.
- Optional `compliance/mapping.yaml` maps categories/rules to PCI-DSS v4, SOC 2,
  or ISO 27001:2022 control IDs. The report labels it **“indicative mapping, not
  an audit conclusion”**; enable via `docs.compliance.enabled`.

## Run artifacts

```
artifacts/
├── runs/<run-id>/
│   ├── audit.json
│   ├── discovery.json         # pages, endpoints, traffic, repo analysis
│   ├── app-map.json           # Application Map + risk scores
│   ├── lanes.json             # lane/test findings + totals
│   ├── session.json           # browser probes, vitals, a11y, security
│   ├── findings.json
│   ├── evidence/session/*.png # screenshots
│   ├── run-summary.json
│   └── stages/*.json          # resumable stage outputs
├── docs/<run-id>/             # 15 documents + defects/, evidence/, PDFs, XLSX, SARIF, JUnit
│   ├── findings.sarif         # SARIF 2.1.0 (file-only)
│   └── junit.xml              # JUnit XML for CI
├── docs/latest/               # copy of the latest run
└── bundles/qa-<run-id>.zip    # docs + stages + evidence + checksums.txt
```

Everything under `artifacts/` is generated and gitignored.

## Layout

| Path                       | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/cli`                 | `qa` command, pipeline orchestration, HTTP probes                                              |
| `packages/core`            | Run Request schema, mode guard, allowlist/redirect checks, redaction, audit, run store         |
| `packages/sandbox`         | Stack detection, `.qa/recipe.yaml`, process/container runner, health, teardown                 |
| `packages/discover`        | Crawler, robots/rate/circuit policy, OpenAPI importer, repo analyzer, traffic log              |
| `packages/app-map`         | Application Map builder, edges, and risk scoring                                               |
| `packages/session`         | Playwright instrumented session: probes, axe, vitals, screenshots, security                    |
| `packages/lanes`           | Lane planning/scheduling, repo/API/E2E/a11y/perf/security lanes, LanePlugin contract, findings |
| `apps/api`                 | REST API server, OIDC/role auth, run lifecycle, live SSE streaming, bundle download            |
| `apps/web`                 | 5-step engineering console (Target, Test Builder, Plan Review, Live Run, Results)              |
| `packages/registry`        | Dynamic test type catalogue (`e2e`, `api`, `a11y`, `perf`, `visual`, `security-passive`)       |
| `packages/correlate`       | Fingerprint/dedupe, FP replay, external SARIF ingestion, confidence labels, baseline           |
| `packages/gate`            | Per-confidence quality gate (GO / GO WITH RISKS / NO-GO) with rule evidence                    |
| `packages/doc-engine`      | 15 documents + SARIF/JUnit exports, i18n, compliance section, verification, zip bundle         |
| `packages/planner`         | 5 test generators, diff suggester, change-based risk ordering, self-healing suggestions        |
| `packages/qa-suite`        | Test promotion pipeline (conventions, verified-only, 3x green check), catalogue matrix         |
| `compliance/`              | Optional example compliance mapping (disabled by default)                                      |
| `fixtures/sample-todo-api` | Dependency-free sample target used by smoke tests                                              |
| `run-requests/`            | Example run requests                                                                           |
| `docs/`                    | Decisions, ADRs, and tool evaluations (`docs/evaluations/deep-eye.md`)                         |
| `ketentuan/`               | Frozen product specification, rules, and roadmap                                               |
| `docs/RUNBOOK.md`          | Comprehensive operational procedures, scheduling, retention, secret rotation, incidents        |
| `.github/workflows/`       | Complete CI/CD suite: PR check, nightly regression, manual dispatch, release gate, docs        |
| `CONTRIBUTING.md`          | Comprehensive onboarding & extension guide (lanes, types, extractors, docs)                    |

## Safety limitations in this phase

- Local fixtures run in a child process (no OS-level CPU/memory limits). Remote
  repositories require Docker and run with `--cap-drop ALL`,
  `--security-opt no-new-privileges`, `--pids-limit`, memory/CPU limits, and
  automatic teardown.
- Container egress filtering is **not enforced yet**; tracked for the hardening
  phase. Do not use remote untrusted repositories until that is implemented.
- The browser session covers crawled pages, while multi-step business journeys
  and custom test scenarios are authored through the Test Builder and Journey
  Scripting in the Web Console or specified via testRows.
- Repo developer tests are discovered but not executed yet; the repo lane is
  static analysis only.
- Requirement coverage is reported as `uncovered` unless a test or finding
  references the requirement ID; the sample fixture has no such links yet.
