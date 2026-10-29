import { describe, expect, it } from 'vitest';
import {
  classifySignal,
  compareWithBaseline,
  correlateSignals,
  determineConfidence,
} from '../src/index.js';
import type { AppMap } from '@nexus/app-map';

describe('packages/correlate', () => {
  it('classifies signals deterministically', () => {
    expect(classifySignal({ title: 'Connection ECONNREFUSED', lane: 'e2e' })).toBe('environment');
    expect(classifySignal({ title: 'axe rule violation: color-contrast', lane: 'a11y' })).toBe(
      'accessibility',
    );
    expect(
      classifySignal({ title: 'Missing Content-Security-Policy', lane: 'security-passive' }),
    ).toBe('security');
    expect(classifySignal({ title: 'LCP exceeded 2500ms', lane: 'vitals-perf' })).toBe(
      'performance',
    );
    expect(
      classifySignal({
        title: 'GET /api/todos status mismatch: expected 200 got 500',
        lane: 'api',
      }),
    ).toBe('app-bug');
  });

  it('determines confidence based on honesty rules', () => {
    expect(determineConfidence({ lane: 'api', requirements: ['REQ-01'] })).toBe('verified');
    expect(determineConfidence({ lane: 'api', expected: 'status 200' })).toBe('verified');
    expect(determineConfidence({ lane: 'a11y', category: 'accessibility' })).toBe(
      'auto-discovered',
    );
    expect(determineConfidence({ lane: 'repo', category: 'quality-debt' })).toBe('needs-review');
  });

  it('deduplicates repeated violations across pages into one finding with occurrence count', () => {
    const signals = [
      { lane: 'a11y', title: 'a11y: image-alt', page: '/home', actual: 'Missing alt text' },
      { lane: 'a11y', title: 'a11y: image-alt', page: '/about', actual: 'Missing alt text' },
      { lane: 'a11y', title: 'a11y: image-alt', page: '/contact', actual: 'Missing alt text' },
    ];

    const result = correlateSignals(signals);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe('image-alt across 3 pages');
    expect(result.findings[0].occurrences).toBe(3);
    expect(result.findings[0].affected).toHaveLength(3);
    expect(result.findings[0].confidence).toBe('auto-discovered');
  });

  it('correlates multi-lane failure using Application Map edges', () => {
    const appMap: AppMap = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'page:/checkout',
          type: 'page',
          path: '/checkout',
          sources: ['crawl'],
          changedRecently: false,
          risk: 0,
          riskFactors: [],
        },
        {
          id: 'endpoint:post_/orders',
          type: 'endpoint',
          path: '/orders',
          method: 'POST',
          sources: ['openapi'],
          changedRecently: true,
          risk: 10,
          riskFactors: ['change'],
        },
        {
          id: 'code:src/orders.ts',
          type: 'code',
          path: 'src/orders.ts',
          codeRef: 'src/orders.ts',
          sources: ['repo'],
          changedRecently: true,
          risk: 12,
          riskFactors: ['change'],
        },
      ],
      edges: [
        {
          from: 'page:/checkout',
          to: 'endpoint:post_/orders',
          kind: 'calls',
          confidence: 'verified',
        },
        {
          from: 'endpoint:post_/orders',
          to: 'code:src/orders.ts',
          kind: 'implemented-by',
          confidence: 'auto-discovered',
        },
      ],
      stats: { pages: 1, endpoints: 1, code: 1, edges: 2, highRisk: 0, changed: 2 },
    };

    const signals = [
      {
        lane: 'e2e',
        title: 'Checkout button submission failed',
        page: '/checkout',
        evidence: [{ type: 'screenshot', path: 'checkout-err.png' }],
      },
      {
        lane: 'api',
        title: 'POST /orders failed with 500',
        endpoint: 'POST /orders',
        evidence: [{ type: 'network', status: 500 }],
      },
    ];

    const result = correlateSignals(signals, { appMap });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].lanes).toContain('e2e');
    expect(result.findings[0].lanes).toContain('api');
    expect(result.findings[0].evidence).toHaveLength(2);
    expect(result.findings[0].codeRefs).toBeDefined();
    expect(result.findings[0].codeRefs?.[0].file).toBe('src/orders.ts');
  });

  it('compares findings against baseline correctly', () => {
    const baselineFindings = [
      {
        id: 'F-0001',
        title: 'a11y: color-contrast',
        category: 'accessibility',
        severity: 'medium' as const,
        confidence: 'auto-discovered' as const,
        lanes: ['a11y'],
        occurrences: 1,
        evidence: [],
        status: 'new',
      },
      {
        id: 'F-0002',
        title: 'Old bug',
        category: 'app-bug',
        severity: 'high' as const,
        confidence: 'verified' as const,
        lanes: ['api'],
        occurrences: 1,
        evidence: [],
        status: 'new',
      },
    ];

    const currentFindings = [
      {
        id: 'F-0001',
        title: 'a11y: color-contrast',
        category: 'accessibility',
        severity: 'medium' as const,
        confidence: 'auto-discovered' as const,
        lanes: ['a11y'],
        occurrences: 1,
        evidence: [],
        status: 'new',
      },
      {
        id: 'F-0003',
        title: 'Brand new bug',
        category: 'app-bug',
        severity: 'critical' as const,
        confidence: 'verified' as const,
        lanes: ['e2e'],
        occurrences: 1,
        evidence: [],
        status: 'new',
      },
    ];

    const { findings, summary, fixedFindings } = compareWithBaseline(currentFindings, {
      baselineFindings,
      baselineRunId: 'run-prev',
      currentRunId: 'run-now',
      baselineTotals: { passed: 8, total: 10 },
      currentTotals: { passed: 10, total: 10 },
    });

    expect(findings.find((f) => f.title === 'a11y: color-contrast')?.status).toBe('recurring');
    expect(findings.find((f) => f.title === 'a11y: color-contrast')?.firstSeenRun).toBe('run-prev');
    expect(findings.find((f) => f.title === 'Brand new bug')?.status).toBe('new');
    expect(findings.every((f) => f.lastSeenRun === 'run-now')).toBe(true);
    expect(fixedFindings).toHaveLength(1);
    expect(fixedFindings[0].title).toBe('Old bug');
    expect(fixedFindings[0].status).toBe('fixed');
    expect(summary?.newFindings).toBe(1);
    expect(summary?.recurringFindings).toBe(1);
    expect(summary?.fixedFindings).toBe(1);
    expect(summary?.regressedFindings).toBe(0);
    expect(summary?.passRateDelta).toBe(20);
  });

  it('marks a finding that disappeared and returned as regressed', () => {
    const oldFinding = {
      id: 'F-0001',
      title: 'Intermittent checkout timeout',
      category: 'app-bug',
      severity: 'high' as const,
      confidence: 'verified' as const,
      lanes: ['e2e'],
      occurrences: 1,
      evidence: [],
      status: 'new' as const,
    };
    const current = { ...oldFinding, id: 'F-0009', status: 'new' as const };

    const result = compareWithBaseline([current], {
      baselineFindings: [],
      baselineRunId: 'run-prev',
      currentRunId: 'run-now',
      history: [{ runId: 'run-old', findings: [oldFinding] }],
    });

    expect(result.findings[0].status).toBe('regressed');
    expect(result.findings[0].firstSeenRun).toBe('run-old');
    expect(result.summary?.regressedFindings).toBe(1);
  });
});
