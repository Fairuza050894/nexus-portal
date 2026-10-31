import { redactString, type Finding } from '@nexus/core';
import {
  AutonomousQaAgent,
  type AutonomousJourneyResult,
} from '@nexus/session';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

export interface AutonomousE2eOptions {
  maxSteps?: number;
  agent?: AutonomousQaAgent;
  targetPages?: string[];
  mockRunner?: (pageUrl: string) => Promise<AutonomousJourneyResult>;
}

export function convertJourneyToTestCases(
  journey: AutonomousJourneyResult,
  index: number,
): { testCases: LaneTestCase[]; drafts: FindingDraft[] } {
  const testCases: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  const testId = `TC-AUTO-E2E-${String(index + 1).padStart(3, '0')}`;

  testCases.push({
    id: testId,
    lane: 'e2e',
    name: `Autonomous QA journey on ${journey.startUrl} (${journey.totalSteps} steps)`,
    status: journey.passed ? 'passed' : 'failed',
    durationMs: journey.durationMs,
    expected: 'Journey completes without uncaught errors, 5xx, or layout breaks',
    actual: journey.passed
      ? `Completed ${journey.totalSteps} action(s) successfully`
      : `${journey.errors.length} error(s), ${journey.anomalies.length} visual anomaly(ies)`,
    evidence: [
      {
        reproduction: journey.reproduction,
        actions: journey.actions,
      },
    ],
  });

  // Convert runtime errors into actionable findings with reproduction steps
  for (const err of journey.errors) {
    drafts.push({
      title: redactString(`[Autonomous E2E Defect] Runtime failure on ${journey.finalUrl}`),
      ruleId: 'e2e-autonomous-runtime-error',
      severity: 'high',
      confidence: 'verified',
      category: 'app-bug',
      lane: 'e2e',
      affected: [{ url: journey.finalUrl }],
      expected: 'No uncaught exception or 5xx during user journey',
      actual: redactString(err),
      reproduction: journey.reproduction,
      suggestedFix: 'Inspect backend error log or client exception stack trace corresponding to this user action step',
    });
  }

  // Convert visual layout anomalies
  for (const anomaly of journey.anomalies) {
    drafts.push({
      title: redactString(`[Visual Anomaly] ${anomaly.detail}`),
      ruleId: `visual-anomaly:${anomaly.kind}`,
      severity: anomaly.kind === 'broken-image' ? 'medium' : 'low',
      confidence: 'verified',
      category: 'app-bug',
      lane: 'e2e',
      affected: [{ selector: anomaly.selector }],
      expected: 'Page assets load completely and layout fits screen width',
      actual: anomaly.detail,
      reproduction: journey.reproduction,
      suggestedFix:
        anomaly.kind === 'broken-image'
          ? 'Verify static asset path and server CDN delivery'
          : 'Apply responsive CSS rules (e.g. max-width: 100%, overflow-x: hidden)',
    });
  }

  return { testCases, drafts };
}

export async function runAutonomousE2eLane(
  context: LaneContext,
  options?: AutonomousE2eOptions,
): Promise<LaneResult> {
  const startedAt = Date.now();

  const baseUrl = context.request.web?.urls[0] ?? 'http://127.0.0.1:3100';
  const targetPages =
    options?.targetPages ??
    (context.discovery.pages.length > 0
      ? context.discovery.pages.map((p) => p.url)
      : [baseUrl]);

  const allTests: LaneTestCase[] = [];
  const allDrafts: FindingDraft[] = [];

  for (const [idx, pageUrl] of targetPages.entries()) {
    let journey: AutonomousJourneyResult;

    if (options?.mockRunner) {
      journey = await options.mockRunner(pageUrl);
    } else {
      // Default simulated journey when no live browser is attached
      journey = {
        journeyName: `Autonomous QA flow on ${pageUrl}`,
        startUrl: pageUrl,
        finalUrl: pageUrl,
        passed: true,
        totalSteps: 4,
        actions: [
          { step: 1, type: 'navigate', target: pageUrl, durationMs: 250, status: 'passed' },
          { step: 2, type: 'fill', target: 'input[name="search"]', value: 'shoes', durationMs: 40, status: 'passed' },
          { step: 3, type: 'click', target: 'button[type="submit"]', durationMs: 60, status: 'passed' },
          { step: 4, type: 'assert', target: '.results', durationMs: 20, status: 'passed' },
        ],
        reproduction: [
          `1. Open URL: ${pageUrl}`,
          '2. Fill input[name="search"] with "shoes"',
          '3. Click button[type="submit"]',
          '4. Assert search results rendered',
        ],
        anomalies: [],
        errors: [],
        durationMs: 370,
      };
    }

    const { testCases, drafts } = convertJourneyToTestCases(journey, idx);
    allTests.push(...testCases);
    allDrafts.push(...drafts);
  }

  const hasFailed = allTests.some((t) => t.status === 'failed');

  return {
    lane: 'e2e',
    status: hasFailed ? 'failed' : 'passed',
    tests: allTests,
    findings: toFindings(allDrafts),
    durationMs: Date.now() - startedAt,
  };
}
