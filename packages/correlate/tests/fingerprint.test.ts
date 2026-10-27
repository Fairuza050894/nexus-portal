import { describe, expect, it } from 'vitest';
import type { Finding } from '@nexus/core';
import {
  compareWithBaseline,
  correlateSignals,
  dedupeFindings,
  findingFingerprint,
  normalizeTarget,
} from '../src/index.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    title: 'Checkout failed',
    ruleId: 'e2e-page-load',
    severity: 'high',
    confidence: 'auto-discovered',
    category: 'app-bug',
    lanes: ['e2e'],
    occurrences: 1,
    affected: [{ page: '/checkout' }],
    evidence: [],
    status: 'new',
    ...overrides,
  };
}

describe('finding fingerprint v2', () => {
  it('is stable across affected order and volatile text', () => {
    const first = finding({
      title: 'Failure at 2026-10-27T08:00:00Z for request req-123',
      affected: [{ page: '/orders/123' }, { endpoint: 'POST /orders/456' }],
    });
    const second = finding({
      title: 'Failure at 2026-10-28T09:10:11Z for request req-999',
      affected: [{ endpoint: 'POST /orders/777' }, { page: '/orders/999' }],
    });

    expect(findingFingerprint(first)).toBe(findingFingerprint(second));
    expect(findingFingerprint(first)).toMatch(/^v2:[0-9a-f]{64}$/);
  });

  it('normalizes numeric ids, uuids, timestamps, tokens, and query strings', () => {
    expect(normalizeTarget('/users/42')).toBe('/users/:id');
    expect(normalizeTarget('https://app.test/users/42?tab=profile#top')).toBe('/users/:id');
    expect(normalizeTarget('/orders/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/orders/:uuid',
    );
    expect(normalizeTarget('/events/2026-10-27T08:00:00Z')).toBe('/events/:timestamp');
    expect(normalizeTarget('/callback/abcdefabcdefabcdefabcdef')).toBe('/callback/:token');
    expect(normalizeTarget('/')).toBe('/');
  });

  it('does not merge the same rule on different targets', () => {
    const checkout = finding({ affected: [{ page: '/checkout' }] });
    const cart = finding({ affected: [{ page: '/cart' }] });
    const apiOrders = finding({ affected: [{ endpoint: 'POST /orders' }] });

    expect(findingFingerprint(checkout)).not.toBe(findingFingerprint(cart));
    expect(findingFingerprint(checkout)).not.toBe(findingFingerprint(apiOrders));
  });

  it('does not merge different rules on the same target', () => {
    const pageLoad = finding({ ruleId: 'e2e-page-load' });
    const consoleError = finding({ ruleId: 'e2e-console-error' });

    expect(findingFingerprint(pageLoad)).not.toBe(findingFingerprint(consoleError));
  });

  it('does not merge different components on the same rule', () => {
    const first = finding({
      category: 'security',
      ruleId: 'secret:api-key',
      affected: [{ component: 'src/api/client.ts' }],
    });
    const second = finding({
      category: 'security',
      ruleId: 'secret:api-key',
      affected: [{ component: 'src/server/config.ts' }],
    });

    expect(findingFingerprint(first)).not.toBe(findingFingerprint(second));
  });

  it('merges duplicate findings with summed occurrences, unioned evidence, and stable ids', () => {
    const first = finding({
      occurrences: 2,
      lanes: ['e2e'],
      affected: [{ page: '/checkout' }, { endpoint: 'POST /orders' }],
      evidence: [{ type: 'screenshot', path: 'a.png' }],
      severity: 'medium',
      confidence: 'auto-discovered',
    });
    const second = finding({
      id: 'F-0002',
      occurrences: 3,
      lanes: ['api'],
      affected: [{ endpoint: 'POST /orders' }, { page: '/checkout' }],
      evidence: [{ type: 'network', status: 500 }, { type: 'screenshot', path: 'a.png' }],
      severity: 'critical',
      confidence: 'verified',
    });

    const merged = dedupeFindings([first, second]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('F-0001');
    expect(merged[0].occurrences).toBe(5);
    expect(merged[0].severity).toBe('critical');
    expect(merged[0].confidence).toBe('verified');
    expect(merged[0].lanes).toEqual(['api', 'e2e']);
    expect(merged[0].affected).toHaveLength(2);
    expect(merged[0].evidence).toHaveLength(2);
    expect(merged[0].fingerprint).toBe(findingFingerprint(first));
  });

  it('collapses repeated a11y rules across pages while keeping per-endpoint app findings separate', () => {
    const a11y = correlateSignals([
      {
        lane: 'a11y',
        title: 'axe image-alt: images need alt',
        ruleId: 'image-alt',
        page: '/home',
        affected: [{ page: '/home' }],
        evidence: [{ rule: 'image-alt' }],
      },
      {
        lane: 'a11y',
        title: 'axe image-alt: images need alt',
        ruleId: 'image-alt',
        page: '/about',
        affected: [{ page: '/about' }],
        evidence: [{ rule: 'image-alt' }],
      },
    ]);
    expect(a11y.findings).toHaveLength(1);
    expect(a11y.findings[0].occurrences).toBe(2);
    expect(a11y.findings[0].affected).toHaveLength(2);

    const api = correlateSignals([
      {
        lane: 'api',
        title: 'POST /orders contract mismatch',
        ruleId: 'api-contract:POST:/orders',
        endpoint: 'POST /orders',
        affected: [{ endpoint: 'POST /orders' }],
      },
      {
        lane: 'api',
        title: 'POST /orders auth bypass',
        ruleId: 'auth-bypass',
        endpoint: 'POST /orders',
        affected: [{ endpoint: 'POST /orders' }],
      },
    ]);
    expect(api.findings).toHaveLength(2);
    expect(api.findings.map((item) => item.ruleId).sort()).toEqual([
      'api-contract:post:/orders',
      'auth-bypass',
    ]);
  });

  it('keeps the same security rule separate per component', () => {
    const secrets = correlateSignals([
      {
        lane: 'repo',
        title: 'Possible api-key in src/api/client.ts',
        ruleId: 'secret:api-key',
        category: 'security',
        affected: [{ component: 'src/api/client.ts' }],
      },
      {
        lane: 'repo',
        title: 'Possible api-key in src/server/config.ts',
        ruleId: 'secret:api-key',
        category: 'security',
        affected: [{ component: 'src/server/config.ts' }],
      },
    ]);

    expect(secrets.findings).toHaveLength(2);
    expect(secrets.findings.map((item) => item.ruleId)).toEqual(['secret:api-key', 'secret:api-key']);
    expect(secrets.findings.every((item) => item.affected?.length === 1)).toBe(true);
  });

  it('uses a normalized title fallback when no rule id exists, ignoring volatile values', () => {
    const first = finding({
      ruleId: undefined,
      title: 'Server error 500 on /checkout at 2026-10-27T08:00:00Z',
      affected: [{ page: '/checkout' }],
    });
    const second = finding({
      ruleId: undefined,
      title: 'Server error 503 on /checkout at 2026-10-28T09:10:11Z',
      affected: [{ page: '/checkout' }],
    });

    expect(findingFingerprint(first)).toBe(findingFingerprint(second));
  });

  it('matches pre-v2 baseline findings through the legacy fallback', () => {
    const legacy = finding({
      id: 'F-0001',
      title: 'Checkout failed',
      ruleId: undefined,
      fingerprint: undefined,
      affected: [{ page: '/checkout' }],
      status: 'new',
    });
    const current = finding({ id: 'F-0009', fingerprint: undefined });

    const result = compareWithBaseline([current], {
      baselineFindings: [legacy],
      baselineRunId: 'run-prev',
      currentRunId: 'run-now',
    });

    expect(result.findings[0].status).toBe('recurring');
    expect(result.findings[0].firstSeenRun).toBe('run-prev');
    expect(result.summary?.recurringFindings).toBe(1);
  });

  it('matches a pre-v2 baseline when the affected list was not recorded before', () => {
    const legacy = finding({
      title: 'Missing security header: x-frame-options',
      category: 'security',
      ruleId: undefined,
      fingerprint: undefined,
      affected: undefined,
      status: 'new',
    });
    const current = finding({
      title: 'Missing security header: x-frame-options',
      category: 'security',
      ruleId: 'missing-security-header:x-frame-options',
      affected: [{ page: '/' }],
      fingerprint: undefined,
    });

    const result = compareWithBaseline([current], {
      baselineFindings: [legacy],
      baselineRunId: 'run-prev',
      currentRunId: 'run-now',
    });

    expect(result.findings[0].status).toBe('recurring');
    expect(result.summary?.regressedFindings).toBe(0);
  });

  it('does not use the loose fallback between two v2 findings', () => {
    const baseline = finding({
      title: 'Checkout failed',
      affected: [{ page: '/checkout' }],
      fingerprint: undefined,
    });
    const current = finding({
      id: 'F-0002',
      title: 'Checkout failed',
      affected: [{ page: '/cart' }],
      fingerprint: undefined,
    });

    const result = compareWithBaseline([current], {
      baselineFindings: [baseline],
      baselineRunId: 'run-prev',
      currentRunId: 'run-now',
    });

    expect(result.findings[0].status).toBe('new');
    expect(result.summary?.newFindings).toBe(1);
  });
});
