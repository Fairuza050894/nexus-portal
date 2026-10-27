import { describe, expect, it } from 'vitest';
import { evaluateGate } from '../src/index.js';
import type { Finding } from '@nexus/core';

describe('packages/gate', () => {
  it('returns GO when all tests pass and no findings exist', () => {
    const result = evaluateGate({
      totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
      findings: [],
    });
    expect(result.decision).toBe('GO');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns NO-GO on verified defect', () => {
    const verifiedFinding: Finding = {
      id: 'F-0001',
      title: 'Assert status 200 failed',
      severity: 'high',
      confidence: 'verified',
      category: 'app-bug',
      lanes: ['api'],
      occurrences: 1,
      evidence: [],
      status: 'new',
    };
    const result = evaluateGate({
      totals: { tests: 10, passed: 9, failed: 1, skipped: 0 },
      findings: [verifiedFinding],
    });
    expect(result.decision).toBe('NO-GO');
    expect(result.reasons.some((r) => r.includes('verified defect'))).toBe(true);
  });

  it('returns NO-GO on critical auto-discovered finding', () => {
    const autoFinding: Finding = {
      id: 'F-0002',
      title: 'Unhandled 500 server crash',
      severity: 'critical',
      confidence: 'auto-discovered',
      category: 'app-bug',
      lanes: ['e2e'],
      occurrences: 1,
      evidence: [],
      status: 'new',
    };
    const result = evaluateGate({
      totals: { tests: 5, passed: 5, failed: 0, skipped: 0 },
      findings: [autoFinding],
    });
    expect(result.decision).toBe('NO-GO');
    expect(result.reasons.some((r) => r.includes('auto-discovered'))).toBe(true);
  });

  it('returns GO WITH RISKS on needs-review or moderate findings, never NO-GO', () => {
    const reviewFinding: Finding = {
      id: 'F-0003',
      title: 'Missing test coverage in auth module',
      severity: 'medium',
      confidence: 'needs-review',
      category: 'quality-debt',
      lanes: ['repo'],
      occurrences: 1,
      evidence: [],
      status: 'new',
    };
    const result = evaluateGate({
      totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
      findings: [reviewFinding],
    });
    expect(result.decision).toBe('GO WITH RISKS');
    expect(result.reasons.some((r) => r.includes('needs-review'))).toBe(true);
  });

  it('returns GO WITH RISKS when tests are skipped', () => {
    const result = evaluateGate({
      totals: { tests: 13, passed: 10, failed: 0, skipped: 3 },
      findings: [],
    });
    expect(result.decision).toBe('GO WITH RISKS');
    expect(result.reasons.some((r) => r.includes('3 test case(s) skipped'))).toBe(true);
  });

  it('returns NO-GO when pipeline is incomplete', () => {
    const result = evaluateGate({
      totals: { tests: 0, passed: 0, failed: 0, skipped: 0 },
      findings: [],
      incomplete: true,
    });
    expect(result.decision).toBe('NO-GO');
    expect(result.reasons.some((r) => r.includes('incomplete'))).toBe(true);
  });

  it('flags low requirement coverage as GO WITH RISKS', () => {
    const result = evaluateGate({
      totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
      findings: [],
      reqCoveragePercent: 50,
    });
    expect(result.decision).toBe('GO WITH RISKS');
    expect(result.reasons.some((r) => r.includes('requirement coverage'))).toBe(true);
    const rule = result.rules.find((item) => item.name === 'requirement_coverage');
    expect(rule?.pass).toBe(false);
  });

  it('does not evaluate requirement coverage when it is unknown', () => {
    const result = evaluateGate({
      totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
      findings: [],
    });
    expect(result.rules.some((item) => item.name === 'requirement_coverage')).toBe(false);
  });
});
