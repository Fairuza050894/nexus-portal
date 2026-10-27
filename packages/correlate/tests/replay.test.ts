import { describe, expect, it } from 'vitest';
import type { Finding } from '@nexus/core';
import {
  applyReplayOutcome,
  promoteConfirmedFinding,
  replayAndRecord,
  replayFinding,
} from '../src/index.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    title: 'GET /orders returned 500',
    ruleId: 'api-contract:GET:/orders',
    severity: 'high',
    confidence: 'auto-discovered',
    category: 'app-bug',
    lanes: ['api'],
    occurrences: 1,
    affected: [{ endpoint: 'GET /orders' }],
    evidence: [{ type: 'api', url: 'http://127.0.0.1:3100/orders', status: 500 }],
    expected: 'status in [200] + schema match',
    actual: 'status=500',
    status: 'new',
    ...overrides,
  };
}

describe('false-positive replay', () => {
  it('confirms an API failure when the stored request still mismatches', async () => {
    const outcome = await replayFinding(finding(), {
      executor: { api: async () => ({ status: 500 }) },
    });
    expect(outcome.result).toBe('confirmed');
    expect(outcome.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'replay', observedStatus: 500 })]),
    );
  });

  it('returns not-reproduced when the API now matches the expected status', async () => {
    const outcome = await replayFinding(finding(), {
      executor: { api: async () => ({ status: 200 }) },
    });
    expect(outcome.result).toBe('not-reproduced');
  });

  it('returns inconclusive without a stored URL, expected status, or executor', async () => {
    const noUrl = await replayFinding(finding({ evidence: [] }), {
      executor: { api: async () => ({ status: 500 }) },
    });
    expect(noUrl.result).toBe('inconclusive');

    const noExpected = await replayFinding(finding({ expected: undefined }), {
      executor: { api: async () => ({ status: 500 }) },
    });
    expect(noExpected.result).toBe('inconclusive');

    const noExecutor = await replayFinding(finding());
    expect(noExecutor.result).toBe('inconclusive');
  });

  it('replays e2e findings through an injected adapter', async () => {
    const e2e = finding({
      lanes: ['e2e'],
      title: 'Checkout button failed',
      evidence: [{ type: 'screenshot', path: 'evidence/session/checkout.png' }],
    });
    const reproduced = await replayFinding(e2e, {
      executor: { e2e: async () => ({ matched: false }) },
    });
    expect(reproduced.result).toBe('confirmed');

    const notReproduced = await replayFinding(e2e, {
      executor: { e2e: async () => ({ matched: true }) },
    });
    expect(notReproduced.result).toBe('not-reproduced');
  });

  it('returns inconclusive for lanes without executable replay', async () => {
    const repo = finding({ lanes: ['repo'], category: 'quality-debt', ruleId: 'repo-license-missing' });
    const outcome = await replayFinding(repo, {
      executor: { api: async () => ({ status: 500 }), e2e: async () => ({ matched: false }) },
    });
    expect(outcome.result).toBe('inconclusive');
    expect(outcome.reason).toContain('no executable replay');
  });

  it('redacts executor errors', async () => {
    const outcome = await replayFinding(finding(), {
      executor: {
        api: async () => {
          throw new Error('request failed with token ghp_123456789012345678901234567890123456');
        },
      },
    });
    expect(outcome.result).toBe('inconclusive');
    expect(outcome.reason).not.toContain('ghp_123456789012345678901234567890123456');
  });

  it('records replay result and evidence without changing confidence by itself', async () => {
    const outcome = await replayFinding(finding(), {
      executor: { api: async () => ({ status: 500 }) },
    });
    const applied = applyReplayOutcome(finding(), outcome, {
      runId: 'run-1',
      checkedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(applied.replay).toMatchObject({
      result: 'confirmed',
      runId: 'run-1',
      checkedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(applied.confidence).toBe('auto-discovered');
  });

  it('promotes to verified only when replay is confirmed and an assertion source exists', () => {
    const confirmedNoRequirement = applyReplayOutcome(
      finding(),
      { result: 'confirmed', evidence: [] },
      { checkedAt: '2026-10-27T00:00:00.000Z' },
    );
    expect(promoteConfirmedFinding(confirmedNoRequirement).confidence).toBe('auto-discovered');

    const confirmedWithRequirement = applyReplayOutcome(
      finding({ requirements: ['REQ-ORDERS-01'] }),
      { result: 'confirmed', evidence: [] },
      { checkedAt: '2026-10-27T00:00:00.000Z' },
    );
    expect(promoteConfirmedFinding(confirmedWithRequirement).confidence).toBe('verified');

    const notReproduced = applyReplayOutcome(
      finding({ requirements: ['REQ-ORDERS-01'] }),
      { result: 'not-reproduced', evidence: [] },
      { checkedAt: '2026-10-27T00:00:00.000Z' },
    );
    expect(promoteConfirmedFinding(notReproduced).confidence).toBe('auto-discovered');
  });

  it('replayAndRecord combines outcome, redaction, and promotion rules', async () => {
    const result = await replayAndRecord(
      finding({ requirements: ['REQ-ORDERS-01'] }),
      {
        runId: 'run-2',
        checkedAt: '2026-10-27T00:00:00.000Z',
        executor: { api: async () => ({ status: 500 }) },
      },
    );
    expect(result.replay?.result).toBe('confirmed');
    expect(result.confidence).toBe('verified');
  });
});
