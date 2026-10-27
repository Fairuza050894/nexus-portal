import type { BaselineComparisonSummary, Finding } from '@nexus/core';
import {
  findingIdentityKeys,
  isPreV2Finding,
  legacyLooseFindingFingerprint,
  resolveFindingFingerprint,
} from './fingerprint.js';
import type { BaselineComparisonOptions } from './types.js';

export interface BaselineComparisonResult {
  findings: Finding[];
  summary?: BaselineComparisonSummary;
  fixedFindings: Finding[];
  regressedFindings: Finding[];
}

/**
 * Compares the current findings against the previous run and, when supplied,
 * older history.
 *
 * - `recurring`: present in the immediate baseline.
 * - `new`: never seen in the baseline or history.
 * - `regressed`: seen in history, absent from the immediate baseline, and back
 *   now. Without history a reappearing finding cannot be distinguished from a
 *   new one, so it stays `new` instead of being guessed.
 * - `fixed`: present in the baseline but absent from the current run.
 *
 * Fingerprint v2 is the primary identity. A pre-v2 legacy key is also matched so
 * one schema transition does not reclassify every historical finding as new.
 */
export function compareWithBaseline(
  currentFindings: Finding[],
  options: BaselineComparisonOptions = {},
): BaselineComparisonResult {
  const baselineFindings = options.baselineFindings ?? [];
  const history = options.history ?? [];

  // Earliest history run per identity key, so firstSeenRun survives many runs.
  const earliestSeen = new Map<string, string>();
  for (const run of [...history].reverse()) {
    for (const finding of run.findings) {
      const keys = findingIdentityKeys(finding);
      if (isPreV2Finding(finding)) {
        keys.push(`loose:${legacyLooseFindingFingerprint(finding)}`);
      }
      for (const key of keys) {
        if (!earliestSeen.has(key)) earliestSeen.set(key, run.runId);
      }
    }
  }

  const firstSeenFor = (finding: Finding): string | undefined => {
    for (const key of findingIdentityKeys(finding)) {
      const runId = earliestSeen.get(key);
      if (runId) return runId;
    }
    const looseRunId = earliestSeen.get(`loose:${legacyLooseFindingFingerprint(finding)}`);
    return looseRunId;
  };

  if (baselineFindings.length === 0 && !options.baselineRunId && history.length === 0) {
    return {
      findings: currentFindings.map((finding) => ({
        ...finding,
        status: 'new',
        ...(finding.firstSeenRun ?? options.currentRunId
          ? { firstSeenRun: finding.firstSeenRun ?? options.currentRunId }
          : {}),
        ...(options.currentRunId ? { lastSeenRun: options.currentRunId } : {}),
      })),
      fixedFindings: [],
      regressedFindings: [],
    };
  }

  const baselineByKey = new Map<string, Finding>();
  const preV2BaselineByLoose = new Map<string, Finding>();
  for (const finding of baselineFindings) {
    for (const key of findingIdentityKeys(finding)) {
      if (!baselineByKey.has(key)) baselineByKey.set(key, finding);
    }
    if (isPreV2Finding(finding)) {
      preV2BaselineByLoose.set(legacyLooseFindingFingerprint(finding), finding);
    }
  }
  const matchedBaseline = new Set<Finding>();

  const findBaseline = (finding: Finding): Finding | undefined => {
    for (const key of findingIdentityKeys(finding)) {
      const candidate = baselineByKey.get(key);
      if (candidate && !matchedBaseline.has(candidate)) return candidate;
    }
    const looseCandidate = preV2BaselineByLoose.get(legacyLooseFindingFingerprint(finding));
    if (looseCandidate && !matchedBaseline.has(looseCandidate)) return looseCandidate;
    return undefined;
  };

  let newCount = 0;
  let recurringCount = 0;
  let regressedCount = 0;
  const regressedFindings: Finding[] = [];

  const updatedFindings = currentFindings.map((finding): Finding => {
    const baseline = findBaseline(finding);

    if (baseline) {
      matchedBaseline.add(baseline);
      recurringCount += 1;
      const firstSeen =
        baseline.firstSeenRun ?? firstSeenFor(finding) ?? options.baselineRunId;
      return stamp(finding, 'recurring', firstSeen, options.currentRunId);
    }

    const historyFirstSeen = firstSeenFor(finding);
    if (historyFirstSeen) {
      regressedCount += 1;
      const regressed = stamp(finding, 'regressed', historyFirstSeen, options.currentRunId);
      regressedFindings.push(regressed);
      return regressed;
    }

    newCount += 1;
    return stamp(
      finding,
      'new',
      finding.firstSeenRun ?? options.currentRunId,
      options.currentRunId,
    );
  });

  const fixedFindings = baselineFindings
    .filter((finding) => !matchedBaseline.has(finding))
    .map((finding) => ({
      ...finding,
      status: 'fixed' as const,
      lastSeenRun: finding.lastSeenRun ?? options.baselineRunId,
    }));

  const currentPassRate =
    options.currentTotals && options.currentTotals.total > 0
      ? (options.currentTotals.passed / options.currentTotals.total) * 100
      : undefined;
  const baselinePassRate =
    options.baselineTotals && options.baselineTotals.total > 0
      ? (options.baselineTotals.passed / options.baselineTotals.total) * 100
      : undefined;

  const summary: BaselineComparisonSummary = {
    baselineRunId: options.baselineRunId ?? 'previous',
    mode: options.mode ?? 'standard',
    newFindings: newCount,
    recurringFindings: recurringCount,
    fixedFindings: fixedFindings.length,
    regressedFindings: regressedCount,
    ...(currentPassRate !== undefined && baselinePassRate !== undefined
      ? { passRateDelta: Number((currentPassRate - baselinePassRate).toFixed(2)) }
      : {}),
  };

  return { findings: updatedFindings, summary, fixedFindings, regressedFindings };
}

function stamp(
  finding: Finding,
  status: Finding['status'],
  firstSeenRun: string | undefined,
  currentRunId: string | undefined,
): Finding {
  return {
    ...finding,
    fingerprint: resolveFindingFingerprint(finding),
    status,
    ...(firstSeenRun ? { firstSeenRun } : {}),
    ...(currentRunId ? { lastSeenRun: currentRunId } : {}),
  };
}
