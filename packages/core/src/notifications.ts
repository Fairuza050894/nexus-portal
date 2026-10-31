import type { Finding, RunSummary } from './types.js';
import { redactString } from './redaction.js';

export interface NotificationSummary {
  decision: 'GO' | 'GO WITH RISKS' | 'NO-GO';
  passRate: string;
  totalTests: number;
  failedTests: number;
  criticalFindings: number;
  topFailingFeatures: string[];
  bundleUrl?: string;
}

export function extractNotificationSummary(
  summary: RunSummary,
  bundleUrl?: string,
): NotificationSummary {
  const totals = summary.totals;
  const passRate =
    totals.tests > 0 ? `${((totals.passed / totals.tests) * 100).toFixed(1)}%` : '100.0%';

  const topFailingFeatures: string[] = [];
  for (const test of summary.tests ?? []) {
    if (test.status === 'failed' && test.feature && !topFailingFeatures.includes(test.feature)) {
      topFailingFeatures.push(test.feature);
      if (topFailingFeatures.length >= 3) break;
    }
  }

  const criticalFindings = summary.findings?.filter((f) => f.severity === 'critical').length ?? 0;

  return {
    decision: summary.gate.decision,
    passRate,
    totalTests: totals.tests,
    failedTests: totals.failed,
    criticalFindings,
    topFailingFeatures,
    bundleUrl,
  };
}

export interface SlackWebhookPayload {
  text: string;
  attachments: Array<{
    color: string;
    title: string;
    text: string;
    fields: Array<{ title: string; value: string; short: boolean }>;
  }>;
}

