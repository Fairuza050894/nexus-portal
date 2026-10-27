import type { SessionResult } from '@nexus/session';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

const LCP_LIMIT_MS = 4000;
const TTFB_LIMIT_MS = 1800;
const CLS_LIMIT = 0.25;

export function runPerfLane(_context: LaneContext, session: SessionResult | undefined): LaneResult {
  const startedAt = Date.now();
  if (!session || session.pages.length === 0) {
    return {
      lane: 'perf',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no browser session',
      durationMs: Date.now() - startedAt,
    };
  }

  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  for (const [index, page] of session.pages.entries()) {
    const { lcpMs, cls, ttfbMs } = page.vitals;
    tests.push({
      id: `TC-PERF-${String(index + 1).padStart(3, '0')}`,
      lane: 'perf',
      name: `Web Vitals collected for ${page.path}`,
      status: page.error
        ? 'skipped'
        : lcpMs !== undefined || ttfbMs !== undefined
          ? 'passed'
          : 'skipped',
      durationMs: page.durationMs,
      expected: 'LCP/TTFB measured from normal page load',
      actual: `LCP=${lcpMs ?? 'n/a'}ms, CLS=${cls ?? 'n/a'}, TTFB=${ttfbMs ?? 'n/a'}ms`,
      ...(page.error ? { reason: page.error } : {}),
    });

    if (lcpMs !== undefined && lcpMs > LCP_LIMIT_MS) {
      drafts.push({
        title: `Slow LCP on ${page.path}: ${lcpMs}ms`,
        ruleId: 'vitals-lcp',
        severity: 'medium',
        confidence: 'auto-discovered',
        category: 'performance',
        lane: 'perf',
        affected: [{ page: page.path }],
        expected: `LCP <= ${LCP_LIMIT_MS}ms`,
        actual: `${lcpMs}ms`,
      });
    }
    if (ttfbMs !== undefined && ttfbMs > TTFB_LIMIT_MS) {
      drafts.push({
        title: `Slow TTFB on ${page.path}: ${ttfbMs}ms`,
        ruleId: 'vitals-ttfb',
        severity: 'medium',
        confidence: 'auto-discovered',
        category: 'performance',
        lane: 'perf',
        affected: [{ page: page.path }],
        expected: `TTFB <= ${TTFB_LIMIT_MS}ms`,
        actual: `${ttfbMs}ms`,
      });
    }
    if (cls !== undefined && cls > CLS_LIMIT) {
      drafts.push({
        title: `High layout shift on ${page.path}: ${cls}`,
        ruleId: 'vitals-cls',
        severity: 'medium',
        confidence: 'auto-discovered',
        category: 'performance',
        lane: 'perf',
        affected: [{ page: page.path }],
        expected: `CLS <= ${CLS_LIMIT}`,
        actual: String(cls),
      });
    }
  }

  const allSkipped = tests.length > 0 && tests.every((test) => test.status === 'skipped');
  return {
    lane: 'perf',
    status: allSkipped ? 'skipped' : 'passed',
    tests,
    findings: toFindings(drafts),
    ...(allSkipped ? { reason: 'no Web Vitals collected' } : {}),
    durationMs: Date.now() - startedAt,
  };
}
