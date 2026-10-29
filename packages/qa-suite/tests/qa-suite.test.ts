import { describe, expect, it } from 'vitest';
import type { PlannedTestCase } from '@nexus/planner';
import { promoteTestCase, TestCatalogue } from '../src/index.js';

describe('QA Suite Test Promotion Pipeline (6.3)', () => {
  const validCandidate: PlannedTestCase = {
    id: 'TC-AUTH-001',
    title: 'Valid authentication verification',
    lane: 'api',
    type: 'api',
    source: 'requirement',
    confidence: 'verified',
    priority: 'critical',
    riskScore: 0.8,
    target: { endpoint: 'POST /api/v1/login' },
    requirements: ['REQ-AUTH-01'],
    assertionType: 'business-requirement',
    estDurationMs: 1500,
    modeCompatibility: 'allowed',
  };

  it('rejects candidate test case with invalid ID convention', async () => {
    const invalidIdCandidate = { ...validCandidate, id: 'invalid_case_id' };
    const result = await promoteTestCase({
      candidate: invalidIdCandidate,
      requestedBy: 'qa-engineer@company.local',
      runVerificationFn: async () => true,
    });
    expect(result.promoted).toBe(false);
    expect(result.error).toContain('does not follow the required convention (TC-<AREA>-<NNN>)');
  });

  it('rejects candidate without verified confidence (no promotion of heuristic tests)', async () => {
    const heuristicCandidate = {
      ...validCandidate,
      confidence: 'needs-review' as const,
      source: 'crawl' as const,
    };
    const result = await promoteTestCase({
      candidate: heuristicCandidate,
      requestedBy: 'qa-engineer@company.local',
      runVerificationFn: async () => true,
    });
    expect(result.promoted).toBe(false);
    expect(result.error).toContain('Only "verified" cases backed by formal requirements');
  });

  it('requires 3x consecutive green passes and rejects flaky candidates', async () => {
    let callCount = 0;
    const flakyVerification = async () => {
      callCount += 1;
      return callCount !== 2; // Fails on run #2
    };

    const result = await promoteTestCase({
      candidate: validCandidate,
      requestedBy: 'qa-lead@company.local',
      runVerificationFn: flakyVerification,
    });

    expect(result.promoted).toBe(false);
    expect(result.runsPassed).toBe(1);
    expect(result.runsTotal).toBe(3);
    expect(result.error).toContain(
      'verification run #2 failed (requires 3x consecutive green passes with 0% flakiness)',
    );
  });

  it('successfully promotes test when 3x green check passes and updates catalogue & traceability', async () => {
    const catalogue = new TestCatalogue();
    let runCounter = 0;
    const greenVerification = async () => {
      runCounter += 1;
      return true;
    };

    const result = await promoteTestCase(
      {
        candidate: validCandidate,
        requestedBy: 'qa-lead@company.local',
        runVerificationFn: greenVerification,
      },
      catalogue,
    );

    expect(result.promoted).toBe(true);
    expect(result.runsPassed).toBe(3);
    expect(runCounter).toBe(3);
    expect(result.test).toBeDefined();
    expect(result.test?.id).toBe('TC-AUTH-001');
    expect(result.test?.verifiedRunsCount).toBe(3);
    expect(result.test?.flakyRate).toBe(0.0);

    // Catalogue verification
    expect(catalogue.has('TC-AUTH-001')).toBe(true);
    expect(catalogue.count()).toBe(1);

    // Traceability matrix
    const matrix = catalogue.buildTraceabilityMatrix(['REQ-AUTH-01', 'REQ-UNCOVERED-99']);
    expect(matrix).toHaveLength(2);

    const authEntry = matrix.find((m) => m.requirementId === 'REQ-AUTH-01');
    expect(authEntry?.status).toBe('covered');
    expect(authEntry?.testCaseIds).toContain('TC-AUTH-001');

    const uncoveredEntry = matrix.find((m) => m.requirementId === 'REQ-UNCOVERED-99');
    expect(uncoveredEntry?.status).toBe('uncovered');
    expect(uncoveredEntry?.testCaseIds).toHaveLength(0);
  });
});
