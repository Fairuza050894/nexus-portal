import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuditRecord, RunSummary, StageSummary } from './types.js';

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`invalid run id: ${runId}`);
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tempPath, filePath);
}

function readJson<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export class RunStore {
  readonly runDir: string;
  readonly stageDir: string;

  constructor(rootDir: string, runId: string) {
    assertRunId(runId);
    this.runDir = join(rootDir, 'artifacts', 'runs', runId);
    this.stageDir = join(this.runDir, 'stages');
  }

  writeStage(stage: StageSummary): void {
    writeJsonAtomic(join(this.stageDir, `${stage.name}.json`), stage);
  }

  readStage(name: string): StageSummary | undefined {
    return readJson<StageSummary>(join(this.stageDir, `${name}.json`));
  }

  writeArtifact(name: string, value: unknown): string {
    const filePath = join(this.runDir, this.safeArtifactName(name));
    writeJsonAtomic(filePath, value);
    return filePath;
  }

  private safeArtifactName(name: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
      throw new Error(`invalid artifact name: ${name}`);
    }
    return name;
  }

  writeAudit(audit: AuditRecord): void {
    writeJsonAtomic(join(this.runDir, 'audit.json'), audit);
  }

  readAudit(): AuditRecord | undefined {
    return readJson<AuditRecord>(join(this.runDir, 'audit.json'));
  }

  writeSummary(summary: RunSummary): void {
    writeJsonAtomic(join(this.runDir, 'run-summary.json'), summary);
  }

  static listRunIds(rootDir: string): string[] {
    const runsDir = join(rootDir, 'artifacts', 'runs');
    if (!existsSync(runsDir)) return [];
    return readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  }

  static latestRunId(rootDir: string): string | undefined {
    return RunStore.listRunIds(rootDir)[0];
  }

  static readSummaryById(rootDir: string, runId: string): RunSummary | undefined {
    assertRunId(runId);
    return readJson<RunSummary>(join(rootDir, 'artifacts', 'runs', runId, 'run-summary.json'));
  }
}
