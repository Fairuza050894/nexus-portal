#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  QaConfigSchema,
  RunRequestSchema,
  RunStore,
  validateRunRequest,
  type QaConfig,
  type QaConfigInput,
  type RunRequest,
} from '@nexus/core';
import {
  copyLatestDocs,
  generateDocs,
  generatePdfDocs,
  relativeTo,
  verifyDocs,
  type HistoryPoint,
} from '@nexus/doc-engine';
import { booleanFlag, listFlag, parseArgs, stringFlag, type ParsedArgs } from './args.js';
import { runPipeline } from './pipeline.js';

const USAGE = `Usage:
  qa run --config <run-request.json> [--json]
  qa run --repo <url|local-path> [--url <target>] [--mode sandbox|staging|prod-safe]
  qa run --config <file> --resume <run-id>
  qa run --config <file> --retest-new <baseline-run-id|latest|previous>
  qa plan --config <run-request.json>
  qa docs [--run <run-id>] [--open]
  qa docs:verify [--run <run-id>]
  qa replay <run-id>
  qa clean

Exit codes: 0 ok, 1 test failures, 2 quality gate failed, 3 infrastructure/config/incomplete.`;

function repoRoot(): string {
  return resolve(fileURLToPath(new URL('../../../', import.meta.url)));
}

