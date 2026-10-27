import type { Finding, RunSummary } from '@nexus/core';
import { resolveFindingFingerprint } from '@nexus/correlate';

const SEVERITY_TO_LEVEL: Record<string, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

function fingerprintValue(finding: Finding): string {
  return resolveFindingFingerprint(finding).replace(/^v2:/, '');
}

function targetLocations(finding: Finding): Array<Record<string, unknown>> {
  const locations: Array<Record<string, unknown>> = [];
  for (const item of finding.affected ?? []) {
    if (typeof item.component === 'string') {
      locations.push({
        physicalLocation: {
          artifactLocation: { uri: item.component.replace(/\\/g, '/') },
        },
      });
    } else if (typeof item.page === 'string') {
      locations.push({ logicalLocations: [{ fullyQualifiedName: item.page }] });
    } else if (typeof item.endpoint === 'string') {
      locations.push({ logicalLocations: [{ fullyQualifiedName: item.endpoint }] });
    }
  }
  for (const ref of finding.codeRefs ?? []) {
    locations.push({
      physicalLocation: {
        artifactLocation: { uri: ref.file.replace(/\\/g, '/') },
        ...(ref.line !== undefined ? { region: { startLine: Math.max(1, ref.line) } } : {}),
      },
    });
  }
  return locations;
}

export function createSarif(summary: RunSummary): Record<string, unknown> {
  const findings = [...summary.findings].sort((left, right) =>
    (left.fingerprint ?? left.id).localeCompare(right.fingerprint ?? right.id),
  );
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId ?? 'unknown'))].sort();
  const ruleIndex = new Map(ruleIds.map((ruleId, index) => [ruleId, index]));

  const rules = ruleIds.map((ruleId) => ({
    id: ruleId,
    name: ruleId,
    shortDescription: { text: ruleId },
  }));

  const results = findings.map((finding) => {
    const ruleId = finding.ruleId ?? 'unknown';
    const locations = targetLocations(finding);
    return {
      ruleId,
      ruleIndex: ruleIndex.get(ruleId),
      level: SEVERITY_TO_LEVEL[finding.severity] ?? 'warning',
      message: {
        text: finding.actual
          ? `${finding.title}: ${finding.actual}`
          : finding.title,
      },
      ...(locations.length > 0 ? { locations } : {}),
      partialFingerprints: {
        nexusFingerprintV2: fingerprintValue(finding),
      },
      properties: {
        confidence: finding.confidence,
        category: finding.category,
        severity: finding.severity,
        lanes: finding.lanes,
        occurrences: finding.occurrences,
        status: finding.status,
        ...(finding.firstSeenRun ? { firstSeenRun: finding.firstSeenRun } : {}),
        ...(finding.lastSeenRun ? { lastSeenRun: finding.lastSeenRun } : {}),
        ...(finding.replay ? { replay: finding.replay.result } : {}),
        ...(finding.provenance ? { provenance: finding.provenance } : {}),
        ...(finding.evidenceSummary ? { evidenceSummary: finding.evidenceSummary } : {}),
        ...(finding.requirements ? { requirements: finding.requirements } : {}),
      },
    };
  });

  return {
    $schema:
      'https://docs.oasis-open.org/sarif/sarif/v2.1.0/cs01/schemas/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nexus-portal',
            version: '0.1.0',
            informationUri: 'https://github.com/Fairuza050894/nexus-portal',
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: summary.run.status === 'complete',
            startTimeUtc: summary.run.startedAt,
            endTimeUtc: summary.run.finishedAt,
            ...(summary.run.status !== 'complete'
              ? { toolExecutionNotifications: [] }
              : {}),
          },
        ],
        results,
        properties: {
          runId: summary.run.id,
          mode: summary.run.mode,
          scope: summary.run.scope,
          gate: summary.gate.decision,
        },
      },
    ],
  };
}

export function serializeSarif(summary: RunSummary): string {
  return `${JSON.stringify(createSarif(summary), null, 2)}\n`;
}
