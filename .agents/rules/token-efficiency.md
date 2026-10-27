---
trigger: always_on
description: Guidelines for aggressive token conservation, context optimization, and efficient execution.
---

# Token & Context Conservation Rules

1. **Concise Communication (Caveman Principles)**:
   - Eliminate filler words, conversational pleasantries ("Sure!", "I'd be happy to...", "As requested..."), and apologetic framing.
   - Answer directly first: `[result/diagnosis] -> [action/fix] -> [next step]`.
   - Keep technical payloads verbatim: file paths, symbols, code snippets, numbers, errors.
   - Never print entire files when showing code changes; show only the focused diff with 1-2 lines of context.

2. **Context Window Protection**:
   - Do NOT read whole large files when checking a specific section; use `StartLine` and `EndLine` with `read_file`.
   - Before searching raw files with grep/find, consult `graphify-out/graph.json` or `graphify query` to identify exact files and symbols.
   - Run focused tests first (e.g., `vitest run path/to/test.ts`) instead of full test suites on every minor change.
   - Stop immediately once verification passes (see `verify-and-stop` skill); do not over-iterate or add speculative code.

3. **Execution Efficiency**:
   - Make surgical edits (`edit_file`) rather than recreating entire files (`write_file`) for existing code.
   - Reuse existing utilities and dependencies; avoid adding new packages without explicit need.