async function loadConfig(rootDir: string, flags: ParsedArgs['flags']): Promise<QaConfig> {
  const configPath = join(rootDir, 'qa.config.ts');
  if (!existsSync(configPath)) {
    throw new Error(`config not found: ${configPath}`);
  }
  // The config path depends on --root, so it cannot be a static import.
  const module = (await import(pathToFileURL(configPath).href)) as {
    default?: QaConfigInput;
  };
  const parsed = QaConfigSchema.parse(module.default ?? {});
  const override = stringFlag(flags, 'allowlist');
  if (!override) return parsed;
  return {
    ...parsed,
    allowlist: override
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function isRemoteRepo(value: string): boolean {
  return /^(?:https?|ssh):\/\//.test(value) || /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/.test(value);
}

function buildRequest(flags: ParsedArgs['flags']): RunRequest {
  const configPath = stringFlag(flags, 'config');
  const base: Record<string, unknown> = configPath
    ? (JSON.parse(readFileSync(resolve(configPath), 'utf8')) as Record<string, unknown>)
    : { name: 'cli run', mode: 'sandbox', scope: 'quick' };

  const repo = stringFlag(flags, 'repo');
  if (repo) {
    base.repo = isRemoteRepo(repo) ? { url: repo } : { localPath: repo };
  }
  const urls = listFlag(flags, 'url');
  if (urls.length > 0) base.web = { urls };
  const api = stringFlag(flags, 'api');
  const spec = stringFlag(flags, 'spec');
  if (api || spec) {
    base.api = { ...(api ? { baseUrl: api } : {}), ...(spec ? { specUrl: spec } : {}) };
  }
  const mode = stringFlag(flags, 'mode');
  const scope = stringFlag(flags, 'scope');
  const name = stringFlag(flags, 'name');
  if (mode) base.mode = mode;
  if (scope) base.scope = scope;
  if (name) base.name = name;

  return RunRequestSchema.parse(base);
}

function printPlan(request: RunRequest, config: QaConfig): void {
  const plan = {
    name: request.name,
    mode: request.mode,
    scope: request.scope,
    targets: request,
    lanes: request.lanes ?? {},
    allowlist: config.allowlist,
    implemented: {
      run: [
        'intake',
        'preflight',
        'discover (crawl, OpenAPI, repo analysis)',
        'model (Application Map)',
        'plan (lane selection)',
        'execute (repo, API, E2E, a11y, Web Vitals, passive security)',
        'correlate (dedupe, classify, Application Map correlation)',
        'analyze (baseline comparison)',
        'gate',
        'document (15 documents, PDF/XLSX, verify)',
        'bundle',
      ],
      notImplemented: ['visual baseline', 'test generation'],
    },
  };
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

function openPath(filePath: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function runCommand(args: ParsedArgs, rootDir: string): Promise<number> {
  const config = await loadConfig(rootDir, args.flags);
  const request = buildRequest(args.flags);
  const verdict = validateRunRequest(request, {
    allowlist: config.allowlist,
    allowedModes: config.modes,
  });
  if (!verdict.allowed || !verdict.runRequest) {
    process.stderr.write(
      `REJECTED:\n${verdict.reasons.map((reason) => `- ${reason}`).join('\n')}\n`,
    );
    return 3;
  }

  const result = await runPipeline({
    rootDir,
    config,
    request: verdict.runRequest,
    requestedBy: 'cli',
    trigger: 'manual',
    resumeRunId: stringFlag(args.flags, 'resume'),
    retestNew: stringFlag(args.flags, 'retest-new'),
  });

  if (booleanFlag(args.flags, 'json')) {
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Run: ${result.runId}`,
        `Status: ${result.status}`,
        `Gate: ${result.gate}`,
        `Tests: ${result.summary.totals.passed}/${result.summary.totals.tests} passed, ${result.summary.totals.failed} failed, ${result.summary.totals.skipped} skipped`,
        `Findings: ${result.summary.findings.length}`,
        `Docs: ${result.docsDir ? relativeTo(rootDir, result.docsDir) : 'not generated'}`,
        `Bundle: ${result.bundlePath ? relativeTo(rootDir, result.bundlePath) : 'not generated'}`,
        ...(result.summary.gate.reasons.length
          ? ['Reasons:', ...result.summary.gate.reasons.map((reason) => `- ${reason}`)]
          : []),
        '',
      ].join('\n'),
    );
  }
  return result.exitCode;
}

async function planCommand(args: ParsedArgs, rootDir: string): Promise<number> {
  const config = await loadConfig(rootDir, args.flags);
  const request = buildRequest(args.flags);
  const verdict = validateRunRequest(request, {
    allowlist: config.allowlist,
    allowedModes: config.modes,
  });
  if (!verdict.allowed || !verdict.runRequest) {
    process.stderr.write(
      `REJECTED:\n${verdict.reasons.map((reason) => `- ${reason}`).join('\n')}\n`,
    );
    return 3;
  }
  printPlan(verdict.runRequest, config);
  return 0;
}

function historyFor(rootDir: string, runId: string): HistoryPoint[] {
  return RunStore.listRunIds(rootDir)
    .filter((id) => id !== runId)
    .slice(0, 30)
    .map((id) => RunStore.readSummaryById(rootDir, id))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((item) => ({
      runId: item.run.id,
      startedAt: item.run.startedAt,
      passRate:
        item.totals.passed + item.totals.failed > 0
          ? (item.totals.passed / (item.totals.passed + item.totals.failed)) * 100
          : 100,
      tests: item.totals.tests,
      passed: item.totals.passed,
      failed: item.totals.failed,
      skipped: item.totals.skipped,
      durationMs: item.run.durationMs,
      gate: item.gate.decision,
    }))
    .reverse();
}

async function docsCommand(args: ParsedArgs, rootDir: string): Promise<number> {
  const config = await loadConfig(rootDir, args.flags);
  const runId = stringFlag(args.flags, 'run') ?? RunStore.latestRunId(rootDir);
  if (!runId) {
    throw new Error('no runs found under artifacts/runs');
  }
  const summary = RunStore.readSummaryById(rootDir, runId);
  if (!summary) {
    throw new Error(`run summary not found for ${runId}`);
  }
  const docsDir = join(rootDir, 'artifacts', 'docs', runId);
  generateDocs(summary, docsDir, {
    language: config.docs.language,
    runDir: join(rootDir, 'artifacts', 'runs', runId),
    history: historyFor(rootDir, runId),
  });
  const pdf = await generatePdfDocs(docsDir, [
    'executive-summary.html',
    'execution-report.html',
    'plan-approval.html',
    'failure-analysis.html',
  ]);
  for (const warning of pdf.warnings) process.stderr.write(`warning: ${warning}\n`);
  copyLatestDocs(rootDir, docsDir);
  const verification = verifyDocs(docsDir, { requirePdf: pdf.generated.length > 0 });
  process.stdout.write(`Docs: ${relativeTo(rootDir, join(docsDir, 'index.html'))}\n`);
  process.stdout.write(
    `PDF: ${pdf.generated.length} file(s) · Verification: ${verification.ok ? 'ok' : 'FAILED'}\n`,
  );
  for (const error of verification.errors) process.stderr.write(`error: ${error}\n`);
  if (booleanFlag(args.flags, 'open')) openPath(join(docsDir, 'index.html'));
  return verification.ok ? 0 : 1;
}

function verifyDocsCommand(args: ParsedArgs, rootDir: string): number {
  const runId = stringFlag(args.flags, 'run') ?? RunStore.latestRunId(rootDir);
  if (!runId) throw new Error('no runs found under artifacts/runs');
  const docsDir = join(rootDir, 'artifacts', 'docs', runId);
  const verification = verifyDocs(docsDir);
  process.stdout.write(
    `Verified ${verification.verifiedFiles.length} file(s) in ${relativeTo(rootDir, docsDir)}\n`,
  );
  for (const warning of verification.warnings) process.stdout.write(`warning: ${warning}\n`);
  for (const error of verification.errors) process.stderr.write(`error: ${error}\n`);
  process.stdout.write(`Result: ${verification.ok ? 'ok' : 'FAILED'}\n`);
  return verification.ok ? 0 : 1;
}

async function replayCommand(args: ParsedArgs, rootDir: string): Promise<number> {
  const runId = stringFlag(args.flags, 'run') ?? args.positionals[1];
  if (!runId) throw new Error('replay requires a run id');
  const summary = RunStore.readSummaryById(rootDir, runId);
  if (!summary) throw new Error(`run summary not found for ${runId}`);
  const config = await loadConfig(rootDir, args.flags);
  const request = RunRequestSchema.parse(summary.request);
  const verdict = validateRunRequest(request, {
    allowlist: config.allowlist,
    allowedModes: config.modes,
  });
  if (!verdict.allowed || !verdict.runRequest) {
    process.stderr.write(
      `REJECTED:\n${verdict.reasons.map((reason) => `- ${reason}`).join('\n')}\n`,
    );
    return 3;
  }
  const result = await runPipeline({
    rootDir,
    config,
    request: verdict.runRequest,
    requestedBy: `replay:${runId}`,
    trigger: 'replay',
  });
  process.stdout.write(`Run: ${result.runId}\nStatus: ${result.status}\nGate: ${result.gate}\n`);
  return result.exitCode;
}

function cleanCommand(rootDir: string, args: ParsedArgs): number {
  const artifacts = join(rootDir, 'artifacts');
  if (!booleanFlag(args.flags, 'yes')) {
    process.stderr.write('refusing to delete artifacts without --yes\n');
    return 3;
  }
  rmSync(artifacts, { recursive: true, force: true });
  process.stdout.write(`Removed ${relativeTo(rootDir, artifacts)}\n`);
  return 0;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (booleanFlag(parsed.flags, 'help') || !parsed.command || parsed.command === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return parsed.command ? 0 : 3;
  }
  const rootDir = stringFlag(parsed.flags, 'root')
    ? resolve(stringFlag(parsed.flags, 'root')!)
    : repoRoot();

  switch (parsed.command) {
    case 'run':
      return runCommand(parsed, rootDir);
    case 'plan':
      return planCommand(parsed, rootDir);
    case 'docs':
      return docsCommand(parsed, rootDir);
    case 'docs:verify':
      return verifyDocsCommand(parsed, rootDir);
    case 'replay':
      return replayCommand(parsed, rootDir);
    case 'clean':
      return cleanCommand(rootDir, parsed);
    default:
      process.stderr.write(`unknown command: ${parsed.command}\n\n${USAGE}\n`);
      return 3;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`INFRA ERROR: ${(error as Error).message}\n`);
    process.exitCode = 3;
  });
