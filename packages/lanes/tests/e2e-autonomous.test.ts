import { describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import {
  runAutonomousE2eLane,
  convertJourneyToTestCases,
  type AutonomousJourneyResult,
} from '../src/index.js';
import type { LaneContext } from '../src/types.js';

describe('Autonomous E2E Lane Runner & Journey Converter (Fase 14)', () => {
  const dummyContext: LaneContext = {
    runId: 'RUN-AUTO-E2E-01',
    runDir: '/tmp',
    mode: 'sandbox',
    scope: 'quick',
    request: RunRequestSchema.parse({
      name: 'autonomous e2e test',
      mode: 'sandbox',
      web: { urls: ['http://127.0.0.1:3100/'] },
    }),
    config: QaConfigSchema.parse({ env: 'test' }),
    discovery: {
      pages: [{ url: 'http://127.0.0.1:3100/dashboard', path: '/dashboard' }],
      endpoints: [],
      traffic: [],
      warnings: [],
      crawl: {
        robots: { found: false, rules: 0 },
        budget: { requests: 0, maxRequests: 0, exhausted: false },
        circuit: { open: false },
      },
      auth: { used: false },
    },
    appMap: {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      stats: { pages: 0, endpoints: 0, code: 0, edges: 0, highRisk: 0, changed: 0 },
    },
  };

  it('converts successful autonomous journey into passed test case', () => {
    const journey: AutonomousJourneyResult = {
      journeyName: 'Login and browse checkout',
      startUrl: 'http://127.0.0.1:3100/login',
      finalUrl: 'http://127.0.0.1:3100/dashboard',
      passed: true,
      totalSteps: 3,
      actions: [
        { step: 1, type: 'navigate', target: 'http://127.0.0.1:3100/login', durationMs: 200, status: 'passed' },
        { step: 2, type: 'fill', target: '#email', value: 'user@local.test', durationMs: 50, status: 'passed' },
        { step: 3, type: 'click', target: '#btn-login', value: 'Masuk', durationMs: 120, status: 'passed' },
      ],
      reproduction: [
        '1. Open URL: http://127.0.0.1:3100/login',
        '2. Fill #email with "user@local.test"',
        '3. Click button "Masuk"',
      ],
      anomalies: [],
      errors: [],
      durationMs: 370,
    };

    const { testCases, drafts } = convertJourneyToTestCases(journey, 0);

    expect(testCases.length).toBe(1);
    expect(testCases[0].status).toBe('passed');
    expect(testCases[0].id).toBe('TC-AUTO-E2E-001');
    expect(drafts.length).toBe(0);
  });

  it('creates actionable finding with human reproduction steps when error occurs', () => {
    const journeyWithError: AutonomousJourneyResult = {
      journeyName: 'Checkout order submission',
      startUrl: 'http://127.0.0.1:3100/checkout',
      finalUrl: 'http://127.0.0.1:3100/checkout',
      passed: false,
      totalSteps: 3,
      actions: [
        { step: 1, type: 'navigate', target: 'http://127.0.0.1:3100/checkout', durationMs: 150, status: 'passed' },
        { step: 2, type: 'click', target: '#btn-submit-order', durationMs: 80, status: 'failed', error: 'HTTP 500 Internal Server Error' },
      ],
      reproduction: [
        '1. Open URL: http://127.0.0.1:3100/checkout',
        '2. Click button "Bayar Sekarang"',
        '3. HTTP 500 error returned by API',
      ],
      anomalies: [
        {
          kind: 'broken-image',
          selector: 'img[src="/assets/banner.png"]',
          detail: 'Broken image source failed to load: /assets/banner.png',
        },
      ],
      errors: ['HTTP 500 Internal Server Error on /api/orders'],
      durationMs: 230,
    };

    const { testCases, drafts } = convertJourneyToTestCases(journeyWithError, 1);

    expect(testCases[0].status).toBe('failed');
    expect(drafts.length).toBe(2);

    // 1. Runtime error finding
    const runtimeFinding = drafts.find((d) => d.ruleId === 'e2e-autonomous-runtime-error')!;
    expect(runtimeFinding).toBeDefined();
    expect(runtimeFinding.severity).toBe('high');
    expect(runtimeFinding.reproduction).toContain('2. Click button "Bayar Sekarang"');

    // 2. Visual layout anomaly finding
    const anomalyFinding = drafts.find((d) => d.ruleId === 'visual-anomaly:broken-image')!;
    expect(anomalyFinding).toBeDefined();
    expect(anomalyFinding.actual).toContain('banner.png');
  });

  it('runs autonomous e2e lane with mockRunner and aggregates all test cases', async () => {
    const mockRunner = async (url: string): Promise<AutonomousJourneyResult> => ({
      journeyName: `Mocked autonomous QA on ${url}`,
      startUrl: url,
      finalUrl: url,
      passed: true,
      totalSteps: 2,
      actions: [
        { step: 1, type: 'navigate', target: url, durationMs: 100, status: 'passed' },
        { step: 2, type: 'assert', target: 'body', durationMs: 10, status: 'passed' },
      ],
      reproduction: [`1. Open URL: ${url}`, '2. Assert body rendered'],
      anomalies: [],
      errors: [],
      durationMs: 110,
    });

    const res = await runAutonomousE2eLane(dummyContext, { mockRunner });

    expect(res.status).toBe('passed');
    expect(res.tests.length).toBe(1);
    expect(res.tests[0].status).toBe('passed');
    expect(res.findings.length).toBe(0);
  });
});
