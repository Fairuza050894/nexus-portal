import {
  ownersFor,
  type DiscoveredEndpoint,
  type DiscoveredPage,
  type RepoAnalysis,
  type RepoRoute,
} from '@nexus/discover';

export type RiskFactorKey =
  'change' | 'criticality' | 'pastFailures' | 'complexity' | 'exposure' | 'coverage';

export const RISK_WEIGHTS: Record<RiskFactorKey, number> = {
  change: 0.25,
  criticality: 0.25,
  pastFailures: 0.2,
  complexity: 0.1,
  exposure: 0.1,
  coverage: 0.1,
};

export interface AppMapNode {
  type: 'page' | 'endpoint' | 'code';
  id: string;
  path?: string;
  method?: string;
  title?: string;
  status?: number;
  forms?: number;
  authRequired?: boolean;
  spec?: boolean;
  sources: string[];
  changedRecently: boolean;
  codeRef?: string;
  suggestedOwner?: string;
  risk: number;
  riskFactors: string[];
}

export interface AppMapEdge {
  from: string;
  to: string;
  kind: 'calls' | 'navigates-to' | 'implemented-by';
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
}

export interface AppMap {
  schemaVersion: '1.0';
  generatedAt: string;
  nodes: AppMapNode[];
  edges: AppMapEdge[];
  stats: {
    pages: number;
    endpoints: number;
    code: number;
    edges: number;
    highRisk: number;
    changed: number;
  };
}

export interface BuildAppMapOptions {
  pages: DiscoveredPage[];
  endpoints: DiscoveredEndpoint[];
  repo?: RepoAnalysis;
  generatedAt?: string;
}

const CRITICAL_SEGMENTS = [
  'auth',
  'login',
  'logout',
  'admin',
  'account',
  'user',
  'order',
  'orders',
  'checkout',
  'payment',
  'billing',
];

function normalizePath(path: string): string {
  const withParams = path.replace(/\{([^}]+)\}/g, ':$1');
  if (withParams.length > 1 && withParams.endsWith('/')) return withParams.slice(0, -1);
  return withParams || '/';
}

function criticality(path: string): { score: number; segment?: string } {
  const segments = path.toLowerCase().split('/').filter(Boolean);
  const critical = segments.find((segment) =>
    CRITICAL_SEGMENTS.some((keyword) => segment === keyword || segment.startsWith(`${keyword}-`)),
  );
  if (critical) return { score: 1, segment: critical };
  if (segments.includes('api')) return { score: 0.5 };
  return { score: 0.3 };
}

function pathMatches(pattern: string, actual: string): boolean {
  const expected = normalizePath(pattern).split('/').filter(Boolean);
  const got = normalizePath(actual).split('/').filter(Boolean);
  if (expected.length !== got.length) return false;
  return expected.every((segment, index) => {
    const value = got[index] ?? '';
    return segment === value || segment.startsWith(':') || segment === '*';
  });
}

function routeForEndpoint(
  endpoint: DiscoveredEndpoint,
  routes: RepoRoute[],
): RepoRoute | undefined {
  return routes.find(
    (route) =>
      (route.method === endpoint.method || route.method === 'ALL') &&
      normalizePath(route.path) === normalizePath(endpoint.path),
  );
}

function endpointCoverage(
  route: RepoRoute | undefined,
  testFiles: string[],
): { gap: number; label?: string } {
  if (!route) return { gap: 0.6, label: 'no-test-coverage' };
  if (testFiles.length === 0) return { gap: 1, label: 'no-test-coverage' };
  const base =
    route.file
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? '';
  const covered = testFiles.some((file) => file.toLowerCase().includes(base.toLowerCase()));
  return covered
    ? { gap: 0.2, label: 'partial-test-coverage' }
    : { gap: 0.7, label: 'no-direct-test-coverage' };
}

function riskScore(parts: {
  changed: boolean;
  criticality: number;
  complexity: number;
  exposure: number;
  coverage: number;
}): number {
  const weighted =
    (parts.changed ? 1 : 0) * RISK_WEIGHTS.change +
    parts.criticality * RISK_WEIGHTS.criticality +
    0 * RISK_WEIGHTS.pastFailures +
    Math.min(1, parts.complexity) * RISK_WEIGHTS.complexity +
    parts.exposure * RISK_WEIGHTS.exposure +
    parts.coverage * RISK_WEIGHTS.coverage;
  return Math.round(weighted * 100) / 100;
}

