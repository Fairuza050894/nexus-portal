import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunSummary } from '@nexus/core';
import { createBundle, generateDocs, listZipNames } from '../src/index.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-docs-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function summary(): RunSummary {
  return {
    schemaVersion: '1.0',
    run: {
      id: 'run-001',
      status: 'complete',
      mode: 'sandbox',
      scope: 'quick',
      trigger: 'manual',
      startedAt: '2026-10-26T00:00:00.000Z',
      finishedAt: '2026-10-26T00:00:01.000Z',
      durationMs: 1000,
    },
    environment: {
      name: 'local',
      baseUrl: 'http://127.0.0.1:3100',
      gitSha: 'local',
      nodeVersion: 'v20.0.0',
      platform: 'darwin',
    },
    request: { name: 'smoke', mode: 'sandbox' },
    audit: {
      runId: 'run-001',
      requestedBy: 'test',
      mode: 'sandbox',
      targets: ['http://127.0.0.1:3100'],
      startedAt: '2026-10-26T00:00:00.000Z',
      finishedAt: '2026-10-26T00:00:01.000Z',
      requestCount: 0,
    },
    stages: {
      intake: {
        name: 'intake',
        status: 'ok',
        startedAt: '2026-10-26T00:00:00.000Z',
        finishedAt: '2026-10-26T00:00:00.100Z',
        durationMs: 100,
      },
      execute: {
        name: 'execute',
        status: 'skipped',
        startedAt: '2026-10-26T00:00:00.200Z',
        finishedAt: '2026-10-26T00:00:00.200Z',
        durationMs: 0,
        reason: 'no lanes requested <script>alert(1)</script>',
      },
    },
    totals: { tests: 0, passed: 0, failed: 0, skipped: 0, lanes: [] },
    gate: { decision: 'GO WITH RISKS', reasons: ['no automated lanes were executed'] },
    findings: [],
    limitations: ['foundation phase'],
  };
}

describe('doc engine', () => {
  it('writes markdown, HTML, and a JSON manifest with escaped content', () => {
    const docsDir = tempDir();
    const files = generateDocs(summary(), docsDir, { language: 'id' });
    expect(files).toHaveLength(3);
    expect(existsSync(join(docsDir, 'index.html'))).toBe(true);
    const html = readFileSync(join(docsDir, 'index.html'), 'utf8');
    expect(html).toContain('GO WITH RISKS');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    const markdown = readFileSync(join(docsDir, 'report.md'), 'utf8');
    expect(markdown).toContain('# Laporan QA');
    expect(markdown).toContain('no lanes requested');
  });

  it('creates a readable bundle with docs, stages, and checksums', () => {
    const root = tempDir();
    const docsDir = join(root, 'docs');
    const stagesDir = join(root, 'stages');
    mkdirSync(stagesDir);
    const manifest = summary();
    generateDocs(manifest, docsDir);
    writeFileSync(join(stagesDir, 'intake.json'), JSON.stringify(manifest.stages.intake));

    const bundle = createBundle({
      summary: manifest,
      docsDir,
      stagesDir,
      outFile: join(root, 'qa-run-001.zip'),
    });

    expect(existsSync(bundle.path)).toBe(true);
    expect(bundle.names).toEqual(
      expect.arrayContaining([
        'index.html',
        'report.md',
        'run-summary.json',
        'stages/intake.json',
        'checksums.txt',
      ]),
    );
    const zipBuffer = readFileSync(bundle.path);
    expect(listZipNames(zipBuffer)).toEqual(bundle.names);
    expect(bundle.sha256).toHaveLength(64);
  });
});
