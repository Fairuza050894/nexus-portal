# Operational Runbook: Nexus QA Platform

> **Document Status:** OFFICIAL — Operational guidelines for platform administration, CI/CD, scheduling, security, and incident response.  
> **Milestone:** M3 ("Always On") — Phase 7.5  
> **Audience:** DevOps, SRE, QA Leads, Platform Administrators  

---

## 1. Operational Architecture & Overview

Nexus QA Portal is a multi-lane automation platform providing end-to-end target discovery, test execution, signal correlation, quality gating, and documentation generation.

```
+-----------------------------------------------------------------------------------+
| Continuous Integration (GitHub Actions) / Scheduled Cron (01:00 WIB)               |
|                                                                                   |
|  [PR Check]       [Nightly Regression]      [Manual Dispatch]     [Release Gate]  |
|       |                     |                       |                    |        |
|       +---------------------+-----------------------+--------------------+        |
|                                     |                                             |
|                                     v                                             |
|                        `qa run` / apps/cli / apps/api                             |
|                                     |                                             |
|     +-------------------------------+-------------------------------+             |
|     |                               |                               |             |
|     v                               v                               v             |
|  [Sandbox Container]      [Staging (qa_auto_*)]           [Prod-Safe (GET-only)]  |
|  Ephemeral isolation      Renewable authorization         Rate limit <= 2 req/s   |
|  Deny-all egress          Concurrency lock enforced       No state mutations      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Scheduling & Renewable Authorization Lifecycle

Scheduled runs targeting `staging` or `prod-safe` environments operate under **Renewable Authorization** to prevent orphaned or unmonitored automated execution against live infrastructure.

### 2.1 Policy Rules
1. **Validity Window:** Renewable authorizations are valid for a maximum of **30 days** (`renewableDays: 30`) from the time of approver sign-off.
2. **Hard Expiry Block:** If `now >= expiresAt`, the platform **unconditionally blocks** the scheduled run with reason:
   ```
   Scheduled run blocked: authorization expired on <expiresAt>. An approver must renew authorization before this schedule can execute.
   ```
3. **Approver Role:** Only actors holding role `approver` or `admin` can sign or renew authorizations.

### 2.2 Renewal Procedure
To renew an authorization:
1. Review the target environment, synthetic data cleanup scripts, and active lanes.
2. Call `POST /api/schedules/:id/renew` (or run CLI `qa schedule renew <id> --approver <email>`).
3. The renewed authorization is timestamped and recorded in the audit log.

---

## 3. Concurrency Control & Environment Mutex

To prevent concurrent test pipelines from corrupting shared test data (`qa_auto_*`) or causing artificial rate-limit spikes:

1. **Per-Environment Mutex:** The `EnvironmentLockManager` grants an exclusive lock per environment (`staging`, `uat`, `prod`).
2. **Re-entrant Exemption:** The same active run may re-acquire its existing lock during multi-stage execution.
3. **Lock Rejection:** If an environment is already locked by an active pipeline, subsequent runs queue or reject immediately with status code `409 Conflict`.
4. **Automatic TTL Release:** Default lock TTL is 60 minutes. If an orchestrator crashes without releasing, the lock automatically expires to prevent deadlock.
5. **Manual Break Lock:** In emergency scenarios:
   ```bash
   qa lock release --env staging --force
   ```

---

## 4. CI/CD Pipeline Operations

### 4.1 Workflows
- **`pr-check.yml`**: Runs on every pull request to `main`. Executes static checks, monorepo vitest suite, smoke pipeline, and verifies docs.
- **`nightly-regression.yml`**: Runs daily at 01:00 WIB (18:00 UTC). Executes the full regression suite, uploads zip bundle, and retains artifacts for 30 days.
- **`manual-run.yml`**: Triggered via GitHub Actions `workflow_dispatch`. Accepts environment, suite scope, browser engine, and optional notification flag.
- **`release-gate.yml`**: Triggered on tag push (`v*`). Evaluates strict release gates before production deployment.
- **`docs-only.yml`**: Regenerates HTML/PDF/SARIF/JUnit docs from a previous run's stage artifacts without re-executing browser tests.

---

## 5. Secret Management & Rotation

### 5.1 Non-Negotiable Rules
- **No Plaintext Secrets:** Raw tokens, passwords, or client secrets are strictly banned in repository code, Run Requests, and logs.
- **Vault References:** All credentials must be formatted as `vault:<path/alias>` (e.g., `vault:qa/staging-admin`).
- **Log Masking & Verification:** All outputs pass through `redactValue()`. Any secret or PII pattern detected during `npm run docs:verify` fails the pipeline with exit code `3`.

### 5.2 Secret Rotation Procedure
When rotating test account credentials:
1. Update the credential value in the company vault provider.
2. Keep the vault alias reference unchanged (`vault:qa/staging-admin`).
3. Trigger a manual smoke run to verify authentication:
   ```bash
   qa run --config run-requests/smoke.json
   ```

---

## 6. Backup, Retention & Archival Policy

| Artifact Class | Storage Location | Retention Window | Purge Policy |
|---|---|---|---|
| **Run Documentation Bundles** (`qa-*.zip`) | `artifacts/bundles/` | 90 days | Automated CI artifact expiry / S3 lifecycle |
| **Individual Run Docs** (`report.html`, PDFs) | `artifacts/docs/<run-id>/` | 30 days | FIFO rolling cleanup |
| **Stage JSON Data** (`stages/*.json`) | `artifacts/runs/<run-id>/` | 14 days | Resumable cache purge |
| **Audit Log Records** (`audit.json`) | `artifacts/runs/<run-id>/` | 365 days | Compliance archival |

To clean local artifact caches manually:
```bash
npm run clean
```

---

## 7. Incident Response & Emergency Procedures

### 7.1 Circuit Breaker Trip
The discovery and HTTP probe engine trips the circuit breaker under two conditions:
1. Encountering HTTP `429 Too Many Requests`.
2. HTTP 5xx error rate exceeds `5%` over 20 consecutive requests.

**Action:**
1. Pipeline halts immediately to protect the target server.
2. The partial report is preserved with status `INCOMPLETE` (exit code `3`).
3. Check target server logs for capacity bottlenecks or upstream database connection exhaustion.

### 7.2 Emergency Abort
To abort a runaway test run:
- **Web Console:** Click the `[Cancel Run]` button in Step 4 (Live Run).
- **API Server:** Dispatch `POST /api/runs/:id/stop`.
- **CLI / Process:** Send `SIGTERM` to the process; the runner invokes `teardown()` to stop sandbox containers and close browser contexts.