export function buildAppMap(options: BuildAppMapOptions): AppMap {
  const nodes: AppMapNode[] = [];
  const edges: AppMapEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const repo = options.repo;
  const routes = repo?.routes ?? [];
  const changed = new Set(repo?.changedFiles ?? []);
  const owners = repo?.codeOwners ?? [];
  const testFiles = repo?.testFiles ?? [];

  const addNode = (node: AppMapNode): void => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge: AppMapEdge): void => {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    if (edgeIds.has(key)) return;
    edgeIds.add(key);
    edges.push(edge);
  };

  const pageByPath = new Map<string, AppMapNode>();
  for (const page of options.pages) {
    const path = normalizePath(page.path);
    if (pageByPath.has(path)) continue;
    const crit = criticality(path);
    const forms = page.forms.length;
    const complexity = Math.min(1, forms / 5 + page.links.length / 50);
    const risk = riskScore({
      changed: false,
      criticality: crit.score,
      complexity,
      exposure: ['login', 'admin', 'checkout', 'payment'].some((word) => path.includes(word))
        ? 0.8
        : 0.4,
      coverage: 0.5,
    });
    const factors: string[] = [];
    if (crit.score >= 1 && crit.segment) factors.push(`critical-path:${crit.segment}`);
    if (forms > 0) factors.push(`handles-forms:${forms}`);
    const node: AppMapNode = {
      type: 'page',
      id: `page:${path}`,
      path,
      title: page.title,
      status: page.status,
      forms,
      sources: ['crawl'],
      changedRecently: false,
      risk,
      riskFactors: factors,
    };
    addNode(node);
    pageByPath.set(path, node);
  }

  if (repo) {
    for (const pageRoute of repo.pageRoutes) {
      const path = normalizePath(pageRoute.path);
      const existingPage = pageByPath.get(path);
      if (existingPage) {
        const crit = criticality(path);
        const changedRecently = changed.has(pageRoute.file);
        existingPage.sources = [...new Set([...existingPage.sources, 'repo-route'])];
        existingPage.codeRef = pageRoute.file;
        existingPage.changedRecently = changedRecently;
        existingPage.suggestedOwner = ownersFor(pageRoute.file, owners).join(' ') || undefined;
        existingPage.risk = riskScore({
          changed: changedRecently,
          criticality: crit.score,
          complexity: Math.min(1, (existingPage.forms ?? 0) / 5),
          exposure: ['login', 'admin', 'checkout', 'payment'].some((word) => path.includes(word))
            ? 0.8
            : 0.4,
          coverage: testFiles.length === 0 ? 1 : 0.5,
        });
        existingPage.riskFactors = [
          ...(changedRecently ? ['changed-in-last-10-commits'] : []),
          ...(crit.score >= 1 && crit.segment ? [`critical-path:${crit.segment}`] : []),
          ...((existingPage.forms ?? 0) > 0 ? [`handles-forms:${existingPage.forms}`] : []),
        ];
        continue;
      }
      const crit = criticality(path);
      const changedRecently = changed.has(pageRoute.file);
      const risk = riskScore({
        changed: changedRecently,
        criticality: crit.score,
        complexity: pageRoute.lineCount / 400,
        exposure: 0.5,
        coverage: testFiles.length === 0 ? 1 : 0.6,
      });
      const factors: string[] = [];
      if (changedRecently) factors.push('changed-in-last-10-commits');
      if (crit.score >= 1 && crit.segment) factors.push(`critical-path:${crit.segment}`);
      if (testFiles.length === 0) factors.push('no-test-coverage');
      const node: AppMapNode = {
        type: 'page',
        id: `page:${path}`,
        path,
        sources: ['repo-route'],
        changedRecently,
        codeRef: pageRoute.file,
        risk,
        riskFactors: factors,
      };
      addNode(node);
      pageByPath.set(path, node);
    }
  }

  const mergedEndpoints = new Map<string, DiscoveredEndpoint & { sources: string[] }>();
  for (const endpoint of options.endpoints) {
    const path = normalizePath(endpoint.path);
    const key = `${endpoint.method.toUpperCase()} ${path}`;
    const existing = mergedEndpoints.get(key);
    if (!existing) {
      mergedEndpoints.set(key, { ...endpoint, path, sources: [endpoint.source] });
      continue;
    }
    existing.sources.push(endpoint.source);
    if (endpoint.confidence === 'verified') existing.confidence = 'verified';
    if (endpoint.authRequired) existing.authRequired = true;
    if (endpoint.summary && !existing.summary) existing.summary = endpoint.summary;
    if (endpoint.operationId && !existing.operationId) existing.operationId = endpoint.operationId;
  }

  if (repo) {
    for (const route of routes) {
      const path = normalizePath(route.path);
      const key = `${route.method === 'ALL' ? 'ALL' : route.method.toUpperCase()} ${path}`;
      const existing = mergedEndpoints.get(key);
      if (existing) {
        if (!existing.sources.includes('repo-route')) existing.sources.push('repo-route');
        existing.codeRef ??= route.file;
        continue;
      }
      mergedEndpoints.set(key, {
        method: route.method,
        path,
        rawPath: route.path,
        source: 'repo-route',
        confidence: 'needs-review',
        tags: [],
        authRequired: false,
        codeRef: route.file,
        sources: ['repo-route'],
      });
    }
  }

  const endpointByKey = new Map<string, AppMapNode>();
  for (const endpoint of mergedEndpoints.values()) {
    const path = normalizePath(endpoint.path);
    const route = routeForEndpoint(endpoint, routes);
    const codeRef = endpoint.codeRef ?? route?.file;
    const changedRecently = Boolean(codeRef && changed.has(codeRef));
    const crit = criticality(path);
    const complexity = route ? route.lineCount / 400 : 0.3;
    const coverage = endpointCoverage(route, testFiles);
    const risk = riskScore({
      changed: changedRecently,
      criticality: crit.score,
      complexity,
      exposure: endpoint.authRequired || crit.score >= 1 ? 0.9 : 0.4,
      coverage: coverage.gap,
    });
    const factors: string[] = [];
    if (changedRecently) factors.push('changed-in-last-10-commits');
    if (crit.score >= 1 && crit.segment) factors.push(`critical-path:${crit.segment}`);
    if (endpoint.authRequired) factors.push('auth-required');
    if (coverage.label) factors.push(coverage.label);
    if (complexity >= 0.75) factors.push('high-complexity');

    const node: AppMapNode = {
      type: 'endpoint',
      id: `api:${endpoint.method.toUpperCase()} ${path}`,
      path,
      method: endpoint.method.toUpperCase(),
      title: endpoint.summary,
      authRequired: endpoint.authRequired,
      spec: endpoint.sources.includes('spec'),
      sources: [...new Set(endpoint.sources)],
      changedRecently,
      codeRef,
      suggestedOwner: codeRef ? ownersFor(codeRef, owners).join(' ') || undefined : undefined,
      risk,
      riskFactors: factors,
    };
    addNode(node);
    endpointByKey.set(`${endpoint.method.toUpperCase()} ${path}`, node);

    if (codeRef) {
      const codeId = `code:${codeRef}`;
      if (!nodeIds.has(codeId)) {
        const codeChanged = changed.has(codeRef);
        addNode({
          type: 'code',
          id: codeId,
          path: codeRef,
          sources: ['repo-route'],
          changedRecently: codeChanged,
          codeRef,
          suggestedOwner: ownersFor(codeRef, owners).join(' ') || undefined,
          risk: codeChanged ? 0.7 : 0.3,
          riskFactors: codeChanged ? ['changed-in-last-10-commits'] : [],
        });
      }
      addEdge({
        from: node.id,
        to: codeId,
        kind: 'implemented-by',
        confidence: 'needs-review',
      });
    }
  }

  for (const page of options.pages) {
    const pageNode = pageByPath.get(normalizePath(page.path));
    if (!pageNode) continue;
    for (const link of page.links) {
      let linkPath: string;
      try {
        linkPath = normalizePath(new URL(link).pathname);
      } catch {
        continue;
      }
      const linkedPage = pageByPath.get(linkPath);
      if (linkedPage) {
        addEdge({
          from: pageNode.id,
          to: linkedPage.id,
          kind: 'navigates-to',
          confidence: 'auto-discovered',
        });
      }
      for (const [key, endpointNode] of endpointByKey) {
        if (endpointNode.method !== 'GET' && endpointNode.method !== 'HEAD') continue;
        if (!key.endsWith(` ${linkPath}`) && !pathMatches(endpointNode.path ?? '', linkPath))
          continue;
        addEdge({
          from: pageNode.id,
          to: endpointNode.id,
          kind: 'calls',
          confidence: 'needs-review',
        });
      }
    }
    for (const form of page.forms) {
      let formPath: string;
      try {
        formPath = normalizePath(new URL(form.action).pathname);
      } catch {
        continue;
      }
      for (const [key, endpointNode] of endpointByKey) {
        if (endpointNode.method !== form.method) continue;
        if (!key.endsWith(` ${formPath}`) && !pathMatches(endpointNode.path ?? '', formPath))
          continue;
        addEdge({
          from: pageNode.id,
          to: endpointNode.id,
          kind: 'calls',
          confidence: 'needs-review',
        });
      }
    }
  }

  return {
    schemaVersion: '1.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    nodes,
    edges,
    stats: {
      pages: nodes.filter((node) => node.type === 'page').length,
      endpoints: nodes.filter((node) => node.type === 'endpoint').length,
      code: nodes.filter((node) => node.type === 'code').length,
      edges: edges.length,
      highRisk: nodes.filter((node) => node.risk >= 0.7).length,
      changed: nodes.filter((node) => node.changedRecently).length,
    },
  };
}
export { buildFullStackLineage } from './lineage.js';
export type {
  TopologyNodeType,
  TopologyEdgeKind,
  TopologyNode,
  TopologyEdge,
  LineageTableTouch,
  DataLineageEntry,
  FullStackTopology,
  BuildLineageOptions,
} from './lineage.js';
