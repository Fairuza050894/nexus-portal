import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importSarifFindings,
  ingestExternalFindings,
  type ExternalFindingsAdapter,
} from '../src/index.js';

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'semgrep.sarif'), 'utf8'),
) as unknown;

describe('external findings ingestion', () => {
  it('maps SARIF results to findings with provenance and confidence labels', () => {
    const findings = importSarifFindings(fixture);
    expect(findings).toHaveLength(2);

    const secret = findings.find(
      (finding) => finding.ruleId === 'javascript.lang.security.audit.hardcoded-secret',
    );
    expect(secret).toMatchObject({
      severity: 'critical',
      confidence: 'auto-discovered',
      category: 'security',
      lanes: ['security-external'],
      occurrences: 2,
      status: 'new',
      provenance: {
        tool: 'Semgrep',
        version: '1.90.0',
        ruleId: 'javascript.lang.security.audit.hardcoded-secret',
        rawSeverity: '9.1',
      },
    });
    expect(secret?.affected).toEqual([{ component: 'src/config.ts' }]);
    expect(secret?.fingerprint).toMatch(/^v2:[0-9a-f]{64}$/);

    const heuristic = findings.find(
      (finding) => finding.ruleId === 'typescript.react.best-practice.no-dangerous-html',
    );
    expect(heuristic).toMatchObject({
      severity: 'medium',
      confidence: 'needs-review',
      category: 'security',
      lanes: ['security-external'],
    });
  });

  it('redacts tokens and secrets from external messages before storing findings', () => {
    const findings = importSarifFindings(fixture);
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain('ghp_123456789012345678901234567890123456');
    expect(serialized).toContain('TOKEN_REDACTED');
  });

  it('rejects invalid SARIF instead of producing partial findings', () => {
    expect(() => importSarifFindings({ version: '2.0.0', runs: [] })).toThrow(
      'version 2.1.0',
    );
    expect(() => importSarifFindings({ version: '2.1.0' })).toThrow('runs array');
    expect(() => importSarifFindings(null)).toThrow('object');
  });

  it('supports a generic adapter and dedupes its findings', () => {
    const adapter: ExternalFindingsAdapter<Array<{ title: string; rule: string }>> = {
      id: 'fixture',
      tool: 'fixture-tool',
      import: (raw) =>
        raw.map((item) => ({
          id: '',
          title: item.title,
          ruleId: item.rule,
          severity: 'medium',
          confidence: 'needs-review',
          category: 'security',
          lanes: ['security-external'],
          occurrences: 1,
          affected: [{ component: 'src/a.ts' }],
          evidence: [],
          status: 'new',
          provenance: { tool: 'fixture-tool', ruleId: item.rule },
        })),
    };
    const findings = ingestExternalFindings(adapter, [
      { title: 'Same issue', rule: 'fixture-rule' },
      { title: 'Same issue', rule: 'fixture-rule' },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].occurrences).toBe(2);
    expect(findings[0].id).toBe('F-0001');
  });
});
