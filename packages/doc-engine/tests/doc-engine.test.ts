import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Finding, RunSummary } from '@nexus/core';
import { createBundle, generateDocs, listZipNames, verifyDocs } from '../src/index.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-docs-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    schemaVersion: '2.0',
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
        status: 'ok',
        startedAt: '2026-10-26T00:00:00.200Z',
        finishedAt: '2026-10-26T00:00:00.900Z',
        durationMs: 700,
      },
    },
    totals: { tests: 0, passed: 0, failed: 0, skipped: 0, lanes: [] },
    gate: { decision: 'GO WITH RISKS', reasons: ['no automated lanes were executed'] },
    findings: [],
    limitations: ['foundation phase'],
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    title: 'Checkout failed',
    severity: 'high',
    confidence: 'verified',
    category: 'app-bug',
    lanes: ['e2e', 'api'],
    occurrences: 2,
    evidence: [
      { type: 'screenshot', path: 'evidence/session/checkout.png' },
      { type: 'network', status: 500 },
    ],
    expected: 'HTTP 200',
    actual: 'HTTP 500',
    status: 'new',
    ...overrides,
  };
}

function allPass(): RunSummary {
  return summary({
    totals: { tests: 5, passed: 5, failed: 0, skipped: 0, flaky: 0, lanes: ['api', 'e2e'] },
    gate: { decision: 'GO', reasons: [] },
    tests: [
      {
        id: 'TC-1',
        lane: 'api',
        title: 'GET /health',
        status: 'passed',
        durationMs: 12,
        requirements: ['REQ-HEALTH-01'],
      },
      {
        id: 'TC-2',
        lane: 'e2e',
        title: 'Home page loads',
        status: 'passed',
        durationMs: 50,
      },
    ],
    lanes: [
      { lane: 'api', status: 'passed', tests: 1, passed: 1, failed: 0, skipped: 0, durationMs: 20 },
      { lane: 'e2e', status: 'passed', tests: 1, passed: 1, failed: 0, skipped: 0, durationMs: 60 },
    ],
    requirements: [
      {
        id: 'REQ-HEALTH-01',
        title: 'Health endpoint',
        acceptance: ['GET /health -> 200'],
        tests: ['TC-1'],
        covered: true,
      },
    ],
    coverage: {
      requirementsTotal: 1,
      requirementsCovered: 1,
      featureCoverage: { api: { total: 1, passed: 1, covered: true } },
      uncovered: [],
    },
  });
}

