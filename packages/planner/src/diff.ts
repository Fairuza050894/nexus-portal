import type { PlannedTestCase, ScenarioDiff } from './types.js';

export function computeScenarioDiff(
  type: string,
  existingRows: Array<Record<string, unknown>>,
  proposedCases: PlannedTestCase[],
): ScenarioDiff {
  const added: PlannedTestCase[] = [];
  const modified: ScenarioDiff['modified'] = [];
  const unchanged: Array<{ id: string }> = [];

  const existingMap = new Map<string, Record<string, unknown>>();
  for (const row of existingRows) {
    const id = String(row.id ?? row.scenario ?? row.endpoint ?? '');
    if (id) {
      existingMap.set(id, row);
    }
  }

  for (const proposed of proposedCases) {
    if (proposed.type !== type) continue;

    const existing = existingMap.get(proposed.id);
    if (!existing) {
      added.push(proposed);
    } else {
      const changes: string[] = [];
      if (existing.scenario && existing.scenario !== proposed.title) {
        changes.push(`scenario: "${String(existing.scenario)}" -> "${proposed.title}"`);
      }
      if (existing.priority && existing.priority !== proposed.priority) {
        changes.push(`priority: "${String(existing.priority)}" -> "${proposed.priority}"`);
      }

      if (changes.length > 0) {
        modified.push({
          id: proposed.id,
          original: existing,
          proposed,
          changes,
        });
      } else {
        unchanged.push({ id: proposed.id });
      }
    }
  }

  return {
    type,
    added,
    modified,
    unchanged,
  };
}
