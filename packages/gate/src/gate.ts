import type {
  GateDecision,
  GateEvaluationInput,
  GatePolicy,
  GateResult,
  GateRuleResult,
} from './types.js';

export function evaluateGate(input: GateEvaluationInput, policy: GatePolicy = {}): GateResult {
  const minPassRate = policy.minPassRatePercent ?? 95;
  const maxFlakyRate = policy.maxFlakyRatePercent ?? 2;
  const minReqCoverage = policy.minReqCoveragePercent ?? 80;

  const reasons: string[] = [];
  const rules: GateRuleResult[] = [];

  // 1. Incomplete run check
  if (input.incomplete) {
    reasons.push('run is incomplete: one or more stages failed or were skipped');
    rules.push({
      name: 'pipeline_complete',
      threshold: 'complete',
      actual: 'incomplete',
      pass: false,
      severity: 'critical',
    });
  } else {
    rules.push({
      name: 'pipeline_complete',
      threshold: 'complete',
      actual: 'complete',
      pass: true,
      severity: 'critical',
    });
  }

  // 2. Lane error check
  const laneErrors = (input.lanes ?? []).filter((lane) => lane.status === 'error');
  if (laneErrors.length > 0) {
    const errorDetails = laneErrors.map((l) => `${l.lane}: ${l.reason ?? 'error'}`).join('; ');
    reasons.push(`lane error(s): ${errorDetails}`);
    rules.push({
      name: 'lane_errors',
      threshold: '0 errors',
      actual: `${laneErrors.length} lane(s) in error`,
      pass: false,
      severity: 'critical',
    });
  }

  // 3. Confidence breakdown of findings
  const confidenceCounts = {
    verified: { total: 0, criticalHigh: 0 },
    autoDiscovered: { total: 0, criticalHigh: 0 },
    needsReview: { total: 0, criticalHigh: 0 },
  };

  for (const f of input.findings) {
    const isCriticalHigh = f.severity === 'critical' || f.severity === 'high';
    if (f.confidence === 'verified') {
      confidenceCounts.verified.total++;
      if (isCriticalHigh) confidenceCounts.verified.criticalHigh++;
    } else if (f.confidence === 'auto-discovered') {
      confidenceCounts.autoDiscovered.total++;
      if (isCriticalHigh) confidenceCounts.autoDiscovered.criticalHigh++;
    } else {
      confidenceCounts.needsReview.total++;
      if (isCriticalHigh) confidenceCounts.needsReview.criticalHigh++;
    }
  }

  // 4. Verified failures check (Immediate NO-GO if any failed)
  if (confidenceCounts.verified.total > 0) {
    reasons.push(
      `${confidenceCounts.verified.total} verified defect(s) / test assertion failure(s)`,
    );
    rules.push({
      name: 'verified_defects',
      threshold: '0',
      actual: `${confidenceCounts.verified.total}`,
      pass: false,
      severity: 'critical',
    });
  } else {
    rules.push({
      name: 'verified_defects',
      threshold: '0',
      actual: '0',
      pass: true,
      severity: 'critical',
    });
  }

  // 5. High/critical auto-discovered anomalies check (NO-GO)
  if (confidenceCounts.autoDiscovered.criticalHigh > 0) {
    reasons.push(
      `${confidenceCounts.autoDiscovered.criticalHigh} critical/high auto-discovered anomalie(s)`,
    );
    rules.push({
      name: 'auto_discovered_critical_high',
      threshold: '0',
      actual: `${confidenceCounts.autoDiscovered.criticalHigh}`,
      pass: false,
      severity: 'high',
    });
  } else {
    rules.push({
      name: 'auto_discovered_critical_high',
      threshold: '0',
      actual: '0',
      pass: true,
      severity: 'high',
    });
  }

  // 6. Test pass rate check (evaluated on executed tests: passed + failed)
  const totalTests = input.totals.tests;
  const executedTests = input.totals.passed + input.totals.failed;
  const passedTests = input.totals.passed;
  const actualPassRate = executedTests > 0 ? (passedTests / executedTests) * 100 : 100;
  if (executedTests > 0 && actualPassRate < minPassRate) {
    reasons.push(
      `test pass rate ${actualPassRate.toFixed(1)}% is below threshold of ${minPassRate}%`,
    );
    rules.push({
      name: 'pass_rate',
      threshold: `>= ${minPassRate}%`,
      actual: `${actualPassRate.toFixed(1)}%`,
      pass: false,
      severity: 'high',
    });
  } else {
    rules.push({
      name: 'pass_rate',
      threshold: `>= ${minPassRate}%`,
      actual: `${actualPassRate.toFixed(1)}%`,
      pass: true,
      severity: 'high',
    });
  }

  // 6b. Requirement coverage (only evaluated when requirements are known)
  if (input.reqCoveragePercent !== undefined) {
    const coverage = input.reqCoveragePercent;
    if (coverage < minReqCoverage) {
      reasons.push(
        `requirement coverage ${coverage.toFixed(1)}% is below threshold of ${minReqCoverage}%`,
      );
      rules.push({
        name: 'requirement_coverage',
        threshold: `>= ${minReqCoverage}%`,
        actual: `${coverage.toFixed(1)}%`,
        pass: false,
        severity: 'medium',
      });
    } else {
      rules.push({
        name: 'requirement_coverage',
        threshold: `>= ${minReqCoverage}%`,
        actual: `${coverage.toFixed(1)}%`,
        pass: true,
        severity: 'medium',
      });
    }
  }

  // 7. Flaky rate check
  const flakyCount = input.totals.flaky ?? 0;
  const actualFlakyRate = totalTests > 0 ? (flakyCount / totalTests) * 100 : 0;
  if (actualFlakyRate > maxFlakyRate) {
    reasons.push(`flaky rate ${actualFlakyRate.toFixed(1)}% exceeds threshold of ${maxFlakyRate}%`);
    rules.push({
      name: 'flaky_rate',
      threshold: `<= ${maxFlakyRate}%`,
      actual: `${actualFlakyRate.toFixed(1)}%`,
      pass: false,
      severity: 'medium',
    });
  } else {
    rules.push({
      name: 'flaky_rate',
      threshold: `<= ${maxFlakyRate}%`,
      actual: `${actualFlakyRate.toFixed(1)}%`,
      pass: true,
      severity: 'medium',
    });
  }

  // 8. Skipped tests / lanes (Produces GO WITH RISKS)
  const skippedLanes = (input.lanes ?? []).filter((lane) => lane.status === 'skipped');
  if (skippedLanes.length > 0) {
    reasons.push(`skipped lane(s): ${skippedLanes.map((l) => l.lane).join(', ')}`);
  }
  if (input.totals.skipped > 0) {
    reasons.push(`${input.totals.skipped} test case(s) skipped`);
  }
  if (confidenceCounts.needsReview.total > 0) {
    reasons.push(`${confidenceCounts.needsReview.total} finding(s) marked needs-review`);
  }
  if (confidenceCounts.autoDiscovered.total > confidenceCounts.autoDiscovered.criticalHigh) {
    const moderateAuto =
      confidenceCounts.autoDiscovered.total - confidenceCounts.autoDiscovered.criticalHigh;
    reasons.push(`${moderateAuto} moderate auto-discovered finding(s)`);
  }
  if (totalTests === 0 && !input.incomplete) {
    reasons.push('no automated tests were executed');
  }

  // Decision determination:
  // NO-GO if: incomplete, lane errors, verified failures, auto-discovered high/critical, or pass rate < 95%
  const hasNoGo =
    input.incomplete ||
    laneErrors.length > 0 ||
    confidenceCounts.verified.total > 0 ||
    confidenceCounts.autoDiscovered.criticalHigh > 0 ||
    (totalTests > 0 && actualPassRate < minPassRate);

  let decision: GateDecision = 'GO';
  if (hasNoGo) {
    decision = 'NO-GO';
  } else if (reasons.length > 0) {
    decision = 'GO WITH RISKS';
  }

  return {
    decision,
    reasons: [...new Set(reasons)],
    rules,
    confidenceCounts,
  };
}
