import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import type { AppMap } from '@nexus/app-map';
import type { DiscoveryResult, RepoAnalysis } from '@nexus/discover';
import type { SessionResult } from '@nexus/session';
import { planLanes } from '../src/plan.js';
import { runApiLane } from '../src/api.js';
import { runRepoLane } from '../src/repo.js';
import { runE2eLane } from '../src/e2e.js';
import { runA11yLane } from '../src/a11y.js';
import { runSecurityLane } from '../src/security.js';
import { runPerfLane } from '../src/perf.js';
import { runLanes } from '../src/scheduler.js';
import type { LaneContext } from '../src/types.js';

const runDir = mkdtempSync(join(tmpdir(), 'qa-lanes-'));

afterAll(() => {
  rmSync(runDir, { recursive: true, force: true });
});

const emptyDiscovery: DiscoveryResult = {
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
};

function context(overrides: Partial<LaneContext> = {}): LaneContext {
  const request = RunRequestSchema.parse({
    name: 'lane test',
    mode: 'sandbox',
    repo: { localPath: 'fixtures/sample-todo-api' },
    web: { urls: ['http://127.0.0.1:3100/'] },
    lanes: { repo: true, e2e: true, a11y: true, security: true, perf: true },
  });
  const config = QaConfigSchema.parse({
    env: 'test',
    modes: ['sandbox'],
    allowlist: ['127.0.0.1'],
  });
  return {
    runId: 'run-test',
    runDir,
    mode: 'sandbox',
    scope: 'quick',
    request,
    config,
    discovery: emptyDiscovery,
    appMap: {
      schemaVersion: '1.0',
      generatedAt: '',
      nodes: [],
      edges: [],
      stats: {
        pages: 0,
        endpoints: 0,
        code: 0,
        edges: 0,
        highRisk: 0,
        changed: 0,
      },
    },
    ...overrides,
  };
}

function repoAnalysis(overrides: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    stack: 'node',
    changedFiles: [],
    codeOwners: [],
    routes: [],
    pageRoutes: [],
    testFiles: [],
    dependencyFiles: ['package.json'],
    licenseFiles: [],
    secretFindings: [],
    filesScanned: 3,
    warnings: [],
    ...overrides,
  };
}

const session: SessionResult = {
  browserVersion: 'test',
  warnings: [],
  durationMs: 10,
  pages: [
    {
      url: 'http://127.0.0.1:3100/',
      path: '/',
      title: 'Home',
      status: 200,
      forms: 1,
      consoleErrors: ['console boom'],
      pageErrors: ['page boom'],
      failedRequests: [],
      serverErrors: [],
      a11y: {
        violations: [
          {
            id: 'image-alt',
            impact: 'critical',
            description: 'Images must have alternate text',
            help: 'Provide alt text',
            helpUrl: 'https://example.test/image-alt',
            nodes: [{ target: ['img'] }],
          },
        ],
        critical: 1,
        serious: 0,
        total: 1,
      },
      vitals: { lcpMs: 5000, cls: 0.3, ttfbMs: 100 },
      security: {
        headers: {},
        missingHeaders: ['content-security-policy'],
        insecureCookies: ['session'],
        mixedContent: ['http://cdn.example.test/app.js'],
      },
      durationMs: 10,
    },
  ],
};

describe('lane planning', () => {
  it('selects capability defaults and keeps visual unsupported', () => {
    const request = RunRequestSchema.parse({
      name: 'defaults',
      mode: 'sandbox',
      repo: { localPath: 'fixtures/sample-todo-api' },
      web: { urls: ['http://127.0.0.1:3100/'] },
      api: { baseUrl: 'http://127.0.0.1:3100' },
    });
    const plan = planLanes(request, emptyDiscovery);
    expect(plan.lanes).toEqual(
      expect.arrayContaining(['repo', 'api', 'e2e', 'a11y', 'security', 'perf']),
    );
    expect(plan.lanes).not.toContain('visual');

    const visual = planLanes(
      RunRequestSchema.parse({
        name: 'visual',
        mode: 'sandbox',
        web: { urls: ['http://127.0.0.1:3100/'] },
        lanes: { visual: true },
      }),
      emptyDiscovery,
    );
    expect(visual.unsupported).toEqual(['visual']);
    expect(visual.lanes).toEqual([]);
  });
});

describe('repo lane', () => {
  it('fails on secrets and reports missing tests/license', () => {
    const result = runRepoLane(
      context(),
      repoAnalysis({
        secretFindings: [{ file: 'config.js', line: 1, kind: 'hardcoded-credential' }],
      }),
    );
    expect(result.status).toBe('failed');
    expect(result.tests.find((test) => test.id === 'TC-REPO-001')?.status).toBe('failed');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          lanes: expect.arrayContaining(['repo']),
        }),
      ]),
    );
    expect(result.tests.filter((test) => test.status === 'skipped').length).toBe(3);
  });
});

