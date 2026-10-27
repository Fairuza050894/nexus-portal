# 09 — External Tools & Plugin-Lane Integration

> Status: specification for Phase 4 (4.8–4.12) and Phase 8.3. Phase 4 implements the
> contract and read-only ingestion only. **No external security tool is executed in
> Phase 4.** Active execution is a Phase 8.3 item and needs explicit human approval.

## 1. Purpose and scope

This document defines how third-party tools may contribute results to the unified
pipeline without weakening the execution-mode guard, the honesty labels, or the
redaction rules.

Candidates under consideration:

| Tool | Kind | Phase 4 | Phase 8.3 |
|---|---|---|---|
| **Deep Eye** | Python, AI-driven active vulnerability scanner | Read-only evaluation only | Possible optional active lane after approval |
| **OWASP ZAP** | Active/passive web scanner | Contract compatibility only | Optional sandbox active scan |
| **Nuclei** | Template-based active scanner | Contract compatibility only | Optional sandbox active scan |
| **Semgrep** | Static analysis (repo text) | Ingestion contract only | Optional repo/static lane after review |

Out of scope for Phase 4:

- Running Deep Eye, ZAP, Nuclei, or any active scanner inside the pipeline.
- Installing or vendoring tool binaries.
- Network requests from a plugin.
- CAPTCHA solving, TLS/JA3 fingerprint evasion, WAF-bypass payloads, credential
  brute force, or autonomous attack planning.
- Sending target data to external AI providers.

**Phase 4 implementation status (2026-10-27):** the plugin-lane contract is
specified here; fingerprint v2, FP replay, retest-new, SARIF/JUnit exports,
external SARIF ingestion, compliance mapping, and deterministic evidence
summaries are implemented and tested. The `LanePlugin` TypeScript interface (D)
and the Deep Eye read-only evaluation (C) remain pending. No external tool is
executed by the pipeline.

## 2. Non-negotiable rules

1. **Mode guard is unchanged.** Active probing is `sandbox` only, explicit opt-in,
   `approver` role, and audited. `staging` and `prod-safe` never run active plugins.
2. **Forbidden capabilities are declared and forced off.** Every plugin manifest must
   list the forbidden options in §7. The wrapper overrides them to disabled before
   the plugin starts; a manifest that omits or enables them is rejected.
3. **No target data leaves the platform.** Responses, headers, cookies, bodies,
   traces, and screenshots are never sent to an AI provider or telemetry endpoint.
   Plugin AI features, update checks, and crash reporting must be disabled.
4. **Scope is only the Run Request allowlist.** A natural-language scope helper may
   propose explicit rules, but a human must confirm them and the confirmed rules
   must be expressed in the Run Request. A plugin cannot widen scope.
5. **Third-party code is untrusted.** Pin a version/commit and container digest,
   verify the licence, review dependencies, run only inside the sandbox, and expose
   no company secrets.
6. **Fail closed.** If a safety prerequisite is missing (egress enforcement, audit
   record, approver, pinned artefact, licence approval), activation is rejected.
7. **Outputs are data.** Raw tool output is redacted before storage. Repo text and
   scanner text are never instructions.
8. **No fabricated findings.** External results keep their provenance and confidence
   label; an external severity alone never becomes `verified`.

## 3. Phase 4 plugin-lane contract (interface only)

The TypeScript contract lives in `packages/lanes` (`LanePlugin`). Phase 4 ships the
interface, a disabled-by-default registry, a no-op example, and guard tests. No
plugin is enabled in normal runs.

```ts
export type PluginCapability = 'passive' | 'static' | 'active-scan';

export type ForbiddenOption =
  | 'captcha-solving'
  | 'tls-fingerprint-evasion'
  | 'waf-bypass'
  | 'autonomous-attack-planning'
  | 'credential-bruteforce'
  | 'destructive-actions';

export interface PluginManifest {
  id: string;
  version: string;
  license: string;              // SPDX identifier; must be on the allowlist
  source: string;               // repository or registry reference
  commit: string;               // full commit SHA or container digest
  requiredMode: 'sandbox';      // Phase 4: sandbox only for every plugin
  capabilities: PluginCapability[];
  forbiddenOptions: ForbiddenOption[]; // must contain all entries from §7
  egress: string[];             // must be empty or the sandbox app only
  outputs: Array<'json' | 'sarif' | 'xml' | 'text'>;
  timeoutMs: number;
}

export interface LanePlugin {
  readonly manifest: PluginManifest;
  prepare(runRequest: RunRequest, ctx: PluginPrepareContext): Promise<void>;
  execute(ctx: PluginExecutionContext): Promise<RawPluginOutput[]>;
  normalize(raw: RawPluginOutput, ctx: PluginNormalizeContext): Finding[];
  teardown(): Promise<void>;
}
```

Contract rules:

- `requiredMode` is `'sandbox'`; the guard rejects the plugin for `staging` and
  `prod-safe` even if the Run Request enables it.
