import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SessionResult } from '@nexus/session';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import { compareScreenshotBuffers, runVisualLane } from '../src/index.js';
import type { LaneContext } from '../src/types.js';

describe('Visual Regression Lane & Diffing Engine (8.1)', () => {
  const testDir = mkdtempSync(join(tmpdir(), 'nexus-visual-test-'));

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function makeContext(): LaneContext {
    return {
      runId: 'RUN-VISUAL-01',
      runDir: testDir,
      mode: 'sandbox',
      scope: 'quick',
      request: RunRequestSchema.parse({
        name: 'Visual test',
        mode: 'sandbox',
        web: { urls: ['http://127.0.0.1:3100/'] },
      }),
      config: QaConfigSchema.parse({ env: 'test', allowlist: ['127.0.0.1'] }),
      discovery: {
        pages: [],
        endpoints: [],
        traffic: [],
        warnings: [],
        crawl: {
          robots: { found: false, rules: 0 },
          budget: { requests: 0, maxRequests: 0, exhausted: false },
          circuit: { open: false },
        },
        auth: { used: false },
      },
      appMap: {
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
        stats: { pages: 0, endpoints: 0, code: 0, edges: 0, highRisk: 0, changed: 0 },
      },
    };
  }

  it('compares screenshot buffers and calculates diff ratio accurately', () => {
    const buf1 = Buffer.from('identical-screenshot-bytes-12345');
    const buf2 = Buffer.from('identical-screenshot-bytes-12345');
    const exactMatch = compareScreenshotBuffers(buf1, buf2, 0.1);
    expect(exactMatch.matches).toBe(true);
    expect(exactMatch.diffRatio).toBe(0.0);

    // Byte shift (drift)
    const buf3 = Buffer.from('identical-screenshot-drift-99999');
    const drifted = compareScreenshotBuffers(buf1, buf3, 0.1);
    expect(drifted.matches).toBe(false);
    expect(drifted.diffRatio).toBeGreaterThan(0.001);
  });

  it('establishes new baseline on first run, then detects visual drift on subsequent runs', () => {
    const screenshot1 = join(testDir, 'screen1.png');
    writeFileSync(screenshot1, Buffer.from('initial-screenshot-data-pixels-11111'));

    const mockSession1: SessionResult = {
      pages: [
        {
          url: 'http://127.0.0.1:3100/home',
          path: '/home',
          title: 'Home',
          forms: 0,
          consoleErrors: [],
          pageErrors: [],
          failedRequests: [],
          serverErrors: [],
          a11y: { violations: [], critical: 0, serious: 0, total: 0 },
          vitals: {},
          security: { headers: {}, missingHeaders: [], insecureCookies: [], mixedContent: [] },
          screenshot: screenshot1,
          durationMs: 100,
        },
      ],
      browserVersion: 'chromium 120',
      warnings: [],
      durationMs: 100,
    };

    const ctx = makeContext();

    // First run -> establishes baseline
    const res1 = runVisualLane(ctx, mockSession1);
    expect(res1.status).toBe('passed');
    expect(res1.tests[0].name).toContain('baseline established');

    // Second run with identical screenshot -> passes comparison
    const res2 = runVisualLane(ctx, mockSession1);
    expect(res2.status).toBe('passed');
    expect(res2.tests[0].actual).toContain('Visual diff = 0.00%');

    // Third run with shifted pixels -> fails comparison and generates defect finding
    const screenshot2 = join(testDir, 'screen2.png');
    writeFileSync(screenshot2, Buffer.from('drifted-screenshot-data-pixels-99999'));
    mockSession1.pages[0].screenshot = screenshot2;

    const res3 = runVisualLane(ctx, mockSession1);
    expect(res3.status).toBe('failed');
    expect(res3.tests[0].status).toBe('failed');
    expect(res3.findings).toHaveLength(1);
    expect(res3.findings[0].title).toContain('Visual UI regression detected');
    expect(res3.findings[0].lanes).toContain('visual');
  });
});
