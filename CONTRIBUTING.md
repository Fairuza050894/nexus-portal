# Contributor Guide: Nexus QA Platform

Welcome to the Nexus QA Portal engineering repository! This guide provides onboarding instructions and step-by-step walkthroughs for extending the platform.

---

## 1. Development Setup

### Prerequisites
- **Node.js**: >= 20.0.0
- **npm**: >= 10.0.0
- **Chromium**: Installed via Playwright

### Initial Setup
```bash
git clone https://github.com/Fairuza050894/nexus-portal.git
cd nexus-portal
npm run setup            # Runs npm ci && npx playwright install chromium
npm run qa               # Runs lint, typecheck, vitest monorepo suite, smoke run, and docs:verify
```

---

## 2. Monorepo Architecture Overview

| Package | Role |
|---|---|
| `packages/core` | Run Request schema, Mode Guard, Allowlist/SSRF validation, redaction, audit |
| `packages/discover` | Web crawler, OpenAPI importer, AST repo route & DB schema extractors |
| `packages/app-map` | Application Map builder, risk scoring, full-stack data lineage |
| `packages/session` | Playwright Chromium context, axe-core a11y, Web Vitals, passive security |
| `packages/lanes` | Test lane scheduler (E2E, API, Repo, A11y, Perf, Security, Visual, k6, Plugins) |
| `packages/correlate` | Signal correlation, fingerprint v2 dedupe, baseline comparison, FP replay |
| `packages/gate` | Quality gate evaluator (GO / GO WITH RISKS / NO-GO) & Flaky quarantine |
| `packages/doc-engine` | 15-document bundle generator (HTML, PDF, XLSX, SARIF 2.1.0, JUnit XML) |
| `packages/registry` | Data-driven test types catalogue (`e2e`, `api`, `a11y`, `perf`, `visual`, `security-passive`) |
| `packages/planner` | 5 test generators, diff suggester, change-based risk ordering, self-healing |
| `packages/qa-suite` | Regression suite promotion pipeline with 3x green check |
| `apps/cli` | Command-line interface (`qa run`, `qa plan`, `qa docs`, `qa clean`) |
| `apps/api` | REST API server, OIDC/role auth, SSE real-time event streaming, bundle download |
| `apps/web` | Engineering console (Target, Test Builder, Plan Review, Live Run, Results, Lineage) |

---

## 3. How to Add a New Test Lane

To add a new lane (e.g. `mobile` or `fuzz`):
1. **Declare Lane Name**:
   In `packages/lanes/src/types.ts`, add the lane name to `LANE_NAMES`:
   ```ts
   export const LANE_NAMES = ['repo', 'api', 'e2e', 'a11y', 'visual', 'perf', 'security', 'my-lane'] as const;
   ```
2. **Implement Lane Logic**:
   Create `packages/lanes/src/my-lane.ts`:
   ```ts
   import type { LaneContext, LaneResult } from './types.js';
   export function runMyLane(context: LaneContext): LaneResult {
     // Execute lane logic and return LaneResult { lane: 'my-lane', status, tests, findings, durationMs }
   }
   ```
3. **Register in Scheduler**:
   In `packages/lanes/src/scheduler.ts`, import `runMyLane` and wire into `runLanes()`.
4. **Write Tests**:
   Add test coverage in `packages/lanes/tests/my-lane.test.ts`.

---

## 4. How to Add a New Test Type in Registry

Test types are data-driven JSON/TS definitions in `packages/registry/src/definitions.ts`:
1. Define the type configuration:
   ```ts
   export const MY_TYPE_DEFINITION: TestTypeRegistryDefinition = {
     type: 'my-type',
     label: { id: 'Nama Tipe', en: 'My Test Type' },
     icon: 'sparkles',
     help: { id: 'Deskripsi tipe pengujian', en: 'Test type description' },
     lane: 'my-lane',
     modes: { sandbox: true, staging: true, prodSafe: false }, // Mode guard rules
     requiresApproval: false,
     globals: [ /* Global fields */ ],
     columns: [ /* Table columns for test rows */ ],
     defaults: [ /* Sample rows */ ],
     validators: ['atLeastOneRow', 'urlOnAllowlist'],
   };
   ```
2. Add to `BUILTIN_DEFINITIONS` in `packages/registry/src/definitions.ts`.

---

## 5. How to Add a New Framework Route Extractor

In `packages/discover/src/repo-analyzer.ts`:
1. Write an extractor function that inspects source files using AST or regex patterns:
   ```ts
   export function myFrameworkRoutes(file: string, source: string): RepoRoute[] {
     // Extract method, path, line number and return RepoRoute[]
   }
   ```
2. In the `walkFiles` loop of `analyzeRepo()`, inspect files matching your framework extension and append routes.
3. Add unit test in `packages/discover/tests/extended-routes.test.ts`.

---

## 6. How to Add a New Documentation Section

In `packages/doc-engine/src/`:
1. Add section template logic in `packages/doc-engine/src/documents.ts`.
2. Provide Indonesian and English translations in `packages/doc-engine/src/i18n.ts`.
3. If exporting machine-readable schemas, declare schema and validate in `packages/doc-engine/src/verify.ts`.
4. Run `npm run docs:verify` to confirm output passes link, placeholder, and PII checks.

---

## 7. Standards & Verification

- **Strict TypeScript**: `tsc --noEmit -p tsconfig.json` must pass with 0 errors.
- **ESLint Zero Warnings**: `eslint . --max-warnings 0` must pass.
- **No Plaintext Secrets**: Raw tokens or passwords must never be committed. Always use `vault:<key>` aliases.
- **Commit Format**: Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`, `test(...)`).
- **Full Verification**: Run `npm run qa` before pushing.
