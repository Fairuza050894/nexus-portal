import { redactString, redactValue, type Finding, type ReplayResult } from '@nexus/core';
import { withEvidenceSummary } from './evidence-summary.js';

export interface ReplayObservation {
  /** Observed HTTP status for API findings. */
  status?: number;
  /** Explicit match result for e2e adapters. */
  matched?: boolean;
  evidence?: Array<Record<string, unknown>>;
  error?: string;
}

export interface ReplayExecutor {
  api?: (finding: Finding, target: { url: string }) => Promise<ReplayObservation>;
  e2e?: (finding: Finding) => Promise<ReplayObservation>;
}

export interface ReplayOptions {
  executor?: ReplayExecutor;
  runId?: string;
  checkedAt?: string;
}

export interface ReplayOutcome {
  result: ReplayResult;
  evidence: Array<Record<string, unknown>>;
  reason?: string;
}

function apiUrl(finding: Finding): string | undefined {
  for (const item of finding.evidence) {
    if (item.type === 'api' && typeof item.url === 'string') return item.url;
    if (typeof item.url === 'string' && finding.lanes.includes('api')) return item.url;
  }
  return undefined;
}

function expectedStatuses(expected: string | undefined): {
  codes: number[];
  below400: boolean;
} {
  const codes = expected
    ? [...expected.matchAll(/\b([1-5]\d{2})\b/g)].map((match) => Number(match[1]))
    : [];
  return { codes, below400: Boolean(expected?.includes('status <400')) };
}

function mismatchReason(finding: Finding, status: number | undefined): string {
  const expected = expectedStatuses(finding.expected);
  if (status === undefined) return 'adapter returned no observable status';
  if (expected.below400) return `observed HTTP ${status}, expected <400`;
  if (expected.codes.length > 0) {
    return `observed HTTP ${status}, expected one of ${expected.codes.join(', ')}`;
  }
  return 'no expected status was recorded';
}

async function replayApi(finding: Finding, executor: ReplayExecutor): Promise<ReplayOutcome> {
  const url = apiUrl(finding);
  if (!url) {
    return { result: 'inconclusive', evidence: [], reason: 'no stored API request URL' };
  }
  if (!executor.api) {
    return {
      result: 'inconclusive',
      evidence: [],
      reason: 'no API replay executor was provided',
    };
  }
  const expected = expectedStatuses(finding.expected);
  if (expected.codes.length === 0 && !expected.below400) {
    return {
      result: 'inconclusive',
      evidence: [],
      reason: 'no expected status was recorded',
    };
  }

  try {
    const observation = await executor.api(finding, { url });
    if (observation.error) {
      return {
        result: 'inconclusive',
        evidence: observation.evidence ?? [],
        reason: `replay executor error: ${redactString(observation.error)}`,
      };
    }
    if (observation.status === undefined) {
      return {
        result: 'inconclusive',
        evidence: observation.evidence ?? [],
        reason: mismatchReason(finding, observation.status),
      };
    }

    const reproduced = expected.below400
      ? observation.status >= 400
      : !expected.codes.includes(observation.status);
    const evidence = [
      ...(observation.evidence ?? []),
      {
        type: 'replay',
        adapter: 'api',
        url,
        expected: finding.expected,
        observedStatus: observation.status,
      },
    ];
    return {
      result: reproduced ? 'confirmed' : 'not-reproduced',
      evidence: redactValue(evidence) as Array<Record<string, unknown>>,
      reason: mismatchReason(finding, observation.status),
    };
  } catch (error) {
    return {
      result: 'inconclusive',
      evidence: [],
      reason: `replay executor error: ${redactString((error as Error).message)}`,
    };
  }
}

async function replayE2e(finding: Finding, executor: ReplayExecutor): Promise<ReplayOutcome> {
  if (!executor.e2e) {
    return {
      result: 'inconclusive',
      evidence: [],
      reason: 'no e2e replay executor was provided',
    };
  }
  try {
    const observation = await executor.e2e(finding);
    if (observation.error) {
      return {
        result: 'inconclusive',
        evidence: observation.evidence ?? [],
        reason: `replay executor error: ${redactString(observation.error)}`,
      };
    }
    if (observation.matched === undefined) {
      return {
        result: 'inconclusive',
        evidence: observation.evidence ?? [],
        reason: 'e2e adapter returned no match result',
      };
    }
    const evidence = redactValue([
      ...(observation.evidence ?? []),
      { type: 'replay', adapter: 'e2e', matched: observation.matched },
    ]) as Array<Record<string, unknown>>;
    return {
      result: observation.matched ? 'not-reproduced' : 'confirmed',
      evidence,
      reason: observation.matched
        ? 'stored e2e steps produced the expected result'
        : 'stored e2e steps reproduced the failure',
    };
  } catch (error) {
    return {
      result: 'inconclusive',
      evidence: [],
      reason: `replay executor error: ${redactString((error as Error).message)}`,
    };
  }
}

/**
 * Replays a stored finding. Only e2e/api findings with stored evidence can be
 * replayed; every other lane is honestly `inconclusive`. No network or browser
 * is used unless the caller injects an executor.
 */
export async function replayFinding(
  finding: Finding,
  options: ReplayOptions = {},
): Promise<ReplayOutcome> {
  const lane = finding.lanes[0];
  if (lane === 'api') return replayApi(finding, options.executor ?? {});
  if (lane === 'e2e') return replayE2e(finding, options.executor ?? {});
  return {
    result: 'inconclusive',
    evidence: [],
    reason: `lane ${lane ?? 'unknown'} has no executable replay`,
  };
}

export function applyReplayOutcome(
  finding: Finding,
  outcome: ReplayOutcome,
  options: { runId?: string; checkedAt?: string } = {},
): Finding {
  return withEvidenceSummary({
    ...finding,
    replay: {
      result: outcome.result,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      evidence: outcome.evidence,
      ...(options.runId ? { runId: options.runId } : {}),
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    },
  });
}

/**
 * Promotes to `verified` only when replay is confirmed **and** the finding has an
 * external assertion source (requirement/spec/user row). Replay alone is
 * evidence, not business intent.
 */
export function promoteConfirmedFinding(finding: Finding): Finding {
  const hasAssertionSource = (finding.requirements?.length ?? 0) > 0;
  if (
    finding.replay?.result === 'confirmed' &&
    hasAssertionSource &&
    finding.confidence !== 'verified'
  ) {
    return withEvidenceSummary({ ...finding, confidence: 'verified' });
  }
  return finding;
}

export async function replayAndRecord(
  finding: Finding,
  options: ReplayOptions = {},
): Promise<Finding> {
  const outcome = await replayFinding(finding, options);
  return promoteConfirmedFinding(
    applyReplayOutcome(finding, outcome, {
      ...(options.runId ? { runId: options.runId } : {}),
      ...(options.checkedAt ? { checkedAt: options.checkedAt } : {}),
    }),
  );
}
