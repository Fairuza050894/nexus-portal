import { describe, expect, it } from 'vitest';
import type { RunTestSummary } from '@nexus/core';
import {
  createQuarantineRecord,
  isTestQuarantined,
  partitionByQuarantine,
  type QuarantinedTest,
} from '../src/index.js';

describe('Flaky Test Review & Quarantine Engine (9.3)', () => {
  it('creates quarantine record with ticket reference, reason, and 14-day expiry date', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const record = createQuarantineRecord({
      testId: 'TC-E2E-FLAKY',
      ticket: 'QA-5501',
      reason: 'Flaky network timeout on external third party payment gateway in staging',
      quarantineDays: 14,
      quarantinedBy: 'qa-lead@company.local',
      now,
    });

    expect(record.testId).toBe('TC-E2E-FLAKY');
    expect(record.ticket).toBe('QA-5501');
    expect(record.quarantinedBy).toBe('qa-lead@company.local');
    expect(record.expiresAt).toBe('2026-10-15T00:00:00.000Z');
  });

  it('honors active quarantine and expires after the expiration window passes', () => {
    const record: QuarantinedTest = {
      testId: 'TC-FLAKY-01',
      ticket: 'DEF-100',
      reason: 'Transient animation timing issue',
      quarantinedAt: '2026-10-01T00:00:00Z',
      expiresAt: '2026-10-15T00:00:00Z',
      quarantinedBy: 'qa@company.local',
    };

    // Active date (e.g. 2026-10-10) -> quarantined
    const activeDate = new Date('2026-10-10T00:00:00Z');
    expect(isTestQuarantined('TC-FLAKY-01', [record], activeDate)).toBe(true);

    // Expired date (e.g. 2026-10-20) -> expired!
    const expiredDate = new Date('2026-10-20T00:00:00Z');
    expect(isTestQuarantined('TC-FLAKY-01', [record], expiredDate)).toBe(false);

    // Unknown test -> false
    expect(isTestQuarantined('TC-OTHER-02', [record], activeDate)).toBe(false);
  });

  it('partitions test suite into active and quarantined tests', () => {
    const tests: RunTestSummary[] = [
      { id: 'TC-01', lane: 'e2e', title: 'Login', status: 'passed', durationMs: 100 },
      { id: 'TC-02', lane: 'api', title: 'Flaky Order API', status: 'failed', durationMs: 200 },
      { id: 'TC-03', lane: 'a11y', title: 'Audit Home', status: 'passed', durationMs: 300 },
    ];

    const quarantineList: QuarantinedTest[] = [
      createQuarantineRecord({
        testId: 'TC-02',
        ticket: 'JIRA-899',
        reason: 'Known backend bug under fix',
        quarantineDays: 7,
        quarantinedBy: 'dev-lead@company.local',
      }),
    ];

    const { activeTests, quarantinedTests } = partitionByQuarantine(tests, quarantineList);
    expect(activeTests.map((t) => t.id)).toEqual(['TC-01', 'TC-03']);
    expect(quarantinedTests.map((t) => t.id)).toEqual(['TC-02']);
  });
});
