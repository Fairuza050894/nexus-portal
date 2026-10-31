import { createHash } from 'node:crypto';
import type { Finding } from '@nexus/core';

export interface AuditControlAssessment {
  framework: 'ISO/IEC 27001:2022' | 'SOC 2 Type II';
  controlId: string;
  controlName: string;
  status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT';
  criticalFindings: number;
  highFindings: number;
  totalFindings: number;
  findings: Array<{ id: string; title: string; severity: string; ruleId?: string }>;
  remediationSummary?: string;
}

export interface IsoAuditPack {
  generatedAt: string;
  integrityHash: string; // SHA-256 seal of the audit assessment
  overallStatus: 'AUDIT_READY' | 'ACTION_REQUIRED' | 'AUDIT_FAILED';
  summary: {
    totalControlsEvaluated: number;
    compliantControls: number;
    nonCompliantControls: number;
    complianceScorePercent: number;
  };
  controls: AuditControlAssessment[];
  markdownReport: string;
}

const CONTROL_DEFINITIONS: Array<{
  framework: AuditControlAssessment['framework'];
  controlId: string;
  controlName: string;
  matchesRule: (ruleId: string, category: string) => boolean;
}> = [
  {
    framework: 'ISO/IEC 27001:2022',
    controlId: 'A.8.7',
    controlName: 'Protection against malware',
    matchesRule: (rule, cat) => rule.startsWith('malware:') || rule.includes('virus') || cat === 'security' && rule.includes('webshell'),
  },
  {
    framework: 'ISO/IEC 27001:2022',
    controlId: 'A.8.8',
    controlName: 'Management of technical vulnerabilities',
    matchesRule: (rule) => rule.startsWith('dast-') || rule.startsWith('nuclei-') || rule.startsWith('zap-') || rule.includes('cve-'),
  },
  {
    framework: 'ISO/IEC 27001:2022',
    controlId: 'A.8.20',
    controlName: 'Network security & anti-phishing',
    matchesRule: (rule) => rule.startsWith('phishing:') || rule.includes('security-header') || rule.includes('open-redirect'),
  },
  {
    framework: 'ISO/IEC 27001:2022',
    controlId: 'A.8.28',
    controlName: 'Secure coding & input validation',
    matchesRule: (rule) => rule.includes('sql-injection') || rule.includes('xss') || rule.includes('path-traversal'),
  },
  {
    framework: 'SOC 2 Type II',
    controlId: 'CC6.6',
    controlName: 'Logical boundary protection & access',
    matchesRule: (rule) => rule.includes('auth') || rule.includes('csrf') || rule.includes('clickjacking') || rule.includes('security-header'),
  },
  {
    framework: 'SOC 2 Type II',
    controlId: 'CC6.8',
    controlName: 'Malware prevention & unauthorized software',
    matchesRule: (rule) => rule.startsWith('malware:') || rule.includes('webshell') || rule.includes('cryptominer'),
  },
  {
    framework: 'SOC 2 Type II',
    controlId: 'CC7.1',
    controlName: 'Threat detection & vulnerability management',
    matchesRule: (rule) => rule.startsWith('dast-') || rule.startsWith('nuclei-') || rule.includes('sla-breach'),
  },
];

export function generateIsoAuditPack(findings: Finding[], options?: { runId?: string }): IsoAuditPack {
  const generatedAt = new Date().toISOString();
  const controls: AuditControlAssessment[] = [];

  for (const def of CONTROL_DEFINITIONS) {
    const matchedFindings = findings.filter((f) => def.matchesRule(f.ruleId || '', f.category));

    const critical = matchedFindings.filter((f) => f.severity === 'critical').length;
    const high = matchedFindings.filter((f) => f.severity === 'high').length;
    const total = matchedFindings.length;

    let status: AuditControlAssessment['status'] = 'COMPLIANT';
    if (critical > 0 || high > 0) {
      status = 'NON_COMPLIANT';
    } else if (total > 0) {
      status = 'PARTIAL';
    }

    controls.push({
      framework: def.framework,
      controlId: def.controlId,
      controlName: def.controlName,
      status,
      criticalFindings: critical,
      highFindings: high,
      totalFindings: total,
      findings: matchedFindings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        ruleId: f.ruleId,
      })),
      remediationSummary:
        status === 'NON_COMPLIANT'
          ? `Resolve ${critical + high} critical/high vulnerability item(s) to achieve compliance`
          : undefined,
    });
  }

  const compliantCount = controls.filter((c) => c.status === 'COMPLIANT').length;
  const nonCompliantCount = controls.filter((c) => c.status === 'NON_COMPLIANT').length;
  const scorePercent = Math.round((compliantCount / controls.length) * 100);

  const overallStatus: IsoAuditPack['overallStatus'] =
    nonCompliantCount === 0 ? 'AUDIT_READY' : nonCompliantCount <= 2 ? 'ACTION_REQUIRED' : 'AUDIT_FAILED';

  // Build markdown representation
  const runId = options?.runId ?? 'AUDIT-SNAPSHOT';
  const mdLines = [
    `# ISO/IEC 27001:2022 & SOC 2 Corporate Audit Evidence Pack`,
    `**Run Identifier:** \`${runId}\` | **Generated At:** ${generatedAt}`,
    `**Overall Compliance Verdict:** **${overallStatus}** (${scorePercent}% controls fully compliant)`,
    ``,
    `| Framework | Control ID | Control Description | Status | Critical / High | Total Findings |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`,
    ...controls.map(
      (c) =>
        `| ${c.framework} | \`${c.controlId}\` | ${c.controlName} | **${c.status}** | ${c.criticalFindings} / ${c.highFindings} | ${c.totalFindings} |`,
    ),
    ``,
    `> **Cryptographic Notice:** This audit evidence bundle is sealed with a cryptographic SHA-256 hash to ensure tamper-evident non-repudiation during formal auditor review.`,
  ];
  const markdownReport = mdLines.join('\n');

  // Compute SHA-256 seal
  const integrityHash = createHash('sha256')
    .update(JSON.stringify({ generatedAt, overallStatus, controls }))
    .digest('hex');

  return {
    generatedAt,
    integrityHash,
    overallStatus,
    summary: {
      totalControlsEvaluated: controls.length,
      compliantControls: compliantCount,
      nonCompliantControls: nonCompliantCount,
      complianceScorePercent: scorePercent,
    },
    controls,
    markdownReport,
  };
}
