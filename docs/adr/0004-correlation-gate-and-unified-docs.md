# ADR 0004: Signal Correlation, Per-Confidence Quality Gate, and Unified Document Bundle

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Platform Architecture Team, QA Leads

## Context

A major bottleneck of automated testing platforms is signal fragmentation: the E2E lane reports an error, the accessibility lane reports another, and the security scanner reports a third. This leads to duplicate reports and alert fatigue. Furthermore, automated scanner results were historically presented with equal weight to formal requirement verification, eroding trust in quality gates.

## Decisions

1. **Signal Correlation & Fingerprint v2:** All test findings across lanes normalize into a single `Finding` model. Duplicate anomalies are collapsed into one finding using deterministic fingerprinting (`sha256(category | ruleId | normalizedTarget | component)`).
2. **Honesty & Confidence Labels:** Findings carry strict confidence labels:
   - `verified`: Directly linked to a formal requirement, spec, or user test row.
   - `auto-discovered`: Objective scanner or invariant match.
   - `needs-review`: Heuristics or AI inferences.
     Only verified or critical auto-discovered anomalies can trigger a `NO-GO` gate decision.
3. **Unified 15-Document Bundle:** Every test run deterministically outputs a comprehensive bundle containing Executive Summary (PDF), Execution Report (HTML/PDF), Findings Register (Excel/XLSX), SARIF 2.1.0, and JUnit XML. Verification (`docs:verify`) guarantees no broken links, unrendered placeholders, or secret leaks before bundle sealing.

## Consequences

- Single pane of glass for test results.
- Zero duplicate defect reports.
- Compliance and audit teams receive standardized, tamper-evident document bundles.
