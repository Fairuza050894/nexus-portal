import type { ComplianceMapping, Finding, RunSummary } from '@nexus/core';
import { matchCompliance } from '@nexus/core';
import { t, type DocLanguage } from './i18n.js';
import {
  badge,
  escapeCsv,
  escapeHtml,
  evidenceLinks,
  formatDateTime,
  formatPercent,
  htmlPage,
  sparkline,
  table,
} from './ui.js';

export interface DocFile {
  name: string;
  content: string;
}

export interface AppMapNodeView {
  id: string;
  type: string;
  path?: string;
  method?: string;
  title?: string;
  status?: number;
  risk?: number;
  changedRecently?: boolean;
  suggestedOwner?: string;
  sources?: string[];
}

export interface AppMapView {
  nodes: AppMapNodeView[];
  edges: Array<{ from: string; to: string; kind: string; confidence: string }>;
}

export interface HistoryPoint {
  runId: string;
  startedAt: string;
  passRate: number;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  gate: string;
}

export interface DocContext {
  runId: string;
  /** True when the run artifacts (app-map.json, evidence/) are available in the docs bundle. */
  runArtifacts?: boolean;
  appMap?: AppMapView;
  sessionPages?: Array<{ path: string; title?: string; status?: number }>;
  history?: HistoryPoint[];
  complianceMapping?: ComplianceMapping;
}

const CONFIDENCE_ORDER = ['verified', 'auto-discovered', 'needs-review'] as const;

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function sortedFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

function passRate(summary: RunSummary): number {
  const executed = summary.totals.passed + summary.totals.failed;
  return executed > 0 ? (summary.totals.passed / executed) * 100 : 100;
}

