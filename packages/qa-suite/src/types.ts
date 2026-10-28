import type { PlannedTestCase } from '@nexus/planner';

export interface PromotedTest {
  id: string; // TC-<AREA>-<NNN>
  title: string;
  lane: string;
  type: string;
  source: string;
  confidence: 'verified';
  requirements: string[];
  promotedAt: string;
  promotedBy: string;
  verifiedRunsCount: number; // 3
  flakyRate: number; // 0.0
  traceability: {
    requirements: string[];
    target: string;
  };
}

export interface PromotionRequest {
  candidate: PlannedTestCase;
  requestedBy: string;
  runVerificationFn: (testCase: PlannedTestCase, runIndex: number) => Promise<boolean>;
}

export interface PromotionResult {
  promoted: boolean;
  test?: PromotedTest;
  runsPassed: number;
  runsTotal: number;
  error?: string;
}

export interface TraceabilityEntry {
  requirementId: string;
  testCaseIds: string[];
  status: 'covered' | 'uncovered';
}