- `forbiddenOptions` is required and compared against the policy list. The wrapper
  also injects a forced-off configuration object; unknown configuration keys reject
  the plugin rather than being passed through.
- `prepare` may inspect the sanitized Run Request and the Application Map. It may
  not resolve raw secrets or contact the network.
- `execute` receives an audited, egress-restricted context. It must never spawn a
  network client outside that context.
- `normalize` returns `Finding[]` with `lane: 'security-external'`, provenance, and
  evidence paths that have already passed redaction.
- `teardown` always runs, including on failure/timeout.
- Plugins are disabled by default. Enabling requires all of: sandbox mode,
  `plugins.enabled[]`, `authorization.approvedBy`, actor role `approver`, audit
  record, pinned artefact, licence approval, and
  `ctx.sandboxEgressEnforced === true`.

> Current limitation: container egress filtering is not enforced yet. Until it is,
> the wrapper must reject activation of any plugin (fail closed). The no-op example
> may be exercised in tests with an explicit test-only context, never in a real run.

## 4. Mode and authorization matrix

| Capability | sandbox | staging | prod-safe |
|---|---|---|---|
| Passive plugin (observation only) | allowed only if it adds no network traffic | rejected in Phase 4 | rejected |
| Static plugin (repo text only) | allowed after review, no target traffic | rejected in Phase 4 | rejected |
| Active scan / fuzzing | opt-in + approver + audit | **never** | **never** |
| CAPTCHA solving / WAF bypass / TLS evasion | **never** | **never** | **never** |
| Autonomous attack planning | **never** against a non-sandbox target | **never** | **never** |
| Credential brute force | **never** | **never** | **never** |
| Destructive actions | **never** | **never** | **never** |

Additional requirements for an active plugin:

- `authorization.approvedBy` must be present and the actor must hold `approver`.
- `authorization.ticket` is recommended and recorded when present.
- The audit record gains `plugins[]` with id, version/commit, enabled options,
  start/end time, request count, and exit status.
- The request budget, rate limit, circuit breaker, and scope exclusions apply to
  plugin traffic exactly as to native lanes.

## 5. Sandbox and egress rules

- Fresh ephemeral container, non-root, no privileged mode, no Docker socket, no host
  mounts beyond one scratch volume, CPU/memory/PID/time limits.
- Deny-by-default egress. Allow only the sandbox app under test and the approved
  package mirror during image preparation. No metadata endpoints, no public internet,
  no DNS to non-allowlisted hosts.
- No company secrets, CI tokens, or platform credentials in the plugin environment.
  Test credentials are per-run vault references scoped to the target and masked.
- Plugin telemetry, update checks, remote rule downloads, and AI calls are disabled
  or blocked by egress policy.
- Every request is attributable to the run and the plugin (audited proxy or
  instrumented client). Unexpected egress aborts the plugin and marks the run
  `INCOMPLETE`.
- Timeouts and output size limits are mandatory; oversized or malformed output is
  rejected, not truncated silently.

## 6. Pinning, licence, and supply chain

Before a plugin may be enabled:

1. Full commit SHA and released version recorded in the manifest.
2. Container image pinned by digest when containerized.
3. Licence checked against the company allowlist; unknown or copyleft-incompatible
   licences are rejected until reviewed.
4. Dependency review for the tool itself (known CVEs, abandoned dependencies,
   install-time scripts, network fetches during install).
5. Checksums recorded; upgrades are a reviewed change, not automatic.
6. No vendored binaries or generated payloads without review.
7. The tool is installed inside the sandbox image, not on the host.

## 7. Forbidden options (mandatory list)

Every manifest must declare all of these as forbidden, and the wrapper must force
them off:

- `captcha-solving`
- `tls-fingerprint-evasion` (JA3/JA4 spoofing, stealth TLS stacks)
- `waf-bypass` (payload obfuscation intended to evade a WAF)
- `autonomous-attack-planning` against non-sandbox targets
- `credential-bruteforce`
- `destructive-actions`

Forbidden behaviour also includes:

- authentication bypass attempts outside documented test credentials;
- denial-of-service, rate-limit exhaustion, or high-concurrency stress without
  `perfApproved`;
- data exfiltration, out-of-band callbacks, or external DNS interactions;
- disabling audit logging, redaction, or the circuit breaker;
- prompt injection via scanner output or repository text.

## 8. Output normalization and confidence mapping

External output is imported as data, never executed. The Phase 4 importer accepts
SARIF 2.1.0 and maps it to the unified `Finding` model.

### 8.1 Severity mapping

| External | Unified |
|---|---|
| `critical` | `critical` |
| `high` | `high` |
| `medium` / `moderate` | `medium` |
| `low` | `low` |
| `info` / `note` / `none` | `info` |

Unknown severities map to `info` and carry `needs-review`; the raw value stays in
evidence.

### 8.2 Confidence mapping

