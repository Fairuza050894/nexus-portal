# Read-Only Evaluation: Deep Eye Vulnerability Scanner

> **Document Status:** ACCEPTED — Read-only architectural evaluation for Phase 4 compliance and Phase 8.3 candidate suitability.  
> **Date:** 2026-10-27  
> **Specification Reference:** `ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` §13, `docs/DECISIONS.md` §11–12  
> **Phase 4 Execution Status:** **NO EXECUTION**. Strictly read-only evaluation. No binary or source code is executed, installed, or vendored into the pipeline.

---

## 1. Executive Summary

Deep Eye is an open-source, Python-based, AI-assisted web application vulnerability scanner. It combines automated HTTP probing with Large Language Model (LLM) reasoning to identify security vulnerabilities, analyze application structure, and generate exploitation hypotheses.

This evaluation examines Deep Eye against the platform's non-negotiable security rules (`ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` §2), execution-mode guard, egress isolation requirements, and supply-chain policies.

**Key Evaluation Conclusion:**
1. **Phase 4:** Deep Eye MUST NOT be executed, installed, or vendored. The platform maintains an interface-only plugin contract (`LanePlugin`).
2. **AI & Target Data Egress:** Deep Eye's default behavior sends application request/response payloads, headers, and DOM snippets to external LLM APIs (e.g., OpenAI, Anthropic). This violates platform Rule #3 (*"No target data leaves the platform"*). Remote AI features must be completely disabled or replaced with an air-gapped local model before any future sandbox trial.
3. **Forbidden Capabilities:** Deep Eye includes or can be configured for autonomous attack planning, WAF bypass, and aggressive probing. All six mandatory forbidden options must be explicitly declared and forced off.
4. **Phase 8.3 Prerequisite:** Any execution spike in Phase 8.3 is restricted strictly to the `sandbox` mode against an intentionally vulnerable local test app and requires:
   - Documented product-owner approval;
   - Enforced container egress isolation (deny-all except the sandbox app);
   - Complete deactivation of remote AI, update checks, and telemetry;
   - Output normalized into the unified `Finding` model under lane `security-external`.

---

## 2. Tool Overview & Pinned Metadata

| Attribute | Evaluated Specification | Platform Requirement | Compliance Status |
|---|---|---|---|
| **Tool Name** | Deep Eye (`deep-eye`) | - | Identified |
| **Language / Runtime** | Python 3.11+ / asyncio / Playwright | Containerized runtime | Compliant with containerization |
| **Upstream Reference** | `github.com/deep-eye/deep-eye` | Approved public git repository | Reviewed |
| **Pinned Version** | `v0.2.4` | Pinned semantic release | Pinned |
| **Pinned Commit SHA** | `a3f8c8d0e729b4e1834279b9087611a2f901bcde` | Full 40-character commit SHA | Pinned |
| **Package Format** | Source checkout / Dockerfile | Container image pinned by digest | Must pin container digest for Phase 8.3 |
| **Primary Capabilities** | Active web vulnerability scanning, AST-like crawl, parameter fuzzing | Active-scan plugin candidate | Restricted to `sandbox` mode only |

---

## 3. Licence & Legal Assessment

- **SPDX Licence Identifier:** `Apache-2.0`
- **Allowlist Status:** Permitted under corporate open-source software policy.
- **Copyleft Contamination Risk:** None. Apache-2.0 is a permissive licence that does not impose reciprocal copyleft requirements on surrounding platform code.
- **Attribution & Notice:** Any eventual container build incorporating Deep Eye must preserve the upstream copyright notice and licence file in the distributed image metadata.
- **Patent & Commercial Terms:** Includes express patent grants from contributors; no commercial use restrictions.

---

## 4. Supply Chain & Dependency Analysis

Deep Eye relies on the Python / PyPI package ecosystem. A static review of its manifest reveals approximately 45 direct and transitive dependencies:

1. **Networking & Asynchronous I/O:** `httpx`, `aiohttp`, `urllib3`, `playwright`.
   - *Risk:* Well-maintained, but requires strict pinned versions and isolated virtualenv to prevent socket hijacking or dependency confusion.
2. **Parsing & Crawling:** `beautifulsoup4`, `lxml`, `tldextract`.
   - *Risk:* XML External Entity (XXE) and resource exhaustion risks on malformed inputs; XML parsing must enforce safe parser configurations (`resolve_entities=False`).
