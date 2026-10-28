# DECISIONS.md - Phase 0 Discovery & Decisions (Unified QA Platform)

> Status: ACCEPTED for the MVP foundation (defaults adopted; open operational items in §6).
> Tanggal: 2026-10-26 | Spec: `ketentuan/` | Output: repo root `/Users/user/Projects/nexus-portal`
> Phase 0–3 selesai; acceptance dibuktikan oleh `npm test` dan `npm run qa:smoke`.

## 0. Ringkasan produk (6 baris, Prompt 1)

1. Platform QA terpadu satu-klik: input repo/URL -> peta aplikasi -> rencana -> eksekusi -> temuan -> bundle 15 dokumen.
2. Mode `sandbox`: app dibangun dari repo di kontainer isolasi ephemeral, bebas eksplorasi + active probing hanya di sini (opt-in).
3. Mode `staging`: env non-prod milik sendiri, data sintetis `qa_auto_*`, wajib otorisasi + host allowlist, rate <=10 req/s.
4. Mode `prod-safe`: observe-only, tanpa state-change/beban/probing aktif, rate <=2 req/s, hormati robots.txt + Retry-After.
5. Semua lane berbagi satu pipeline (satu Application Map + satu sesi browser terinstrumentasi) agar hemat crawl/login dan temuan terkoneksi.
6. Output: satu gate GO / GO WITH RISKS / NO-GO + dokumen HTML/PDF/MD/XLSX + run-summary.json + zip bundle, selalu digenerate walau gagal.

## 1. Discovery checklist - diputus pakai DEFAULT (pilihan user: Pakai semua default)

- 1 CI: **GitHub Actions**, runner ubuntu-latest + pinned Playwright image v1.49.0-jammy. Logic di npm scripts.
- 2 Git: **GitHub**, short-lived read-only token (expire <=8 jam), hanya utk clone di sandbox. CODEOWNERS aktif Phase 1.
- 3 Sandbox: **Docker rootless** (fallback Docker tanpa privileged). Fresh container per run, non-root, no socket, 1 scratch volume, deny-egress.
- 4 Registry/proxy/CA: **npm registry publik**, tanpa proxy/CA khusus MVP. `npm ci` + lockfile.
- 5 Allowlist: staging MVP `localhost,127.0.0.1,*.local,staging-qa-pilot.local`; prod-safe deny kecuali eksplisit. approvedBy=pemilik repo (user).
- 6 SSO: **tanpa SSO utk MVP/CLI**; web Phase 5 pakai OIDC generik (viewer,runner,approver,admin).
- 7 Issue tracker: **none (MVP)**. Defect Drafts MD Jira-ready, tanpa auto-create.
- 8 Requirements: **YAML** di requirements/requirements.yaml. Bahasa dokumen+UI default `id`.
- 9 App/pilot framework: **Web Node20+Express + REST OpenAPI 3.1**. Extractor awal: Express + Next App Router.
- 10 Pilot: lihat S3 (3 pilot di bawah).
- 11 Auth: akun sintetis qa-auto-{admin,user,readonly}, tanpa MFA. Prod-safe hanya read-only/anonim.
- 12 Test data: via API fixture, prefix qa_auto_<runId>_, faker seed deterministik; npm run data:cleanup by prefix+age.
- 13 Reporting: file lokal artifacts/docs/<run-id>/ + zip, tanpa publish/notify MVP.
- 14 AI eksternal: OFF (docs.ai.enabled=false). Tanpa kirim source/artifact/kredensial keluar.
- 15 Browser: chromium saja (MVP). firefox/webkit + mobile Phase 8.

## 2. Stack dikonfirmasi (docs/01 S2, tanpa ubahan)

TypeScript strict Node20+, Playwright Test, APIRequestContext+Zod, axe-core, k6 opt-in, toHaveScreenshot, HTML+JSON+JUnit, doc-engine Nunjucks->MD/HTML->PDF, ESLint+Prettier+tsc, GHA, Playwright image pinned.
Monorepo: apps/web,api,worker,cli + packages/core,sandbox,discover,app-map,planner,lanes,correlate,gate,doc-engine,registry,qa-suite + deploy/ + artifacts/ (gitignored).
Queue/DB MVP: SQLite + file queue (naik ke BullMQ+Redis+Postgres bila perlu). Storage lokal. Realtime SSE.