function mdCell(value: unknown): string {
  return escapeHtml(String(value ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function findingRows(
  summary: RunSummary,
  language: DocLanguage,
  ctx: DocContext,
  findings: Finding[],
): string[][] {
  return findings.map((finding) => [
    `<td><strong>${escapeHtml(finding.id)}</strong></td>`,
    `<td>${escapeHtml(finding.title)}</td>`,
    `<td>${escapeHtml(finding.evidenceSummary ?? '—')}</td>`,
    `<td>${badge(language, finding.severity)}</td>`,
    `<td>${escapeHtml(finding.category)}</td>`,
    `<td>${escapeHtml(finding.lanes.join(', '))}</td>`,
    `<td>${escapeHtml(finding.status)}</td>`,
    `<td>${escapeHtml(finding.firstSeenRun ?? '—')}</td>`,
    `<td>${escapeHtml(finding.lastSeenRun ?? summary.run.id)}</td>`,
    `<td>${escapeHtml(finding.suggestedOwner ?? '—')}</td>`,
    `<td>${evidenceLinks(finding.evidence, Boolean(ctx.runArtifacts))}</td>`,
  ]);
}

function confidenceSection(
  summary: RunSummary,
  language: DocLanguage,
  ctx: DocContext,
  confidence: (typeof CONFIDENCE_ORDER)[number],
  findings: Finding[],
): string {
  const filtered = sortedFindings(findings.filter((finding) => finding.confidence === confidence));
  const label = t(
    language,
    confidence === 'verified'
      ? 'common.verified'
      : confidence === 'auto-discovered'
        ? 'common.autoDiscovered'
        : 'common.needsReview',
  );
  return `<h3>${escapeHtml(label)} (${filtered.length})</h3>
    ${
      filtered.length === 0
        ? `<p class="muted">${t(language, 'common.none')}</p>`
        : table(
            language,
            [
              t(language, 'common.id'),
              t(language, 'common.title'),
              t(language, 'findings.evidenceSummary'),
              t(language, 'common.severity'),
              t(language, 'common.category'),
              t(language, 'common.lanes'),
              t(language, 'findings.status'),
              t(language, 'common.firstSeen'),
              t(language, 'common.lastSeen'),
              t(language, 'common.owner'),
              t(language, 'common.evidence'),
            ],
            findingRows(summary, language, ctx, filtered),
          )
    }`;
}

function overviewPage(summary: RunSummary, language: DocLanguage): string {
  const docs: Array<[string, string]> = [
    ['executive-summary.html', 'doc.executive'],
    ['execution-report.html', 'doc.execution'],
    ['test-catalogue.html', 'doc.catalogue'],
    ['traceability-matrix.html', 'doc.traceability'],
    ['failure-analysis.html', 'doc.failure'],
    ['findings-register.html', 'doc.findings'],
    ['trend-stability.html', 'doc.trend'],
    ['coverage-report.html', 'doc.coverage'],
    ['application-map.html', 'doc.appmap'],
    ['run-comparison.html', 'doc.comparison'],
    ['plan-approval.html', 'doc.plan'],
    ['not-covered.html', 'doc.notCovered'],
  ];
  const links = docs
    .map(([file, key]) => `<li><a href="${file}">${t(language, key)}</a></li>`)
    .join('');
  const stageRows = Object.values(summary.stages)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((stage) => [
      `<td>${escapeHtml(stage.name)}</td>`,
      `<td>${escapeHtml(stage.status)}</td>`,
      `<td>${stage.durationMs} ms</td>`,
      `<td>${escapeHtml([stage.reason, stage.error].filter(Boolean).join(': ') || '—')}</td>`,
    ]);
  const body = `
  <h1>${escapeHtml(summary.run.id)} — ${t(language, 'doc.overview')}</h1>
  <div class="card">
    <div class="grid">
      <div><div class="muted">${t(language, 'common.decision')}</div><div class="metric">${badge(language, summary.gate.decision)}</div></div>
      <div><div class="muted">${t(language, 'summary.passRate')}</div><div class="metric">${formatPercent(passRate(summary))}</div></div>
      <div><div class="muted">${t(language, 'common.tests')}</div><div class="metric">${summary.totals.passed}/${summary.totals.tests}</div></div>
      <div><div class="muted">${t(language, 'doc.findings')}</div><div class="metric">${summary.findings.length}</div></div>
    </div>
    <p class="muted">${escapeHtml(summary.run.mode)} · ${escapeHtml(summary.run.scope)} · ${formatDateTime(summary.run.startedAt, language)}</p>
  </div>
  <div class="card"><h2>${t(language, 'overview.links')}</h2><ul>${links}</ul></div>
  <div class="card"><h2>${t(language, 'overview.stages')}</h2>
    ${table(language, [t(language, 'common.title'), t(language, 'common.status'), t(language, 'common.duration'), t(language, 'common.reason')], stageRows)}
  </div>`;
  return htmlPage(language, `${summary.run.id} — ${t(language, 'doc.overview')}`, body);
}

function executiveSummaryHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const risks = sortedFindings(summary.findings).slice(0, 5);
  const riskRows = risks.map((finding) => [
    `<td>${escapeHtml(finding.id)}</td>`,
    `<td>${escapeHtml(finding.title)}</td>`,
    `<td>${escapeHtml(finding.evidenceSummary ?? '—')}</td>`,
    `<td>${badge(language, finding.severity)}</td>`,
    `<td>${badge(language, finding.confidence)}</td>`,
    `<td>${escapeHtml(finding.category)}</td>`,
  ]);
  const history = ctx.history ?? [];
  const trend = sparkline(
    history.map((point) => ({ runId: point.runId, passRate: point.passRate })),
  );
  const confidence = summary.confidenceTotals ?? {
    verified: summary.findings.filter((f) => f.confidence === 'verified').length,
    autoDiscovered: summary.findings.filter((f) => f.confidence === 'auto-discovered').length,
    needsReview: summary.findings.filter((f) => f.confidence === 'needs-review').length,
  };
  const skippedTests = summary.totals.skipped;
  const skippedLanes = (summary.lanes ?? []).filter((lane) => lane.status === 'skipped').length;
  const body = `
  <h1>${t(language, 'doc.executive')}</h1>
  <p class="muted">${t(language, 'summary.subtitle')}</p>
  <div class="card">
    <div class="grid">
      <div><div class="muted">${t(language, 'common.decision')}</div><div class="metric">${badge(language, summary.gate.decision)}</div></div>
      <div><div class="muted">${t(language, 'summary.passRate')}</div><div class="metric">${formatPercent(passRate(summary))}</div></div>
      <div><div class="muted">${t(language, 'common.tests')}</div><div class="metric">${summary.totals.passed}/${summary.totals.tests}</div></div>
      <div><div class="muted">${t(language, 'common.flaky')}</div><div class="metric">${summary.totals.flaky ?? 0}</div></div>
      <div><div class="muted">${t(language, 'summary.notCoveredHeadline')}</div><div class="metric">${summary.limitations.length + skippedLanes + skippedTests}</div></div>
    </div>
    <p class="muted">${t(language, 'common.environment')}: ${escapeHtml(summary.environment.name)} · ${t(language, 'common.build')}: ${escapeHtml(summary.environment.gitSha)} · ${summary.run.durationMs} ms</p>
  </div>

  <div class="card">
    <h2>${t(language, 'common.reasons')}</h2>
    ${summary.gate.reasons.length > 0 ? `<ul>${summary.gate.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : `<p>${t(language, 'common.none')}</p>`}
  </div>

  <div class="card">
    <h2>${t(language, 'findings.byConfidence')}</h2>
    <div class="grid">
      <div><div class="muted">${t(language, 'common.verified')}</div><div class="metric">${confidence.verified}</div></div>
      <div><div class="muted">${t(language, 'common.autoDiscovered')}</div><div class="metric">${confidence.autoDiscovered}</div></div>
      <div><div class="muted">${t(language, 'common.needsReview')}</div><div class="metric">${confidence.needsReview}</div></div>
    </div>
  </div>

  <div class="card">
    <h2>${t(language, 'summary.topRisks')}</h2>
    ${
      riskRows.length === 0
        ? `<p>${t(language, 'summary.noRisks')}</p>`
        : table(
            language,
            [
              t(language, 'common.id'),
              t(language, 'common.title'),
              t(language, 'findings.evidenceSummary'),
              t(language, 'common.severity'),
              t(language, 'common.confidence'),
              t(language, 'common.category'),
            ],
            riskRows,
          )
    }
  </div>

  ${trend ? `<div class="card"><h2>${t(language, 'summary.trend')}</h2>${trend}</div>` : ''}

  <div class="card">
    <h2>${t(language, 'summary.notCoveredHeadline')}</h2>
    <p>${t(language, 'notCovered.skippedLanes')}: ${skippedLanes} · ${t(language, 'notCovered.skippedTests')}: ${skippedTests}</p>
    <p><a href="not-covered.html">${t(language, 'doc.notCovered')}</a></p>
  </div>`;
  return htmlPage(language, t(language, 'doc.executive'), body);
}

function executiveSummaryMd(summary: RunSummary, language: DocLanguage): string {
  const confidence = summary.confidenceTotals ?? {
    verified: summary.findings.filter((f) => f.confidence === 'verified').length,
    autoDiscovered: summary.findings.filter((f) => f.confidence === 'auto-discovered').length,
    needsReview: summary.findings.filter((f) => f.confidence === 'needs-review').length,
  };
  return `# ${t(language, 'doc.executive')} — ${summary.run.id}

- **${t(language, 'common.decision')}**: ${summary.gate.decision}
- **${t(language, 'common.mode')}**: ${summary.run.mode} | **${t(language, 'common.scope')}**: ${summary.run.scope}
- **${t(language, 'summary.passRate')}**: ${formatPercent(passRate(summary))} (${summary.totals.passed}/${summary.totals.tests})
- **${t(language, 'common.flaky')}**: ${summary.totals.flaky ?? 0}
- **${t(language, 'common.duration')}**: ${summary.run.durationMs} ms

## ${t(language, 'common.reasons')}
${summary.gate.reasons.map((reason) => `- ${escapeHtml(reason)}`).join('\n') || `- ${t(language, 'common.none')}`}

## ${t(language, 'findings.byConfidence')}
- **${t(language, 'common.verified')}**: ${confidence.verified}
- **${t(language, 'common.autoDiscovered')}**: ${confidence.autoDiscovered}
- **${t(language, 'common.needsReview')}**: ${confidence.needsReview}

## ${t(language, 'notCovered.limitations')}
${summary.limitations.map((limitation) => `- ${escapeHtml(limitation)}`).join('\n') || `- ${t(language, 'common.none')}`}
`;
}

function executionReportHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const laneRows = (summary.lanes ?? []).map((lane) => [
    `<td>${escapeHtml(lane.lane)}</td>`,
    `<td>${badge(language, lane.status)}</td>`,
    `<td>${lane.tests}</td>`,
    `<td>${lane.passed}</td>`,
    `<td>${lane.failed}</td>`,
    `<td>${lane.skipped}</td>`,
    `<td>${lane.durationMs ?? '—'}</td>`,
    `<td>${escapeHtml(lane.reason ?? '—')}</td>`,
  ]);

  const tests = summary.tests ?? [];
  const featureTotals = new Map<string, { total: number; passed: number; failed: number }>();
  for (const test of tests) {
    const key = test.feature ?? test.lane;
    const bucket = featureTotals.get(key) ?? { total: 0, passed: 0, failed: 0 };
    bucket.total += 1;
    if (test.status === 'passed') bucket.passed += 1;
    if (test.status === 'failed') bucket.failed += 1;
    featureTotals.set(key, bucket);
  }
  const featureRows = [...featureTotals.entries()].map(([feature, totals]) => [
    `<td>${escapeHtml(feature)}</td>`,
    `<td>${totals.total}</td>`,
    `<td>${totals.passed}</td>`,
    `<td>${totals.failed}</td>`,
    `<td>${formatPercent(totals.total > 0 ? (totals.passed / totals.total) * 100 : 100)}</td>`,
  ]);

  const failedTests = tests.filter((test) => test.status === 'failed');
  const failureRows = failedTests.map((test) => [
    `<td>${escapeHtml(test.id)}</td>`,
    `<td>${escapeHtml(test.title)}</td>`,
    `<td>${escapeHtml(test.lane)}</td>`,
    `<td>${escapeHtml(test.reason ?? test.actual ?? '—')}</td>`,
    `<td>${evidenceLinks(test.evidence, Boolean(ctx.runArtifacts))}</td>`,
  ]);
  const flakyTests = tests.filter((test) => test.status === 'flaky');
  const flakyRows = flakyTests.map((test) => [
    `<td>${escapeHtml(test.id)}</td>`,
    `<td>${escapeHtml(test.title)}</td>`,
    `<td>${escapeHtml(test.lane)}</td>`,
    `<td>${escapeHtml(test.reason ?? '—')}</td>`,
  ]);

  const envRows = [
    [t(language, 'common.environment'), summary.environment.name],
    [t(language, 'common.build'), summary.environment.gitSha],
    ['Node.js', summary.environment.nodeVersion],
    [t(language, 'env.platform'), summary.environment.platform],
    [t(language, 'env.baseUrl'), summary.environment.baseUrl ?? '—'],
    [t(language, 'env.apiUrl'), summary.environment.apiUrl ?? '—'],
    [
      t(language, 'env.browser'),
      summary.session?.browserVersion ?? summary.environment.browsers?.join(', ') ?? '—',
    ],
  ].map(([key, value]) => [`<td>${escapeHtml(key)}</td>`, `<td>${escapeHtml(value)}</td>`]);

  const body = `
  <h1>${t(language, 'doc.execution')}</h1>
  <div class="card">
    <h2>${t(language, 'execution.totals')}</h2>
    <div class="grid">
      <div><div class="muted">${t(language, 'common.total')}</div><div class="metric">${summary.totals.tests}</div></div>
      <div><div class="muted">${t(language, 'common.passed')}</div><div class="metric">${summary.totals.passed}</div></div>
      <div><div class="muted">${t(language, 'common.failed')}</div><div class="metric">${summary.totals.failed}</div></div>
      <div><div class="muted">${t(language, 'common.skipped')}</div><div class="metric">${summary.totals.skipped}</div></div>
      <div><div class="muted">${t(language, 'common.flaky')}</div><div class="metric">${summary.totals.flaky ?? 0}</div></div>
    </div>
  </div>
  <div class="card"><h2>${t(language, 'execution.perLane')}</h2>
    ${table(
      language,
      [
        t(language, 'common.lane'),
        t(language, 'common.status'),
        t(language, 'common.tests'),
        t(language, 'common.passed'),
        t(language, 'common.failed'),
        t(language, 'common.skipped'),
        t(language, 'common.duration'),
        t(language, 'common.reason'),
      ],
      laneRows,
    )}
  </div>
  <div class="card"><h2>${t(language, 'execution.perFeature')}</h2>
    ${table(language, [t(language, 'catalogue.feature'), t(language, 'common.tests'), t(language, 'common.passed'), t(language, 'common.failed'), t(language, 'summary.passRate')], featureRows)}
  </div>
  <div class="card"><h2>${t(language, 'execution.failures')}</h2>
    ${
      failureRows.length === 0
        ? `<p>${t(language, 'execution.noFailures')}</p>`
        : table(
            language,
            [
              t(language, 'common.id'),
              t(language, 'common.title'),
              t(language, 'common.lane'),
              t(language, 'common.reason'),
              t(language, 'common.evidence'),
            ],
            failureRows,
          )
    }
  </div>
  <div class="card"><h2>${t(language, 'execution.flaky')}</h2>
    ${flakyRows.length === 0 ? `<p>${t(language, 'common.none')}</p>` : table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'common.lane'), t(language, 'common.reason')], flakyRows)}
  </div>
  <div class="card"><h2>${t(language, 'common.environment')}</h2>
    ${table(language, [t(language, 'common.title'), t(language, 'common.detail')], envRows)}
  </div>`;
  return htmlPage(language, t(language, 'doc.execution'), body);
}

function catalogueRows(summary: RunSummary): Array<Array<string | number>> {
  return (summary.tests ?? []).map((test) => [
    test.id,
    test.lane,
    test.feature ?? '',
    test.title,
    (test.requirements ?? []).join('; '),
    test.expected ?? '',
    test.actual ?? '',
    test.status,
    test.durationMs,
    test.reason ?? '',
  ]);
}

const CATALOGUE_HEADERS = [
  'ID',
  'lane',
  'feature',
  'title',
  'requirements',
  'expected',
  'actual',
  'status',
  'durationMs',
  'reason',
];

function testCatalogueHtml(summary: RunSummary, language: DocLanguage): string {
  const rows = (summary.tests ?? []).map((test) => [
    `<td>${escapeHtml(test.id)}</td>`,
    `<td>${escapeHtml(test.lane)}</td>`,
    `<td>${escapeHtml(test.feature ?? '—')}</td>`,
    `<td>${escapeHtml(test.title)}</td>`,
    `<td>${escapeHtml((test.requirements ?? []).join(', ') || '—')}</td>`,
    `<td>${escapeHtml(test.expected ?? '—')}</td>`,
    `<td>${escapeHtml(test.actual ?? '—')}</td>`,
    `<td>${badge(language, test.status)}</td>`,
    `<td>${test.durationMs}</td>`,
    `<td>${escapeHtml(test.reason ?? '—')}</td>`,
  ]);
  const body = `
  <h1>${t(language, 'doc.catalogue')}</h1>
  <div class="card">
    <p class="muted">${t(language, 'catalogue.help')}</p>
    <p>${t(language, 'common.download')}: <a href="test-catalogue.csv">CSV</a> · <a href="test-catalogue.xlsx">XLSX</a> · <a href="test-catalogue.md">MD</a></p>
    ${
      rows.length === 0
        ? `<p>${t(language, 'catalogue.empty')}</p>`
        : table(
            language,
            [
              t(language, 'common.id'),
              t(language, 'common.lane'),
              t(language, 'catalogue.feature'),
              t(language, 'common.title'),
              t(language, 'common.requirements'),
              t(language, 'catalogue.expected'),
              t(language, 'catalogue.actual'),
              t(language, 'common.status'),
              t(language, 'common.duration'),
              t(language, 'common.reason'),
            ],
            rows,
          )
    }
  </div>`;
  return htmlPage(language, t(language, 'doc.catalogue'), body);
}

function csvOf(rows: Array<Array<string | number>>, headers: string[]): string {
  return `${[headers, ...rows].map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')}\n`;
}