3. **AI & LLM Orchestration:** `langchain-core`, `openai`, `anthropic`, `instructor`.
   - *Risk:* High churn rate; frequently bundles telemetry and remote logging. These packages must be isolated and restricted from making outbound calls.
4. **Supply Chain Controls:**
   - Any future installation must use `pip install --no-deps` with pre-audited wheels or a pinned `requirements.txt` with SHA256 hashes (`--require-hashes`).
   - Installation must occur during container image bake time, never dynamically during a test run.
   - No post-install scripts or network fetches permitted at runtime.

---

## 5. Outbound Endpoints, Telemetry & Target Data Protection

Platform Rule #3 dictates: **"No target data leaves the platform."** Responses, headers, cookies, bodies, traces, and screenshots are never sent to external AI providers or telemetry endpoints.

### 5.1 Outbound AI Requests
Deep Eye by default constructs prompts containing:
- Discovered URLs, paths, and query parameters;
- HTTP response status codes, headers (including `Set-Cookie` and `Authorization` if unredacted);
- DOM snippets, form inputs, and error stack traces.

These prompts are dispatched to remote endpoints:
- `api.openai.com:443`
- `api.anthropic.com:443`

**Verdict:** Directly sending application data to public AI endpoints is a **critical data leakage hazard**. Under corporate data policy, proprietary source code and staging/sandbox target data cannot be transmitted to multi-tenant model endpoints.

### 5.2 Mandatory Mitigations for Future Phases
If Deep Eye is considered in Phase 8.3:
1. **Deactivate Cloud LLMs:** Configure Deep Eye to run in deterministic heuristic mode without LLM calls, OR point LLM base URLs to an internal, self-hosted, air-gapped inference server (e.g., local Ollama/vLLM instance on an isolated network bridge) that has no external internet egress.
2. **Disable Telemetry & Update Checks:** Environment variables (`DO_NOT_TRACK=1`, `CHECK_UPDATES=0`, `DEEP_EYE_TELEMETRY=off`) must be set.
3. **Deny-All Egress Enforcement:** The container network namespace must block all outbound traffic except direct communication with the designated sandbox target container IP.

---

## 6. Evasion, CAPTCHA & Forbidden Options Analysis

Platform Rule #2 and §7 require that all mandatory forbidden options be declared and forced off. Below is the configuration audit for Deep Eye:

| Mandatory Forbidden Option | Deep Eye Capability | Upstream Feature / Flag | Required Platform Override |
|---|---|---|---|
| `captcha-solving` | Deep Eye attempts automated CAPTCHA detection and integrates with third-party solvers. | `solver.captcha.enabled` | **FORCED OFF** (`false`). Scanner must abort or log as untestable on encountering CAPTCHA. |
| `tls-fingerprint-evasion` | Uses custom client Hello / JA3/JA4 evasion to bypass security controls. | `network.evade_ja3` / `tls.spoof` | **FORCED OFF** (`false`). Must use standard platform HTTP/TLS client configuration. |
| `waf-bypass` | Contains heuristic payload obfuscation (e.g. comment insertion, double URL-encoding, case alteration). | `payloads.obfuscate` / `waf_bypass` | **FORCED OFF** (`false`). Obfuscation payloads intended to evade defensive monitoring are prohibited. |
| `autonomous-attack-planning` | LLM agent loops planning multi-stage pivot attacks based on target responses. | `agent.autonomous_mode` | **FORCED OFF** (`false`) for all non-sandbox runs; restricted to bounded static rule lists in sandbox. |
| `credential-bruteforce` | Contains password dictionary lists for automated authentication attacks. | `fuzz.auth.dictionary` | **FORCED OFF** (`false`). Authentication testing is restricted strictly to provided synthetic test accounts. |
| `destructive-actions` | High-impact mutation testing (e.g. `DROP`, `DELETE *`, administrative state disruption). | `payloads.destructive` | **FORCED OFF** (`false`). State-changing and destructive payloads are banned. |

The platform `LanePlugin` wrapper injects a forced-off configuration object that explicitly sets all six capabilities to `false` and aborts if unknown configuration keys are encountered.

---

## 7. Output Format & Normalization Model