## 3. Pilot yang diusulkan (3)

A repo+URL (utama): `fixtures/sample-todo-api/` → http://127.0.0.1:3100, endpoint `/health` + `/api/todos`, req `REQ-HEALTH-01`, `REQ-TODOS-01..03`. Uji sandbox build/start/health/teardown; lane repo+api+e2e+a11y+passive menyusul Phase 2–3.
B URL-only: target staging yang sama tanpa repo, mode staging scope quick. Uji crawler rate-limit+robots, invariant, a11y/vitals/passive, endpoint inference.
C API-only: baseUrl+specUrl pilot A; plus prod-safe read-only demo https://jsonplaceholder.typicode.com (GET invariant saja). Uji importer OpenAPI, Zod schema, 401/403/404/422, drift.
Catatan Phase 2: A (repo+crawl), B (URL-only), dan C (API-only/OpenAPI) sudah menghasilkan Application Map; lane pengujian belum ada sampai Phase 3.
Semua: data sintetis qa_auto_*, chromium, quick->standard.

## 4. Mode/otorisasi/guard (docs/05, security)

- sandbox: tanpa authorization, state-change boleh, active probing hanya opt-in eksplisit.
- staging: ownerConfirmed + allowlist; perf butuh perfApproved; active probing never.
- prod-safe: ownerConfirmed + approvedBy named + allowlist; observe-only, guard blokir POST/PUT/PATCH/DELETE/submit di planner+lane+guard termasuk redirect/subresource; vitals dari load normal.
- Guard redirect-aware + lookalike reject; raw secret ditolak; audit immutable; circuit breaker stop 429 atau 5xx>5%/20req.
- Secret: .env.example tanpa nilai, gitignore (.env*, artifacts/, storageState*.json, *.har), gitleaks pre-commit+CI, redaction, docs:verify.
- Sandbox untrusted: non-root ephemeral, no priv/socket, 1 scratch vol, limit CPU/mem/disk/waktu, deny-egress, repo text=data.

## 5. Quality gates awal (bisa diubah via PR + QA-lead review)

critical 100%, overall >=95% (ex-quarantine), flaky <=2%, a11y critical/serious 0, req coverage >=80%, schema 0, skip/fixme baru 0 => GO / GO WITH RISKS / NO-GO. Hanya verified + auto-discovered high bisa NO-GO. Bahasa id default.

## 6. Butuh approval operasional (tidak memblokir Phase 2)

1. Allowlist MVP + admin file/UI: default `qa.config.ts`, admin = QA lead.
2. Pilot: `fixtures/sample-todo-api` dipakai untuk acceptance; 3 pilot nyata menyusul.
3. Docker rootless: belum tersedia di mesin dev ini (daemon mati); jalur container diuji dengan mock. CI wajib menyediakan Docker untuk repo remote.
4. CODEOWNERS sudah ada; branch protection (PR + review + green) perlu diaktifkan di GitHub.

## 7. Phase 1 implementation decisions

- Runtime: Node 20+ dengan `tsx` (`node --import tsx`), tanpa build step; TS strict tetap menjadi source of truth.
- Artifacts: `artifacts/runs/<id>/stages/*.json` (resumable), `artifacts/docs/<id>/`, `artifacts/bundles/`.
- Docs engine Phase 1: `run-summary.json`, `report.md`, `index.html`, zip deterministik + `checksums.txt`. PDF/XLSX menunggu Phase 4.
- Sandbox: fixture lokal memakai process isolation (hanya repo tepercaya); repo remote wajib Docker dengan limit resource. Egress filtering container belum ditegakkan — tercatat sebagai batasan dan hardening Phase 9.
- Unimplemented lane/stage selalu ditulis `skipped` dengan alasan; requested lane yang belum ada membuat run `INCOMPLETE` (exit 3), tidak pernah dilaporkan lulus.
- Git clone memakai token hanya pada langkah clone; environment install/build/start dibersihkan dari token dan secret.

## 8. Phase 2 implementation decisions

