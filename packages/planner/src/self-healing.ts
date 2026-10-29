import type { Finding } from '@nexus/core';
import type { SelfHealingSuggestion } from './types.js';

export function detectSelfHealingSuggestions(
  findings: Finding[],
  executedCases: Array<{
    id: string;
    lane: string;
    target?: string;
    expected?: string;
    actual?: string;
  }>,
): SelfHealingSuggestion[] {
  const suggestions: SelfHealingSuggestion[] = [];

  for (const item of executedCases) {
    if (!item.expected || !item.actual || item.expected === item.actual) {
      continue;
    }

    // 1. Status code drift (e.g. expected 200, actual 204 or 201)
    const statusExpectedMatch = item.expected.match(/\b(200|201|204|400|401|403|404|422|500)\b/);
    const statusActualMatch = item.actual.match(/\b(200|201|204|400|401|403|404|422|500)\b/);

    if (
      statusExpectedMatch &&
      statusActualMatch &&
      statusExpectedMatch[1] !== statusActualMatch[1]
    ) {
      const expStatus = Number(statusExpectedMatch[1]);
      const actStatus = Number(statusActualMatch[1]);

      // If actual status is successful (e.g. 204 No Content instead of 200 OK)
      if (actStatus >= 200 && actStatus < 300 && expStatus >= 200 && expStatus < 300) {
        suggestions.push({
          caseId: item.id,
          lane: item.lane,
          target: item.target ?? item.id,
          kind: 'status-drift',
          expected: expStatus,
          observed: actStatus,
          suggestedPatch: { expectedStatus: actStatus },
          confidence: 'needs-review',
          reason: `Observed status ${actStatus} succeeds with semantic equivalence to expected ${expStatus}. Suggested report-only test update.`,
        });
      }
    }

    // 2. Schema field drift
    if (
      item.actual.toLowerCase().includes('schema') ||
      item.actual.toLowerCase().includes('additional properties')
    ) {
      suggestions.push({
        caseId: item.id,
        lane: item.lane,
        target: item.target ?? item.id,
        kind: 'schema-drift',
        expected: item.expected,
        observed: item.actual,
        suggestedPatch: { schemaUpdate: 'allowAdditionalProperties' },
        confidence: 'needs-review',
        reason: 'API response structure evolved. Proposed schema contract alignment diff.',
      });
    }
  }

  // Check findings for DOM selector drift
  for (const finding of findings) {
    if (finding.category === 'app-bug' && finding.actual?.includes('waiting for selector')) {
      suggestions.push({
        caseId: finding.id,
        lane: finding.lanes[0] ?? 'e2e',
        target: finding.title,
        kind: 'selector-drift',
        expected: finding.expected ?? 'target element visible',
        observed: finding.actual,
        suggestedPatch: { fallbackSelector: 'role-based alternative' },
        confidence: 'needs-review',
        reason: 'Target DOM selector timed out. Suggesting resilient role/aria-based locator.',
      });
    }
  }

  return suggestions;
}
