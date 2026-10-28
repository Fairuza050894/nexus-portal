import { describe, expect, it } from 'vitest';
import type { Finding, RunSummary } from '../src/types.js';
import {
  extractNotificationSummary,
  formatSlackNotification,
  formatTeamsNotification,
  formatEmailNotification,
  exportFindingToJiraMarkdown,
  exportFindingToGitHubIssue,
} from '../src/index.js';

describe('Sanitized Notifications & Issue Exports (7.3 & 7.4)', () => {
  const mockSummary: RunSummary = {
    schemaVersion: '2.0',
    run: {
      id: '2026-10-28T00-00-00-000Z_test',
      status: 'complete',
      mode: 'staging',
      scope: 'standard',
      trigger: 'nightly',
      startedAt: '2026-10-28T00:00:00Z',
      finishedAt: '2026-10-28T00:05:00Z',
      durationMs: 300_000,
    },
    environment: {
      name: 'staging',
      baseUrl: 'https://staging.app.company.local',
      gitSha: 'c23db59',
      nodeVersion: '20.0.0',
      platform: 'linux',
    },
    request: {},
    audit: {
      runId: '2026-10-28T00-00-00-000Z_test',
      requestedBy: 'ci',
      mode: 'staging',
      targets: ['https://staging.app.company.local'],
      startedAt: '2026-10-28T00:00:00Z',
      requestCount: 20,
    },
    stages: {},
    limitations: [],
    gate: {
      decision: 'GO WITH RISKS',
      reasons: ['2 findings marked needs-review'],
    },
    totals: {
      tests: 20,
      passed: 18,
      failed: 2,
      skipped: 0,
      lanes: ['e2e', 'api', 'security'],
    },
    tests: [
      {
        id: 'TC-01',
        lane: 'e2e',
        title: 'Checkout Flow',
        status: 'failed',
        durationMs: 1200,
        feature: 'Payment Processing (card: 4111-2222-3333-4444, user: john@secret.com)',
      },
    ],
    findings: [
      {
        id: 'F-SEC-01',
        title: 'Leaked API token ghp_secretToken123456789 in response',
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'security',
        lanes: ['security'],
        occurrences: 1,
        evidence: [],
        status: 'new',
        evidenceSummary: 'Detected raw GitHub token in script tag',
      },
    ],
    confidenceTotals: {
      verified: 15,
      autoDiscovered: 4,
      needsReview: 1,
    },
  };

  it('extracts notification summary and calculates pass rate', () => {
    const summary = extractNotificationSummary(mockSummary, 'https://ci.company.local/bundle.zip');
    expect(summary.decision).toBe('GO WITH RISKS');
    expect(summary.passRate).toBe('90.0%');
    expect(summary.failedTests).toBe(2);
    expect(summary.totalTests).toBe(20);
    expect(summary.bundleUrl).toBe('https://ci.company.local/bundle.zip');
  });

  it('sanitizes Slack notification and strips PII and secret tokens', () => {
    const slack = formatSlackNotification(mockSummary, 'https://ci.company.local/bundle.zip');
    expect(slack.text).toContain('GO WITH RISKS');
    expect(slack.text).toContain('90.0%');

    const attachmentJson = JSON.stringify(slack.attachments);
    // Verified: No raw credit card number or leaked email in notification payload
    expect(attachmentJson).not.toContain('4111-2222-3333-4444');
    expect(attachmentJson).not.toContain('john@secret.com');
  });

  it('sanitizes Teams notification card payload', () => {
    const teams = formatTeamsNotification(mockSummary, 'https://ci.company.local/bundle.zip');
    expect(teams.themeColor).toBe('d29922'); // Amber color for GO WITH RISKS
    expect(teams.summary).toContain('GO WITH RISKS');

    const teamsJson = JSON.stringify(teams);
    expect(teamsJson).not.toContain('4111-2222-3333-4444');
    expect(teamsJson).not.toContain('john@secret.com');
    expect(teamsJson).toContain('Download Artifact Bundle');
  });

  it('sanitizes Email notification text and HTML body', () => {
    const email = formatEmailNotification(mockSummary, 'https://ci.company.local/bundle.zip');
    expect(email.subject).toContain('[QA Pipeline] Gate: GO WITH RISKS');
    expect(email.textBody).toContain('Pass Rate: 90.0%');

    expect(email.textBody).not.toContain('4111-2222-3333-4444');
    expect(email.textBody).not.toContain('john@secret.com');
    expect(email.htmlBody).not.toContain('john@secret.com');
  });

  it('exports finding to Jira markdown without raw secrets', () => {
    const finding: Finding = {
      id: 'F-JIRA-01',
      title: 'Auth bypass with token ghp_123456789012345678901234567890123456',
      severity: 'critical',
      confidence: 'verified',
      category: 'security',
      lanes: ['api'],
      occurrences: 1,
      evidence: [],
      status: 'new',
      evidenceSummary: 'Token leaked in error header',
      reproduction: ['GET /admin with token ghp_123456789012345678901234567890123456', 'Verify 200 returned'],
      expected: 'HTTP 401 Unauthorized',
      actual: 'HTTP 200 OK with secret admin data',
      suggestedFix: 'Enforce JWT signature validation middleware',
    };

    const jiraMarkdown = exportFindingToJiraMarkdown(finding, mockSummary);
    expect(jiraMarkdown).toContain('h2.');
    expect(jiraMarkdown).toContain('*Severity:* CRITICAL');
    expect(jiraMarkdown).toContain('Reproduction Steps');
    expect(jiraMarkdown).toContain('Enforce JWT signature validation middleware');

    // Asserts raw secret token was redacted
    expect(jiraMarkdown).not.toContain('ghp_123456789012345678901234567890123456');
  });

  it('exports finding to GitHub Issue with labels and sanitized body', () => {
    const finding: Finding = {
      id: 'F-GH-01',
      title: 'Missing CSRF protection on POST /transfer',
      severity: 'high',
      confidence: 'auto-discovered',
      category: 'security',
      lanes: ['api'],
      occurrences: 2,
      evidence: [],
      status: 'new',
      evidenceSummary: 'Endpoint accepts cross-origin POST without token',
      suggestedFix: 'Implement SameSite=Strict cookies or anti-CSRF token',
    };

    const ghIssue = exportFindingToGitHubIssue(finding, mockSummary);
    expect(ghIssue.title).toBe('[HIGH] Missing CSRF protection on POST /transfer');
    expect(ghIssue.labels).toContain('qa-finding');
    expect(ghIssue.labels).toContain('high');
    expect(ghIssue.labels).toContain('lane:api');
    expect(ghIssue.body).toContain('Endpoint accepts cross-origin POST without token');
  });
});
