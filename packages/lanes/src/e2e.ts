import { relative } from 'node:path';
import type { SessionResult } from '@nexus/session';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

function firstParty(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export function runE2eLane(context: LaneContext, session: SessionResult | undefined): LaneResult {
  const startedAt = Date.now();
  if (!session || session.pages.length === 0) {
    return {
      lane: 'e2e',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: context.discovery.pages.length === 0 ? 'no crawled pages' : 'no browser session',
      durationMs: Date.now() - startedAt,
    };
  }

  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  for (const [index, page] of session.pages.entries()) {
    const failed =
      Boolean(page.error) ||
      (page.status !== undefined && page.status >= 400) ||
      page.pageErrors.length > 0 ||
      page.serverErrors.length > 0;
    tests.push({
      id: `TC-E2E-${String(index + 1).padStart(3, '0')}`,
      lane: 'e2e',
      name: `page ${page.path} loads without uncaught errors`,
      status: failed ? 'failed' : 'passed',
      durationMs: page.durationMs,
      expected: 'page loads with status <400 and no uncaught errors/5xx',
      actual:
        page.error ??
        `status=${page.status ?? 'n/a'}, pageErrors=${page.pageErrors.length}, 5xx=${page.serverErrors.length}`,
      ...(page.error ? { reason: page.error } : {}),
      ...(page.screenshot
        ? { evidence: [{ type: 'screenshot', path: relative(context.runDir, page.screenshot) }] }
        : {}),
    });

    if (page.forms > 0) {
      tests.push({
        id: `TC-E2E-${String(index + 1).padStart(3, '0')}-FORM`,
        lane: 'e2e',
        name: `form presence on ${page.path}`,
        status: 'passed',
        durationMs: page.durationMs,
        expected: '>=1 form rendered',
        actual: `${page.forms} form(s)`,
      });
    }
    if (page.error) {
      drafts.push({
        title: `Page ${page.path} failed to load`,
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'app-bug',
        lane: 'e2e',
        affected: [{ page: page.path }],
        expected: 'page loads',
        actual: page.error,
        evidence: page.screenshot
          ? [{ type: 'screenshot', path: relative(context.runDir, page.screenshot) }]
          : [],
      });
    }
    for (const [errorIndex, error] of page.pageErrors.entries()) {
      drafts.push({
        title: `Uncaught JavaScript error on ${page.path}`,
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'app-bug',
        lane: 'e2e',
        affected: [{ page: page.path }],
        actual: error,
        evidence: [{ type: 'log', path: `${page.path}#pageerror-${errorIndex + 1}` }],
      });
    }
    for (const [errorIndex, error] of page.consoleErrors.entries()) {
      drafts.push({
        title: `Console error on ${page.path}`,
        severity: 'medium',
        confidence: 'auto-discovered',
        category: 'app-bug',
        lane: 'e2e',
        affected: [{ page: page.path }],
        actual: error,
        evidence: [{ type: 'log', path: `${page.path}#console-${errorIndex + 1}` }],
      });
    }
    for (const failure of page.failedRequests) {
      if (!firstParty(failure.url, page.url)) continue;
      drafts.push({
        title: `First-party request failed on ${page.path}`,
        severity: 'medium',
        confidence: 'auto-discovered',
        category: 'app-bug',
        lane: 'e2e',
        affected: [{ page: page.path, request: failure.url }],
        actual: failure.reason,
        evidence: [{ type: 'har-lite', path: failure.url }],
      });
    }
    for (const failure of page.serverErrors) {
      drafts.push({
        title: `Server error ${failure.status} on ${page.path}`,
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'app-bug',
        lane: 'e2e',
        affected: [{ page: page.path, endpoint: failure.url }],
        actual: `HTTP ${failure.status}`,
        evidence: [{ type: 'har-lite', path: failure.url }],
      });
    }
  }

  if (context.request.testRows?.e2e?.length) {
    tests.push({
      id: 'TC-E2E-ROWS',
      lane: 'e2e',
      name: 'user-provided E2E rows',
      status: 'skipped',
      durationMs: 0,
      reason: 'Test Builder row schema lands in Phase 5',
    });
  }

  return {
    lane: 'e2e',
    status: tests.some((test) => test.status === 'failed') ? 'failed' : 'passed',
    tests,
    findings: toFindings(drafts),
    durationMs: Date.now() - startedAt,
  };
}
