# Starter Prompts for the Office AI Agent

Copy-paste these. Replace `<...>`. Make sure the agent can read `AGENTS.md` and the files it references.

---

## Prompt 1 — Kickoff (Phase 0)

```
You are the engineering agent for our unified QA platform. Read, in order:
AGENTS.md, docs/01-ARCHITECTURE.md (incl. addendum v2), docs/02-TEST-STRATEGY.md, docs/03-DOC-GENERATION.md,
docs/04-CI-CD.md, docs/05-TARGET-INTAKE-AND-MODES.md, docs/06-UNIFIED-PIPELINE.md, docs/07-TEST-BUILDER-UI.md,
rules/coding-standards.md, rules/security-and-data.md, tasks/ROADMAP.md.

Execute Phase 0 only:
1. Summarize the product in 6 lines, including the three modes and why lanes share one pipeline.
2. Run the discovery checklist (AGENTS.md §5). Ask every question you can't answer yourself, grouped and numbered,
   each with your recommended default.
3. After I answer, create docs/DECISIONS.md and propose 2–3 pilot targets.
Do not write platform code yet. Use the report format in AGENTS.md §8.

Context: company CI = <...>; git provider = <...>; sandbox options = <Docker/K8s/other>; SSO = <...>;
pilot candidates = <...>.
```

## Prompt 2 — Start a phase

```
Start Phase <N> of tasks/ROADMAP.md. Before coding, post a short plan (packages/files, risks, assumptions)
and wait for my "go". Work task by task, one PR-sized change at a time. After each task run the verification
steps (AGENTS.md §4) and send the report (AGENTS.md §8). Stop at the acceptance criteria and show evidence for each.
```

## Prompt 3 — Build the safety core (Phase 1)

```
Implement Phase 1 tasks 1.2 and 1.3 using docs/05-TARGET-INTAKE-AND-MODES.md as the spec.
Write the tests first: (a) non-allowlisted host rejected, (b) redirect to another host rejected,
(c) any POST/PUT/PATCH/DELETE blocked in prod-safe, (d) raw password/token in a Run Request rejected,
(e) sandbox container has no company secrets and no egress except the allowed list.
Show me the test output before moving on.
```

## Prompt 4 — Build a lane

```
Implement the "<lane>" lane (packages/lanes/<lane>) per docs/06-UNIFIED-PIPELINE.md §4.
It must reuse the shared Application Map and instrumented session (no separate crawl/login), respect mode rules,
emit results in the normalized model, label confidence correctly, and record skipped items with reasons.
Add unit tests and one integration test on pilot target <name>. Run it 10× to check stability and report the flaky rate.
```

## Prompt 5 — Build the Test Builder (Phase 5)

```
Implement the registry package and the Test Builder UI per docs/07-TEST-BUILDER-UI.md.
Start with the registry JSON for e2e and api, then the generic form/table engine driven by the registry,
then add a11y, perf, visual, security-passive by adding JSON only (no new UI code — if you need new code, tell me why).
Behaviors required: validation, mode-aware disabling with visible reasons, XLSX/CSV import/export, dry run, secretRef-only fields.
Show screenshots and the a11y lane result for the UI.
```

## Prompt 6 — Generate a test plan for a target

```
Run `qa plan` for <repo/url> in mode <mode>, scope <scope>. Present the plan grouped by lane with source, confidence,
priority, and estimated time, plus a "Not covered" list with reasons. Do not execute anything until I approve.
Flag every case that asserts business behavior without a requirement/spec/user-provided basis — those must be marked needs-review.
```

## Prompt 7 — Investigate findings

```
For run <id>, review findings in artifacts/docs/<id>/. For each critical/high finding: confirm the evidence,
check the correlation (page, endpoint, code ref), classify (app-bug / test-bug / environment / data / flaky),
and draft the defect text. Do not change assertions to make anything pass. Separate verified from auto-discovered
findings in your summary.
```

## Prompt 8 — Security self-review of the platform

```
Review the platform against rules/security-and-data.md §1, §10, §11. Try to break it:
SSRF via redirects, allowlist bypass with lookalike hosts, secret leakage into logs/artifacts/docs,
sandbox egress, resource exhaustion, path traversal in artifact download, role escalation in the API.
Output a table: attack · result · evidence · fix. Fix only after I confirm.
```

## Prompt 9 — Weekly health report

```
Using history from the last 7 runs, produce: pass-rate and finding trends, flaky leaderboard, new/regressed findings,
slowest lanes, uncovered requirements, planner decisions that reduced coverage, quarantines near expiry.
Recommend the 5 highest-value next actions with effort estimates. No code changes.
```

## Tips

- Give the agent **one phase at a time**; ask for **evidence** (command output, run counts, screenshots) instead of "done".
- Require tests before safety-related code (Prompt 3). Safety is the part you cannot fix after an incident.
- If the agent wants to relax a rule in `AGENTS.md`, make it write the reason into `docs/DECISIONS.md` first.
- Keep a human reviewer on any PR touching modes, allowlists, authorization, redaction, sandbox, or quality gates.
