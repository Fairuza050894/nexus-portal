# Coding Standards

## 1. General

- TypeScript `strict: true`. No `any` (use `unknown` + narrowing). No `// @ts-ignore` without a comment and ticket.
- ESLint + Prettier enforced; CI fails on warnings in `src/` and `tests/`.
- One responsibility per file. Files < 300 lines; functions < 40 lines where practical.
- Named exports (no default exports) except config files.
- Comments explain **why**, not what. Public helpers have a short TSDoc.
- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `ci:`.

## 2. Naming

| Item | Convention | Example |
|---|---|---|
| Files | `kebab-case` | `login.page.ts`, `orders.api.ts`, `login.spec.ts` |
| Classes | `PascalCase` | `LoginPage` |
| Functions/vars | `camelCase` | `createOrder()` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT_MS` |
| Test ID | `TC-<AREA>-<NNN>` | `TC-AUTH-001` |
| Requirement ID | `REQ-<AREA>-<NN>` | `REQ-AUTH-01` |
| Test title | Behavior in plain language | `Login fails with an incorrect password` |
| Tags | lowercase, `@` prefix | `@smoke @regression @critical @api` |

## 3. Locators (priority order)

1. `getByRole` (with accessible name)
2. `getByLabel`, `getByPlaceholder`, `getByText` (stable visible text only)
3. `getByTestId` (`data-testid`) — request devs to add them where 1–2 are impossible
4. CSS selectors — scoped, short, no positional indexes
5. XPath — last resort, needs comment explaining why

Forbidden: auto-generated class names, deep chains (`div > div > div`), `nth()` on unstable lists, text that is translated or dynamic.

## 4. Page Objects & components

- One Page Object per page/major view; reusable widgets become components (`DataTable`, `Modal`, `DatePicker`).
- Locators are defined once as readonly properties/getters.
- Methods represent **user intentions** (`login(user)`, `addToCart(item)`), not clicks.
- Page Objects **do not assert business expectations**. Assertions live in tests (exception: `expectLoaded()` readiness checks).
- Navigation methods return the next Page Object when helpful.
- No test data hard-coded inside Page Objects.

## 5. Writing tests

- Structure: Arrange (API/fixtures) → Act (UI/API under test) → Assert.
- Use `test.step()` for each documented action; the final step states the expected result (feeds documentation).
- Use **web-first assertions** (`await expect(locator).toBeVisible()`); never assert immediately on a non-awaited value.
- One logical behavior per test; multiple assertions are fine if they verify the same behavior.
- Use `expect.soft` only for independent checks on one page.
- Parameterize with data arrays instead of copy-paste; each case gets a unique title/ID suffix.
- Tests must pass in any order and in parallel.
- Cleanup in fixtures/`afterEach` using API calls; cleanup must not fail the test silently — log failures.
- Network: prefer real calls to the test env. Mock only third-party/unreliable dependencies, and tag such tests `@mocked`.

## 6. Waiting & timeouts

- Forbidden: `waitForTimeout`, `sleep`, arbitrary loops.
- Allowed: web-first assertions, `locator.waitFor()`, `expect.poll()` for eventually-consistent data, `waitForResponse` for specific requests.
- Default timeouts come from `qa.config.ts`. Overriding in a test requires a comment with reason.

## 7. API tests

- Typed client per service in `src/api/`; tests never build raw URLs.
- Validate **status, headers that matter, and response schema** (Zod) on every call.
- Cover: happy path, validation errors (400/422), auth (401/403), not found (404), conflict (409), idempotency, pagination, boundaries.
- Never log full tokens/bodies containing PII; use the logger's redaction.

## 8. Accessibility / visual / performance

- A11y: run axe on key pages after the page reaches a stable state; fail on `critical`/`serious`; list `moderate`/`minor` in the report.
- Visual: only on stable components; mask dynamic regions (dates, ids); baselines updated only via reviewed PR (`test:visual:update`).
- Performance: scripts must have explicit thresholds; never run against shared environments without approval.

## 9. Logging & errors

- Use the shared logger (levels: debug/info/warn/error), structured JSON in CI.
- Error messages include context: what was attempted, on which entity, expected vs actual.
- No `console.log` in committed code.

## 10. Reviewing checklist (agent self-review before PR)

- [ ] Test has complete metadata and meaningful steps
- [ ] Locators follow priority order
- [ ] No hard waits, no shared state, data cleaned up
- [ ] Assertions verify behavior, not implementation details
- [ ] Runs green 3× in a row, in parallel and alone
- [ ] No secrets/PII; no URLs hard-coded
- [ ] Docs regenerate and show the new test correctly
