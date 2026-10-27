import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  createRunId,
  finishAudit,
  newAuditRecord,
  redactValue,
  RunStore,
  targetsOf,
  type AuditRecord,
  type QaConfig,
  type RunRequest,
  type RunResult,
  type RunSummary,
  type StageSummary,
} from '@nexus/core';
import { startSandbox, type SandboxResult, type SandboxSession } from '@nexus/sandbox';
import {
  analyzeRepo,
  discoverTargets,
  findMutationRequests,
  type DiscoveryResult,
  type RepoAnalysis,
} from '@nexus/discover';
import { buildAppMap, type AppMap } from '@nexus/app-map';
import {
  planLanes,
  runLanes,
  type LanePlan,
  type LaneResult,
  type LaneRunResult,
} from '@nexus/lanes';
import type { SessionResult } from '@nexus/session';
import { copyLatestDocs, createBundle, generateDocs, relativeTo } from '@nexus/doc-engine';
import { probeUrl } from './http.js';

export const STAGE_ORDER = [
  'intake',
  'preflight',
  'discover',
  'model',
  'plan',
  'execute',
  'correlate',
  'analyze',
  'gate',
  'document',
  'bundle',
] as const;

export type StageName = (typeof STAGE_ORDER)[number];

const UPSTREAM: Record<StageName, StageName[]> = {
  intake: [],
  preflight: ['intake'],
  discover: ['preflight'],
  model: ['discover'],
  plan: ['model'],
  execute: ['plan'],
  correlate: ['execute'],
  analyze: ['correlate'],
  gate: ['analyze'],
  document: ['gate'],
  bundle: ['document'],
};

const RESUME_SAFE: Partial<Record<StageName, true>> = {
  intake: true,
  preflight: true,
};

export interface PipelineOptions {
  rootDir: string;
  artifactsRoot?: string;
  config: QaConfig;
  request: RunRequest;
  requestedBy?: string;
  trigger?: string;
  resumeRunId?: string;
  sandboxStarter?: typeof startSandbox;
  probe?: typeof probeUrl;
}

export interface PipelineResult extends RunResult {
  docsDir?: string;
  bundlePath?: string;
  bundleSha256?: string;
}

interface DiscoveryOutput {
  sandbox?: SandboxResult;
  discovery: DiscoveryResult;
  failures: string[];
}

interface ModelOutput {
  path: string;
  stats: AppMap['stats'];
}

interface ExecuteOutput {
  lanes: Array<{
    lane: string;
    status: string;
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    reason?: string;
  }>;
  totals: RunSummary['totals'];
  findings: number;
  warnings: string[];
}

