# nexus-portal

Unified QA automation platform. One run request discovers a target, executes the
applicable lanes, correlates results, and produces a documentation bundle.

**Current status: Phase 3 (instrumented session & lane MVP).** Intake, mode
guard, sandbox, discovery, Application Map, one Playwright session per run, and
repo/API/E2E/a11y/Web Vitals/passive-security lanes are implemented, with
per-lane isolation, findings, gate scaffolding, docs, and bundle.

Correlation/analysis, visual baselines, and the **web dashboard** are not
implemented yet. The dashboard is Phase 5 (`apps/web` + `apps/api` + worker);
Phases 2–4 build the data it will display. Unimplemented stages are recorded as
`skipped` with a reason — the platform never reports fabricated results.

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

## CLI

The examples below use `qa` as shorthand for
`node --import tsx apps/cli/src/index.ts`.

```bash
qa run --config run-requests/smoke.json
qa run --repo https://git.example.com/team/app.git --url https://staging.example.com --mode staging
qa plan --config run-requests/smoke.json
qa docs --run <run-id>
qa replay <run-id>
qa clean --yes
```

Use the CLI through the package scripts or with the local TypeScript runtime:

```bash
node --import tsx apps/cli/src/index.ts run --config run-requests/smoke.json
```

Exit codes: `0` ok, `1` test failures, `2` quality gate failed, `3`
infrastructure/config/incomplete (also used for rejected requests).

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
| `visual`   | screenshots only; baseline comparison is Phase 8                                                         |

Lanes run in parallel where possible; a lane error does not abort the others.
Findings carry `confidence` labels; docs never present inferred items as
verified defects.

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
├── docs/<run-id>/             # run-summary.json, report.md, index.html
├── docs/latest/               # copy of the latest run
└── bundles/qa-<run-id>.zip    # docs + stages + checksums.txt
```

Everything under `artifacts/` is generated and gitignored.

## Layout

| Path                       | Purpose                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `apps/cli`                 | `qa` command, pipeline orchestration, HTTP probes                                      |
| `packages/core`            | Run Request schema, mode guard, allowlist/redirect checks, redaction, audit, run store |
| `packages/sandbox`         | Stack detection, `.qa/recipe.yaml`, process/container runner, health, teardown         |
| `packages/discover`        | Crawler, robots/rate/circuit policy, OpenAPI importer, repo analyzer, traffic log      |
| `packages/app-map`         | Application Map builder, edges, and risk scoring                                       |
| `packages/session`         | Playwright instrumented session: probes, axe, vitals, screenshots, security            |
| `packages/lanes`           | Lane planning/scheduling, repo/API/E2E/a11y/perf/security lanes, findings              |
| `packages/doc-engine`      | Markdown/HTML reports, JSON manifest, deterministic zip bundle                         |
| `fixtures/sample-todo-api` | Dependency-free sample target used by smoke tests                                      |
| `run-requests/`            | Example run requests                                                                   |
| `docs/`                    | Decisions and ADRs                                                                     |
| `ketentuan/`               | Frozen product specification, rules, and roadmap                                       |

## Safety limitations in this phase

- Local fixtures run in a child process (no OS-level CPU/memory limits). Remote
  repositories require Docker and run with `--cap-drop ALL`,
  `--security-opt no-new-privileges`, `--pids-limit`, memory/CPU limits, and
  automatic teardown.
- Container egress filtering is **not enforced yet**; tracked for the hardening
  phase. Do not use remote untrusted repositories until that is implemented.
- The browser session covers crawled pages, not multi-step business journeys;
  Test Builder rows and journey scripting land with the UI in Phase 5.
- Repo developer tests are discovered but not executed yet; the repo lane is
  static analysis only.
- Visual baselines, load testing, correlation/analyze, and the web dashboard
  remain later phases (4, 5, 8). Requested visual lanes mark the run
  `INCOMPLETE` (exit 3) instead of pretending to pass.
