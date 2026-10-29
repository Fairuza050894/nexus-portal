import { describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import { generateK6Script, runK6LoadLane, type K6ScenarioConfig } from '../src/index.js';
import type { LaneContext } from '../src/types.js';

describe('k6 Load Testing Engine & SLA Thresholds (8.2)', () => {
  function makeContext(
    mode: 'sandbox' | 'staging' | 'prod-safe',
    perfApproved: boolean = false,
  ): LaneContext {
    return {
      runId: 'RUN-K6-01',
      runDir: '/tmp',
      mode,
      scope: 'quick',
      request: RunRequestSchema.parse({
        name: 'k6 test',
        mode,
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization:
          mode !== 'sandbox'
            ? { ownerConfirmed: true, approvedBy: 'Lead', perfApproved }
            : undefined,
      }),
      config: QaConfigSchema.parse({ env: 'test', allowlist: ['127.0.0.1'] }),
      discovery: {
        pages: [],
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
  }

  const sampleScenarios: K6ScenarioConfig[] = [
    {
      scenario: 'Fetch items list',
      endpoint: '/api/v1/items',
      vus: 10,
      duration: '15s',
      p95MaxMs: 400,
      errorRateMaxPercent: 1.0,
    },
  ];

  it('generates valid k6 script with thresholds and checks', () => {
    const script = generateK6Script('http://127.0.0.1:3100', sampleScenarios);
    expect(script).toContain("import http from 'k6/http';");
    expect(script).toContain('p(95)<400');
    expect(script).toContain('rate<0.01');
    expect(script).toContain("http.get('http://127.0.0.1:3100/api/v1/items')");
  });

  it('strictly blocks k6 load testing in prod-safe mode (Mode Guard)', () => {
    const ctx = makeContext('prod-safe', true);
    const result = runK6LoadLane(ctx, sampleScenarios);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('strictly forbidden in prod-safe mode');
  });

  it('requires perfApproved=true in staging mode', () => {
    const ctxUnapproved = makeContext('staging', false);
    const unapprovedResult = runK6LoadLane(ctxUnapproved, sampleScenarios);
    expect(unapprovedResult.status).toBe('skipped');
    expect(unapprovedResult.reason).toContain('requires authorization.perfApproved=true');

    const ctxApproved = makeContext('staging', true);
    const approvedResult = runK6LoadLane(ctxApproved, sampleScenarios);
    expect(approvedResult.status).toBe('passed');
    expect(approvedResult.tests[0].status).toBe('passed');
  });
});