describe('browser-derived lanes', () => {
  it('derives E2E, a11y, security, and perf findings from one session', () => {
    const e2e = runE2eLane(context(), session);
    expect(e2e.status).toBe('failed');
    expect(e2e.findings.map((finding) => finding.title)).toEqual(
      expect.arrayContaining(['Uncaught JavaScript error on /', 'Console error on /']),
    );

    const a11y = runA11yLane(context(), session);
    expect(a11y.status).toBe('failed');
    expect(a11y.findings[0]).toMatchObject({ category: 'accessibility', severity: 'critical' });

    const security = runSecurityLane(context(), session);
    expect(security.status).toBe('passed');
    expect(security.findings.map((finding) => finding.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing security header'),
        expect.stringContaining('Mixed content'),
      ]),
    );

    const perf = runPerfLane(context(), session);
    expect(perf.status).toBe('passed');
    expect(perf.findings.map((finding) => finding.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Slow LCP'),
        expect.stringContaining('High layout shift'),
      ]),
    );
  });

  it('reuses an injected session and assigns global finding ids', async () => {
    const result = await runLanes(context({ session }), [
      'repo',
      'e2e',
      'a11y',
      'security',
      'perf',
    ]);
    expect(result.session?.pages).toHaveLength(1);
    expect(result.totals.lanes).toEqual(
      expect.arrayContaining(['repo', 'e2e', 'a11y', 'security', 'perf']),
    );
    const ids = result.findings.map((finding) => finding.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.totals.failed).toBeGreaterThan(0);
  });
});

describe('API lane', () => {
  it('fails when the response does not match the OpenAPI schema', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":"yes"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const base = `http://127.0.0.1:${port}`;
      const request = RunRequestSchema.parse({
        name: 'api',
        mode: 'sandbox',
        api: { baseUrl: base },
        lanes: { api: true },
      });
      const appMap: AppMap = {
        schemaVersion: '1.0',
        generatedAt: '',
        nodes: [
          {
            type: 'endpoint',
            id: 'api:GET /health',
            method: 'GET',
            path: '/health',
            sources: ['spec'],
            changedRecently: false,
            risk: 0.2,
            riskFactors: [],
          },
        ],
        edges: [],
        stats: { pages: 0, endpoints: 1, code: 0, edges: 0, highRisk: 0, changed: 0 },
      };
      const result = await runApiLane(
        context({
          request,
          appMap,
          discovery: {
            ...emptyDiscovery,
            endpoints: [
              {
                method: 'GET',
                path: '/health',
                source: 'spec',
                confidence: 'verified',
                tags: [],
                authRequired: false,
                responseSchemas: {
                  '200': {
                    type: 'object',
                    required: ['ok'],
                    properties: { ok: { type: 'boolean' } },
                  },
                },
              },
            ],
          },
        }),
      );
      expect(result.status).toBe('failed');
      expect(result.tests[0]?.status).toBe('failed');
      expect(result.tests[0]?.actual).toContain('must be boolean');
      expect(result.findings[0]).toMatchObject({
        confidence: 'verified',
        lanes: expect.arrayContaining(['api']),
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('fails the unauthenticated check when an auth-required endpoint returns 200', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const base = `http://127.0.0.1:${port}`;
      const request = RunRequestSchema.parse({
        name: 'api auth',
        mode: 'sandbox',
        api: { baseUrl: base },
        lanes: { api: true },
      });
      const appMap: AppMap = {
        schemaVersion: '1.0',
        generatedAt: '',
        nodes: [
          {
            type: 'endpoint',
            id: 'api:GET /private',
            method: 'GET',
            path: '/private',
            sources: ['spec'],
            changedRecently: false,
            risk: 0.5,
            riskFactors: [],
          },
        ],
        edges: [],
        stats: { pages: 0, endpoints: 1, code: 0, edges: 0, highRisk: 0, changed: 0 },
      };
      const result = await runApiLane(
        context({
          request,
          appMap,
          discovery: {
            ...emptyDiscovery,
            endpoints: [
              {
                method: 'GET',
                path: '/private',
                source: 'spec',
                confidence: 'verified',
                tags: [],
                authRequired: true,
              },
            ],
          },
        }),
      );
      expect(result.status).toBe('failed');
      const unauthorized = result.tests.find((test) => test.name.includes('unauthenticated'));
      expect(unauthorized?.status).toBe('failed');
      expect(result.findings.map((finding) => finding.title)).toEqual(
        expect.arrayContaining([expect.stringContaining('Authentication bypass')]),
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
