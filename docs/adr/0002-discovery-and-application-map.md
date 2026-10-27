# ADR 0002 — Discovery and Application Map

- Status: Accepted
- Date: 2026-10-26

## Context

Phase 2 must turn a Run Request into shared knowledge: pages, endpoints, code
references, changes, and risk. It also must be safe in `prod-safe` (observe
only) and must not let target distress or an unbounded crawl run away.

## Decisions

1. **One guarded HTTP client.** `packages/discover` owns allowlist checks,
   redirect re-validation, mode rate limits (sandbox 20 req/s, staging 10,
   prod-safe 2), scope request budgets, and the circuit breaker. Every crawl,
   robots, and spec request goes through it and is recorded in `traffic`.
2. **GET-only discovery.** The crawler never submits forms. It records form
   actions as `needs-review` endpoints so the map/planner knows they exist.
   `findMutationRequests()` is asserted for `prod-safe` runs; the traffic log
   is evidence, not a convention.
3. **Robots and retry policy.** `prod-safe` loads and enforces `robots.txt`
   (longest match, allow wins ties). Transient `503` responses are retried once
   when `Retry-After` is ≤10s; `429` opens the circuit and stops the crawl.
4. **Budget and circuit breaker are separate.** Budget bounds total requests
   and wall clock per scope; the breaker reacts to target distress (429, or >5%
   5xx in a 20-request window) and stays open for the run.
5. **Auth references, scoped by host.** `auth.ref` resolves from
   `vault:path` → `QA_VAULT_PATH` or an env name. Values may be a bearer token,
   a full `Bearer`/`Basic` value, or JSON credentials. The header is sent only
   to the original target host, never across redirects, and never logged.
6. **Repo text is data.** The repo analyzer parses Express and Next App Router
   files with regex/heuristics, skips dependencies/build output, and never
   executes repo code. Route extraction is labeled `needs-review`.
7. **OpenAPI 3 is authoritative for spec-backed endpoints.** JSON and YAML are
   accepted; paths are normalized (`{id}` → `:id`), security inherits from the
   document, and invalid/unreachable specs become warnings so the rest of the
   run continues.
8. **Application Map merges sources.** Traffic/crawl/form/spec/repo endpoints
   merge by method+normalized path. Edges are inferred and labeled; risk is the
   documented weighted sum, with past-failure weight reserved for history.
9. **Artifacts are redacted and bundled.** `discovery.json`, `app-map.json`,
   and the audit are redacted before storage; the ZIP includes them.
10. **Partial failure is reported, not hidden.** A sandbox build failure still
    allows repo analysis; a target with no discovered pages/endpoints marks the
    run `INCOMPLETE` (exit 3) while docs and the bundle are produced.

## Consequences

- HTML/JS-rendered navigation beyond static links/forms needs the Phase 3
  instrumented browser session.
- `app-map.json` is the dashboard's data source; the interactive viewer lands
  with the web app in Phase 5.
- The circuit breaker is intentionally sticky: a run that trips it stops
  discovery rather than retrying into a distressed target.
