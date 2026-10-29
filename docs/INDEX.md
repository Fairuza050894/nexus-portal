# Nexus QA Platform — Documentation Index & Single Source of Truth

This index defines the boundary and source-of-truth structure for all platform specifications, operational runbooks, architecture decisions, and developer guides.

---

## 1. Structure & Boundaries

```
nexus-portal/
├── ketentuan/             # FROZEN SPECIFICATIONS & CLIENT REQUIREMENTS
│   ├── README.md          # Frozen requirements overview & pilot app definitions
│   ├── rules/             # Frozen security, data, and coding standard rules
│   ├── tasks/ROADMAP.md   # Phased delivery plan (Phases 0 through 9)
│   └── docs/              # 01-ARCHITECTURE through 09-EXTERNAL-TOOLS
│
├── docs/                  # LIVING OPERATIONAL & ARCHITECTURAL DOCUMENTATION
│   ├── INDEX.md           # This index (single source of truth navigation)
│   ├── DECISIONS.md       # Master record of implementation decisions (Phases 0–9)
│   ├── RUNBOOK.md         # Official operations, backup, retention, and emergency runbook
│   ├── adr/               # Architecture Decision Records (ADR 0001–0005)
│   └── evaluations/       # Read-only third-party tool assessments (Deep Eye)
│
└── CONTRIBUTING.md        # DEVELOPER ONBOARDING & EXTENSION GUIDE
    └── Step-by-step guides for adding lanes, test types, extractors, and doc sections
```

---

## 2. Specification Navigation (What was specified)

| Reference                                         | Document Title                 | Scope & Authority                                    |
| ------------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `ketentuan/docs/01-ARCHITECTURE.md`               | Core Monorepo Architecture     | Monorepo layout, strict TS, package boundaries       |
| `ketentuan/docs/02-TEST-STRATEGY.md`              | Multi-Lane Test Strategy       | Unit, integration, E2E, a11y, perf, security         |
| `ketentuan/docs/03-DOC-GENERATION.md`             | Documentation Engine & Bundles | 15-document bundle, SARIF 2.1.0, JUnit XML           |
| `ketentuan/docs/04-CI-CD.md`                      | CI/CD Pipelines & Scheduling   | PR check, nightly regression, manual runs            |
| `ketentuan/docs/05-TARGET-INTAKE-AND-MODES.md`    | Target Intake & Mode Guard     | Sandbox, Staging, Prod-Safe execution boundaries     |
| `ketentuan/docs/06-UNIFIED-PIPELINE.md`           | Unified Execution Pipeline     | Single crawl & browser session, lane scheduler       |
| `ketentuan/docs/07-TEST-BUILDER-UI.md`            | Web Console & Test Registry    | Data-driven test types catalogue & API contract      |
| `ketentuan/docs/08-UI-FLOW-REFERENCE.md`          | 5-Step UI Flow Reference       | Acceptance criteria and observable user interactions |
| `ketentuan/docs/09-EXTERNAL-TOOLS-INTEGRATION.md` | Plugin-Lane & External Tools   | `LanePlugin` interface, forbidden capabilities       |

---

## 3. Operational Navigation (How the platform runs)

| Reference                      | Document Title                | Purpose                                                |
| ------------------------------ | ----------------------------- | ------------------------------------------------------ |
| `docs/RUNBOOK.md`              | Platform Operational Runbook  | SRE/QA operations, scheduling, backup, secret rotation |
| `docs/DECISIONS.md`            | Implementation Decisions      | Chronological record of decisions from Phase 0 to 9    |
| `docs/adr/`                    | Architecture Decision Records | Formal ADRs 0001 through 0005                          |
| `docs/evaluations/deep-eye.md` | Deep Eye Security Evaluation  | Static read-only evaluation of candidate scanner       |
| `CONTRIBUTING.md`              | Contributor Onboarding        | Developer extension tutorials & coding standards       |

---

## 4. Configuration Single Source of Truth

- **Runtime & Gating Policy:** Defined in [`qa.config.ts`](../qa.config.ts) (environment, allowlist, pass-rate thresholds, doc language).
- **Environment Variables:** Defined with documentation in [`.env.example`](../.env.example).
- **Test Type Schemas:** Declaratively managed in [`packages/registry/src/definitions.ts`](../packages/registry/src/definitions.ts).
