import type { PlanOptions, PlannedTestCase } from './types.js';

export function generateInvariants(options: PlanOptions): PlannedTestCase[] {
  const cases: PlannedTestCase[] = [];
  const pageNodes = options.appMap.nodes.filter((n) => n.type === 'page');
  const targetPages = pageNodes.length > 0 ? pageNodes : [{ id: 'p-root', path: '/', risk: 0.1 }];

  targetPages.forEach((page, idx) => {
    cases.push({
      id: `TC-INV-LOAD-${String(idx + 1).padStart(3, '0')}`,
      title: `Root page navigation and DOM load invariant on ${page.path ?? '/'}`,
      lane: 'e2e',
      type: 'e2e',
      source: 'invariant',
      confidence: 'verified',
      priority: page.risk > 0.5 ? 'critical' : 'high',
      riskScore: page.risk ?? 0.2,
      target: { page: page.path ?? '/' },
      assertionType: 'invariant',
      estDurationMs: 2500,
      modeCompatibility: 'allowed',
      reason: 'Core page navigation invariant (status 200, valid DOM, zero fatal console errors)',
    });

    cases.push({
      id: `TC-INV-A11Y-${String(idx + 1).padStart(3, '0')}`,
      title: `WCAG 2.1 AA root accessibility audit on ${page.path ?? '/'}`,
      lane: 'a11y',
      type: 'a11y',
      source: 'invariant',
      confidence: 'verified',
      priority: 'medium',
      riskScore: 0.2,
      target: { page: page.path ?? '/' },
      assertionType: 'invariant',
      estDurationMs: 1500,
      modeCompatibility: 'allowed',
      reason: 'Standard accessibility compliance invariant',
    });
  });

  cases.push({
    id: 'TC-INV-SEC-001',
    title: 'Passive security headers, cookie flags, and TLS policy invariant',
    lane: 'security',
    type: 'security-passive',
    source: 'invariant',
    confidence: 'verified',
    priority: 'high',
    riskScore: 0.3,
    target: { page: '/' },
    assertionType: 'invariant',
    estDurationMs: 1000,
    modeCompatibility: 'allowed',
    reason: 'Security headers baseline check',
  });

  return cases;
}

export function generateSpecCases(options: PlanOptions): PlannedTestCase[] {
  const cases: PlannedTestCase[] = [];
  const endpointNodes = options.appMap.nodes.filter((n) => n.type === 'endpoint');
  const isProdSafe = options.mode === 'prod-safe';

  endpointNodes.forEach((node, idx) => {
    const method = (node.method ?? 'GET').toUpperCase();
    const path = node.path ?? '/';
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const modeCompatibility = isProdSafe && isStateChanging ? 'skipped-by-mode' : 'allowed';

    cases.push({
      id: `TC-SPEC-${String(idx + 1).padStart(3, '0')}`,
      title: `OpenAPI contract check for ${method} ${path}`,
      lane: 'api',
      type: 'api',
      source: 'spec',
      confidence: 'auto-discovered',
      priority: node.risk > 0.6 ? 'critical' : node.risk > 0.3 ? 'high' : 'medium',
      riskScore: node.risk ?? 0.3,
      target: { endpoint: `${method} ${path}` },
      params: { method, path, expectedStatus: isStateChanging ? 201 : 200 },
      assertionType: 'spec-schema',
      estDurationMs: 1200,
      modeCompatibility,
      reason: `Derived from OpenAPI specification (${method} ${path})`,
    });
  });

  return cases;
}

export function generateCrawlCases(options: PlanOptions): PlannedTestCase[] {
  const cases: PlannedTestCase[] = [];
  const pageNodes = options.appMap.nodes.filter((n) => n.type === 'page');

  pageNodes.forEach((page, idx) => {
    // If page has forms and forms > 0:
    // Heuristic inference without specification or user-defined assertion must carry confidence "needs-review"
    if (page.forms && page.forms > 0) {
      cases.push({
        id: `TC-CRAWL-FORM-${String(idx + 1).padStart(3, '0')}`,
        title: `Heuristic form field submission check on ${page.path ?? '/'}`,
        lane: 'e2e',
        type: 'e2e',
        source: 'crawl',
        confidence: 'needs-review', // Rule: no business assertion without requirement/spec/user row
        priority: 'medium',
        riskScore: page.risk ?? 0.4,
        target: { page: page.path ?? '/' },
        assertionType: 'status-check',
        estDurationMs: 3000,
        modeCompatibility: options.mode === 'prod-safe' ? 'skipped-by-mode' : 'allowed',
        reason:
          'Inferred from detected HTML form elements during crawler traversal; requires human triage',
      });
    }
  });

  return cases;
}

export function generateRepoRouteCases(options: PlanOptions): PlannedTestCase[] {
  const cases: PlannedTestCase[] = [];
  const codeNodes = options.appMap.nodes.filter(
    (n) => n.type === 'code' || n.sources?.includes('repo'),
  );

  codeNodes.forEach((node, idx) => {
    cases.push({
      id: `TC-REPO-${String(idx + 1).padStart(3, '0')}`,
      title: `Route handler integration test for ${node.id}`,
      lane: 'repo',
      type: 'repo',
      source: 'repo-route',
      confidence: 'auto-discovered',
      priority: node.risk > 0.5 ? 'high' : 'medium',
      riskScore: node.risk ?? 0.3,
      target: { component: node.id },
      assertionType: 'status-check',
      estDurationMs: 1800,
      modeCompatibility: 'allowed',
      reason: `Extracted from repository route AST analysis (${node.id})`,
    });
  });

  return cases;
}

export function generateRequirementCases(options: PlanOptions): PlannedTestCase[] {
  const cases: PlannedTestCase[] = [];
  const requirements = options.requirements ?? [];

  requirements.forEach((req, idx) => {
    const lane = req.area === 'e2e' || req.area === 'web' ? 'e2e' : 'api';
    const priority: PlannedTestCase['priority'] = req.severity === 'critical' ? 'critical' : 'high';
    cases.push({
      id: `TC-REQ-${String(idx + 1).padStart(3, '0')}`,
      title: `Verification of requirement ${req.id}: ${req.title}`,
      lane,
      type: lane,
      source: 'requirement',
      confidence: 'verified', // Explicit requirement link confers verified status
      priority,
      riskScore: priority === 'critical' ? 0.9 : 0.6,
      target: {
        component: req.area ?? req.id,
      },
      requirements: [req.id],
      assertionType: 'business-requirement',
      estDurationMs: 2000,
      modeCompatibility: 'allowed',
      reason: `Direct assertion mapped from formal requirement ${req.id}`,
    });
  });

  return cases;
}
