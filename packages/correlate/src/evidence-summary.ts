import { redactString, type Finding } from '@nexus/core';
import { findingTargets } from './fingerprint.js';

function truncate(value: string, limit = 160): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length <= limit ? singleLine : `${singleLine.slice(0, limit - 1)}…`;
}

/**
 * Deterministic, template-based evidence summary. No AI, no external calls,
 * and no volatile fields (timestamps, run ids, request ids) are included.
 */
export function buildEvidenceSummary(finding: Finding): string {
  const targets = findingTargets(finding);
  const evidenceTypes = [
    ...new Set(
      finding.evidence.map((item) => (typeof item.type === 'string' ? item.type : 'unknown')),
    ),
  ].sort();
  const lanes = [...new Set(finding.lanes)].sort();
  const parts = [
    `${finding.severity} ${finding.category} (${finding.confidence})`,
    `rule ${finding.ruleId ?? 'unknown'}`,
    targets.length > 0 ? `targets ${targets.join(', ')}` : 'target unspecified',
    `observed ${finding.occurrences}x across ${lanes.join(' + ') || 'unknown lane'}`,
    ...(finding.expected ? [`expected ${truncate(finding.expected)}`] : []),
    ...(finding.actual ? [`actual ${truncate(finding.actual)}`] : []),
    ...(evidenceTypes.length > 0 ? [`evidence ${evidenceTypes.join(', ')}`] : []),
    ...(finding.replay ? [`replay ${finding.replay.result}`] : []),
    ...(finding.provenance ? [`tool ${finding.provenance.tool}`] : []),
  ];
  return redactString(parts.join('; '));
}

export function withEvidenceSummary(finding: Finding): Finding {
  return { ...finding, evidenceSummary: buildEvidenceSummary(finding) };
}
