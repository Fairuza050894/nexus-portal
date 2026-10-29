import type { RunMode, Scope } from '@nexus/core';

export type TrafficKind = 'page' | 'robots' | 'spec' | 'api' | 'redirect' | 'form' | 'probe';

export interface TrafficRecord {
  sequence: number;
  method: string;
  url: string;
  kind: TrafficKind;
  status?: number;
  durationMs: number;
  redirectTo?: string;
  error?: string;
}

export interface DiscoveredForm {
  action: string;
  method: string;
}

export interface DiscoveredPage {
  url: string;
  path: string;
  status: number;
  contentType: string;
  title?: string;
  depth: number;
  links: string[];
  forms: DiscoveredForm[];
}

export type EndpointSource = 'spec' | 'repo-route' | 'traffic' | 'crawl';

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  source: EndpointSource;
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  operationId?: string;
  summary?: string;
  tags: string[];
  authRequired: boolean;
  codeRef?: string;
  rawPath?: string;
  responseSchemas?: Record<string, unknown>;
}

export interface OpenApiImport {
  title?: string;
  version?: string;
  servers: string[];
  schemaNames: string[];
  components?: Record<string, unknown>;
  endpoints: DiscoveredEndpoint[];
  warnings: string[];
}

export interface RepoRoute {
  method: string;
  path: string;
  file: string;
  line: number;
  framework: 'express' | 'next-app' | 'laravel' | 'fastapi' | 'spring';
  lineCount: number;
}

export interface RepoPageRoute {
  path: string;
  file: string;
  lineCount: number;
}

export interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

export interface SecretFinding {
  file: string;
  line: number;
  kind: string;
}

export interface RepoAnalysis {
  stack: string;
  gitSha?: string;
  gitBranch?: string;
  changedFiles: string[];
  codeOwners: CodeOwnerRule[];
  routes: RepoRoute[];
  pageRoutes: RepoPageRoute[];
  testFiles: string[];
  dependencyFiles: string[];
  licenseFiles: string[];
  secretFindings: SecretFinding[];
  filesScanned: number;
  warnings: string[];
}

export interface CrawlWarning {
  url?: string;
  reason: string;
}

export interface CrawlResult {
  pages: DiscoveredPage[];
  endpoints: DiscoveredEndpoint[];
  traffic: TrafficRecord[];
  warnings: CrawlWarning[];
  robots: { found: boolean; rules: number };
  budget: { requests: number; maxRequests: number; exhausted: boolean };
  circuit: { open: boolean; reason?: string };
}

export interface DiscoveryResult {
  pages: DiscoveredPage[];
  endpoints: DiscoveredEndpoint[];
  traffic: TrafficRecord[];
  warnings: string[];
  openapi?: OpenApiImport;
  repo?: RepoAnalysis;
  crawl: {
    robots: { found: boolean; rules: number };
    budget: { requests: number; maxRequests: number; exhausted: boolean };
    circuit: { open: boolean; reason?: string };
  };
  auth: { used: boolean; reason?: string };
}

export interface DiscoverOptions {
  mode: RunMode;
  scope: Scope;
  allowlist: string[];
  web?: {
    urls: string[];
    maxDepth?: number;
    excludePaths?: string[];
  };
  api?: {
    baseUrl?: string;
    specUrl?: string;
  };
  authRef?: string;
  env?: NodeJS.ProcessEnv;
  cookieHeader?: string;
  timeoutMs?: number;
  deadlineMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}
