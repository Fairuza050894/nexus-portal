# ADR 0005: High-Density Web Console, Data-Driven Test Registry, and Full-Stack Lineage

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Platform Architecture Team, UX & SRE Leads

## Context

Non-technical stakeholders (Product Managers, Manual QA, Auditors) require one-click self-service access to the platform without reading source code or executing shell scripts. However, generic "AI slop" dashboard templates (puffy cards, emojis, consumer gradients) reduce professional credibility in enterprise and banking environments.

## Decisions

1. **Developer / SRE Console Aesthetics:** The web console (`apps/web`) adopts a dark-mode, high-density, engineering design system inspired by Datadog, GitHub, and Grafana. Emojis and decorative bloat are strictly forbidden. Monospace typography is used for technical identifiers, routes, and metrics.
2. **Data-Driven Test Builder (`packages/registry`):** All test types (`e2e`, `api`, `a11y`, `perf`, `visual`, `security-passive`) are specified as declarative registry schemas. Adding a new test type requires zero custom UI frontend code. Mode compatibility rules are strictly validated client- and server-side.
3. **Full-Stack Architecture & Data Lineage (`packages/app-map`):** The platform automatically reconstructs full-stack architecture by linking UI routes to API endpoints, controller handlers, and database tables/models (supporting Prisma and SQL schemas). Sensitive columns (PII) are automatically detected and tagged.
4. **Live Security Sandbox Monitor:** Real-time visual monitoring of Host Allowlist enforcement (SSRF defense), container egress boundaries, and live secret/PII redaction counters.

## Consequences

- Non-technical stakeholders can configure, execute, and inspect enterprise test suites with one click.
- Architecture and data flow are transparently observable from UI down to the database schema.
