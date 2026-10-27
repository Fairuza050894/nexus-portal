import { describe, expect, it } from 'vitest';
import { buildAppMap } from '../src/index.js';
import type { DiscoveredEndpoint, DiscoveredPage, RepoAnalysis } from '@nexus/discover';

const page: DiscoveredPage = {
  url: 'http://app.local/',
  path: '/',
  status: 200,
  contentType: 'text/html',
  title: 'Home',
  depth: 0,
  links: ['http://app.local/health', 'http://app.local/api/todos'],
  forms: [{ action: 'http://app.local/api/todos', method: 'POST' }],
};

const endpoints: DiscoveredEndpoint[] = [
  {
    method: 'GET',
    path: '/health',
    source: 'traffic',
    confidence: 'auto-discovered',
    tags: [],
    authRequired: false,
  },
  {
    method: 'GET',
    path: '/api/todos',
    source: 'traffic',
    confidence: 'auto-discovered',
    tags: [],
    authRequired: false,
  },
  {
    method: 'POST',
    path: '/api/todos',
    source: 'crawl',
    confidence: 'needs-review',
    tags: [],
    authRequired: false,
  },
  {
    method: 'GET',
    path: '/api/todos/:id',
    source: 'spec',
    confidence: 'verified',
    tags: ['todos'],
    authRequired: true,
    summary: 'Get a todo',
  },
];

const repo: RepoAnalysis = {
  stack: 'node',
  changedFiles: ['server.js'],
  codeOwners: [{ pattern: 'server.js', owners: ['@backend'] }],
  routes: [
    {
      method: 'GET',
      path: '/health',
      file: 'server.js',
      line: 1,
      framework: 'express',
      lineCount: 100,
    },
    {
      method: 'GET',
      path: '/api/todos',
      file: 'server.js',
      line: 2,
      framework: 'express',
      lineCount: 100,
    },
    {
      method: 'POST',
      path: '/api/todos',
      file: 'server.js',
      line: 3,
      framework: 'express',
      lineCount: 100,
    },
  ],
  pageRoutes: [],
  testFiles: [],
  dependencyFiles: ['package.json'],
  licenseFiles: [],
  secretFindings: [],
  filesScanned: 1,
  warnings: [],
};

describe('Application Map', () => {
  it('merges sources, builds page/endpoint/code edges, and scores risk', () => {
    const map = buildAppMap({
      pages: [page],
      endpoints,
      repo,
      generatedAt: '2026-01-01T00:00:00Z',
    });

    expect(map.generatedAt).toBe('2026-01-01T00:00:00Z');
    expect(map.nodes.find((node) => node.id === 'page:/')?.forms).toBe(1);
    const getTodos = map.nodes.find((node) => node.id === 'api:GET /api/todos');
    expect(getTodos?.sources).toEqual(expect.arrayContaining(['traffic', 'repo-route']));
    expect(getTodos?.codeRef).toBe('server.js');
    expect(getTodos?.changedRecently).toBe(true);
    expect(getTodos?.suggestedOwner).toBe('@backend');
    expect(getTodos?.risk).toBeGreaterThan(0.5);
    expect(getTodos?.riskFactors).toContain('changed-in-last-10-commits');
    expect(getTodos?.riskFactors).toContain('no-test-coverage');

    const specEndpoint = map.nodes.find((node) => node.id === 'api:GET /api/todos/:id');
    expect(specEndpoint?.spec).toBe(true);
    expect(specEndpoint?.authRequired).toBe(true);

    expect(map.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'code', id: 'code:server.js', changedRecently: true }),
      ]),
    );
    expect(map.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'page:/',
          to: 'api:GET /health',
          kind: 'calls',
        }),
        expect.objectContaining({
          from: 'page:/',
          to: 'api:POST /api/todos',
          kind: 'calls',
        }),
        expect.objectContaining({
          from: 'api:GET /api/todos',
          to: 'code:server.js',
          kind: 'implemented-by',
        }),
      ]),
    );
    expect(map.stats).toMatchObject({ pages: 1, endpoints: 4, code: 1 });
    expect(map.stats.edges).toBeGreaterThanOrEqual(4);
  });

  it('adds repo-only page routes without inventing runtime status', () => {
    const map = buildAppMap({
      pages: [],
      endpoints: [],
      repo: {
        ...repo,
        pageRoutes: [{ path: '/checkout', file: 'app/checkout/page.tsx', lineCount: 50 }],
      },
    });
    const node = map.nodes.find((entry) => entry.id === 'page:/checkout');
    expect(node?.sources).toEqual(['repo-route']);
    expect(node?.status).toBeUndefined();
    expect(node?.riskFactors).toContain('critical-path:checkout');
  });
});