describe('doc engine', () => {
  it('writes the full document set and passes verification', () => {
    const docsDir = tempDir();
    const files = generateDocs(allPass(), docsDir, { language: 'id' });
    expect(files.length).toBeGreaterThanOrEqual(25);
    for (const file of [
      'index.html',
      'executive-summary.html',
      'executive-summary.md',
      'execution-report.html',
      'test-catalogue.html',
      'test-catalogue.csv',
      'test-catalogue.md',
      'test-catalogue.xlsx',
      'traceability-matrix.html',
      'traceability-matrix.csv',
      'traceability-matrix.xlsx',
      'failure-analysis.html',
      'failure-analysis.md',
      'trend-stability.html',
      'coverage-report.html',
      'findings-register.html',
      'findings-register.csv',
      'findings-register.md',
      'findings-register.xlsx',
      'findings.sarif',
      'junit.xml',
      'application-map.html',
      'run-comparison.html',
      'plan-approval.html',
      'not-covered.html',
      'report.md',
    ]) {
      expect(existsSync(join(docsDir, file)), file).toBe(true);
    }

    const verification = verifyDocs(docsDir);
    expect(verification.errors).toEqual([]);
    expect(verification.ok).toBe(true);

    const html = readFileSync(join(docsDir, 'index.html'), 'utf8');
    expect(html).toContain('GO');
    const markdown = readFileSync(join(docsDir, 'report.md'), 'utf8');
    expect(markdown).toContain('# Ringkasan');
    expect(markdown).toContain('REQ-HEALTH-01');

    const xlsxNames = listZipNames(readFileSync(join(docsDir, 'test-catalogue.xlsx')));
    expect(xlsxNames).toContain('xl/worksheets/sheet1.xml');
  });

  it('escapes data and never emits undefined for missing metadata', () => {
    const docsDir = tempDir();
    const data = summary({
      limitations: ['no lanes requested <script>alert(1)</script>'],
      findings: [finding({ title: '<img src=x onerror=alert(1)>', evidence: [] })],
    });
    generateDocs(data, docsDir, { language: 'id' });
    const notCovered = readFileSync(join(docsDir, 'not-covered.html'), 'utf8');
    expect(notCovered).toContain('&lt;script&gt;');
    expect(notCovered).not.toContain('<script>alert(1)</script>');
    const markdown = readFileSync(join(docsDir, 'report.md'), 'utf8');
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).not.toContain('<script>alert(1)</script>');
    expect(verifyDocs(docsDir).ok).toBe(true);
  });

  it('renders failures, defect drafts, and multi-lane correlation evidence', () => {
    const docsDir = tempDir();
    const multi = finding();
    const data = summary({
      totals: { tests: 3, passed: 2, failed: 1, skipped: 0, lanes: ['e2e', 'api'] },
      gate: { decision: 'NO-GO', reasons: ['1 verified defect(s)'] },
      findings: [
        multi,
        finding({
          id: 'F-0002',
          title: 'Console error on home',
          confidence: 'auto-discovered',
          severity: 'medium',
          category: 'app-bug',
          lanes: ['e2e'],
          evidence: [],
        }),
      ],
      tests: [
        {
          id: 'TC-3',
          lane: 'api',
          title: 'POST /orders',
          status: 'failed',
          durationMs: 30,
          expected: '201',
          actual: '500',
          reason: 'status mismatch',
        },
      ],
      confidenceTotals: { verified: 1, autoDiscovered: 1, needsReview: 0 },
    });
    generateDocs(data, docsDir, { language: 'en' });

    expect(existsSync(join(docsDir, 'defects', 'DEFECT-F-0001.md'))).toBe(true);
    const defect = readFileSync(join(docsDir, 'defects', 'DEFECT-F-0001.md'), 'utf8');
    expect(defect).toContain('DEFECT');
    expect(defect).toContain('HTTP 500');
    const failure = readFileSync(join(docsDir, 'failure-analysis.html'), 'utf8');
    expect(failure).toContain('e2e, api');
    expect(failure).toContain('network');
    const register = readFileSync(join(docsDir, 'findings-register.html'), 'utf8');
    expect(register).toContain('verified (1)');
    expect(register).toContain('auto-discovered (1)');
    expect(register).toContain('needs-review (0)');
    expect(verifyDocs(docsDir).ok).toBe(true);
  });

  it('handles flaky runs and incomplete runs honestly', () => {
    const flakyDir = tempDir();
    generateDocs(
      summary({
        totals: { tests: 5, passed: 4, failed: 0, skipped: 0, flaky: 1, lanes: ['e2e'] },
        gate: { decision: 'GO WITH RISKS', reasons: ['flaky rate 20.0% exceeds threshold of 2%'] },
        tests: [
          { id: 'TC-9', lane: 'e2e', title: 'Login', status: 'flaky', durationMs: 40, reason: 'passed on retry' },
        ],
        findings: [finding({ category: 'flaky', confidence: 'auto-discovered', severity: 'medium' })],
      }),
      flakyDir,
      { language: 'en' },
    );
    expect(readFileSync(join(flakyDir, 'trend-stability.html'), 'utf8')).toContain('Login');
    expect(readFileSync(join(flakyDir, 'execution-report.html'), 'utf8')).toContain('passed on retry');
    expect(verifyDocs(flakyDir).ok).toBe(true);

    const incompleteDir = tempDir();
    generateDocs(
      summary({
        run: { ...summary().run, status: 'incomplete' },
        stages: {
          execute: {
            name: 'execute',
            status: 'failed',
            startedAt: '2026-10-26T00:00:00.000Z',
            finishedAt: '2026-10-26T00:00:01.000Z',
            durationMs: 1000,
            error: 'browser crashed',
            reason: 'stage failed',
          },
        },
        totals: { tests: 0, passed: 0, failed: 0, skipped: 0, lanes: [] },
        gate: { decision: 'NO-GO', reasons: ['run is incomplete'] },
      }),
      incompleteDir,
      { language: 'en' },
    );
    const notCovered = readFileSync(join(incompleteDir, 'not-covered.html'), 'utf8');
    expect(notCovered).toContain('execute');
    expect(notCovered).toContain('browser crashed');
    expect(verifyDocs(incompleteDir).ok).toBe(true);
  });

  it('renders zero-test and missing-metadata runs without fabricating results', () => {
    const docsDir = tempDir();
    const zero = summary({
      totals: { tests: 0, passed: 0, failed: 0, skipped: 0, lanes: [] },
      gate: { decision: 'GO WITH RISKS', reasons: ['no automated tests were executed'] },
    });
    generateDocs(zero, docsDir, { language: 'en' });
    expect(readFileSync(join(docsDir, 'test-catalogue.html'), 'utf8')).toContain(
      'No per-case test results',
    );
    expect(readFileSync(join(docsDir, 'coverage-report.html'), 'utf8')).toContain(
      'No requirements were loaded',
    );
    expect(verifyDocs(docsDir).ok).toBe(true);

    const missing = tempDir();
    const bare = summary();
    delete bare.tests;
    delete bare.lanes;
    delete bare.coverage;
    delete bare.requirements;
    generateDocs(bare, missing, { language: 'en' });
    expect(verifyDocs(missing).ok).toBe(true);
  });

  it('renders Indonesian and English labels', () => {
    const idDir = tempDir();
    const enDir = tempDir();
    generateDocs(allPass(), idDir, { language: 'id' });
    generateDocs(allPass(), enDir, { language: 'en' });
    expect(readFileSync(join(idDir, 'executive-summary.html'), 'utf8')).toContain(
      'Keputusan',
    );
    expect(readFileSync(join(enDir, 'executive-summary.html'), 'utf8')).toContain(
      'Decision',
    );
  });

  it('fails verification on placeholders, broken links, secrets, PII, and bad PDFs', () => {
    const docsDir = tempDir();
    generateDocs(allPass(), docsDir);

    writeFileSync(join(docsDir, 'bad-template.html'), '<div>{{ placeholder }} TODO</div>', 'utf8');
    expect(verifyDocs(docsDir).errors.some((error) => error.includes('Unrendered placeholder'))).toBe(
      true,
    );
    rmSync(join(docsDir, 'bad-template.html'));

    writeFileSync(join(docsDir, 'bad-link.html'), '<a href="missing.html">x</a>', 'utf8');
    expect(verifyDocs(docsDir).errors.some((error) => error.includes('broken link'))).toBe(true);
    rmSync(join(docsDir, 'bad-link.html'));

    writeFileSync(
      join(docsDir, 'bad-secret.html'),
      'Token: ghp_123456789012345678901234567890123456',
      'utf8',
    );
    expect(verifyDocs(docsDir).errors.some((error) => error.includes('secret leak'))).toBe(true);
    rmSync(join(docsDir, 'bad-secret.html'));

    writeFileSync(join(docsDir, 'bad-pii.md'), 'Contact: person@example.com', 'utf8');
    expect(verifyDocs(docsDir).errors.some((error) => error.includes('PII leak'))).toBe(true);
    rmSync(join(docsDir, 'bad-pii.md'));

    writeFileSync(join(docsDir, 'executive-summary.pdf'), 'not a pdf', 'utf8');
    expect(verifyDocs(docsDir).errors.some((error) => error.includes('PDF does not open'))).toBe(
      true,
    );
    writeFileSync(join(docsDir, 'executive-summary.pdf'), '%PDF-1.7\n', 'utf8');
    expect(verifyDocs(docsDir, { requirePdf: true }).ok).toBe(true);

    writeFileSync(join(docsDir, 'findings.sarif'), '{"version":"2.0","runs":[]}', 'utf8');
    expect(
      verifyDocs(docsDir).errors.some((error) => error.includes('SARIF validation failed')),
    ).toBe(true);

    writeFileSync(join(docsDir, 'junit.xml'), '<testsuites><testsuite>', 'utf8');
    expect(
      verifyDocs(docsDir).errors.some((error) => error.includes('JUnit XML is not well-formed')),
    ).toBe(true);
  });

  it('renders retest-new with recurring findings kept in an appendix', () => {
    const docsDir = tempDir();
    const newFinding = finding({ id: 'F-0001', title: 'New checkout bug', status: 'new' });
    const recurring = finding({
      id: 'F-0002',
      title: 'Recurring old bug',
      status: 'recurring',
      severity: 'low',
    });
    generateDocs(
      summary({
        findings: [newFinding, recurring],
        baseline: {
          baselineRunId: 'run-baseline',
          mode: 'retest-new',
          newFindings: 1,
          recurringFindings: 1,
          fixedFindings: 0,
          regressedFindings: 0,
        },
      }),
      docsDir,
      { language: 'en' },
    );

    const html = readFileSync(join(docsDir, 'run-comparison.html'), 'utf8');
    expect(html).toContain('retest-new');
    expect(html).toContain('New checkout bug');
    expect(html).toContain('Recurring old bug');
    expect(html.indexOf('Recurring old bug')).toBeGreaterThan(html.indexOf('<details'));
    expect(verifyDocs(docsDir).ok).toBe(true);
  });

  it('exports schema-valid SARIF 2.1.0 and deterministic JUnit XML', () => {
    const docsDir = tempDir();
    generateDocs(
      summary({
        totals: { tests: 2, passed: 1, failed: 1, skipped: 0, lanes: ['api'] },
        gate: { decision: 'NO-GO', reasons: ['1 verified defect(s)'] },
        findings: [finding({ ruleId: 'e2e-page-load' })],
        confidenceTotals: { verified: 1, autoDiscovered: 0, needsReview: 0 },
        tests: [
          {
            id: 'TC-1',
            lane: 'api',
            title: 'GET /orders',
            status: 'failed',
            durationMs: 25,
            expected: '200',
            actual: '500',
            reason: 'status mismatch',
          },
          {
            id: 'TC-2',
            lane: 'api',
            title: 'GET /health',
            status: 'passed',
            durationMs: 5,
          },
        ],
      }),
      docsDir,
      { language: 'en' },
    );

    const sarif = JSON.parse(readFileSync(join(docsDir, 'findings.sarif'), 'utf8'));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('nexus-portal');
    expect(sarif.runs[0].results[0].ruleId).toBe('e2e-page-load');
    expect(sarif.runs[0].results[0].level).toBe('error');
    expect(sarif.runs[0].results[0].partialFingerprints.nexusFingerprintV2).toHaveLength(64);

    const junit = readFileSync(join(docsDir, 'junit.xml'), 'utf8');
    expect(junit).toContain('<testsuites');
    expect(junit).toContain('tests="2"');
    expect(junit).toContain('<failure message="500"');
    expect(verifyDocs(docsDir).ok).toBe(true);
  });

  it('creates a readable bundle with docs, stages, and checksums', () => {
    const root = tempDir();
    const docsDir = join(root, 'docs');
    const stagesDir = join(root, 'stages');
    mkdirSync(stagesDir);
    const manifest = allPass();
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
        'test-catalogue.xlsx',
        'checksums.txt',
      ]),
    );
    const zipBuffer = readFileSync(bundle.path);
    expect(listZipNames(zipBuffer)).toEqual(bundle.names);
    expect(bundle.sha256).toHaveLength(64);
  });
});
