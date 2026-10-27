import { describe, expect, it } from 'vitest';
import type { Finding } from '@nexus/core';
import {
  applyReplayOutcome,
  buildEvidenceSummary,
  correlateSignals,
  importSarifFindings,
  promoteConfirmedFinding,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    title: 'GET /orders returned 500',
    ruleId: 'api-contract:GET:/orders',
    severity: 'high',
    confidence: 'auto-discovered',
    category: 'app-bug',
    lanes: ['api', 'e2e'],
    occurrences: 2,
    affected: [{ endpoint: 'GET /orders/123' }, { page: '/orders/456' }],
    evidence: [
      { type: 'network', status: 500 },
      { type: 'screenshot', path: 'evidence/session/orders.png' },
    ],
    expected: 'status 200',
    actual: 'status=500',
    status: 'new',
    ...overrides,
  };
}

describe('deterministic evidence summary', () => {
  it('is stable across affected/evidence order and includes the observable facts', () => {
    const first = finding();
    const reordered = finding({
      affected: [{ page: '/orders/999' }, { endpoint: 'GET /orders/777' }],
      evidence: [
        { type: 'screenshot', path: 'evidence/session/orders.png' },
        { type: 'network', status: 500 },
      ],
    });
    const summary = buildEvidenceSummary(first);
    expect(buildEvidenceSummary(reordered)).toBe(summary);
    expect(summary).toContain('high app-bug (auto-discovered)');
    expect(summary).toContain('rule api-contract:GET:/orders');
    expect(summary).toContain('targets');
    expect(summary).toContain('observed 2x');
    expect(summary).toContain('evidence network, screenshot');
    expect(summary).toContain('expected status 200');
    expect(summary).toContain('actual status=500');
    expect(summary).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts secrets in summarized values', () => {
    const summary = buildEvidenceSummary(
      finding({ actual: 'failed with ghp_123456789012345678901234567890123456' }),
    );
    expect(summary).not.toContain('ghp_123456789012345678901234567890123456');
    expect(summary).toContain('TOKEN_REDACTED');
  });

  it('records replay and refreshed confidence', () => {
    const replayed = applyReplayOutcome(
      finding({ requirements: ['REQ-ORDERS-01'] }),
      { result: 'confirmed', evidence: [] },
      { checkedAt: '2026-10-27T00:00:00.000Z' },
    );
    expect(replayed.evidenceSummary).toContain('replay confirmed');
    const promoted = promoteConfirmedFinding(replayed);
    expect(promoted.confidence).toBe('verified');
    expect(promoted.evidenceSummary).toContain('(verified)');
  });

  it('populates summaries in correlated and external findings', () => {
    const correlated = correlateSignals([
      {
        lane: 'api',
        title: 'GET /orders contract mismatch',
        ruleId: 'api-contract:GET:/orders',
        endpoint: 'GET /orders',
        affected: [{ endpoint: 'GET /orders' }],
        occurrences: 2,
      },
    ]);
    expect(correlated.findings[0].evidenceSummary).toContain('rule api-contract:get:/orders');

    const sarif = JSON.parse(
      readFileSync(join(import.meta.dirname, 'fixtures', 'semgrep.sarif'), 'utf8'),
    ) as unknown;
    const external = importSarifFindings(sarif);
    expect(external.every((item) => item.evidenceSummary?.includes('tool Semgrep'))).toBe(true);
  });
});
