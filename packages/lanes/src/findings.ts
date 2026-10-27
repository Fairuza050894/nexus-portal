import type { Finding } from '@nexus/core';
import type { FindingDraft } from './types.js';

export function toFindings(drafts: FindingDraft[]): Finding[] {
  return drafts.map((draft, index) => ({
    id: `F-${String(index + 1).padStart(4, '0')}`,
    title: draft.title,
    ...(draft.ruleId ? { ruleId: draft.ruleId } : {}),
    severity: draft.severity,
    confidence: draft.confidence,
    category: draft.category,
    lanes: [draft.lane],
    occurrences: draft.occurrences ?? 1,
    ...(draft.affected ? { affected: draft.affected } : {}),
    evidence: draft.evidence ?? [],
    expected: draft.expected,
    actual: draft.actual,
    status: 'new',
    ...(draft.suggestedOwner ? { suggestedOwner: draft.suggestedOwner } : {}),
    ...(draft.suggestedFix ? { suggestedFix: draft.suggestedFix } : {}),
  }));
}
