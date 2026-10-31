import type { RepoAnalysis } from '@nexus/discover';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';
import { scanFilesForMalware, type FileContentProvider } from './malware-scanner.js';

export function runRepoLane(
  _context: LaneContext,
  repo: RepoAnalysis | undefined,
  files?: FileContentProvider[],
): LaneResult {
  const startedAt = Date.now();
  if (!repo) {
    return {
      lane: 'repo',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no repository analysis',
      durationMs: Date.now() - startedAt,
    };
  }

  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  tests.push({
    id: 'TC-REPO-001',
    lane: 'repo',
    name: 'secret scan',
    status: repo.secretFindings.length > 0 ? 'failed' : 'passed',
    durationMs: 0,
    expected: '0 hardcoded secrets',
    actual: `${repo.secretFindings.length} finding(s)`,
  });
  for (const finding of repo.secretFindings) {
    drafts.push({
      title: `Possible ${finding.kind} in ${finding.file}`,
      ruleId: `secret:${finding.kind}`,
      severity: 'critical',
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'repo',
      affected: [{ component: finding.file, file: finding.file, line: finding.line }],
      expected: 'no hardcoded secret',
      actual: `${finding.kind} pattern`,
      evidence: [{ type: 'scan', file: finding.file, line: finding.line, kind: finding.kind }],
      suggestedFix: 'move the value to a secret reference and rotate it',
    });
  }

  tests.push({
    id: 'TC-REPO-002',
    lane: 'repo',
    name: 'dependency manifest',
    status: repo.dependencyFiles.length > 0 ? 'passed' : 'skipped',
    durationMs: 0,
    expected: 'at least one dependency manifest',
    actual: repo.dependencyFiles.join(', ') || 'none',
    ...(repo.dependencyFiles.length === 0 ? { reason: 'no dependency manifest found' } : {}),
  });

  tests.push({
    id: 'TC-REPO-003',
    lane: 'repo',
    name: 'license file',
    status: repo.licenseFiles.length > 0 ? 'passed' : 'skipped',
    durationMs: 0,
    expected: 'LICENSE/COPYING present',
    actual: repo.licenseFiles.join(', ') || 'none',
    ...(repo.licenseFiles.length === 0 ? { reason: 'no license file found' } : {}),
  });
  if (repo.licenseFiles.length === 0) {
    drafts.push({
      title: 'Repository has no license file',
      ruleId: 'repo-license-missing',
      severity: 'low',
      confidence: 'needs-review',
      category: 'quality-debt',
      lane: 'repo',
      actual: 'no LICENSE/COPYING',
      expected: 'license file present',
    });
  }

  tests.push({
    id: 'TC-REPO-004',
    lane: 'repo',
    name: 'developer tests discovered',
    status: repo.testFiles.length > 0 ? 'passed' : 'skipped',
    durationMs: 0,
    expected: '>=1 test file',
    actual: `${repo.testFiles.length} test file(s)`,
    ...(repo.testFiles.length === 0 ? { reason: 'no developer tests found' } : {}),
  });
  if (repo.testFiles.length === 0) {
    drafts.push({
      title: 'Repository has no discovered developer tests',
      ruleId: 'repo-tests-missing',
      severity: 'info',
      confidence: 'needs-review',
      category: 'quality-debt',
      lane: 'repo',
      actual: '0 test files',
      expected: 'developer tests present',
    });
  }

  tests.push({
    id: 'TC-REPO-005',
    lane: 'repo',
    name: 'developer tests executed',
    status: 'skipped',
    durationMs: 0,
    reason: 'test execution inside the sandbox is deferred; static analysis only in this MVP',
  });

  // Anti-Malware & Webshell Scan (Fase 13)
  if (files && files.length > 0) {
    const scanResult = scanFilesForMalware(files);
    const malwareThreats = scanResult.items.filter(
      (i) => i.kind === 'webshell' || i.kind === 'obfuscated-exec' || i.kind === 'command-injection-hook' || i.kind === 'cryptominer',
    );
    const frameworkThreats = scanResult.items.filter(
      (i) => i.kind === 'laravel-debug-exposed' || i.kind === 'laravel-unprotected-model' || i.kind === 'php-cgi-vulnerability',
    );

    tests.push({
      id: 'TC-REPO-006',
      lane: 'repo',
      name: 'anti-malware and webshell scan',
      status: malwareThreats.length > 0 ? 'failed' : 'passed',
      durationMs: 10,
      expected: '0 webshells, backdoors, or cryptominers',
      actual: `${malwareThreats.length} threat(s) detected across ${files.length} file(s)`,
    });

    tests.push({
      id: 'TC-REPO-007',
      lane: 'repo',
      name: 'php & laravel cyber defense scan',
      status: frameworkThreats.length > 0 ? 'failed' : 'passed',
      durationMs: 5,
      expected: '0 critical PHP/Laravel framework misconfigurations or RCE indicators',
      actual: `${frameworkThreats.length} issue(s) detected`,
    });

    for (const item of scanResult.items) {
      drafts.push({
        title: `[Cyber Threat] ${item.description} in ${item.file}`,
        ruleId: `malware:${item.kind}`,
        severity: item.severity,
        confidence: 'verified',
        category: 'security',
        lane: 'repo',
        affected: [{ file: item.file, line: item.line }],
        expected: 'Codebase free from backdoors and critical framework exploits',
        actual: item.snippet ? `Matched: "${item.snippet}"` : item.description,
        evidence: [
          {
            type: 'malware-detection',
            file: item.file,
            line: item.line,
            kind: item.kind,
            snippet: item.snippet,
          },
        ],
        suggestedFix:
          item.kind === 'webshell' || item.kind === 'cryptominer'
            ? 'Quarantine file and inspect system access logs'
            : item.kind === 'laravel-debug-exposed'
              ? 'Set APP_DEBUG=false in environment'
              : 'Review code security guidelines and enforce parameterization',
      });
    }
  }

  return {
    lane: 'repo',
    status: tests.some((test) => test.status === 'failed') ? 'failed' : 'passed',
    tests,
    findings: toFindings(drafts),
    durationMs: Date.now() - startedAt,
  };
}