function emptyDiscovery(warning: string): DiscoveryResult {
  return {
    pages: [],
    endpoints: [],
    traffic: [],
    warnings: [warning],
    crawl: {
      robots: { found: false, rules: 0 },
      budget: { requests: 0, maxRequests: 0, exhausted: false },
      circuit: { open: false },
    },
    auth: { used: false },
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

function inferPort(url: string | undefined): number | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : undefined;
  } catch {
    return undefined;
  }
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { rootDir, config, request } = options;
  const artifactsRoot = options.artifactsRoot ?? rootDir;
  const sandboxStarter = options.sandboxStarter ?? startSandbox;
  const probe = options.probe ?? probeUrl;
  const requestedBy = options.requestedBy ?? 'cli';
  const trigger = options.trigger ?? 'manual';

  const runId = options.resumeRunId ?? createRunId();
  const store = new RunStore(artifactsRoot, runId);
  const existingAudit = options.resumeRunId ? store.readAudit() : undefined;
  let audit: AuditRecord = existingAudit ?? {
    ...newAuditRecord(requestedBy, request.mode, targetsOf(request), request.authorization),
    runId,
  };
  const runStartedMs = Date.parse(audit.startedAt);
  const stages: Record<string, StageSummary> = {};
  const limitations: string[] = [
    'phase 3: visual baseline comparison (Phase 8) and correlation/analyze (Phase 4) are not implemented yet',
  ];
  let incomplete = false;
  let gateDecision: RunSummary['gate']['decision'] = 'GO WITH RISKS';
  let gateReasons: string[] = [];
  let appMapStats: AppMap['stats'] | undefined;
  let builtAppMap: AppMap | undefined;
  let sandboxSession: SandboxSession | undefined;
  let sessionResult: SessionResult | undefined;
  let laneResults: LaneResult[] = [];
  let laneTotals: RunSummary['totals'] = {
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    lanes: [],
  };
  let findings: RunSummary['findings'] = [];

  const stageRecord = (
    name: StageName,
    status: StageSummary['status'],
    startedMs: number,
    extra: Pick<StageSummary, 'reason' | 'error' | 'output' | 'resumed'> = {},
  ): StageSummary => ({
    name,
    status,
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: isoNow(),
    durationMs: Math.max(0, Date.now() - startedMs),
    ...extra,
  });

  const writeStage = (record: StageSummary): void => {
    stages[record.name] = record;
    store.writeStage(record);
  };

  const skipStage = (name: StageName, reason: string): void => {
    const now = Date.now();
    writeStage(stageRecord(name, 'skipped', now, { reason }));
  };

  const upstreamFailure = (name: StageName): string | undefined => {
    for (const dependency of UPSTREAM[name]) {
      const record = stages[dependency];
      if (record?.status === 'failed') return `upstream stage ${dependency} failed`;
    }
    return undefined;
  };

  const runStage = async <T>(
    name: StageName,
    task: () => Promise<T> | T,
  ): Promise<T | undefined> => {
    if (options.resumeRunId && RESUME_SAFE[name]) {
      const prior = store.readStage(name);
      if (prior && prior.status !== 'failed') {
        const resumedStage = { ...prior, resumed: true };
        stages[name] = resumedStage;
        store.writeStage(resumedStage);
        return prior.output as T;
      }
    }
    const blocked = upstreamFailure(name);
    if (blocked) {
      skipStage(name, blocked);
      return undefined;
    }
    const startedMs = Date.now();
    try {
      const output = await task();
      writeStage(stageRecord(name, 'ok', startedMs, { output }));
      return output;
    } catch (error) {
      incomplete = true;
      writeStage(
        stageRecord(name, 'failed', startedMs, {
          error: (error as Error).message,
          reason: 'stage failed',
        }),
      );
      return undefined;
    }
  };

  // INTAKE
  await runStage('intake', () => {
    const sanitizedRequest = redactValue(request);
    audit = {
      ...audit,
      targets: targetsOf(request).map((target) => String(redactValue(target))),
    };
    store.writeAudit(redactValue(audit));
    return { request: sanitizedRequest, targets: audit.targets };
  });

  // PREFLIGHT
  await runStage('preflight', async () => {
    const urls = [...(request.web?.urls ?? [])];
    if (request.api?.baseUrl) urls.push(request.api.baseUrl);
    const deferred = request.mode === 'sandbox' && Boolean(request.repo);
    if (deferred) {
      return {
        checks: ['schema', 'authorization', 'allowlist'],
        reachability: 'deferred: target is started by the sandbox discover stage',
      };
    }
    if (urls.length === 0) {
      return { checks: ['schema', 'authorization', 'allowlist'], reachability: 'no URL to probe' };
    }
    const probes = await Promise.all(
      urls.map((url) => probe(url, config.allowlist, { timeoutMs: 10_000 })),
    );
    const failed = probes.filter((result) => !result.ok);
    if (failed.length > 0) {
      throw new Error(
        `preflight reachability failed: ${failed
          .map((result) => `${result.url} (${result.error ?? result.status})`)
          .join(', ')}`,
      );
    }
    return { checks: ['schema', 'authorization', 'allowlist', 'reachability'], probes };
  });

  // DISCOVER
  const discoveryOutput = await runStage<DiscoveryOutput>('discover', async () => {
    const failures: string[] = [];
    let discovery: DiscoveryResult | undefined;
    let repoAnalysis: RepoAnalysis | undefined;
    let sandbox: SandboxResult | undefined;

    const safeDiscover = async (): Promise<DiscoveryResult> => {
      try {
        return await discoverTargets({
          mode: request.mode,
          scope: request.scope,
          allowlist: config.allowlist,
          web: request.web,
          api: request.api,
          authRef: request.auth?.ref,
        });
      } catch (error) {
        return emptyDiscovery(`discovery failed: ${(error as Error).message}`);
      }
    };

    const repo = request.repo;
    if (repo) {
      const localPath = repo.localPath ? resolve(rootDir, repo.localPath) : undefined;
      if (localPath && !existsSync(localPath)) {
        throw new Error(`local repository not found: ${localPath}`);
      }
      if (localPath) {
        const inside = relative(realpathSync(rootDir), realpathSync(localPath));
        if (inside.startsWith('..') || isAbsolute(inside)) {
          throw new Error('repo.localPath must stay inside the repository root');
        }
      }
      sandboxSession = await sandboxStarter({
        repoUrl: repo.url,
        localPath,
        ref: repo.ref,
        tokenRef: repo.tokenRef,
        allowLocalProcess: Boolean(localPath),
        port: inferPort(request.web?.urls?.[0]),
        healthTimeoutMs: 30_000,
        onRepoReady: ({ repoDir, stack }) => {
          try {
            repoAnalysis = analyzeRepo({ repoDir, stack });
          } catch (error) {
            failures.push(`repo analysis failed: ${(error as Error).message}`);
          }
        },
      });
      sandbox = sandboxSession.result;
      limitations.push(...sandbox.limitations);
      if (!sandbox.ok) {
        failures.push(
          sandbox.error
            ? `${sandbox.reason ?? 'sandbox failed'}: ${sandbox.error}`
            : (sandbox.reason ?? 'sandbox failed'),
        );
      } else {
        discovery = await safeDiscover();
      }
    }

    discovery ??= await safeDiscover();
    if (repoAnalysis) {
      discovery.repo = repoAnalysis;
      discovery.warnings.push(...repoAnalysis.warnings);
    }

    if (request.mode === 'prod-safe') {
      const mutations = findMutationRequests(discovery.traffic);
      if (mutations.length > 0) {
        failures.push(
          `prod-safe violation: ${mutations.length} state-changing request(s) recorded`,
        );
      }
    }
    if (
      (request.web?.urls.length ?? 0) > 0 &&
      discovery.pages.length === 0 &&
      discovery.endpoints.length === 0
    ) {
      failures.push('web discovery produced no pages or endpoints');
    }
    if (
      request.auth?.ref &&
      ((request.web?.urls.length ?? 0) > 0 || Boolean(request.api?.specUrl)) &&
      !discovery.auth.used
    ) {
      failures.push(
        `authentication could not be applied: ${discovery.auth.reason ?? 'unknown reference'}`,
      );
    }

    const safeDiscovery = redactValue(discovery);
    store.writeArtifact('discovery.json', safeDiscovery);
    return { sandbox, discovery: safeDiscovery, failures };
  });

  if (discoveryOutput?.failures.length) {
    incomplete = true;
    limitations.push(...discoveryOutput.failures);
  }

  // MODEL
  const modelOutput = discoveryOutput
    ? await runStage<ModelOutput>('model', () => {
        const discovery = discoveryOutput.discovery;
        const appMap = buildAppMap({
          pages: discovery.pages,
          endpoints: discovery.endpoints,
          repo: discovery.repo,
        });
        const artifactPath = store.writeArtifact('app-map.json', redactValue(appMap));
        appMapStats = appMap.stats;
        builtAppMap = appMap;
        return { path: relativeTo(artifactsRoot, artifactPath), stats: appMap.stats };
      })
    : undefined;
  if (modelOutput) appMapStats = modelOutput.stats;

  // PLAN
  const lanePlan = discoveryOutput
    ? await runStage<LanePlan>('plan', () => planLanes(request, discoveryOutput.discovery))
    : undefined;
  if (lanePlan?.unsupported.length) {
    incomplete = true;
    limitations.push(`requested lanes are not implemented yet: ${lanePlan.unsupported.join(', ')}`);
  }
  if (lanePlan?.reasons.length) limitations.push(...lanePlan.reasons);

  // EXECUTE
  if (!lanePlan || lanePlan.lanes.length === 0) {
    skipStage('execute', 'no lanes selected');
  } else {
    await runStage<ExecuteOutput>('execute', async () => {
      if (!builtAppMap || !discoveryOutput) {
        throw new Error('Application Map is missing before lane execution');
      }
      const laneRun: LaneRunResult = await runLanes(
        {
          runId,
          runDir: store.runDir,
          mode: request.mode,
          scope: request.scope,
          request,
          config,
          discovery: discoveryOutput.discovery,
          appMap: builtAppMap,
          env: process.env,
        },
        lanePlan.lanes,
      );
      laneResults = laneRun.lanes;
      laneTotals = laneRun.totals;
      findings = laneRun.findings;
      sessionResult = laneRun.session;
      store.writeArtifact(
        'lanes.json',
        redactValue({
          lanes: laneRun.lanes,
          totals: laneRun.totals,
          findings: laneRun.findings,
          warnings: laneRun.warnings,
        }),
      );
      store.writeArtifact('findings.json', redactValue(laneRun.findings));
      if (laneRun.session) store.writeArtifact('session.json', redactValue(laneRun.session));
      if (laneRun.warnings.length) limitations.push(...laneRun.warnings);
      return {
        lanes: laneRun.lanes.map((lane) => ({
          lane: lane.lane,
          status: lane.status,
          tests: lane.tests.length,
          passed: lane.tests.filter((test) => test.status === 'passed').length,
          failed: lane.tests.filter((test) => test.status === 'failed').length,
          skipped: lane.tests.filter((test) => test.status === 'skipped').length,
          reason: lane.reason,
        })),
        totals: laneRun.totals,
        findings: laneRun.findings.length,
        warnings: laneRun.warnings,
      };
    });
  }

  // The app must stay alive through discovery and lane execution.
  if (sandboxSession) {
    const teardown = await sandboxSession.stop();
    const discoveryStage = stages.discover;
    if (discoveryStage?.output) {
      const output = discoveryStage.output as DiscoveryOutput;
      output.sandbox = sandboxSession.result;
      store.writeStage(discoveryStage);
    }
    if (!teardown.ok) {
      incomplete = true;
      limitations.push(`sandbox teardown failed: ${teardown.reason ?? 'unknown'}`);
    }
  }

  skipStage('correlate', 'correlation engine is not implemented yet (Phase 4)');
  skipStage('analyze', 'analysis/classification is not implemented yet (Phase 4)');

  // GATE
  await runStage('gate', () => {
    const reasons: string[] = [];
    const laneErrors = laneResults.filter((lane) => lane.status === 'error');
    const skippedLanes = laneResults.filter((lane) => lane.status === 'skipped');
    if (incomplete) reasons.push('run is incomplete: one or more stages failed or were skipped');
    if (laneTotals.failed > 0) reasons.push(`${laneTotals.failed} test case(s) failed`);
    if (laneErrors.length > 0) {
      reasons.push(
        `lane error(s): ${laneErrors.map((lane) => `${lane.lane}: ${lane.reason ?? 'error'}`).join('; ')}`,
      );
    }
    if (lanePlan?.unsupported.length) {
      reasons.push(`unsupported requested lanes: ${lanePlan.unsupported.join(', ')}`);
    }
    if (laneResults.length === 0 && !incomplete) {
      reasons.push('no automated lanes were executed');
    } else if (skippedLanes.length > 0) {
      reasons.push(`skipped lane(s): ${skippedLanes.map((lane) => lane.lane).join(', ')}`);
    }
    if (laneTotals.skipped > 0) {
      reasons.push(`${laneTotals.skipped} test case(s) skipped`);
    }
    gateDecision =
      incomplete || laneTotals.failed > 0 || laneErrors.length > 0
        ? 'NO-GO'
        : laneTotals.tests === 0 || laneTotals.skipped > 0 || skippedLanes.length > 0
          ? 'GO WITH RISKS'
          : 'GO';
    gateReasons = [...new Set(reasons)];
    return { decision: gateDecision, reasons: gateReasons };
  });

  // DOCUMENT + BUNDLE
  const docsDir = join(artifactsRoot, 'artifacts', 'docs', runId);
  const bundlePath = join(artifactsRoot, 'artifacts', 'bundles', `qa-${runId}.zip`);

  const buildSummary = (): RunSummary => {
    const orderedStages = Object.fromEntries(
      STAGE_ORDER.flatMap((name) => (stages[name] ? [[name, stages[name]]] : [])),
    );
    const status: RunSummary['run']['status'] = incomplete ? 'incomplete' : 'complete';
    const finishedAudit = redactValue(
      finishAudit(audit, incomplete ? 'run incomplete' : undefined),
    );
    return {
      schemaVersion: '1.0',
      run: {
        id: runId,
        status,
        mode: request.mode,
        scope: request.scope,
        trigger,
        startedAt: audit.startedAt,
        finishedAt: isoNow(),
        durationMs: Math.max(0, Date.now() - runStartedMs),
      },
      environment: {
        name: config.env,
        baseUrl: request.web?.urls[0] ?? config.baseUrl,
        apiUrl: request.api?.baseUrl ?? config.apiUrl,
        gitSha: process.env.GITHUB_SHA ?? 'local',
        nodeVersion: process.version,
        platform: process.platform,
      },
      request: redactValue(request),
      audit: finishedAudit,
      stages: orderedStages,
      totals: laneTotals,
      gate: { decision: gateDecision, reasons: gateReasons },
      findings: redactValue(findings),
      limitations: [...new Set(limitations)],
      ...(laneResults.length > 0
        ? {
            lanes: laneResults.map((lane) => ({
              lane: lane.lane,
              status: lane.status,
              tests: lane.tests.length,
              passed: lane.tests.filter((test) => test.status === 'passed').length,
              failed: lane.tests.filter((test) => test.status === 'failed').length,
              skipped: lane.tests.filter((test) => test.status === 'skipped').length,
              ...(lane.reason ? { reason: lane.reason } : {}),
            })),
          }
        : {}),
      ...(sessionResult
        ? {
            session: {
              pages: sessionResult.pages.length,
              browserVersion: sessionResult.browserVersion,
            },
          }
        : {}),
      ...(appMapStats ? { appMap: { path: 'app-map.json', ...appMapStats } } : {}),
    };
  };

  stages.document = stageRecord('document', 'ok', Date.now(), {
    output: { dir: relativeTo(artifactsRoot, docsDir) },
  });
  stages.bundle = stageRecord('bundle', 'ok', Date.now(), {
    output: { path: relativeTo(artifactsRoot, bundlePath) },
  });
  store.writeStage(stages.document);
  store.writeStage(stages.bundle);

  let summary = buildSummary();
  store.writeSummary(summary);

  let docsGenerated = false;
  try {
    generateDocs(summary, docsDir, { language: config.docs.language });
    copyLatestDocs(artifactsRoot, docsDir);
    docsGenerated = true;
  } catch (error) {
    stages.document = stageRecord('document', 'failed', Date.now(), {
      error: (error as Error).message,
      reason: 'document generation failed',
    });
    store.writeStage(stages.document);
    incomplete = true;
    summary = buildSummary();
    store.writeSummary(summary);
  }

  let bundleSha256: string | undefined;
  let bundleCreated = false;
  try {
    const bundle = createBundle({
      summary,
      docsDir,
      stagesDir: store.stageDir,
      runDir: store.runDir,
      outFile: bundlePath,
    });
    bundleSha256 = bundle.sha256;
    bundleCreated = true;
  } catch (error) {
    stages.bundle = stageRecord('bundle', 'failed', Date.now(), {
      error: (error as Error).message,
      reason: 'bundle creation failed',
    });
    store.writeStage(stages.bundle);
    incomplete = true;
    summary = buildSummary();
    store.writeSummary(summary);
    if (docsGenerated) {
      try {
        generateDocs(summary, docsDir, { language: config.docs.language });
        copyLatestDocs(artifactsRoot, docsDir);
      } catch {
        // document stage already recorded; keep the original report
      }
    }
  }

  if (incomplete) {
    gateDecision = 'NO-GO';
    if (!gateReasons.some((reason) => reason.startsWith('run is incomplete'))) {
      gateReasons = [...gateReasons, 'run is incomplete'];
    }
    summary = buildSummary();
    store.writeSummary(summary);
    if (docsGenerated) {
      try {
        generateDocs(summary, docsDir, { language: config.docs.language });
        copyLatestDocs(artifactsRoot, docsDir);
      } catch {
        // keep existing report
      }
    }
  }

  const status: RunResult['status'] = incomplete ? 'incomplete' : 'complete';
  const exitCode: RunResult['exitCode'] = incomplete
    ? 3
    : laneTotals.failed > 0
      ? 1
      : gateDecision === 'NO-GO'
        ? 2
        : 0;

  return {
    runId,
    status,
    exitCode,
    gate: gateDecision,
    stages,
    summary,
    ...(docsGenerated ? { docsDir } : {}),
    ...(bundleCreated ? { bundlePath } : {}),
    ...(bundleSha256 ? { bundleSha256 } : {}),
  };
}
