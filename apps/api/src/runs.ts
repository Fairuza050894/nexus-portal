import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createRunId,
  DEFAULT_ALLOWLIST,
  QaConfigSchema,
  RunRequestSchema,
  RunStore,
  type QaConfig,
  type RunRequest,
  type RunSummary,
  type StageSummary,
} from '@nexus/core';
import { runPipeline, type PipelineResult } from '@nexus/cli/pipeline';
import { defaultEventStream } from './events.js';
import type { AuthUser } from './auth.js';

export interface PlanCase {
  id: string;
  title: string;
  lane: string;
  source: 'user' | 'spec' | 'crawl' | 'repo-route' | 'requirement' | 'invariant';
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  priority: 'critical' | 'high' | 'medium' | 'low';
  modeCompatibility: 'allowed' | 'skipped-by-mode';
  approved: boolean;
  estDurationMs: number;
}

export interface PlanReviewState {
  cases: PlanCase[];
  summary: {
    candidates: number;
    toRun: number;
    needsApproval: number;
    skippedByMode: number;
  };
}

export interface RunRecord {
  id: string;
  request: RunRequest;
  status: 'pending' | 'reviewing-plan' | 'running' | 'complete' | 'failed' | 'incomplete' | 'cancelled';
  gate?: 'GO' | 'GO WITH RISKS' | 'NO-GO';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  plan?: PlanReviewState;
  pipelineResult?: PipelineResult;
  summary?: RunSummary;
  error?: string;
  requestedBy: string;
}

export interface DryRunEstimate {
  valid: boolean;
  mode: RunRequest['mode'];
  scope: RunRequest['scope'];
  activeLanes: string[];
  estimatedRequests: number;
  estimatedDurationSeconds: number;
  rateLimitReqPerSec: number;
  targets: string[];
  banner?: string;
  errors?: string[];
}

export class RunManager {
  private readonly runs = new Map<string, RunRecord>();
  private readonly rootDir: string;
  private readonly config: QaConfig;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = resolve(rootDir);
    this.config = QaConfigSchema.parse({
      env: 'development',
      modes: ['sandbox', 'staging', 'prod-safe'],
      allowlist: [...DEFAULT_ALLOWLIST],
    });
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getConfig(): QaConfig {
    return this.config;
  }

