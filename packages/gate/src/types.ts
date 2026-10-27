import type { Finding } from '@nexus/core';

export type GateDecision = 'GO' | 'GO WITH RISKS' | 'NO-GO';

export interface GateRuleResult {
  name: string;
  threshold: string;
  actual: string;
  pass: boolean;
  severity: 'critical' | 'high' | 'medium';
}

export interface GatePolicy {
  minPassRatePercent?: number; // default: 95
  maxFlakyRatePercent?: number; // default: 2
  allowSchemaViolations?: boolean; // default: false (0 schema violations)
  allowCriticalA11y?: boolean; // default: false (0 critical/serious a11y)
  minReqCoveragePercent?: number; // default: 80
  allowIncomplete?: boolean; // default: false
}

export interface GateEvaluationInput {
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky?: number;
  };
  findings: Finding[];
  lanes?: Array<{ lane: string; status: string; reason?: string }>;
  incomplete?: boolean;
  limitations?: string[];
  reqCoveragePercent?: number;
}

export interface GateResult {
  decision: GateDecision;
  reasons: string[];
  rules: GateRuleResult[];
  confidenceCounts: {
    verified: { total: number; criticalHigh: number };
    autoDiscovered: { total: number; criticalHigh: number };
    needsReview: { total: number; criticalHigh: number };
  };
}
