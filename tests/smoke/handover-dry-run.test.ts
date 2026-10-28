import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunStore } from '@nexus/core';
import { verifyDocs } from '@nexus/doc-engine';

describe('Final Handover Dry Run & Operational Acceptance (9.5)', () => {
  const rootDir = process.cwd();

  it('verifies that the latest platform run bundle is valid, sealed, and verified', () => {
    const latestRunId = RunStore.latestRunId(rootDir);
    expect(latestRunId).toBeDefined();

    if (latestRunId) {
      const docsDir = join(rootDir, 'artifacts', 'docs', latestRunId);
      expect(existsSync(docsDir)).toBe(true);

      // Verify all essential files are present
      expect(existsSync(join(docsDir, 'index.html'))).toBe(true);
      expect(existsSync(join(docsDir, 'executive-summary.pdf'))).toBe(true);
      expect(existsSync(join(docsDir, 'findings.sarif'))).toBe(true);
      expect(existsSync(join(docsDir, 'junit.xml'))).toBe(true);
      expect(existsSync(join(docsDir, 'application-map.json'))).toBe(true);

      // Run official doc-engine verification
      const verification = verifyDocs(docsDir);
      expect(verification.ok).toBe(true);
      expect(verification.errors).toHaveLength(0);

      // Verify sealed zip bundle exists
      const bundlePath = join(rootDir, 'artifacts', 'bundles', `qa-${latestRunId}.zip`);
      expect(existsSync(bundlePath)).toBe(true);
    }
  });

  it('verifies that the operational Runbook and Contributor Guide exist and are complete', () => {
    const runbookPath = join(rootDir, 'docs', 'RUNBOOK.md');
    expect(existsSync(runbookPath)).toBe(true);
    const runbookContent = readFileSync(runbookPath, 'utf8');
    expect(runbookContent).toContain('Operational Runbook');
    expect(runbookContent).toContain('Renewable Authorization');
    expect(runbookContent).toContain('Concurrency Control');

    const contributingPath = join(rootDir, 'CONTRIBUTING.md');
    expect(existsSync(contributingPath)).toBe(true);
    const contributingContent = readFileSync(contributingPath, 'utf8');
    expect(contributingContent).toContain('Contributor Guide');
    expect(contributingContent).toContain('How to Add a New Test Lane');
    expect(contributingContent).toContain('How to Add a New Test Type');
  });

  it('verifies that all CI/CD workflows are configured', () => {
    const workflows = [
      'pr-check.yml',
      'nightly-regression.yml',
      'manual-run.yml',
      'release-gate.yml',
      'docs-only.yml',
    ];

    for (const wf of workflows) {
      const p = join(rootDir, '.github', 'workflows', wf);
      expect(existsSync(p)).toBe(true);
    }
  });
});
