import { describe, expect, it } from 'vitest';
import type { AppMap } from '@nexus/app-map';
import {
  createExecutionPlan,
  computeScenarioDiff,

  detectSelfHealingSuggestions,
  generateInvariants,
  generateSpecCases,
  generateCrawlCases,
  generateRepoRouteCases,
  generateRequirementCases,
} from '../src/index.js';

const mockAppMap: AppMap = {
  schemaVersion: '1.0',
  generatedAt: '2026-10-28T00:00:00.000Z',
  nodes: [
    {
      id: 'p-home',
      type: 'page',
      path: '/',
      forms: 0,
      risk: 0.2,
      sources: ['crawl'],
      changedRecently: false,
      riskFactors: [],
    },
    {
      id: 'p-checkout',
      type: 'page',
      path: '/checkout',
      forms: 2,
      risk: 0.7,
      sources: ['crawl'],
      changedRecently: true,
      riskFactors: ['exposure', 'criticality'],
    },
    {
      id: 'ep-health',
      type: 'endpoint',
      path: '/health',
      method: 'GET',
      risk: 0.1,
      sources: ['spec'],
      changedRecently: false,
      riskFactors: [],
    },
    {
      id: 'ep-orders',
      type: 'endpoint',
      path: '/api/v1/orders',
      method: 'POST',
      risk: 0.8,
      sources: ['spec'],
      changedRecently: true,
      riskFactors: ['change', 'criticality'],
    },
    {
      id: 'code-orders-route',
      type: 'code',
      sources: ['repo'],
      changedRecently: true,
      risk: 0.6,
      riskFactors: ['change'],
    },
  ],
  edges: [],
  stats: {
    pages: 2,
    endpoints: 2,
    code: 1,
    edges: 0,
    highRisk: 2,
    changed: 3,
  },
};

describe('Planner Generators (6.1)', () => {
  it('generates invariants with source "invariant" and confidence "verified"', () => {
    const cases = generateInvariants({
      appMap: mockAppMap,
      mode: 'sandbox',
      scope: 'quick',
    });
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.source).toBe('invariant');
      expect(c.confidence).toBe('verified');
      expect(c.modeCompatibility).toBe('allowed');
    }
  });

  it('generates spec cases and blocks mutating endpoints in prod-safe mode', () => {
    const sandboxCases = generateSpecCases({
      appMap: mockAppMap,
      mode: 'sandbox',
      scope: 'quick',
    });
    const postCaseSandbox = sandboxCases.find((c) => c.params?.method === 'POST');
    expect(postCaseSandbox?.modeCompatibility).toBe('allowed');

    const prodCases = generateSpecCases({
      appMap: mockAppMap,
      mode: 'prod-safe',
      scope: 'quick',
    });
    const postCaseProd = prodCases.find((c) => c.params?.method === 'POST');
    expect(postCaseProd?.modeCompatibility).toBe('skipped-by-mode');

    const getCaseProd = prodCases.find((c) => c.params?.method === 'GET');
    expect(getCaseProd?.modeCompatibility).toBe('allowed');
  });

  it('generates crawl cases and assigns "needs-review" to heuristic form checks', () => {
    const crawlCases = generateCrawlCases({
      appMap: mockAppMap,
      mode: 'sandbox',
      scope: 'quick',
    });
    expect(crawlCases.length).toBe(1);
    expect(crawlCases[0].target.page).toBe('/checkout');
    expect(crawlCases[0].confidence).toBe('needs-review');
    expect(crawlCases[0].source).toBe('crawl');
  });

  it('generates repo route cases from AST extracted routes', () => {
    const repoCases = generateRepoRouteCases({
      appMap: mockAppMap,
      mode: 'sandbox',
      scope: 'quick',
    });
    expect(repoCases.length).toBe(1);
    expect(repoCases[0].source).toBe('repo-route');
    expect(repoCases[0].confidence).toBe('auto-discovered');
  });

  it('generates requirement cases with source "requirement" and confidence "verified"', () => {
    const reqCases = generateRequirementCases({
      appMap: mockAppMap,
      mode: 'sandbox',
      scope: 'quick',
      requirements: [
        { id: 'REQ-AUTH-01', title: 'User authentication', area: 'api', severity: 'critical', acceptance: [], tests: [], covered: false },
      ],
    });
    expect(reqCases.length).toBe(1);
    expect(reqCases[0].id).toBe('TC-REQ-001');
    expect(reqCases[0].source).toBe('requirement');
    expect(reqCases[0].confidence).toBe('verified');
    expect(reqCases[0].requirements).toContain('REQ-AUTH-01');
  });
});