function markdownTable(headers: string[], rows: string[][]): string {
  return `| ${headers.map(mdCell).join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows
    .map((row) => `| ${row.map(mdCell).join(' | ')} |`)
    .join('\n')}\n`;
}

function traceabilityHtml(summary: RunSummary, language: DocLanguage): string {
  const rows = (summary.requirements ?? []).map((requirement) => [
    `<td>${escapeHtml(requirement.id)}</td>`,
    `<td>${escapeHtml(requirement.title)}</td>`,
    `<td>${escapeHtml((requirement.acceptance ?? []).join(' · ') || '—')}</td>`,
    `<td>${escapeHtml((requirement.tests ?? []).join(', ') || '—')}</td>`,
    `<td><span class="badge ${requirement.covered ? 'badge-pass' : 'badge-review'}">${requirement.covered ? t(language, 'traceability.covered') : t(language, 'traceability.uncovered')}</span></td>`,
  ]);
  const coverage = summary.coverage;
  const body = `
  <h1>${t(language, 'doc.traceability')}</h1>
  <div class="card">
    <p class="muted">${t(language, 'traceability.help')}</p>
    ${
      coverage
        ? `<p>${t(language, 'coverage.coveredRequirements')}: <strong>${coverage.requirementsCovered}</strong> / ${coverage.requirementsTotal}</p>`
        : ''
    }
    <p>${t(language, 'common.download')}: <a href="traceability-matrix.csv">CSV</a> · <a href="traceability-matrix.xlsx">XLSX</a></p>
    ${
      rows.length === 0
        ? `<p>${t(language, 'traceability.empty')}</p>`
        : table(
            language,
            [
              t(language, 'common.id'),
              t(language, 'common.title'),
              t(language, 'traceability.acceptance'),
              t(language, 'traceability.tests'),
              t(language, 'traceability.coverage'),
            ],
            rows,
          )
    }
  </div>`;
  return htmlPage(language, t(language, 'doc.traceability'), body);
}

function failureAnalysisHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const grouped = new Map<string, Finding[]>();
  for (const finding of summary.findings) {
    const key = finding.category;
    const bucket = grouped.get(key) ?? [];
    bucket.push(finding);
    grouped.set(key, bucket);
  }
  const sections = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, findings]) => {
      const items = sortedFindings(findings)
        .map(
          (finding) => `<div class="card">
        <h3>${escapeHtml(finding.id)}: ${escapeHtml(finding.title)}</h3>
        <p>${badge(language, finding.severity)} ${badge(language, finding.confidence)} ${escapeHtml(category)} · ${escapeHtml(finding.lanes.join(', '))} · ${escapeHtml(finding.status)}</p>
        <p><strong>${t(language, 'common.expected')}</strong> ${escapeHtml(finding.expected ?? '—')}</p>
        <p><strong>${t(language, 'common.actual')}</strong> ${escapeHtml(finding.actual ?? '—')}</p>
        <p><strong>${t(language, 'common.reproduction')}</strong> ${finding.reproduction?.map((step) => escapeHtml(step)).join(' → ') ?? '—'}</p>
        <p><strong>${t(language, 'common.owner')}</strong> ${escapeHtml(finding.suggestedOwner ?? '—')}</p>
        <p><strong>${t(language, 'common.codeRefs')}</strong> ${(finding.codeRefs ?? []).map((ref) => escapeHtml(`${ref.file}${ref.line ? `:${ref.line}` : ''}`)).join(', ') || '—'}</p>
        <p><strong>${t(language, 'common.evidence')}</strong> ${evidenceLinks(finding.evidence, Boolean(ctx.runArtifacts))}</p>
      </div>`,
        )
        .join('');
      return `<h2>${escapeHtml(category)} (${findings.length})</h2>${items}`;
    });
  const body = `
  <h1>${t(language, 'doc.failure')}</h1>
  <p class="muted">${t(language, 'failure.help')}</p>
  <p>${t(language, 'common.download')}: <a href="failure-analysis.md">MD</a></p>
  ${sections.length === 0 ? `<p>${t(language, 'failure.empty')}</p>` : sections.join('')}`;
  return htmlPage(language, t(language, 'doc.failure'), body);
}

function failureAnalysisMd(summary: RunSummary, language: DocLanguage): string {
  const sections = summary.findings.map(
    (finding) => `### ${finding.id}: ${escapeHtml(finding.title)}

- **${t(language, 'common.severity')}**: ${finding.severity}
- **${t(language, 'common.confidence')}**: ${finding.confidence}
- **${t(language, 'common.category')}**: ${finding.category}
- **${t(language, 'common.lanes')}**: ${finding.lanes.join(', ')}
- **${t(language, 'common.expected')}**: ${escapeHtml(finding.expected ?? '—')}
- **${t(language, 'common.actual')}**: ${escapeHtml(finding.actual ?? '—')}
- **${t(language, 'common.owner')}**: ${escapeHtml(finding.suggestedOwner ?? '—')}

${finding.reproduction?.map((step, index) => `${index + 1}. ${escapeHtml(step)}`).join('\n') ?? ''}
`,
  );
  return `# ${t(language, 'doc.failure')} — ${summary.run.id}\n\n${sections.join('\n') || t(language, 'failure.empty')}\n`;
}

function defectDrafts(summary: RunSummary, language: DocLanguage): DocFile[] {
  return summary.findings
    .filter((finding) => finding.severity === 'critical' || finding.severity === 'high')
    .map((finding) => ({
      name: `defects/DEFECT-${finding.id}.md`,
      content: `# ${t(language, 'defect.title', { severity: finding.severity.toUpperCase(), title: finding.title })}

- **${t(language, 'common.id')}**: ${finding.id}
- **${t(language, 'common.severity')}**: ${finding.severity}
- **${t(language, 'common.confidence')}**: ${finding.confidence}
- **${t(language, 'common.category')}**: ${finding.category}
- **${t(language, 'common.lanes')}**: ${finding.lanes.join(', ')}
- **${t(language, 'defect.env')}**: ${summary.environment.name} (${summary.environment.baseUrl ?? 'local'})
- **${t(language, 'common.runId')}**: ${summary.run.id}
- **${t(language, 'defect.owner')}**: ${finding.suggestedOwner ?? '—'}

## ${t(language, 'defect.description')}

${finding.actual ?? finding.title}

## ${t(language, 'defect.steps')}

${finding.reproduction?.map((step, index) => `${index + 1}. ${step}`).join('\n') ?? '1. ' + t(language, 'common.notAvailable')}

## ${t(language, 'defect.expected')}

${finding.expected ?? '—'}

## ${t(language, 'defect.actual')}

${finding.actual ?? '—'}

## ${t(language, 'defect.evidence')}

${finding.evidence.map((item) => `- ${JSON.stringify(item)}`).join('\n') || '- ' + t(language, 'common.none')}
`,
    }));
}

function trendStabilityHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const history = [
    ...(ctx.history ?? []),
    {
      runId: summary.run.id,
      startedAt: summary.run.startedAt,
      passRate: passRate(summary),
      tests: summary.totals.tests,
      passed: summary.totals.passed,
      failed: summary.totals.failed,
      skipped: summary.totals.skipped,
      durationMs: summary.run.durationMs,
      gate: summary.gate.decision,
    },
  ];
  const historyRows = history.map((point) => [
    `<td>${escapeHtml(point.runId)}</td>`,
    `<td>${formatDateTime(point.startedAt, language)}</td>`,
    `<td>${point.tests}</td>`,
    `<td>${point.passed}</td>`,
    `<td>${point.failed}</td>`,
    `<td>${point.skipped}</td>`,
    `<td>${formatPercent(point.passRate)}</td>`,
    `<td>${point.durationMs} ms</td>`,
    `<td>${badge(language, point.gate)}</td>`,
  ]);
  const flaky = summary.findings
    .filter((finding) => finding.category === 'flaky')
    .sort((a, b) => b.occurrences - a.occurrences);
  const flakyRows = flaky.map((finding) => [
    `<td>${escapeHtml(finding.id)}</td>`,
    `<td>${escapeHtml(finding.title)}</td>`,
    `<td>${finding.occurrences}</td>`,
    `<td>${escapeHtml(finding.lanes.join(', '))}</td>`,
  ]);
  const flakyTestRows = (summary.tests ?? [])
    .filter((test) => test.status === 'flaky')
    .map((test) => [
      `<td>${escapeHtml(test.id)}</td>`,
      `<td>${escapeHtml(test.title)}</td>`,
      `<td>${test.durationMs} ms</td>`,
      `<td>${escapeHtml(test.reason ?? '—')}</td>`,
    ]);
  const body = `
  <h1>${t(language, 'doc.trend')}</h1>
  <div class="card">
    <p>${t(language, 'summary.passRate')}: <strong>${formatPercent(passRate(summary))}</strong> · ${t(language, 'trend.duration')}: <strong>${summary.run.durationMs} ms</strong></p>
    ${sparkline(history.map((point) => ({ runId: point.runId, passRate: point.passRate })))}
  </div>
  <div class="card"><h2>${t(language, 'trend.history')}</h2>
    ${history.length < 2 ? `<p class="muted">${t(language, 'trend.noHistory')}</p>` : ''}
    ${table(
      language,
      [
        t(language, 'common.runId'),
        t(language, 'common.date'),
        t(language, 'common.tests'),
        t(language, 'common.passed'),
        t(language, 'common.failed'),
        t(language, 'common.skipped'),
        t(language, 'summary.passRate'),
        t(language, 'common.duration'),
        t(language, 'common.gate'),
      ],
      historyRows,
    )}
  </div>
  <div class="card"><h2>${t(language, 'trend.flakyLeaderboard')}</h2>
    ${flakyRows.length === 0 ? `<p>${t(language, 'trend.noFlaky')}</p>` : table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'common.occurrences'), t(language, 'common.lanes')], flakyRows)}
    ${flakyTestRows.length === 0 ? '' : table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'common.duration'), t(language, 'common.reason')], flakyTestRows)}
  </div>`;
  return htmlPage(language, t(language, 'doc.trend'), body);
}