- Discovery HTTP client: allowlist + redirect recheck, mode rate limits (20/10/2 req/s), scope budget, circuit breaker (429 or >5% 5xx over 20), GET-only traffic log.
- `robots.txt` enforced in `prod-safe`; `Retry-After` retried once for 503 ≤10s; 429 stops the crawl.
- Auth refs resolve from `vault:path` → `QA_VAULT_PATH` or env names; bearer/Basic/JSON credentials; header scoped to the original host and never logged.
- Repo analyzer: Express + Next App Router extractors, CODEOWNERS/wildcard matching, last-10-commit changed files; repo text is data and never executed.
- Application Map: merged traffic/crawl/form/spec/repo endpoints, inferred edges, weighted risk; `app-map.json` + docs summary. Past-failure weight waits for history (Phase 4).
- Evidence (`discovery.json`, `app-map.json`, audit) is redacted before storage and included in the ZIP.

## 9. Phase 3 implementation decisions

- Sandbox sessions: `startSandbox()` + `stop()`; the app stays alive from discovery through lanes and is always torn down. Resume only reuses intake/preflight.
- One Playwright Chromium context, one page per crawled journey; probes for console/page errors, failed/5xx requests, axe, LCP/CLS/TTFB, screenshots, headers/cookies/mixed content.
- Credentials are scoped to the first target host in both the crawler and the browser route; redirects never receive them.
- Lanes: read-only API GET + Ajv schema + unauthenticated 401/403 check; E2E page-load invariants; a11y in the same session; Web Vitals; passive security; static repo lane. Automatic state-changing API calls are not performed.
- Visual baseline comparison is Phase 8; repo developer-test execution and coverage are deferred and reported as skipped. Correlation/analyze remains Phase 4.
- Findings carry confidence labels and global IDs; docs show lane/test/finding tables; screenshots and lane/session JSON are bundled.
- Gate is still Phase 3-level: failed tests → NO-GO/exit 1; lane errors → NO-GO/exit 2; skipped work → GO WITH RISKS; incomplete infrastructure → exit 3.
- Flakiness sample: 10 consecutive `qa run` executions on `fixtures/sample-todo-api` produced 10× `complete`, 13 tests each, 0 failed (0/130, 0%); 3 repo-lane skips are documented, not flaky.

## 10. Next

Phase 4 (4.1–4.7) is complete: correlation, classification/dedupe, baseline comparison, confidence-based gate, full document bundle (HTML/MD/CSV/XLSX/PDF/JSON), `docs:verify`, and interactive offline Application Map. Phase 4 additive work: **4.8–4.12 complete** — fingerprint v2 + dedupe, FP replay hook, `retest-new`, SARIF 2.1.0/JUnit exports with verification, external SARIF ingestion, indicative compliance mapping, deterministic evidence summaries, Deep Eye read-only evaluation (C) in `docs/evaluations/deep-eye.md`, and the plugin-lane contract (D) in `packages/lanes`. Phase 4 (Milestone M1) is fully complete. The web dashboard remains Phase 5. Activate branch protection and provide Docker rootless in CI/dev before real remote pilots.

## 11a. Phase 4 additive implementation decisions (2026-10-27)