describe('Scenario Diff (6.2)', () => {
  it('computes added, modified, and unchanged diffs between existing rows and proposals', () => {
    const existingRows = [
      { id: 'TC-EXISTING-01', scenario: 'Old Title', priority: 'low' },
      { id: 'TC-UNCHANGED-02', scenario: 'Exact Title', priority: 'high' },
    ];

    const proposedCases = [
      {
        id: 'TC-EXISTING-01',
        title: 'New Title',
        priority: 'critical' as const,
        type: 'e2e',
        lane: 'e2e',
        source: 'user' as const,
        confidence: 'verified' as const,
        riskScore: 0.5,
        target: {},
        assertionType: 'invariant' as const,
        estDurationMs: 1000,
        modeCompatibility: 'allowed' as const,
      },
      {
        id: 'TC-UNCHANGED-02',
        title: 'Exact Title',
        priority: 'high' as const,
        type: 'e2e',
        lane: 'e2e',
        source: 'user' as const,
        confidence: 'verified' as const,
        riskScore: 0.5,
        target: {},
        assertionType: 'invariant' as const,
        estDurationMs: 1000,
        modeCompatibility: 'allowed' as const,
      },
      {
        id: 'TC-BRAND-NEW-03',
        title: 'Brand New Scenario',
        priority: 'medium' as const,
        type: 'e2e',
        lane: 'e2e',
        source: 'crawl' as const,
        confidence: 'needs-review' as const,
        riskScore: 0.4,
        target: {},
        assertionType: 'status-check' as const,
        estDurationMs: 2000,
        modeCompatibility: 'allowed' as const,
      },
    ];

    const diff = computeScenarioDiff('e2e', existingRows, proposedCases);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe('TC-BRAND-NEW-03');
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].id).toBe('TC-EXISTING-01');
    expect(diff.modified[0].changes.length).toBeGreaterThan(0);
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe('TC-UNCHANGED-02');
  });
});
describe('Change-Based Selection and Risk Ordering (6.4)', () => {
  it('prioritizes test cases targeting changed files and high-risk nodes first', () => {
    const plan = createExecutionPlan({
      appMap: mockAppMap,
      mode: 'staging',
      scope: 'standard',
      changedFiles: ['/api/v1/orders', 'routes/orders.js'],
      requirements: [
        { id: 'REQ-01', title: 'Orders API', area: 'api', severity: 'critical', acceptance: [], tests: [], covered: false },
        { id: 'REQ-02', title: 'Health probe', area: 'api', severity: 'low', acceptance: [], tests: [], covered: false },
      ],
    });

    expect(plan.cases.length).toBeGreaterThan(0);
    expect(plan.riskOrdering.length).toBe(plan.cases.length);

    // Highest risk case should be at index 0
    const topCase = plan.cases[0];
    expect(topCase.riskScore).toBeGreaterThanOrEqual(0.7);

    // Coverage calculation
    expect(plan.stats.coveragePercent).toBe(100.0);
    expect(plan.uncoveredRequirements).toHaveLength(0);
  });
});

describe('Self-Healing Suggestions (6.5)', () => {
  it('detects status code drift and emits report-only diff suggestions with needs-review', () => {
    const suggestions = detectSelfHealingSuggestions([], [
      {
        id: 'TC-API-DELETE',
        lane: 'api',
        target: 'DELETE /items/1',
        expected: 'status 200 OK',
        actual: 'status 204 No Content',
      },
      {
        id: 'TC-API-GET',
        lane: 'api',
        target: 'GET /items',
        expected: 'status 200 OK',
        actual: 'status 200 OK', // unchanged
      },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].kind).toBe('status-drift');
    expect(suggestions[0].confidence).toBe('needs-review');
    expect(suggestions[0].expected).toBe(200);
    expect(suggestions[0].observed).toBe(204);
    expect(suggestions[0].suggestedPatch).toEqual({ expectedStatus: 204 });
  });
});