function coverageReportHtml(summary: RunSummary, language: DocLanguage): string {
  const coverage = summary.coverage;
  const requirementRows = (summary.requirements ?? []).map((requirement) => [
    `<td>${escapeHtml(requirement.id)}</td>`,
    `<td>${escapeHtml(requirement.title)}</td>`,
    `<td>${escapeHtml((requirement.tests ?? []).join(', ') || '—')}</td>`,
    `<td><span class="badge ${requirement.covered ? 'badge-pass' : 'badge-review'}">${requirement.covered ? t(language, 'traceability.covered') : t(language, 'traceability.uncovered')}</span></td>`,
  ]);
  const featureEntries = Object.entries(coverage?.featureCoverage ?? {});
  const featureRows = featureEntries.map(([feature, stats]) => [
    `<td>${escapeHtml(feature)}</td>`,
    `<td>${stats.total}</td>`,
    `<td>${stats.passed}</td>`,
    `<td><span class="badge ${stats.covered ? 'badge-pass' : 'badge-review'}">${stats.covered ? t(language, 'traceability.covered') : t(language, 'traceability.uncovered')}</span></td>`,
  ]);
  const typeTotals = new Map<string, number>();
  for (const test of summary.tests ?? []) {
    typeTotals.set(test.lane, (typeTotals.get(test.lane) ?? 0) + 1);
  }
  const typeRows = [...typeTotals.entries()].map(([lane, count]) => [
    `<td>${escapeHtml(lane)}</td>`,
    `<td>${count}</td>`,
  ]);
  const body = `
  <h1>${t(language, 'doc.coverage')}</h1>
  <div class="card">
    <div class="grid">
      <div><div class="muted">${t(language, 'coverage.totalRequirements')}</div><div class="metric">${coverage?.requirementsTotal ?? 0}</div></div>
      <div><div class="muted">${t(language, 'coverage.coveredRequirements')}</div><div class="metric">${coverage?.requirementsCovered ?? 0}</div></div>
      <div><div class="muted">${t(language, 'coverage.executedTests')}</div><div class="metric">${summary.totals.tests}</div></div>
    </div>
  </div>
  <div class="card"><h2>${t(language, 'coverage.requirements')}</h2>
    ${requirementRows.length === 0 ? `<p>${t(language, 'coverage.noRequirements')}</p>` : table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'traceability.tests'), t(language, 'traceability.coverage')], requirementRows)}
  </div>
  <div class="card"><h2>${t(language, 'coverage.features')}</h2>
    ${featureRows.length === 0 ? `<p>${t(language, 'common.notAvailable')}</p>` : table(language, [t(language, 'catalogue.feature'), t(language, 'common.tests'), t(language, 'common.passed'), t(language, 'traceability.coverage')], featureRows)}
  </div>
  <div class="card"><h2>${t(language, 'coverage.types')}</h2>
    ${table(language, [t(language, 'common.lane'), t(language, 'common.tests')], typeRows)}
  </div>
  <div class="card"><h2>${t(language, 'coverage.gaps')}</h2>
    ${coverage && coverage.uncovered.length > 0 ? `<ul>${coverage.uncovered.map((id) => `<li>${escapeHtml(id)}</li>`).join('')}</ul>` : `<p>${t(language, 'common.none')}</p>`}
  </div>`;
  return htmlPage(language, t(language, 'doc.coverage'), body);
}

function complianceSection(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const mapping = ctx.complianceMapping;
  if (!mapping) return '';
  const rows = summary.findings.map((finding) => {
    const matches = matchCompliance(mapping, finding);
    const controls =
      matches.length === 0
        ? `<span class="muted">${t(language, 'compliance.unmapped')}</span>`
        : matches
            .map(
              (match) =>
                `<strong>${escapeHtml(match.framework)}</strong>: ${escapeHtml(
                  match.controls.join(', '),
                )}`,
            )
            .join('<br>');
    return [
      `<td>${escapeHtml(finding.id)}</td>`,
      `<td>${escapeHtml(finding.title)}</td>`,
      `<td>${escapeHtml(finding.ruleId ?? '—')}</td>`,
      `<td>${escapeHtml(finding.category)}</td>`,
      `<td>${controls}</td>`,
    ];
  });
  return `<details class="card">
    <summary><strong>${t(language, 'compliance.title')}</strong> (${rows.length})</summary>
    <p class="muted">${escapeHtml(mapping.disclaimer)}</p>
    <p class="muted">${t(language, 'compliance.help')}</p>
    ${table(
      language,
      [
        t(language, 'common.id'),
        t(language, 'common.title'),
        'Rule',
        t(language, 'common.category'),
        t(language, 'compliance.controls'),
      ],
      rows,
    )}
  </details>`;
}

function findingsRegisterHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const body = `
  <h1>${t(language, 'doc.findings')}</h1>
  <p class="muted">${t(language, 'findings.help')}</p>
  <p>${t(language, 'common.download')}: <a href="findings-register.csv">CSV</a> · <a href="findings-register.xlsx">XLSX</a> · <a href="findings-register.md">MD</a></p>
  ${CONFIDENCE_ORDER.map((confidence) => confidenceSection(summary, language, ctx, confidence, summary.findings)).join('')}
  ${complianceSection(summary, language, ctx)}`;
  return htmlPage(language, t(language, 'doc.findings'), body);
}

function findingsRegisterMd(summary: RunSummary, language: DocLanguage): string {
  const rows = summary.findings.map((finding) => [
    finding.id,
    finding.title,
    finding.evidenceSummary ?? '',
    finding.severity,
    finding.confidence,
    finding.category,
    finding.lanes.join(', '),
    finding.status,
    finding.firstSeenRun ?? '',
    finding.lastSeenRun ?? summary.run.id,
    finding.suggestedOwner ?? '',
  ]);
  return `# ${t(language, 'doc.findings')} — ${summary.run.id}\n\n${
    summary.findings.length === 0
      ? t(language, 'findings.empty')
      : markdownTable(
          [
            'ID',
            'title',
            'evidenceSummary',
            'severity',
            'confidence',
            'category',
            'lanes',
            'status',
            'firstSeen',
            'lastSeen',
            'owner',
          ],
          rows,
        )
  }`;
}

