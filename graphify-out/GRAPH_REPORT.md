# Graph Report - nexus-portal  (2026-10-27)

## Corpus Check
- 117 files · ~62,670 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 6, .example 1)

## Summary
- 1125 nodes · 2087 edges · 70 communities (62 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `76e65b52`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pipeline.ts
- runner.ts
- lanes.test.ts
- core/src/index.ts
- package.json
- validate.py
- compress.py
- with
- caveman-compress/README.md
- cli.py
- Rules
- discover/src/index.ts
- crawler.ts
- DiscoveryHttpClient
- repo-analyzer.ts
- discover/src/http.ts
- lanes/package.json
- compilerOptions
- nexus-portal
- cli/package.json
- 06 — Unified Pipeline ("test once, observe everything")
- sandbox/package.json
- session/package.json
- _compress_file_locked
- 02 — Test Strategy
- Rules
- 07 — Web App & Test Builder UI
- Security & Data Rules
- ROADMAP — Phased Build Plan (Unified Platform)
- app-map/src/index.ts
- discover/package.json
- discover.ts
- Caveman Compress
- DECISIONS.md - Phase 0 Discovery & Decisions (Unified QA Platform)
- server.js
- AGENTS.md — Master Rules for the QA Automation Platform
- 03 — One-Click Documentation Generation
- Starter Prompts for the Office AI Agent
- Coding Standards
- caveman-commit
- file_lock
- 04 — CI/CD & One-Click Execution
- 2. Acceptance scenarios
- app-map/package.json
- core/package.json
- doc-engine/package.json
- requirements
- Path
- 01 — Architecture & Tech Stack
- 05 — Target Intake, Execution Modes & Sandbox
- benchmark.py
- write_bytes_atomic
- sample-todo-api/package.json
- recipe.yaml
- _body_candidate_error
- interface
- interface
- interface
- interface
- interface
- ADR 0001 — Phase 1 foundation
- ADR 0002 — Discovery and Application Map
- investigate-first/SKILL.md
- lean-build/SKILL.md
- safe-refactor/SKILL.md
- surgical-patch/SKILL.md
- ultracave/README.md
- verify-and-stop/SKILL.md

## God Nodes (most connected - your core abstractions)
1. `runPipeline()` - 30 edges
2. `startSandbox()` - 29 edges
3. `DiscoveryHttpClient` - 22 edges
4. `_compress_file_locked()` - 20 edges
5. `runLanes()` - 19 edges
6. `resolveHost()` - 18 edges
7. `vitest` - 16 edges
8. `isHostAllowed()` - 16 edges
9. `RunStore` - 16 edges
10. `crawl()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `12. Addendum v2 — Test sources and confidence` --references--> `crawl()`  [INFERRED]
  ketentuan/docs/02-TEST-STRATEGY.md → packages/discover/src/crawler.ts
- `Decisions` --references--> `findMutationRequests()`  [INFERRED]
  docs/adr/0002-discovery-and-application-map.md → packages/discover/src/http.ts
- `5. Artifacts (traces, screenshots, videos, HAR, reports)` --references--> `Authorization`  [INFERRED]
  ketentuan/rules/security-and-data.md → packages/core/src/types.ts
- `Decisions` --references--> `startSandbox()`  [INFERRED]
  docs/adr/0003-instrumented-session-and-lanes.md → packages/sandbox/src/runner.ts
- `9. Phase 3 implementation decisions` --references--> `startSandbox()`  [INFERRED]
  docs/DECISIONS.md → packages/sandbox/src/runner.ts

## Import Cycles
- None detected.

## Communities (70 total, 8 thin omitted)

### Community 0 - "pipeline.ts"
Cohesion: 0.05
Nodes (63): ArgError, BOOLEAN_FLAGS, booleanFlag(), FlagValue, KNOWN_FLAGS, listFlag(), parseArgs(), ParsedArgs (+55 more)

### Community 1 - "runner.ts"
Cohesion: 0.06
Nodes (46): ADR 0003 — Instrumented session and lane MVP, Consequences, Context, Decisions, 9. Phase 3 implementation decisions, assertSafeRef(), assertSafeRepoUrl(), buildSandboxEnv() (+38 more)

### Community 2 - "lanes.test.ts"
Cohesion: 0.10
Nodes (53): AppMap, QaConfig, Finding, DiscoveryResult, runA11yLane(), severityForImpact(), runApiLane(), schemaForStatus() (+45 more)

### Community 3 - "core/src/index.ts"
Cohesion: 0.08
Nodes (48): ProbeFetch, ProbeOptions, ProbeResult, probeUrl(), PipelineOptions, DEFAULT_QA_CONFIG, defineConfig(), QaConfigInput (+40 more)

### Community 4 - "package.json"
Cohesion: 0.06
Nodes (39): description, devDependencies, eslint@^8.57.0, prettier@^3.3.3, tsx@^4.20.4, @types/js-yaml@^4.0.9, @types/node@^20.17.6, typescript@^5.6.3 (+31 more)

### Community 5 - "validate.py"
Cohesion: 0.11
Nodes (17): count_bullets(), extract_code_blocks(), extract_fenced_spans(), extract_headings(), extract_indented_code_blocks(), extract_inline_codes(), extract_paths(), extract_urls() (+9 more)

### Community 6 - "compress.py"
Cohesion: 0.12
Nodes (11): AnthropicSdkUnavailable, call_anthropic_sdk(), call_claude(), call_claude_cli(), call_openai_compat(), call_opencode_cli(), configured_model(), configured_provider() (+3 more)

### Community 7 - "with"
Cohesion: 0.08
Nodes (26): concurrency, cancel-in-progress, group, jobs, qa-foundation, verify, name, branches (+18 more)

### Community 8 - "caveman-compress/README.md"
Cohesion: 0.08
Nodes (22): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (421 tokens), Install, Original (827 tokens), Part of Caveman, Provider / model (+14 more)

### Community 9 - "cli.py"
Cohesion: 0.15
Nodes (8): main(), compress_file(), is_sensitive_path(), detect_file_type(), _is_code_line(), _is_json_content(), _is_yaml_content(), should_compress()

### Community 10 - "Rules"
Cohesion: 0.09
Nodes (20): caveman, Example output, How to invoke, See also, What it does, 1. Answer first, 2. Kill ceremony, 3. Short word (+12 more)

### Community 11 - "discover/src/index.ts"
Cohesion: 0.17
Nodes (19): BuildAppMapOptions, endpoints, page, repo, RunMode, CodeOwnerRule, CrawlResult, CrawlWarning (+11 more)

### Community 12 - "crawler.ts"
Cohesion: 0.16
Nodes (15): crawl(), CrawlOptions, decodeEntities(), endpointFromUrl(), extractPage(), isExcluded(), normalizePath(), normalizeUrl() (+7 more)

### Community 13 - "DiscoveryHttpClient"
Cohesion: 0.13
Nodes (8): DiscoveryHttpClient, findMutationRequests(), parseRetryAfter(), Budget, CircuitBreaker, createRateLimiter(), TrafficRecord, client()

### Community 14 - "repo-analyzer.ts"
Cohesion: 0.16
Nodes (18): analyzeRepo(), codeOwnerPattern(), DEPENDENCY_FILES, expressRoutes(), git(), lineCount(), lineNumberAt(), nextPages() (+10 more)

### Community 15 - "discover/src/http.ts"
Cohesion: 0.13
Nodes (12): Scope, DiscoveryHttpError, HttpClientOptions, HttpResponse, normalizeBody(), ResponseLike, BudgetExhaustedError, CircuitOpenError (+4 more)

### Community 16 - "lanes/package.json"
Cohesion: 0.13
Nodes (18): dependencies, ajv@^8.17.1, @nexus/app-map@0.1.0, @nexus/core@0.1.0, @nexus/discover@0.1.0, @nexus/session@0.1.0, exports, @nexus/app-map (+10 more)

### Community 17 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 18 - "nexus-portal"
Cohesion: 0.11
Nodes (16): Bahasa, Batasan yang jujur, Cara memakai, Ide inti: tidak ada tes yang terpisah-pisah, Isi paket, QA Platform Agent Pack (v2 — Unified), Yang perlu Anda siapkan, CLI (+8 more)

### Community 19 - "cli/package.json"
Cohesion: 0.15
Nodes (16): dependencies, @nexus/app-map@0.1.0, @nexus/core@0.1.0, @nexus/discover@0.1.0, @nexus/doc-engine@0.1.0, @nexus/sandbox@0.1.0, @nexus/app-map, @nexus/core (+8 more)

### Community 20 - "06 — Unified Pipeline ("test once, observe everything")"
Cohesion: 0.12
Nodes (16): 06 — Unified Pipeline ("test once, observe everything"), 10. Self-healing (report-only), 11. Non-negotiables for the pipeline, 1. Why unified, 2. Stages, 3. Application Map (shared knowledge), 4. Lanes (run in parallel, share the session and map), 5. Correlation Engine (+8 more)

### Community 21 - "sandbox/package.json"
Cohesion: 0.16
Nodes (14): dependencies, js-yaml@^4.1.0, @nexus/core@0.1.0, zod@^3.23.8, exports, js-yaml, @nexus/core, zod (+6 more)

### Community 22 - "session/package.json"
Cohesion: 0.16
Nodes (14): dependencies, axe-core@^4.10.2, @nexus/core@0.1.0, playwright@^1.64.1, exports, @nexus/core, main, name (+6 more)

### Community 23 - "_compress_file_locked"
Cohesion: 0.14
Nodes (8): build_compress_prompt(), build_fix_prompt(), _compress_file_locked(), _is_smaller_than_body(), mask_code_blocks(), read_source(), restore_code_blocks(), split_frontmatter()

### Community 24 - "02 — Test Strategy"
Cohesion: 0.14
Nodes (13): 02 — Test Strategy, 10. Metrics shown in the report, 11. Entry / exit criteria, 12. Addendum v2 — Test sources and confidence, 1. Test types, 2. What to automate / not automate, 3. Priority & severity, 4. Test design techniques (+5 more)

### Community 25 - "Rules"
Cohesion: 0.15
Nodes (12): 1. Fragments, 2. One word when one word is enough, 3. Each fact once, 4. Cut conjunctions only when order survives, 5. Tool runs, 6. Never perform, Floor, Persistence (+4 more)

### Community 26 - "07 — Web App & Test Builder UI"
Cohesion: 0.15
Nodes (12): 07 — Web App & Test Builder UI, 1. Screens, 2. Test Builder — dynamic forms from a registry, 3. Plan Review, 4. Results screen, 5. Architecture of the app, 6. UX & quality rules, API (REST, JSON) (+4 more)

### Community 27 - "Security & Data Rules"
Cohesion: 0.15
Nodes (12): 10. Sandbox for untrusted repositories, 11. Web app security, 1. Execution modes, authorization & safety guard, 2. Secrets, 3. Test accounts, 4. Test data & PII, 5. Artifacts (traces, screenshots, videos, HAR, reports), 6. Dependencies & supply chain (+4 more)

### Community 28 - "ROADMAP — Phased Build Plan (Unified Platform)"
Cohesion: 0.15
Nodes (12): Backlog ideas (not committed), Phase 0 — Discovery & Decisions  (≈ 2–3 days), Phase 1 — Foundation  (≈ 1 week), Phase 2 — Discovery & Application Map  (≈ 1–2 weeks), Phase 3 — Lanes MVP (instrumented)  (≈ 2–3 weeks), Phase 4 — Correlation, Gate & Unified Docs  (≈ 2 weeks)  → **M1**, Phase 5 — Web App & Test Builder  (≈ 2–3 weeks)  → **M2**, Phase 6 — Test Generation & Promotion  (≈ 2 weeks) (+4 more)

### Community 29 - "app-map/src/index.ts"
Cohesion: 0.26
Nodes (12): AppMapEdge, AppMapNode, buildAppMap(), CRITICAL_SEGMENTS, criticality(), endpointCoverage(), normalizePath(), pathMatches() (+4 more)

### Community 30 - "discover/package.json"
Cohesion: 0.18
Nodes (12): dependencies, js-yaml@^4.1.0, @nexus/core@0.1.0, exports, js-yaml, @nexus/core, main, name (+4 more)

### Community 31 - "discover.ts"
Cohesion: 0.24
Nodes (10): resolveAuth(), ResolvedAuth, discoverTargets(), HTTP_METHODS, importOpenApi(), normalizePath(), OpenApiDocument, OpenApiOperation (+2 more)

### Community 32 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 33 - "DECISIONS.md - Phase 0 Discovery & Decisions (Unified QA Platform)"
Cohesion: 0.17
Nodes (11): 0. Ringkasan produk (6 baris, Prompt 1), 10. Next, 1. Discovery checklist - diputus pakai DEFAULT (pilihan user: Pakai semua default), 2. Stack dikonfirmasi (docs/01 S2, tanpa ubahan), 3. Pilot yang diusulkan (3), 4. Mode/otorisasi/guard (docs/05, security), 5. Quality gates awal (bisa diubah via PR + QA-lead review), 6. Butuh approval operasional (tidak memblokir Phase 2) (+3 more)

### Community 34 - "server.js"
Cohesion: 0.18
Nodes (7): app, http, port, routes, send(), server, todos

### Community 35 - "AGENTS.md — Master Rules for the QA Automation Platform"
Cohesion: 0.17
Nodes (11): 10. When something is broken in the app, 1. Mission, 2. Reading order, 3. Golden rules (non-negotiable), 4. Operating workflow (follow for every task), 5. Discovery checklist (Phase 0 — resolve before writing code), 6. Definition of Done (per task), 7. Boundaries (+3 more)

### Community 36 - "03 — One-Click Documentation Generation"
Cohesion: 0.17
Nodes (11): 03 — One-Click Documentation Generation, 10. Unified additions (see `06-UNIFIED-PIPELINE.md`), 1. Principle, 2. Trigger, 3. Output set, 4. Normalized data model (`run-summary.json`), 5. Pipeline stages, 6. Failure classification heuristics (deterministic, no AI by default) (+3 more)

### Community 37 - "Starter Prompts for the Office AI Agent"
Cohesion: 0.17
Nodes (11): Prompt 1 — Kickoff (Phase 0), Prompt 2 — Start a phase, Prompt 3 — Build the safety core (Phase 1), Prompt 4 — Build a lane, Prompt 5 — Build the Test Builder (Phase 5), Prompt 6 — Generate a test plan for a target, Prompt 7 — Investigate findings, Prompt 8 — Security self-review of the platform (+3 more)

### Community 38 - "Coding Standards"
Cohesion: 0.17
Nodes (11): 10. Reviewing checklist (agent self-review before PR), 1. General, 2. Naming, 3. Locators (priority order), 4. Page Objects & components, 5. Writing tests, 6. Waiting & timeouts, 7. API tests (+3 more)

### Community 39 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 40 - "file_lock"
Cohesion: 0.18
Nodes (4): file_lock(), LockTimeoutError, _try_lock_nonblocking(), _unlock()

### Community 41 - "04 — CI/CD & One-Click Execution"
Cohesion: 0.18
Nodes (10): 04 — CI/CD & One-Click Execution, 1. Pipelines, 2. Standard job steps, 3. Environment & secrets, 4. Docker, 5. Reliability rules for the pipeline, 6. Notification (optional, needs approval), 7. Local one-click equivalents (+2 more)

### Community 42 - "2. Acceptance scenarios"
Cohesion: 0.18
Nodes (10): 08 — UI Flow Reference & Acceptance Scenarios, 1. Flow, 2. Acceptance scenarios, 3. Example Run Request (pilot: online store), Cross-cutting, Step 1 — Target, Step 2 — Test builder, Step 3 — Plan review (+2 more)

### Community 43 - "app-map/package.json"
Cohesion: 0.20
Nodes (10): dependencies, @nexus/discover@0.1.0, exports, @nexus/discover, main, name, private, type (+2 more)

### Community 44 - "core/package.json"
Cohesion: 0.20
Nodes (10): dependencies, zod@^3.23.8, exports, zod, main, name, private, type (+2 more)

### Community 45 - "doc-engine/package.json"
Cohesion: 0.20
Nodes (10): dependencies, @nexus/core@0.1.0, exports, @nexus/core, main, name, private, type (+2 more)

### Community 46 - "requirements"
Cohesion: 0.18
Nodes (10): app, language, requirements, acceptance, area, covers, id, severity (+2 more)

### Community 47 - "Path"
Cohesion: 0.31
Nodes (4): backup_dir_for(), legacy_backup_dir_for(), lock_path_for(), _state_base_dir()

### Community 48 - "01 — Architecture & Tech Stack"
Cohesion: 0.20
Nodes (9): 01 — Architecture & Tech Stack, 1. Goals of the architecture, 2. Default tech stack (confirm in Phase 0; record changes in `docs/DECISIONS.md`), 3. Component map, 4. Repository layout, 5. Key design decisions, 6. Non-functional requirements of the platform itself, 7. Addendum v2 — Unified platform layout (supersedes the single-repo layout in §4 where different) (+1 more)

### Community 49 - "05 — Target Intake, Execution Modes & Sandbox"
Cohesion: 0.20
Nodes (9): 05 — Target Intake, Execution Modes & Sandbox, 1. Inputs (the "one input" principle), 2. Execution modes, 3. Handling a repository safely (untrusted code), 4. Stack detection → run recipes, 5. Scope presets (time-boxed, adaptive), 6. Run Request schema (`run-request.json`), 7. Preflight (before any request is sent to a target) (+1 more)

### Community 50 - "benchmark.py"
Cohesion: 0.39
Nodes (4): benchmark_pair(), count_tokens(), main(), print_table()

### Community 51 - "write_bytes_atomic"
Cohesion: 0.29
Nodes (3): write_bytes_atomic(), _write_target(), write_text_atomic()

### Community 52 - "sample-todo-api/package.json"
Cohesion: 0.25
Nodes (7): main, name, private, scripts, dev, start, version

### Community 53 - "recipe.yaml"
Cohesion: 0.29
Nodes (6): build, envNames, healthUrl, install, stack, start

### Community 54 - "_body_candidate_error"
Cohesion: 0.33
Nodes (3): _body_candidate_error(), first_nonblank_line(), _frontmatter_block_count()

### Community 55 - "interface"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 56 - "interface"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 57 - "interface"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 58 - "interface"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 59 - "interface"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 60 - "ADR 0001 — Phase 1 foundation"
Cohesion: 0.40
Nodes (4): ADR 0001 — Phase 1 foundation, Consequences, Context, Decisions

### Community 61 - "ADR 0002 — Discovery and Application Map"
Cohesion: 0.40
Nodes (4): ADR 0002 — Discovery and Application Map, Consequences, Context, Decisions

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `core/src/index.ts` to `pipeline.ts`, `runner.ts`, `lanes.test.ts`, `package.json`, `discover/src/index.ts`, `crawler.ts`, `DiscoveryHttpClient`, `repo-analyzer.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `runPipeline()` (e.g. with `.readAudit()` and `.readStage()`) actually correct?**
  _`runPipeline()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05417236662106703 - nodes in this community are weakly interconnected._
- **Why does `startSandbox()` connect `runner.ts` to `pipeline.ts`, `core/src/index.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `startSandbox()` (e.g. with `Decisions` and `9. Phase 3 implementation decisions`) actually correct?**
  _`startSandbox()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Should `runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05543859649122807 - nodes in this community are weakly interconnected._
- **Why does `crawl()` connect `crawler.ts` to `discover/src/index.ts`, `DiscoveryHttpClient`, `discover/src/http.ts`, `02 — Test Strategy`, `discover.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._