export function formatSlackNotification(
  summary: RunSummary,
  bundleUrl?: string,
): SlackWebhookPayload {
  const data = extractNotificationSummary(summary, bundleUrl);
  const color =
    data.decision === 'GO' ? '#238636' : data.decision === 'GO WITH RISKS' ? '#d29922' : '#da3633';

  const sanitizedFeatures = data.topFailingFeatures.map((f) => redactString(f));
  const featuresText = sanitizedFeatures.length > 0 ? sanitizedFeatures.join(', ') : 'None';

  return {
    text: redactString(
      `QA Pipeline Gate Decision: *${data.decision}* (Pass Rate: ${data.passRate})`,
    ),
    attachments: [
      {
        color,
        title: redactString(`Run Report — ${summary.run.id}`),
        text: redactString(
          `Target: ${summary.run.mode.toUpperCase()} · Tests: ${data.totalTests} (${data.failedTests} failed) · Critical Findings: ${data.criticalFindings}`,
        ),
        fields: [
          { title: 'Decision', value: data.decision, short: true },
          { title: 'Pass Rate', value: data.passRate, short: true },
          { title: 'Failing Areas', value: featuresText, short: false },
          ...(data.bundleUrl
            ? [
                {
                  title: 'Artifacts',
                  value: `<${data.bundleUrl}|Download ZIP Bundle>`,
                  short: false,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

export interface TeamsWebhookPayload {
  '@type': string;
  '@context': string;
  themeColor: string;
  summary: string;
  sections: Array<{
    activityTitle: string;
    activitySubtitle: string;
    facts: Array<{ name: string; value: string }>;
  }>;
  potentialAction?: Array<{
    '@type': string;
    name: string;
    targets: Array<{ os: string; uri: string }>;
  }>;
}

export function formatTeamsNotification(
  summary: RunSummary,
  bundleUrl?: string,
): TeamsWebhookPayload {
  const data = extractNotificationSummary(summary, bundleUrl);
  const themeColor =
    data.decision === 'GO' ? '238636' : data.decision === 'GO WITH RISKS' ? 'd29922' : 'da3633';

  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor,
    summary: redactString(`QA Pipeline Gate: ${data.decision}`),
    sections: [
      {
        activityTitle: redactString(`QA Pipeline Gate: ${data.decision}`),
        activitySubtitle: redactString(`Run ${summary.run.id} (${summary.run.mode})`),
        facts: [
          { name: 'Gate Verdict', value: data.decision },
          { name: 'Pass Rate', value: data.passRate },
          { name: 'Tests Total', value: String(data.totalTests) },
          { name: 'Tests Failed', value: String(data.failedTests) },
          { name: 'Critical Findings', value: String(data.criticalFindings) },
          {
            name: 'Failing Areas',
            value:
              data.topFailingFeatures.length > 0
                ? data.topFailingFeatures.map((f) => redactString(f)).join(', ')
                : 'None',
          },
        ],
      },
    ],
    ...(data.bundleUrl
      ? {
          potentialAction: [
            {
              '@type': 'OpenUri',
              name: 'Download Artifact Bundle',
              targets: [{ os: 'default', uri: data.bundleUrl }],
            },
          ],
        }
      : {}),
  };
}

export interface EmailNotificationPayload {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export function formatEmailNotification(
  summary: RunSummary,
  bundleUrl?: string,
): EmailNotificationPayload {
  const data = extractNotificationSummary(summary, bundleUrl);
  const subject = redactString(`[QA Pipeline] Gate: ${data.decision} - Run ${summary.run.id}`);

  const textBody = redactString(
    `QA Pipeline Execution Summary\n` +
      `==============================\n` +
      `Run ID: ${summary.run.id}\n` +
      `Mode: ${summary.run.mode.toUpperCase()}\n` +
      `Gate Decision: ${data.decision}\n` +
      `Pass Rate: ${data.passRate} (${data.failedTests} failed out of ${data.totalTests})\n` +
      `Critical Findings: ${data.criticalFindings}\n` +
      `Top Failing Areas: ${data.topFailingFeatures.join(', ') || 'None'}\n` +
      (data.bundleUrl ? `Bundle URL: ${data.bundleUrl}\n` : ''),
  );

  const htmlBody = redactString(
    `<div style="font-family:sans-serif; line-height:1.5;">` +
      `<h2>QA Pipeline Execution Summary</h2>` +
      `<p><strong>Run ID:</strong> ${summary.run.id}<br>` +
      `<strong>Mode:</strong> ${summary.run.mode.toUpperCase()}<br>` +
      `<strong>Gate Decision:</strong> <span style="font-weight:bold;">${data.decision}</span><br>` +
      `<strong>Pass Rate:</strong> ${data.passRate} (${data.failedTests} failed / ${data.totalTests} total)<br>` +
      `<strong>Critical Findings:</strong> ${data.criticalFindings}</p>` +
      (data.topFailingFeatures.length > 0
        ? `<p><strong>Top Failing Areas:</strong> ${data.topFailingFeatures.join(', ')}</p>`
        : '') +
      (data.bundleUrl
        ? `<p><a href="${data.bundleUrl}">Download Documentation & Artifact Bundle (ZIP)</a></p>`
        : '') +
      `</div>`,
  );

  return { subject, textBody, htmlBody };
}

export function exportFindingToJiraMarkdown(finding: Finding, summary?: RunSummary): string {
  const runId = summary?.run.id ?? 'manual-run';
  const lines: string[] = [
    `h2. ${redactString(finding.title)}`,
    ``,
    `* *Severity:* ${finding.severity.toUpperCase()}`,
    `* *Confidence:* ${finding.confidence}`,
    `* *Category:* ${finding.category}`,
    `* *Lanes:* ${finding.lanes.join(', ')}`,
    `* *Run ID:* ${runId}`,
    ``,
    `h3. Correlated Evidence Summary`,
    finding.evidenceSummary ? redactString(finding.evidenceSummary) : '_No summary provided_',
    ``,
  ];

  if (finding.reproduction && finding.reproduction.length > 0) {
    lines.push(`h3. Reproduction Steps`);
    finding.reproduction.forEach((step) => {
      lines.push(`# ${redactString(step)}`);
    });
    lines.push(``);
  }

  if (finding.expected && finding.actual) {
    lines.push(`h3. Expected vs Actual`);
    lines.push(`* *Expected:* ${redactString(finding.expected)}`);
    lines.push(`* *Actual:* ${redactString(finding.actual)}`);
    lines.push(``);
  }

  if (finding.suggestedFix) {
    lines.push(`h3. Suggested Remediation`);
    lines.push(redactString(finding.suggestedFix));
  }

  return lines.join('\n');
}

export function exportFindingToGitHubIssue(
  finding: Finding,
  summary?: RunSummary,
): { title: string; body: string; labels: string[] } {
  const runId = summary?.run.id ?? 'pipeline-run';
  const title = `[${finding.severity.toUpperCase()}] ${redactString(finding.title)}`;

  const bodyLines: string[] = [
    `### Defect Overview`,
    `- **Severity:** \`${finding.severity}\``,
    `- **Confidence:** \`${finding.confidence}\``,
    `- **Category:** \`${finding.category}\``,
    `- **Lanes:** \`${finding.lanes.join(', ')}\``,
    `- **First Seen:** \`${runId}\``,
    ``,
    `### Evidence Summary`,
    finding.evidenceSummary
      ? redactString(finding.evidenceSummary)
      : '_No evidence summary recorded._',
    ``,
  ];

  if (finding.reproduction && finding.reproduction.length > 0) {
    bodyLines.push(`### Reproduction Steps`);
    finding.reproduction.forEach((step, i) => {
      bodyLines.push(`${i + 1}. ${redactString(step)}`);
    });
    bodyLines.push(``);
  }

  if (finding.expected || finding.actual) {
    bodyLines.push(`### Observed Behavior`);
    if (finding.expected) bodyLines.push(`- **Expected:** ${redactString(finding.expected)}`);
    if (finding.actual) bodyLines.push(`- **Actual:** ${redactString(finding.actual)}`);
    bodyLines.push(``);
  }

  if (finding.suggestedFix) {
    bodyLines.push(`### Suggested Fix`);
    bodyLines.push(redactString(finding.suggestedFix));
  }

  return {
    title,
    body: bodyLines.join('\n'),
    labels: ['qa-finding', finding.severity, `lane:${finding.lanes[0] ?? 'general'}`],
  };
}

export interface WebhookDispatchResult {
  success: boolean;
  channel: 'slack' | 'teams' | 'generic';
  url: string;
  statusCode?: number;
  error?: string;
}

export interface NotificationDispatchSummary {
  dispatched: number;
  failed: number;
  skipped: boolean;
  results: WebhookDispatchResult[];
}

export interface NotificationConfig {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  genericWebhookUrl?: string;
  onlyOnFailure?: boolean;
  bundleUrl?: string;
}

export async function sendWebhookPayload(
  url: string,
  payload: unknown,
  channel: 'slack' | 'teams' | 'generic' = 'generic',
  options?: { timeoutMs?: number; fetchFn?: typeof fetch },
): Promise<WebhookDispatchResult> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const fetchFn = options?.fetchFn ?? globalThis.fetch;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return {
      success: false,
      channel,
      url: url || 'empty',
      error: 'Invalid or missing webhook URL',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'nexus-portal-notifier/2.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    return {
      success: res.ok,
      channel,
      url,
      statusCode: res.status,
      ...(res.ok ? {} : { error: `HTTP ${res.status}: ${res.statusText || 'Webhook rejected'}` }),
    };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error).name === 'AbortError';
    return {
      success: false,
      channel,
      url,
      error: isAbort ? `Webhook request timed out after ${timeoutMs}ms` : (err as Error).message,
    };
  }
}

export async function dispatchRunAlerts(
  summary: RunSummary,
  config?: NotificationConfig,
  options?: { timeoutMs?: number; fetchFn?: typeof fetch },
): Promise<NotificationDispatchSummary> {
  if (!config) {
    return { dispatched: 0, failed: 0, skipped: true, results: [] };
  }

  const isFailure = summary.gate.decision === 'NO-GO' || summary.gate.decision === 'GO WITH RISKS';
  if (config.onlyOnFailure && !isFailure) {
    return { dispatched: 0, failed: 0, skipped: true, results: [] };
  }

  const tasks: Array<Promise<WebhookDispatchResult>> = [];

  if (config.slackWebhookUrl) {
    const slackPayload = formatSlackNotification(summary, config.bundleUrl);
    tasks.push(sendWebhookPayload(config.slackWebhookUrl, slackPayload, 'slack', options));
  }

  if (config.teamsWebhookUrl) {
    const teamsPayload = formatTeamsNotification(summary, config.bundleUrl);
    tasks.push(sendWebhookPayload(config.teamsWebhookUrl, teamsPayload, 'teams', options));
  }

  if (config.genericWebhookUrl) {
    const genericPayload = {
      event: 'qa.run.complete',
      runId: summary.run.id,
      mode: summary.run.mode,
      gate: summary.gate,
      totals: summary.totals,
      summary: extractNotificationSummary(summary, config.bundleUrl),
      timestamp: new Date().toISOString(),
    };
    tasks.push(sendWebhookPayload(config.genericWebhookUrl, genericPayload, 'generic', options));
  }

  if (tasks.length === 0) {
    return { dispatched: 0, failed: 0, skipped: true, results: [] };
  }

  const results = await Promise.all(tasks);
  const dispatched = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    dispatched,
    failed,
    skipped: false,
    results,
  };
}