function applicationMapHtml(summary: RunSummary, language: DocLanguage, ctx: DocContext): string {
  const map = ctx.appMap;
  if (!map || map.nodes.length === 0) {
    const body = `
    <h1>${t(language, 'doc.appmap')}</h1>
    <div class="card">
      <p>${t(language, 'appmap.empty')}</p>
      ${summary.appMap ? `<p>${t(language, 'appmap.nodes')}: ${summary.appMap.pages} ${t(language, 'appmap.pagesShort')} · ${summary.appMap.endpoints} ${t(language, 'appmap.endpointsShort')} · ${summary.appMap.code} ${t(language, 'appmap.codeShort')} · ${summary.appMap.edges} ${t(language, 'appmap.edgesOf')}</p>` : ''}
    </div>`;
    return htmlPage(language, t(language, 'doc.appmap'), body);
  }

  const testedPaths = new Set((ctx.sessionPages ?? []).map((page) => page.path));
  const testText = (summary.tests ?? [])
    .map((test) => `${test.title} ${test.expected ?? ''} ${test.actual ?? ''}`)
    .join(' ')
    .toLowerCase();
  const isTested = (node: AppMapNodeView): boolean => {
    if (node.path && testedPaths.has(node.path)) return true;
    if (node.path && testText.includes(node.path.toLowerCase())) return true;
    return false;
  };
  const nodes = map.nodes.map((node) => ({ ...node, tested: isTested(node) }));
  const testedCount = nodes.filter((node) => node.tested).length;

  const nodeRows = nodes.map((node) => {
    const tested = node.tested
      ? `<span class="badge badge-pass">${t(language, 'appmap.tested')}</span>`
      : `<span class="badge badge-review">${t(language, 'appmap.notTested')}</span>`;
    return `<tr data-node-id="${escapeHtml(node.id)}" class="${node.tested ? 'tested' : ''}">
      <td>${escapeHtml(node.id)}</td>
      <td>${escapeHtml(node.type)}</td>
      <td>${escapeHtml(node.path ?? '—')}</td>
      <td>${escapeHtml(node.method ?? '—')}</td>
      <td>${escapeHtml(node.risk ?? '—')}</td>
      <td>${node.changedRecently ? t(language, 'common.yes') : t(language, 'common.no')}</td>
      <td>${escapeHtml(node.suggestedOwner ?? '—')}</td>
      <td>${tested}</td>
    </tr>`;
  });

  const edgeRows = map.edges.map((edge) => [
    `<td class="edge-from">${escapeHtml(edge.from)}</td>`,
    `<td>${escapeHtml(edge.kind)}</td>`,
    `<td class="edge-to">${escapeHtml(edge.to)}</td>`,
    `<td>${escapeHtml(edge.confidence)}</td>`,
  ]);

  const extraScript = `
(function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('#map-nodes tbody tr'));
  var edgeRows = Array.prototype.slice.call(document.querySelectorAll('#map-edges tbody tr'));
  var search = document.getElementById('map-search');
  if (search) {
    search.addEventListener('input', function () {
      var value = search.value.toLowerCase();
      rows.forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().indexOf(value) === -1 ? 'none' : '';
      });
    });
  }
  rows.forEach(function (row) {
    row.addEventListener('click', function () {
      rows.forEach(function (other) { other.classList.remove('selected'); });
      row.classList.add('selected');
      var id = row.getAttribute('data-node-id');
      edgeRows.forEach(function (edgeRow) {
        var from = edgeRow.querySelector('.edge-from').textContent;
        var to = edgeRow.querySelector('.edge-to').textContent;
        edgeRow.style.display = from === id || to === id ? '' : 'none';
      });
    });
  });
})();`;

  const body = `
  <h1>${t(language, 'doc.appmap')}</h1>
  <p class="muted">${t(language, 'appmap.help')}</p>
  <div class="card">
    <div class="grid">
      <div><div class="muted">${t(language, 'appmap.nodes')}</div><div class="metric">${nodes.length}</div></div>
      <div><div class="muted">${t(language, 'appmap.edges')}</div><div class="metric">${map.edges.length}</div></div>
      <div><div class="muted">${t(language, 'appmap.tested')}</div><div class="metric">${testedCount}/${nodes.length}</div></div>
    </div>
    ${ctx.runArtifacts ? `<p><a href="application-map.json">app-map.json</a></p>` : ''}
  </div>
  <div class="card">
    <input id="map-search" class="search" type="search" placeholder="${t(language, 'appmap.search')}" aria-label="${t(language, 'appmap.search')}">
    <table id="map-nodes" class="sortable"><thead><tr>
      <th>${t(language, 'common.id')}</th><th>${t(language, 'appmap.type')}</th><th>${t(language, 'appmap.path')}</th><th>${t(language, 'appmap.method')}</th><th>${t(language, 'appmap.risk')}</th><th>${t(language, 'appmap.changed')}</th><th>${t(language, 'common.owner')}</th><th>${t(language, 'traceability.coverage')}</th>
    </tr></thead><tbody>${nodeRows.join('')}</tbody></table>
  </div>
  <div class="card"><h2>${t(language, 'appmap.edges')}</h2>
    <table id="map-edges"><thead><tr><th>${t(language, 'appmap.from')}</th><th>${t(language, 'appmap.kind')}</th><th>${t(language, 'appmap.to')}</th><th>${t(language, 'common.confidence')}</th></tr></thead><tbody>${edgeRows.map((row) => `<tr>${row.join('')}</tr>`).join('')}</tbody></table>
  </div>`;
  return htmlPage(language, t(language, 'doc.appmap'), body, extraScript);
}