- Replay uses injected executors; it never opens a network/browser session by itself. `confirmed` is stored as evidence and only promotes to `verified` when a requirement/spec/user assertion source also exists.
- `retest-new` is `qa run --retest-new <run-id|latest|previous>`. It highlights new/regressed findings and keeps recurring findings in an appendix; the gate is unchanged.
- SARIF export is file-only, bundled with the official SARIF 2.1.0 schema and validated with `ajv` (`unicodeRegExp:false` for the schema's legacy pattern). JUnit XML is validated structurally by `docs:verify`.
- External ingestion maps SARIF to lane `security-external` with provenance, severity/confidence mapping, redaction and fingerprint dedupe. No third-party tool is executed.
- Compliance mapping is optional and disabled by default (`docs.compliance.enabled=false`). The example `compliance/mapping.yaml` is illustrative; the report says "Indicative mapping, not an audit conclusion."
- Evidence summaries are deterministic templates; no AI or external calls.

## 12. External tools, AI & compliance decisions (2026-10-27)

- **Active scanning on staging:** never. Active/plugin scanning is sandbox-only, explicit opt-in, `approver`-signed, and audited. `staging` and `prod-safe` remain unchanged.
- **AI endpoint:** none approved. All target data stays inside the platform. AI-assisted summaries remain off; Phase 4 summaries are deterministic/template-based.
- **Compliance frameworks for indicative mapping:** PCI-DSS v4, SOC 2, ISO/IEC 27001:2022 (mechanism only; labelled "indicative mapping, not an audit conclusion").
- **SARIF destination:** file-only in Phase 4. No GitHub/GitLab code-scanning upload.
- **Deep Eye:** read-only evaluation only in Phase 4 (`ketentuan/docs/evaluations/deep-eye.md`). No execution, installation, or adapter. Any execution spike requires product-owner approval and belongs to Phase 8.3.
- **Plugin contract:** `LanePlugin` is interface-only, disabled by default, sandbox-only. Activation fails closed until sandbox egress enforcement exists. Forbidden options (CAPTCHA solving, TLS/JA3 evasion, WAF bypass, credential brute force, destructive actions, autonomous attack planning) are declared and forced off.
- **Replay vs confidence:** replay `confirmed` is evidence, not business intent. It never promotes `auto-discovered` to `verified` without a requirement/spec/user-approved assertion.
- **Fingerprint migration:** fingerprint v2 with a one-transition legacy fallback; existing baseline statuses are not silently rewritten.
- **SARIF validation dependency:** `ajv` (MIT, already used by `packages/lanes`) will be declared in `doc-engine` to validate against the bundled SARIF 2.1.0 schema. No network access at validation time.
- **Workflow:** local Conventional Commit per package; push/PR only after explicit approval.

## 13. Phase 5 implementation decisions (2026-10-28)

- **UI design standard:** High-density, professional, dark-mode engineering console (`apps/web`). Avoid generic AI slop, decorative gradients, or bloated cards. Clean typography, monospace metrics, accessible contrast (WCAG 2.1 AA), and internal horizontal scrolling for data tables.
- **Test Builder registry (`packages/registry`):** Data-driven test types (`e2e`, `api`, `a11y`, `perf`, `visual`, `security-passive`). Mode compatibility strictly enforced (performance testing with load is blocked in `prod-safe`).
- **API server (`apps/api`):** Lightweight, zero-bloat Node HTTP server. Provides run lifecycle, dry-run estimation, SSE real-time event streaming (`/api/runs/:id/events`), ZIP bundle streaming, and single-page app static serving.
- **Auth & Role matrix:** Role hierarchy (`viewer` < `runner` < `approver` < `admin`). `viewer` has read-only access; `runner` can create sandbox runs; `approver` and `admin` are required for `staging`, `prod-safe`, and active-scan plans.
- **Dogfooding validation:** 26 automated acceptance scenarios covering all steps in `docs/08-UI-FLOW-REFERENCE.md` (validation, mode guards, secret rejection, builder persistence, plan review, live SSE, and results).

## 14. Phase 6 implementation decisions (2026-10-28)

- **Planner engine (`packages/planner`):** 5 modular generators (invariants, OpenAPI spec, crawl invariants, repo AST routes, formal requirements). Every test case carries strict `source` and `confidence` labels (`verified` for invariants/requirements/user rows, `auto-discovered` for spec/routes, `needs-review` for heuristic forms). Strict rule: no business assertion without a requirement/spec/user row.
- **Diff-style scenario suggestions:** `computeScenarioDiff` generates `{ added, modified, unchanged }` diffs for row-by-row acceptance in Test Builder.
- **Change-based selection & risk ordering:** `orderCasesByRisk` correlates git diff changed files with `AppMap` nodes, boosting risk scores for changed components and executing highest-risk tests first.
- **Self-healing suggestions:** `detectSelfHealingSuggestions` detects status drift (e.g. 200 vs 204), schema drift, and selector drift. Emits report-only diff suggestions with `needs-review` without silently mutating suites.
- **Regression suite promotion (`packages/qa-suite`):** `promoteTestCase` enforces naming conventions (`TC-<AREA>-<NNN>`), verified confidence, and 3× consecutive green test passes (0% flakiness) before admitting tests into the persistent test catalogue and traceability matrix.
