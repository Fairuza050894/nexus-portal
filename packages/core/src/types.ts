import { z } from 'zod';

export const RUN_MODES = ['sandbox', 'staging', 'prod-safe'] as const;
export const RunModeSchema = z.enum(RUN_MODES);
export type RunMode = z.infer<typeof RunModeSchema>;

export const SCOPES = ['quick', 'standard', 'deep', 'custom'] as const;
export const ScopeSchema = z.enum(SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

export const DEFAULT_ALLOWLIST = ['localhost', '127.0.0.1', '*.local', 'staging-qa-pilot.local'];

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export const HttpUrlSchema = z.string().url().refine(isHttpUrl, 'must be an http(s) URL');

export const SecretRefSchema = z.string().min(1).max(200);

export const AuthorizationSchema = z
  .object({
    ownerConfirmed: z.boolean(),
    approvedBy: z.string().min(1).optional(),
    ticket: z.string().min(1).optional(),
    perfApproved: z.boolean().optional(),
  })
  .strict();
export type Authorization = z.infer<typeof AuthorizationSchema>;

export const RepoSchema = z
  .object({
    url: z.string().min(1).optional(),
    localPath: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    tokenRef: SecretRefSchema.optional(),
  })
  .strict()
  .refine((repo) => Boolean(repo.url) !== Boolean(repo.localPath), {
    message: 'exactly one of url or localPath is required',
  });

export const WebSchema = z
  .object({
    urls: z.array(HttpUrlSchema).min(1),
    maxDepth: z.number().int().min(0).max(10).optional(),
    excludePaths: z.array(z.string()).optional(),
  })
  .strict();

export const ApiSchema = z
  .object({
    baseUrl: HttpUrlSchema.optional(),
    specUrl: HttpUrlSchema.optional(),
    authType: z.string().optional(),
  })
  .strict();

export const LanesSchema = z
  .object({
    repo: z.boolean().optional(),
    api: z.boolean().optional(),
    e2e: z.boolean().optional(),
    a11y: z.boolean().optional(),
    visual: z.boolean().optional(),
    perf: z.boolean().optional(),
    security: z.boolean().optional(),
  })
  .strict();
export type Lanes = z.infer<typeof LanesSchema>;

export const RunRequestSchema = z
  .object({
    schemaVersion: z.string().optional(),
    name: z.string().min(1),
    mode: RunModeSchema.default('sandbox'),
    scope: ScopeSchema.default('quick'),
    repo: RepoSchema.optional(),
    web: WebSchema.optional(),
    api: ApiSchema.optional(),
    auth: z
      .object({ ref: SecretRefSchema, roles: z.array(z.string()).optional() })
      .strict()
      .optional(),
    requirements: z
      .object({ source: z.string().min(1), location: z.string().min(1) })
      .strict()
      .optional(),
    testRows: z.record(z.array(z.unknown())).optional(),
    lanes: LanesSchema.optional(),
    planApproval: z.enum(['review', 'auto']).default('review'),
    authorization: AuthorizationSchema.optional(),
    notify: z
      .object({ teams: z.boolean().optional(), email: z.array(z.string()).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const PIIPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

export type StageStatus = 'ok' | 'failed' | 'skipped';

export interface StageSummary {
  name: string;
  status: StageStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  reason?: string;
  error?: string;
  resumed?: boolean;
  output?: unknown;
}

export interface AuditRecord {
  runId: string;
  requestedBy: string;
  mode: RunMode;
  targets: string[];
  authorization?: Authorization;
  startedAt: string;
  finishedAt?: string;
  requestCount: number;
  reason?: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  category: string;
  lanes: string[];
  occurrences: number;
  affected?: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  reproduction?: string[];
  expected?: string;
  actual?: string;
  codeRefs?: Array<{ file: string; line?: number; commit?: string }>;
  requirements?: string[];
  status: string;
  suggestedOwner?: string;
  suggestedFix?: string;
}

export interface LaneSummary {
  lane: string;
  status: string;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  reason?: string;
}

export interface RunSummary {
  schemaVersion: '1.0';
  run: {
    id: string;
    status: 'rejected' | 'incomplete' | 'complete';
    mode: RunMode;
    scope: Scope;
    trigger: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  environment: {
    name: string;
    baseUrl?: string;
    apiUrl?: string;
    gitSha: string;
    nodeVersion: string;
    platform: string;
  };
  request: unknown;
  audit: AuditRecord;
  stages: Record<string, StageSummary>;
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    lanes: string[];
  };
  gate: {
    decision: 'GO' | 'GO WITH RISKS' | 'NO-GO';
    reasons: string[];
  };
  findings: Finding[];
  limitations: string[];
  lanes?: LaneSummary[];
  session?: { pages: number; browserVersion: string };
  appMap?: {
    path: string;
    pages: number;
    endpoints: number;
    code: number;
    edges: number;
    highRisk: number;
    changed: number;
  };
}

export interface RunResult {
  runId: string;
  status: 'rejected' | 'incomplete' | 'complete';
  exitCode: 0 | 1 | 2 | 3;
  gate: 'GO' | 'GO WITH RISKS' | 'NO-GO';
  stages: Record<string, StageSummary>;
  summary: RunSummary;
  docsDir?: string;
  bundlePath?: string;
}