function runComparisonHtml(summary: RunSummary, language: DocLanguage): string {
  const baseline = summary.baseline;
  const retestNew = baseline?.mode === 'retest-new';
  const visibleFindings = retestNew
    ? sortedFindings(summary.findings).filter(
        (finding) => finding.status === 'new' || finding.status === 'regressed',
      )
    : sortedFindings(summary.findings);
  const recurringFindings = retestNew
    ? sortedFindings(summary.findings).filter(
        (finding) => finding.status !== 'new' && finding.status !== 'regressed',
      )
    : [];
  const rowsFor = (findings: typeof summary.findings) =>
    findings.map((finding) => [
      `<td>${escapeHtml(finding.id)}</td>`,
      `<td>${escapeHtml(finding.title)}</td>`,
      `<td>${escapeHtml(finding.status)}</td>`,
      `<td>${badge(language, finding.severity)}</td>`,
      `<td>${badge(language, finding.confidence)}</td>`,
    ]);
  const body = `
  <h1>${t(language, 'doc.comparison')}</h1>
  <p class="muted">${t(language, 'comparison.help')}</p>
  ${
    baseline
      ? `<div class="card">
          <p>${t(language, 'comparison.baseline')}: <strong>${escapeHtml(baseline.baselineRunId)}</strong> · ${t(language, 'comparison.mode')}: <strong>${escapeHtml(baseline.mode ?? 'standard')}</strong></p>
          ${retestNew ? `<p class="muted">${t(language, 'comparison.retestHelp')}</p>` : ''}
          <div class="grid">
            <div><div class="muted">${t(language, 'comparison.new')}</div><div class="metric">${baseline.newFindings}</div></div>
            <div><div class="muted">${t(language, 'comparison.recurring')}</div><div class="metric">${baseline.recurringFindings}</div></div>
            <div><div class="muted">${t(language, 'comparison.fixed')}</div><div class="metric">${baseline.fixedFindings}</div></div>
            <div><div class="muted">${t(language, 'comparison.regressed')}</div><div class="metric">${baseline.regressedFindings}</div></div>
            <div><div class="muted">${t(language, 'comparison.passDelta')}</div><div class="metric">${baseline.passRateDelta === undefined ? '—' : `${baseline.passRateDelta > 0 ? '+' : ''}${baseline.passRateDelta.toFixed(2)}`}</div></div>
          </div>
        </div>`
      : `<div class="card"><p>${t(language, 'comparison.empty')}</p></div>`
  }
  <div class="card"><h2>${t(language, 'comparison.findings')}</h2>
    ${table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'findings.status'), t(language, 'common.severity'), t(language, 'common.confidence')], rowsFor(visibleFindings))}
  </div>
  ${
    retestNew && recurringFindings.length > 0
      ? `<details class="card"><summary>${t(language, 'comparison.recurringAppendix')} (${recurringFindings.length})</summary>
          ${table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'findings.status'), t(language, 'common.severity'), t(language, 'common.confidence')], rowsFor(recurringFindings))}
        </details>`
      : ''
  }`;
  return htmlPage(language, t(language, 'doc.comparison'), body);
}

function planApprovalHtml(summary: RunSummary, language: DocLanguage): string {
  const request = summary.request as
    | {
        planApproval?: string;
        authorization?: { ownerConfirmed?: boolean; approvedBy?: string; ticket?: string };
      }
    | undefined;
  const stageRows = Object.values(summary.stages)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((stage) => [
      `<td>${escapeHtml(stage.name)}</td>`,
      `<td>${escapeHtml(stage.status)}</td>`,
      `<td>${formatDateTime(stage.startedAt, language)}</td>`,
      `<td>${stage.durationMs} ms</td>`,
      `<td>${escapeHtml([stage.reason, stage.error].filter(Boolean).join(': ') || '—')}</td>`,
    ]);
  const laneRows = (summary.lanes ?? []).map((lane) => [
    `<td>${escapeHtml(lane.lane)}</td>`,
    `<td>${badge(language, lane.status)}</td>`,
    `<td>${lane.tests}</td>`,
  ]);
  const body = `
  <h1>${t(language, 'doc.plan')}</h1>
  <p class="muted">${t(language, 'plan.help')}</p>
  <div class="card">
    <p>${t(language, 'plan.requestedBy')}: <strong>${escapeHtml(summary.audit.requestedBy)}</strong></p>
    <p>${t(language, 'common.mode')}: <strong>${escapeHtml(summary.run.mode)}</strong> · ${t(language, 'common.scope')}: <strong>${escapeHtml(summary.run.scope)}</strong></p>
    <p>${t(language, 'plan.ownerConfirmed')}: <strong>${request?.authorization?.ownerConfirmed ? t(language, 'common.yes') : t(language, 'common.no')}</strong></p>
    <p>${t(language, 'plan.approvedBy')}: <strong>${escapeHtml(request?.authorization?.approvedBy ?? t(language, 'plan.notRecorded'))}</strong></p>
    <p>${t(language, 'plan.ticket')}: <strong>${escapeHtml(request?.authorization?.ticket ?? '—')}</strong></p>
    <p>${t(language, 'plan.planApproval')}: <strong>${escapeHtml(request?.planApproval ?? t(language, 'plan.notRecorded'))}</strong></p>
  </div>
  <div class="card"><h2>${t(language, 'plan.lanes')}</h2>
    ${laneRows.length === 0 ? `<p>${t(language, 'common.none')}</p>` : table(language, [t(language, 'common.lane'), t(language, 'common.status'), t(language, 'common.tests')], laneRows)}
  </div>
  <div class="card"><h2>${t(language, 'plan.stages')}</h2>
    ${table(language, [t(language, 'common.title'), t(language, 'common.status'), t(language, 'common.date'), t(language, 'common.duration'), t(language, 'common.reason')], stageRows)}
  </div>`;
  return htmlPage(language, t(language, 'doc.plan'), body);
}

function notCoveredHtml(summary: RunSummary, language: DocLanguage): string {
  const badStages = Object.values(summary.stages).filter(
    (stage) => stage.status === 'skipped' || stage.status === 'failed',
  );
  const stageRows = badStages.map((stage) => [
    `<td>${escapeHtml(stage.name)}</td>`,
    `<td>${escapeHtml(stage.status)}</td>`,
    `<td>${escapeHtml([stage.reason, stage.error].filter(Boolean).join(': ') || '—')}</td>`,
  ]);
  const skippedLanes = (summary.lanes ?? []).filter((lane) => lane.status === 'skipped');
  const laneRows = skippedLanes.map((lane) => [
    `<td>${escapeHtml(lane.lane)}</td>`,
    `<td>${escapeHtml(lane.reason ?? '—')}</td>`,
  ]);
  const skippedTests = (summary.tests ?? []).filter((test) => test.status === 'skipped');
  const testRows = skippedTests.map((test) => [
    `<td>${escapeHtml(test.id)}</td>`,
    `<td>${escapeHtml(test.title)}</td>`,
    `<td>${escapeHtml(test.lane)}</td>`,
    `<td>${escapeHtml(test.reason ?? '—')}</td>`,
  ]);
  const nothing =
    summary.limitations.length === 0 &&
    badStages.length === 0 &&
    skippedLanes.length === 0 &&
    skippedTests.length === 0;
  const body = `
  <h1>${t(language, 'doc.notCovered')}</h1>
  <p class="muted">${t(language, 'notCovered.help')}</p>
  ${
    nothing
      ? `<div class="card"><p>${t(language, 'notCovered.none')}</p></div>`
      : `<div class="card"><h2>${t(language, 'notCovered.limitations')}</h2>
          ${summary.limitations.length === 0 ? `<p>${t(language, 'common.none')}</p>` : `<ul>${summary.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join('')}</ul>`}
        </div>
        <div class="card"><h2>${t(language, 'notCovered.skippedStages')}</h2>
          ${stageRows.length === 0 ? `<p>${t(language, 'common.none')}</p>` : table(language, [t(language, 'common.title'), t(language, 'common.status'), t(language, 'common.reason')], stageRows)}
        </div>
        <div class="card"><h2>${t(language, 'notCovered.skippedLanes')}</h2>
          ${laneRows.length === 0 ? `<p>${t(language, 'common.none')}</p>` : table(language, [t(language, 'common.lane'), t(language, 'common.reason')], laneRows)}
        </div>
        <div class="card"><h2>${t(language, 'notCovered.skippedTests')}</h2>
          ${testRows.length === 0 ? `<p>${t(language, 'common.none')}</p>` : table(language, [t(language, 'common.id'), t(language, 'common.title'), t(language, 'common.lane'), t(language, 'common.reason')], testRows)}
        </div>`
  }`;
  return htmlPage(language, t(language, 'doc.notCovered'), body);
}

