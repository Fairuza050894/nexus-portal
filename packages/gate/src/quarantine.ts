import type { RunTestSummary } from '@nexus/core';

export interface QuarantinedTest {
  testId: string;
  ticket: string; // Jira / issue reference
  reason: string;
  quarantinedAt: string;
  expiresAt: string; // ISO date timestamp
  quarantinedBy: string;
}

export function createQuarantineRecord(options: {
  testId: string;
  ticket: string;
  reason: string;
  quarantineDays?: number; // default 14 days
  quarantinedBy: string;
  now?: Date;
}): QuarantinedTest {
  const now = options.now ?? new Date();
  const days = options.quarantineDays ?? 14;
  const expiresMs = now.getTime() + days * 24 * 60 * 60 * 1000;

  return {
    testId: options.testId,
    ticket: options.ticket,
    reason: options.reason,
    quarantinedAt: now.toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    quarantinedBy: options.quarantinedBy,
  };
}

export function isTestQuarantined(
  testId: string,
  quarantineList: QuarantinedTest[],
  now: Date = new Date(),
): boolean {
  const match = quarantineList.find((q) => q.testId === testId);
  if (!match) return false;

  // Hard expiration check: expired quarantine is no longer valid
  const expiresMs = new Date(match.expiresAt).getTime();
  return now.getTime() < expiresMs;
}

export function partitionByQuarantine(
  tests: RunTestSummary[],
  quarantineList: QuarantinedTest[],
  now: Date = new Date(),
): { activeTests: RunTestSummary[]; quarantinedTests: RunTestSummary[] } {
  const activeTests: RunTestSummary[] = [];
  const quarantinedTests: RunTestSummary[] = [];

  for (const test of tests) {
    if (isTestQuarantined(test.id, quarantineList, now)) {
      quarantinedTests.push(test);
    } else {
      activeTests.push(test);
    }
  }

  return { activeTests, quarantinedTests };
}
