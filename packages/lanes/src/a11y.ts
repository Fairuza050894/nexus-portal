import { relative } from 'node:path';
import type { SessionResult } from '@nexus/session';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

function severityForImpact(impact: string | null): FindingDraft['severity'] {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'high';
    case 'moderate':
      return 'medium';
    default:
      return 'low';
  }
}

export function runA11yLane(context: LaneContext, session: SessionResult | undefined): LaneResult {
  const startedAt = Date.now();
  if (!session || session.pages.length === 0) {
    return {
      lane: 'a11y',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no browser session',
      durationMs: Date.now() - startedAt,
    };
  }

  const limit = context.config.gates.a11yCriticalSeriousMax;
  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  for (const [index, page] of session.pages.entries()) {
    if (page.error || page.a11y.error) {
      tests.push({
        id: `TC-A11Y-${String(index + 1).padStart(3, '0')}`,
        lane: 'a11y',
        name: `axe scan ${page.path}`,
        status: 'skipped',
        durationMs: page.durationMs,
        reason: page.error
          ? `page did not load: ${page.error}`
          : `axe could not run: ${page.a11y.error}`,
      });
      continue;
    }
    const blocking = page.a11y.critical + page.a11y.serious;
    tests.push({
      id: `TC-A11Y-${String(index + 1).padStart(3, '0')}`,
      lane: 'a11y',
      name: `axe critical/serious violations on ${page.path} <= ${limit}`,
      status: blocking > limit ? 'failed' : 'passed',
      durationMs: page.durationMs,
      expected: `<= ${limit} critical/serious violations`,
      actual: `${blocking} critical/serious, ${page.a11y.total} total`,
      ...(page.screenshot
        ? { evidence: [{ type: 'screenshot', path: relative(context.runDir, page.screenshot) }] }
        : {}),
    });

    for (const violation of page.a11y.violations) {
      drafts.push({
        title: `axe ${violation.id}: ${violation.help}`,
        severity: severityForImpact(violation.impact),
        confidence: 'auto-discovered',
        category: 'accessibility',
        lane: 'a11y',
        occurrences: violation.nodes.length,
        affected: violation.nodes.map((node) => ({
          page: page.path,
          target: node.target.join(' '),
        })),
        expected: 'no accessibility violations',
        actual: `${violation.nodes.length} node(s): ${violation.description}`,
        evidence: [
          {
            type: 'axe',
            rule: violation.id,
            impact: violation.impact,
            helpUrl: violation.helpUrl,
            page: page.path,
          },
        ],
        suggestedFix: violation.help,
      });
    }
  }

  const allSkipped = tests.length > 0 && tests.every((test) => test.status === 'skipped');
  return {
    lane: 'a11y',
    status: tests.some((test) => test.status === 'failed')
      ? 'failed'
      : allSkipped
        ? 'skipped'
        : 'passed',
    tests,
    findings: toFindings(drafts),
    ...(allSkipped ? { reason: 'axe did not run on any page' } : {}),
    durationMs: Date.now() - startedAt,
  };
}