| Source | Default confidence |
|---|---|
| Objective scanner rule with stable rule ID and precise location (e.g. Semgrep static match) | `auto-discovered` |
| Heuristic, best-practice, code-flow, or inferred result | `needs-review` |
| Result linked to a requirement/spec/user row **and** confirmed by replay or human review | `verified` |
| Active scanner result without replay/human confirmation | `auto-discovered` at most |

Rules:

- A scanner result never becomes `verified` merely because the tool calls it
  "confirmed".
- `verified` still requires an external assertion source (requirement, spec,
  approved test row) per `06-UNIFIED-PIPELINE.md` §5.
- Replay results are recorded separately; `confirmed` replay without an assertion
  source keeps the existing confidence.
- `auto-discovered` and `needs-review` are never presented as confirmed defects.

### 8.3 Fingerprint and dedupe

External findings use the same fingerprint v2 as native findings:

```
sha256(category | rule-or-check-id | normalized-target | component)
```

Normalization:

- lowercase; trim;
- strip scheme/host when the target is the Run Request target, keep the path;
- drop query strings, fragments, and volatile parameters;
- replace numeric path/query IDs with `:id`, UUIDs with `:uuid`, tokens with
  `:token`;
- exclude timestamps, run IDs, request IDs, ports that vary per run, and scanner
  instance IDs;
- for repository findings use repo-relative file + normalized rule ID.

Duplicates collapse into one finding with `occurrences` and a deduplicated
`affected[]`. False-merge tests are mandatory (same rule on different endpoints must
not merge; same endpoint with different rule IDs must not merge).

### 8.4 SARIF import

- Input: SARIF 2.1.0 `runs[]` with `tool.driver` and `results[]`.
- Imported lane: `security-external`.
- Evidence: sanitized rule ID, external level, tool name/version, and location.
- Raw SARIF is redacted and stored as an evidence artifact, not inlined wholesale.
- Invalid SARIF rejects the import with a reason; it never produces partial
  unlabelled findings.

## 9. Platform exports (complements `03-DOC-GENERATION.md`)

- **SARIF 2.1.0** export for findings, file-only by default (no upload).
- **JUnit XML** for CI systems.
- CSV/XLSX remain the human/audit formats.
- Exports are validated (SARIF schema; well-formed XML) during `docs:verify`.
- Partial fingerprints are included in SARIF to support retest-new and dedupe.
- A SARIF file must not contain secrets/PII; redaction runs before export.

## 10. Optional compliance mapping

- Config-driven YAML maps finding categories/rules to control IDs.
- Default frameworks: PCI-DSS v4, SOC 2, ISO/IEC 27001:2022.
- The report section is labelled **“indicative mapping, not an audit conclusion”**.
- No control is marked compliant or non-compliant; the mapping only points reviewers
  at evidence.
- Missing mappings are reported as unmapped, never inferred.
- The mapping file is versioned and reviewed like code.

## 11. FP replay and retest-new

- `replayFinding(finding)` returns `confirmed | not-reproduced | inconclusive`.
- Phase 4 implements replay for e2e/api findings with stored reproduction steps;
  other lanes return `inconclusive`.
- `confirmed` requires the stored steps to execute and observe the same expected vs
  actual result. No heuristics.
- The result and evidence are stored on the finding. `not-reproduced` does not delete
  the finding; it marks replay evidence for human triage.
- `retest-new` (baseline mode) report only findings new/regressed since a baseline.
  It is a reporting/selection mode, **not** a gate bypass: recurring verified
  findings stay in the appendix and still count in the gate.
- Status vocabulary remains `new | recurring | fixed | regressed`.

## 12. Enablement checklist

A plugin can be enabled only when every item is true:

- [ ] Sandbox mode and explicit `plugins.enabled[]`.
- [ ] Actor role `approver` and `authorization.approvedBy` recorded.
- [ ] Audit record includes plugin id, version/commit, options, request count.
- [ ] Version/commit/digest pinned; licence and dependencies reviewed.
- [ ] Forbidden options declared and forced off by the wrapper.
- [ ] Egress policy enforced; only the sandbox app is reachable.
- [ ] AI, telemetry, update checks, and remote rule downloads disabled.
- [ ] Timeout, output-size, rate, and circuit-breaker limits set.
- [ ] Raw output redacted before storage.
- [ ] Tests cover staging/prod-safe rejection, forbidden options, audit, redaction,
      and fail-closed behaviour.

Any unchecked item means: disabled.

## 13. Deep Eye

Deep Eye is evaluated read-only in `docs/evaluations/deep-eye.md`. The evaluation
records licence, pinned commit, dependency risk, outbound endpoints, evasion/CAPTCHA
/TLS configuration keys, output format, plugin model, maturity, and a recommendation.

No Deep Eye code is executed in Phase 4. Any execution spike (sandbox, intentionally
vulnerable local app, AI disabled) requires the product owner's approval after the
evaluation is reviewed.