  validateRawSecrets(input: unknown): string | undefined {
    if (!input) return undefined;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (
        (trimmed.includes('ghp_') ||
          trimmed.includes('eyJhbGciOi') ||
          /password\s*[:=]/i.test(trimmed)) &&
        !trimmed.startsWith('vault:')
      ) {
        return 'Raw secrets or passwords are rejected. Store credentials in a vault and reference them as "vault:<key>".';
      }
    } else if (typeof input === 'object' && input !== null) {
      for (const val of Object.values(input as Record<string, unknown>)) {
        const err = this.validateRawSecrets(val);
        if (err) return err;
      }
    }
    return undefined;
  }

  checkAllowlist(urlStr: string | undefined): string | undefined {
    if (!urlStr) return undefined;
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname;
      const allowlist = this.config.allowlist;
      const matched = allowlist.some((pattern) => {
        if (pattern.startsWith('*.')) {
          const suffix = pattern.slice(2);
          return host === suffix || host.endsWith('.' + suffix);
        }
        return host === pattern;
      });
      if (!matched) {
        return `Host "${host}" is not in the approved allowlist (${allowlist.join(', ')})`;
      }
    } catch {
      return 'Invalid URL format';
    }
    return undefined;
  }

  estimateDryRun(rawRequest: unknown): DryRunEstimate {
    const parseResult = RunRequestSchema.safeParse(rawRequest);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return {
        valid: false,
        mode: 'sandbox',
        scope: 'quick',
        activeLanes: [],
        estimatedRequests: 0,
        estimatedDurationSeconds: 0,
        rateLimitReqPerSec: 0,
        targets: [],
        errors,
      };
    }

    const request = parseResult.data;
    const errors: string[] = [];

    // Check targets presence (1.1)
    const hasRepo = Boolean(request.repo?.url || request.repo?.localPath);
    const hasWeb = Boolean(request.web?.urls && request.web.urls.length > 0);
    const hasApi = Boolean(request.api?.baseUrl);

    if (!hasRepo && !hasWeb && !hasApi) {
      errors.push('Provide a repo link or web URL to test');
    }

    // Check sandbox requires repo (1.3)
    if (request.mode === 'sandbox' && !hasRepo) {
      errors.push('Sandbox mode requires a repository to build and start the app container');
    }

    // Check authorization in staging / prod-safe (1.4)
    if (request.mode !== 'sandbox') {
      if (!request.authorization?.ownerConfirmed) {
        errors.push(`Mode "${request.mode}" requires authorization confirmation`);
      }
      if (!request.authorization?.approvedBy || request.authorization.approvedBy.trim().length === 0) {
        errors.push(`Mode "${request.mode}" requires an authorized approver ("approvedBy")`);
      }
    }

    // Check secrets
    const secretErr = this.validateRawSecrets(request);
    if (secretErr) {
      errors.push(secretErr);
    }

    // Check URLs
    for (const url of request.web?.urls ?? []) {
      const allowErr = this.checkAllowlist(url);
      if (allowErr) errors.push(allowErr);
    }
    if (request.api?.baseUrl) {
      const allowErr = this.checkAllowlist(request.api.baseUrl);
      if (allowErr) errors.push(allowErr);
    }

    // Determine active lanes (1.7)
    const activeLanes: string[] = [];
    if (hasRepo) activeLanes.push('repo');
    if (hasWeb) {
      activeLanes.push('e2e', 'a11y', 'perf', 'security');
    }
    if (hasApi || request.api?.specUrl) {
      if (!activeLanes.includes('api')) activeLanes.push('api');
    }

    // Filter requested lanes if explicitly provided
    const filteredLanes = request.lanes
      ? activeLanes.filter((lane) => request.lanes?.[lane as keyof typeof request.lanes] !== false)
      : activeLanes;

    // Rate limits and estimation
    const rateLimit = request.mode === 'prod-safe' ? 2 : request.mode === 'staging' ? 10 : 20;
    const scopeMultiplier =
      request.scope === 'quick' ? 1 : request.scope === 'standard' ? 3 : request.scope === 'deep' ? 8 : 2;

    const estimatedRequests = Math.round(15 * filteredLanes.length * scopeMultiplier);
    const estimatedDurationSeconds = Math.round(estimatedRequests / Math.min(rateLimit, 10)) + 5;

    const banner =
      request.mode === 'prod-safe'
        ? 'Observe-only mode: no data will be changed (rate limit max 2 req/s).'
        : undefined;

    const targets: string[] = [];
    if (request.repo?.url) targets.push(request.repo.url);
    if (request.repo?.localPath) targets.push(request.repo.localPath);
    for (const u of request.web?.urls ?? []) targets.push(u);
    if (request.api?.baseUrl) targets.push(request.api.baseUrl);

    return {
      valid: errors.length === 0,
      mode: request.mode,
      scope: request.scope,
      activeLanes: filteredLanes,
      estimatedRequests,
      estimatedDurationSeconds,
      rateLimitReqPerSec: rateLimit,
      targets,
      banner,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }

  buildPlanCases(rawRequest: unknown): PlanReviewState {
    const request = RunRequestSchema.parse(rawRequest);
    const cases: PlanCase[] = [];
    const hasRepo = Boolean(request.repo?.url || request.repo?.localPath);
    const hasWeb = Boolean(request.web?.urls && request.web.urls.length > 0);
    const isProdSafe = request.mode === 'prod-safe';

    // 1. Repo lane cases
    if (hasRepo) {
      cases.push({
        id: 'TC-REPO-001',
        title: 'Static analysis and dependency vulnerability audit',
        lane: 'repo',
        source: 'repo-route',
        confidence: 'verified',
        priority: 'high',
        modeCompatibility: 'allowed',
        approved: true,
        estDurationMs: 2000,
      });
      cases.push({
        id: 'TC-REPO-002',
        title: 'Repository secret and credentials scan',
        lane: 'repo',
        source: 'repo-route',
        confidence: 'verified',
        priority: 'critical',
        modeCompatibility: 'allowed',
        approved: true,
        estDurationMs: 1500,
      });
    }

    // 2. Web & E2E invariant cases
    if (hasWeb) {
      cases.push({
        id: 'TC-E2E-001',
        title: 'Root page navigation and DOM load invariant',
        lane: 'e2e',
        source: 'invariant',
        confidence: 'verified',
        priority: 'high',
        modeCompatibility: 'allowed',
        approved: true,
        estDurationMs: 3000,
      });
      cases.push({
        id: 'TC-A11Y-001',
        title: 'WCAG 2.1 AA accessibility audit on home view',
        lane: 'a11y',
        source: 'invariant',
        confidence: 'verified',
        priority: 'medium',
        modeCompatibility: 'allowed',
        approved: true,
        estDurationMs: 1500,
      });
      cases.push({
        id: 'TC-SEC-001',
        title: 'Passive security headers and cookie flags audit',
        lane: 'security',
        source: 'invariant',
        confidence: 'verified',
        priority: 'high',
        modeCompatibility: 'allowed',
        approved: true,
        estDurationMs: 1000,
      });
    }

    // 3. User-provided test rows
    if (request.testRows) {
      for (const [lane, rows] of Object.entries(request.testRows)) {
        if (Array.isArray(rows)) {
          rows.forEach((row, idx) => {
            const r = row as Record<string, unknown>;
            const caseId = typeof r.id === 'string' ? r.id : `TC-USER-${lane.toUpperCase()}-${String(idx + 1).padStart(3, '0')}`;
            const title = typeof r.scenario === 'string' ? r.scenario : `User row ${lane} #${idx + 1}`;
            const isStateChanging =
              lane === 'api' &&
              ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(r.method ?? '').toUpperCase());

            const modeCompatibility = isProdSafe && isStateChanging ? 'skipped-by-mode' : 'allowed';

            cases.push({
              id: caseId,
              title,
              lane,
              source: 'user',
              confidence: 'verified',
              priority: (r.severity as PlanCase['priority']) ?? 'high',
              modeCompatibility,
              approved: modeCompatibility === 'allowed',
              estDurationMs: 2500,
            });
          });
        }
      }
    }

    // 4. Inferred / auto-discovered heuristic cases (needs-review)
    if (hasWeb) {
      cases.push({
        id: 'TC-DISC-001',
        title: 'Inferred multi-step checkout form flow',
        lane: 'e2e',
        source: 'crawl',
        confidence: 'needs-review', // needs-review is unchecked by default (3.2)
        priority: 'medium',
        modeCompatibility: isProdSafe ? 'skipped-by-mode' : 'allowed',
        approved: false, // Unchecked by default!
        estDurationMs: 4000,
      });
    }

    const toRun = cases.filter((c) => c.approved && c.modeCompatibility === 'allowed').length;
    const needsApproval = cases.filter((c) => c.confidence === 'needs-review' && c.modeCompatibility === 'allowed').length;
    const skippedByMode = cases.filter((c) => c.modeCompatibility === 'skipped-by-mode').length;

    return {
      cases,
      summary: {
        candidates: cases.length,
        toRun,
        needsApproval,
        skippedByMode,
      },
    };
  }

  async createRun(rawRequest: unknown, user: AuthUser): Promise<RunRecord> {
    const dryRun = this.estimateDryRun(rawRequest);
    if (!dryRun.valid) {
      throw new Error(`Invalid Run Request: ${(dryRun.errors ?? []).join('; ')}`);
    }

    const request = RunRequestSchema.parse(rawRequest);

    // Mode permission check
    if (request.mode !== 'sandbox' && user.role !== 'approver' && user.role !== 'admin') {
      throw new Error(
        `Mode "${request.mode}" requires an actor with "approver" or "admin" role (current: "${user.role}")`,
      );
    }

    const runId = createRunId();
    const plan = this.buildPlanCases(request);

    const record: RunRecord = {
      id: runId,
      request,
      status: request.planApproval === 'review' ? 'reviewing-plan' : 'pending',
      createdAt: new Date().toISOString(),
      plan,
      requestedBy: user.email,
    };

    this.runs.set(runId, record);

    defaultEventStream.broadcast(runId, 'status', {
      runId,
      status: record.status,
      timestamp: record.createdAt,
    });

    // Auto-approve flow (starts execution immediately)
    if (request.planApproval === 'auto') {
      void this.executePipeline(runId);
    }

    return record;
  }

  async approvePlan(runId: string, approvedCaseIds: string[], user: AuthUser): Promise<RunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run "${runId}" not found`);
    }
    if (record.status !== 'reviewing-plan') {
      throw new Error(`Run "${runId}" is not in reviewing-plan status (current: "${record.status}")`);
    }

    // Require at least one approved case (3.6)
    if (!approvedCaseIds || approvedCaseIds.length === 0) {
      throw new Error('Please approve at least one test case before starting the run');
    }

    if (record.plan) {
      for (const c of record.plan.cases) {
        if (c.modeCompatibility === 'skipped-by-mode') {
          c.approved = false;
        } else {
          c.approved = approvedCaseIds.includes(c.id);
        }
      }
      record.plan.summary.toRun = record.plan.cases.filter((c) => c.approved).length;
    }

    record.status = 'pending';
    defaultEventStream.broadcast(runId, 'plan-approved', {
      runId,
      approvedCount: approvedCaseIds.length,
      approvedBy: user.email,
    });

    void this.executePipeline(runId);
    return record;
  }

  async executePipeline(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record) return;

    record.status = 'running';
    record.startedAt = new Date().toISOString();

    defaultEventStream.broadcast(runId, 'status', {
      runId,
      status: 'running',
      startedAt: record.startedAt,
    });

    try {
      const result = await runPipeline({
        rootDir: this.rootDir,
        config: this.config,
        request: record.request,
        requestedBy: record.requestedBy,
        resumeRunId: runId,
        onStageChange: (stage: StageSummary) => {
          defaultEventStream.broadcast(runId, 'stage', {
            runId,
            stage: stage.name,
            status: stage.status,
            durationMs: stage.durationMs,
            reason: stage.reason,
            error: stage.error,
          });
        },
        onLog: (line: string) => {
          defaultEventStream.broadcast(runId, 'log', {
            runId,
            message: line,
            timestamp: new Date().toISOString(),
          });
        },
      });

      record.pipelineResult = result;
      record.status = result.status === 'complete' ? 'complete' : 'failed';
      record.gate = result.gate;
      record.finishedAt = new Date().toISOString();
      record.durationMs =
        new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime();

      // Read summary from store
      record.summary = RunStore.readSummaryById(this.rootDir, runId);

      defaultEventStream.broadcast(runId, 'complete', {
        runId,
        status: record.status,
        gate: record.gate,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
      });
    } catch (err) {
      record.status = 'failed';
      record.error = err instanceof Error ? err.message : String(err);
      record.finishedAt = new Date().toISOString();

      defaultEventStream.broadcast(runId, 'error', {
        runId,
        error: record.error,
        finishedAt: record.finishedAt,
      });
    }
  }

  stopRun(runId: string): RunRecord {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run "${runId}" not found`);
    }
    if (record.status === 'running' || record.status === 'pending' || record.status === 'reviewing-plan') {
      record.status = 'cancelled';
      record.finishedAt = new Date().toISOString();
      defaultEventStream.broadcast(runId, 'cancelled', { runId, timestamp: record.finishedAt });
    }
    return record;
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  listRuns(): RunRecord[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  getBundlePath(runId: string): string | undefined {
    const bundlePath = join(this.rootDir, 'artifacts', 'bundles', `qa-${runId}.zip`);
    return existsSync(bundlePath) ? bundlePath : undefined;
  }

  getDocContent(runId: string, docName: string): { content: Buffer; contentType: string } | undefined {
    const docsDir = join(this.rootDir, 'artifacts', 'docs', runId);
    const safeDocName = docName.replace(/[^A-Za-z0-9._-]/g, '');
    const filePath = join(docsDir, safeDocName);

    if (!existsSync(filePath)) return undefined;

    const content = readFileSync(filePath);
    let contentType = 'application/octet-stream';
    if (safeDocName.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    else if (safeDocName.endsWith('.json') || safeDocName.endsWith('.sarif')) contentType = 'application/json';
    else if (safeDocName.endsWith('.xml')) contentType = 'application/xml';
    else if (safeDocName.endsWith('.pdf')) contentType = 'application/pdf';
    else if (safeDocName.endsWith('.md')) contentType = 'text/markdown; charset=utf-8';
    else if (safeDocName.endsWith('.csv')) contentType = 'text/csv; charset=utf-8';

    return { content, contentType };
  }
}

export const defaultRunManager = new RunManager();