function mainReportMd(summary: RunSummary, language: DocLanguage): string {
  const confidence = summary.confidenceTotals ?? {
    verified: summary.findings.filter((f) => f.confidence === 'verified').length,
    autoDiscovered: summary.findings.filter((f) => f.confidence === 'auto-discovered').length,
    needsReview: summary.findings.filter((f) => f.confidence === 'needs-review').length,
  };
  return `# ${t(language, 'doc.overview')} — ${summary.run.id}

- **${t(language, 'common.decision')}**: **${summary.gate.decision}**
- **${t(language, 'common.mode')}**: ${summary.run.mode} | **${t(language, 'common.scope')}**: ${summary.run.scope}
- **${t(language, 'summary.passRate')}**: ${formatPercent(passRate(summary))} (${summary.totals.passed}/${summary.totals.tests})
- **${t(language, 'common.duration')}**: ${summary.run.durationMs} ms

## ${t(language, 'common.reasons')}
${summary.gate.reasons.map((reason) => `- ${escapeHtml(reason)}`).join('\n') || `- ${t(language, 'common.none')}`}

## ${t(language, 'findings.byConfidence')}
- **${t(language, 'common.verified')}**: ${confidence.verified}
- **${t(language, 'common.autoDiscovered')}**: ${confidence.autoDiscovered}
- **${t(language, 'common.needsReview')}**: ${confidence.needsReview}

## ${t(language, 'common.lanes')}
${
  summary.lanes && summary.lanes.length > 0
    ? markdownTable(
        [
          t(language, 'common.lane'),
          t(language, 'common.status'),
          t(language, 'common.tests'),
          t(language, 'common.passed'),
          t(language, 'common.failed'),
          t(language, 'common.skipped'),
          t(language, 'common.reason'),
        ],
        summary.lanes.map((lane) => [
          lane.lane,
          lane.status,
          String(lane.tests),
          String(lane.passed),
          String(lane.failed),
          String(lane.skipped),
          lane.reason ?? '',
        ]),
      )
    : `- ${t(language, 'common.notAvailable')}`
}

## ${t(language, 'doc.appmap')}
${
  summary.appMap
    ? `- ${t(language, 'appmap.nodes')}: ${summary.appMap.pages} ${t(language, 'appmap.pagesShort')}, ${summary.appMap.endpoints} ${t(language, 'appmap.endpointsShort')}, ${summary.appMap.code} ${t(language, 'appmap.codeShort')}
- ${t(language, 'appmap.edges')}: ${summary.appMap.edges}
- ${t(language, 'appmap.risk')}: ${summary.appMap.highRisk} ${t(language, 'appmap.highRiskShort')}, ${summary.appMap.changed} ${t(language, 'appmap.changedShort')}`
    : `- ${t(language, 'common.notAvailable')}`
}

## ${t(language, 'doc.traceability')}
${
  summary.requirements && summary.requirements.length > 0
    ? summary.requirements
        .map(
          (requirement) =>
            `- ${requirement.id}: ${requirement.covered ? t(language, 'traceability.covered') : t(language, 'traceability.uncovered')} (${requirement.tests.join(', ') || '—'})`,
        )
        .join('\n')
    : `- ${t(language, 'traceability.empty')}`
}

## ${t(language, 'notCovered.limitations')}
${summary.limitations.map((limitation) => `- ${escapeHtml(limitation)}`).join('\n') || `- ${t(language, 'common.none')}`}

## ${t(language, 'overview.links')}
- [${t(language, 'doc.executive')}](executive-summary.html)
- [${t(language, 'doc.execution')}](execution-report.html)
- [${t(language, 'doc.catalogue')}](test-catalogue.html)
- [${t(language, 'doc.traceability')}](traceability-matrix.html)
- [${t(language, 'doc.failure')}](failure-analysis.html)
- [${t(language, 'doc.findings')}](findings-register.html)
- [${t(language, 'doc.appmap')}](application-map.html)
- [${t(language, 'doc.comparison')}](run-comparison.html)
- [${t(language, 'doc.plan')}](plan-approval.html)
- [${t(language, 'doc.notCovered')}](not-covered.html)
`;
}

export function renderDocumentSet(
  summary: RunSummary,
  language: DocLanguage,
  ctx: DocContext,
): DocFile[] {
  const files: DocFile[] = [
    { name: 'index.html', content: overviewPage(summary, language) },
    { name: 'report.md', content: mainReportMd(summary, language) },
    { name: 'executive-summary.html', content: executiveSummaryHtml(summary, language, ctx) },
    { name: 'executive-summary.md', content: executiveSummaryMd(summary, language) },
    { name: 'execution-report.html', content: executionReportHtml(summary, language, ctx) },
    { name: 'test-catalogue.html', content: testCatalogueHtml(summary, language) },
    {
      name: 'test-catalogue.md',
      content: `# ${t(language, 'doc.catalogue')} — ${summary.run.id}\n\n${
        (summary.tests ?? []).length === 0
          ? t(language, 'catalogue.empty')
          : markdownTable(
              CATALOGUE_HEADERS,
              catalogueRows(summary).map((row) => row.map(String)),
            )
      }`,
    },
    {
      name: 'test-catalogue.csv',
      content: csvOf(catalogueRows(summary), CATALOGUE_HEADERS),
    },
    { name: 'traceability-matrix.html', content: traceabilityHtml(summary, language) },
    {
      name: 'traceability-matrix.csv',
      content: csvOf(
        (summary.requirements ?? []).map((requirement) => [
          requirement.id,
          requirement.title,
          requirement.tests.join('; '),
          requirement.covered ? 'covered' : 'uncovered',
        ]),
        ['requirement', 'title', 'tests', 'coverage'],
      ),
    },
    { name: 'failure-analysis.html', content: failureAnalysisHtml(summary, language, ctx) },
    { name: 'failure-analysis.md', content: failureAnalysisMd(summary, language) },
    { name: 'trend-stability.html', content: trendStabilityHtml(summary, language, ctx) },
    { name: 'coverage-report.html', content: coverageReportHtml(summary, language) },
    { name: 'findings-register.html', content: findingsRegisterHtml(summary, language, ctx) },
    {
      name: 'findings-register.csv',
      content: csvOf(
        summary.findings.map((finding) => [
          finding.id,
          finding.title,
          finding.evidenceSummary ?? '',
          finding.severity,
          finding.confidence,
          finding.category,
          finding.lanes.join('; '),
          finding.occurrences,
          finding.status,
          finding.firstSeenRun ?? '',
          finding.lastSeenRun ?? summary.run.id,
          finding.suggestedOwner ?? '',
        ]),
        [
          'id',
          'title',
          'evidenceSummary',
          'severity',
          'confidence',
          'category',
          'lanes',
          'occurrences',
          'status',
          'firstSeenRun',
          'lastSeenRun',
          'suggestedOwner',
        ],
      ),
    },
    { name: 'findings-register.md', content: findingsRegisterMd(summary, language) },
    { name: 'application-map.html', content: applicationMapHtml(summary, language, ctx) },
    { name: 'run-comparison.html', content: runComparisonHtml(summary, language) },
    { name: 'plan-approval.html', content: planApprovalHtml(summary, language) },
    { name: 'not-covered.html', content: notCoveredHtml(summary, language) },
    ...defectDrafts(summary, language),
  ];
  return files;
}