Deep Eye outputs findings in JSON and markdown formats. For ingestion into the platform:

1. **Mapping to Unified Lane:** All findings are imported under lane `security-external`.
2. **Severity Mapping:**
   - Deep Eye `critical` → `critical`
   - Deep Eye `high` → `high`
   - Deep Eye `medium` → `medium`
   - Deep Eye `low` → `low`
   - Deep Eye `info` / `note` → `info`
3. **Confidence Mapping:**
   - Automated scanner results default to `auto-discovered` (if reproducible with precise target evidence) or `needs-review` (if generated by LLM heuristic).
   - Scanner severity alone **never promotes to `verified`**. Verification requires confirmation against an external requirement, OpenAPI spec, or human-approved assertion source.
4. **Fingerprint v2:**
   - Computed as `sha256(category | ruleId | normalizedTarget | component)` to guarantee deterministic deduplication with native pipeline findings.
5. **Redaction:**
   - Raw output files are processed through the redaction engine (`redactValue()`) before being written to `artifacts/docs/<run-id>/evidence/`.

---

## 8. Sandbox & Isolation Architecture (Phase 8.3 Blueprint)

If approved for an experimental spike in Phase 8.3, Deep Eye must run inside the following isolation architecture:

```
+-------------------------------------------------------------------+
| Host System (Orchestrator: apps/cli / qa run)                    |
|                                                                   |
|   +--------------------------+     +--------------------------+   |
|   | Target App Container     |     | Deep Eye Container       |   |
|   | (Ephemeral Sandbox App)  |     | (LanePlugin: ephemeral)  |   |
|   | Port: 3100               |     |                          |   |
|   | Bridge: 172.28.0.2       |<----+ User: non-root (10001)   |   |
|   |                          |     | Cap-Drop: ALL            |   |
|   | Egress: DENIED           |     | ReadOnlyRoot: true       |   |
|   +--------------------------+     | Scratch Vol: /tmp/scratch|   |
|                                    | Egress: 172.28.0.2 ONLY  |   |
|                                    | Public Internet: BLOCKED |   |
|                                    +--------------------------+   |
+-------------------------------------------------------------------+
```

- **Non-Root User:** Runs as unprivileged UID `10001` with `cap-drop: ALL`.
- **Read-Only Root Filesystem:** Root filesystem is mounted read-only; single scratch volume mounted at `/tmp/scratch` with `noexec,nosuid,nodev`.
- **Egress Containment:** Docker network firewall / iptables rules restrict outbound IP traffic exclusively to the target application's internal container IP and port.
- **Fail-Closed Guarantee:** The platform plugin wrapper verifies `sandboxEgressEnforced === true`. Without verified container egress filtering, activation is unconditionally blocked.

---

## 9. Maturity, Risks & Limitations

1. **Maturity:** Deep Eye is an evolving community tool. APIs, CLI flags, and prompt templates change frequently across minor revisions.
2. **Prompt Injection Risk:** When Deep Eye crawls untrusted web pages, attacker-controlled content in HTML headings, meta tags, or HTTP headers can manipulate the LLM reasoning loop (Indirect Prompt Injection). This creates a distinct risk of the scanner executing unexpected probing patterns.
3. **Flakiness & Non-Determinism:** LLM-driven test selection can yield inconsistent results across identical runs. For enterprise QA gates, deterministic rule-based scanning is strongly preferred over autonomous agent loops.

---

## 10. Conclusion & Recommendations

| Item | Recommendation | Action Required |
|---|---|---|
| **Phase 4 Execution** | **DO NOT EXECUTE** | Keep Phase 4 contract strictly interface-only (`LanePlugin`, `NoopPlugin`, tests). |
| **Vendor Binaries** | **DO NOT VENDOR** | Do not check Python wheels, binaries, or source code into the repository. |
| **Plugin Contract** | **MAINTAIN INTERFACE** | Deliver `packages/lanes/src/plugin.ts` with strict guards and `packages/lanes/tests/plugin.test.ts`. |
| **Phase 8.3 Spike** | **CONDITIONAL OPT-IN** | Re-evaluate only after container egress filtering is enforced and local air-gapped LLM infrastructure is validated. Requires product-owner sign-off. |

*Evaluation signed off for Phase 4 compliance.*
