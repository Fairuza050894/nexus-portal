# 04 — CI/CD & One-Click Execution

Implement for the company's CI (decide in Phase 0). Pipeline logic lives in npm scripts so the CI file stays thin and the same commands work locally.

## 1. Pipelines

| Pipeline | Trigger | Scope | Target duration | Output |
|---|---|---|---|---|
| **PR check** | pull/merge request | lint, typecheck, `@smoke`, `@api` (changed areas) | ≤ 10 min | Pass/fail on PR + short summary comment |
| **Nightly regression** | schedule (e.g. 01:00 WIB) | full `@regression` + `@a11y` (+ `@visual`) | ≤ 60 min (sharded) | Full docs bundle, trend update, notification |
| **Manual one-click** | button / `workflow_dispatch` / "Run pipeline" | user-selected env + suite + browser | by scope | Full docs bundle |
| **Release gate** | tag / release branch | full regression + perf (if approved) | ≤ 90 min | Docs bundle + sign-off sheet |
| **Docs only** | manual | regenerate docs from a past run's artifacts | ≤ 2 min | Docs bundle |

### Manual one-click inputs

`environment` (qa | staging | uat), `suite` (smoke | regression | api | e2e | a11y | full), `browser` (chromium | firefox | webkit | all), `tags` (optional grep), `notify` (true/false).

## 2. Standard job steps

1. Checkout, restore caches (npm, Playwright browsers).
2. `npm ci` → `npm run setup`.
3. Preflight (config validation, safety guard, health check of target env).
4. Static checks (`lint`, `typecheck`).
5. Tests — sharded: `--shard=i/n`; each shard uploads raw results (`blob` reporter).
6. **Merge job** (always runs, `if: always()`): merge shards → `npm run docs` → quality gate → bundle.
7. Upload artifacts: docs bundle (retention 30–90 days per policy), traces only for failures.
8. Restore/persist `history.json` (cache or dedicated artifact branch/storage).
9. Optional publish and notify.
10. Job status = quality gate result (exit code contract in `AGENTS.md` §9).

## 3. Environment & secrets

- Secrets from the CI secret store only. Mapped to env vars declared in `.env.example` (no real values).
- Separate credentials per environment; test accounts have least privilege.
- Mask secrets in logs; fail the pipeline if a secret pattern appears in artifacts (`docs:verify`).

## 4. Docker

- `Dockerfile` based on the official Playwright image pinned by version.
- Same image used locally (`make docker-qa`) and in CI to eliminate "works on my machine".
- Support corporate proxy and internal CA via build args/env (`HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`).

## 5. Reliability rules for the pipeline

- Retry only the **test** (Playwright retries=1), never blindly retry the whole job.
- Health-check target env before running; if unhealthy, abort with exit code `3` and still generate an `INCOMPLETE` report.
- Timeouts at job level and test level; no infinite waits.
- Concurrency: one nightly/regression run per environment at a time (queue, don't parallelize against the same shared env).
- Dependency update bot weekly; lockfile committed.

## 6. Notification (optional, needs approval)

Short message: decision (GO / GO WITH RISKS / NO-GO), pass rate, failures count, top 3 failing features, link to bundle/report. Never include secrets, stack traces, or PII in messages.

## 7. Local one-click equivalents

```
npm run qa                          # default scope from qa.config.ts
npm run qa -- --suite=smoke --env=staging
make qa                             # same via Makefile
make docker-qa                      # inside the pinned Docker image
```

## 8. Addendum v2 — Platform deployment and unified runs in CI

- The platform itself ships via `deploy/docker-compose.yml` (web, api, worker, redis, postgres) and a pinned worker image; CI for the platform runs lint, typecheck, unit tests, the platform's own e2e + a11y lanes (dogfooding), image and dependency scans.
- Other teams' pipelines can call the platform: `qa run --repo $CI_REPOSITORY_URL --ref $CI_COMMIT_SHA --url $PREVIEW_URL --mode staging --scope quick --yes` and use the exit code (`0/1/2/3`) as a gate; the docs bundle is attached as a pipeline artifact.
- Scheduled runs (nightly `standard`/`deep`) are created from saved Run Requests with a stored authorization that an `approver` must renew periodically (default every 30 days).
- Worker autoscaling and per-environment concurrency limits prevent two runs from hitting the same shared environment at once.
