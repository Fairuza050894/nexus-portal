# Read-Only Evaluation: REA (Reverse Engineer Anything)

> **Document Status:** ACCEPTED — Architectural & suitability evaluation for Black-box API Discovery and Phase 8.3 candidate suitability.  
> **Date:** 2026-10-29  
> **Specification Reference:** `ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md`, `docs/DECISIONS.md` §11–12, `docs/evaluations/deep-eye.md`  
> **Execution Status:** **NATIVE EMBEDDED ENGINE IMPLEMENTED**. The core black-box web bundle reverse-engineering capability is implemented natively in `@nexus/discover/bundle-extractor` without third-party binary or remote LLM execution.

---

## 1. Executive Summary

**REA** (_Reverse Engineer Anything_, upstream `morluto/rea`) is an open-source toolkit and Model Context Protocol (MCP) server that enables automated reverse-engineering of compiled targets, native binaries, mobile applications, network traffic, and client-side web bundles without requiring original source code.

This evaluation examines REA against the platform's non-negotiable security rules (`ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` §2), execution-mode guard, egress isolation requirements, and supply-chain policies.

### Key Conclusions:

1. **Core Principle Adopted Natively:** The key QA value of REA for web applications—_extracting hidden API endpoints, client routes, and parameters directly from minified/bundled client-side JavaScript assets_—has been implemented natively and deterministically in `@nexus/discover/src/bundle-extractor.ts`.
2. **AI & Target Data Egress:** Upstream REA connects external disassemblers to remote LLM APIs. Under platform Rule #3 (_"No target data leaves the platform"_), raw binary payloads, decompiled tokens, or target data must never be transmitted to external cloud models.
3. **Quality Gate & Confidence Rules:** Reverse-engineered endpoints are strictly tagged with `confidence: 'auto-discovered'` and `source: 'crawl'`. In accordance with `09-EXTERNAL-TOOLS-INTEGRATION.md` §6, reverse-engineered discoveries NEVER auto-promote to `verified` without explicit test assertion or OpenAPI contract proof.

---

## 2. Tool Overview & Pinned Metadata

| Attribute                | Evaluated Specification                                                                 | Platform Requirement                   | Compliance Status                   |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| **Tool Name**            | REA (_Reverse Engineer Anything_)                                                       | -                                      | Evaluated                           |
| **Upstream Reference**   | `github.com/morluto/rea`                                                                | Approved public git repository         | Reviewed                            |
| **Pinned Version**       | `v0.8.2`                                                                                | Pinned semantic release                | Evaluated                           |
| **Licence**              | MIT                                                                                     | Permissive OSI licence                 | Compliant (Permissive)              |
| **Primary Capabilities** | Static bundle deconstruction, binary disassembly bridging, API endpoint extraction      | Black-box discovery & passive analysis | Approved for bundle static analysis |
| **Integration Model**    | Native TypeScript submodule (`@nexus/discover/bundle-extractor`) + LanePlugin candidate | Isolated execution                     | Native submodule deployed           |

---

## 3. Licence & Legal Assessment

- **SPDX Licence Identifier:** `MIT`
- **Allowlist Status:** Permitted under corporate open-source software policy.
- **Copyleft Contamination Risk:** None. The MIT licence is fully permissive and imposes no reciprocal copyleft obligations.
- **Patent & Commercial Terms:** Unrestricted commercial usage with standard copyright notice retention.

---

## 4. Platform Security & Forbidden Capabilities

Per `ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` §2, the platform enforces mandatory disabling of specific offensive/evasion techniques:

| Capability                           | Upstream Status     | Nexus Portal Policy | Platform Enforcement                                |
| ------------------------------------ | ------------------- | ------------------- | --------------------------------------------------- |
| **Remote AI Inference**              | Default LLM prompts | **FORBIDDEN**       | Disabled; native regex/AST extraction only          |
| **WAF Bypass / Fingerprint Evasion** | Configurable        | **FORBIDDEN**       | Hard-disabled; standard user-agent and timing       |
| **Credential Brute-Force**           | Scriptable          | **FORBIDDEN**       | Blocked by Mode Guard & Rate Limiter                |
| **Automated Active Exploitation**    | Scriptable          | **FORBIDDEN**       | Passive discovery only; no active payload attacks   |
| **Egress Exfiltration**              | Optional telemetry  | **FORBIDDEN**       | Zero outbound network calls beyond target allowlist |

---

## 5. Practical Implementation in Nexus Portal

Rather than introducing heavy binary disassembler dependencies (Ghidra, Hopper, IDA) into the lightweight QA test runner, Nexus Portal extracts the highest-yield capability of REA into `@nexus/discover`:

1. **Client Bundle Reverse-Engineering:**
   - Automatically inspects `<script src="...">` and inline `<script>` tags on crawled pages.
   - Recovers hidden REST APIs (`fetch()`, `axios.get/post/put/delete`, literal `/api/*`, `/v1/*`, `/graphql`).
   - Recovers client-side SPA routes (React Router, Vue Router, Next.js page paths) and enqueues them for complete crawl coverage.
2. **Deterministic Confidence Labeling:**
   - Tagged as `tags: ['reverse-engineered', 'bundle-extract']`.
   - Labeled `confidence: 'auto-discovered'`.
   - Respects rate limits, circuit breakers, and mode restrictions (e.g. read-only in `prod-safe`).
