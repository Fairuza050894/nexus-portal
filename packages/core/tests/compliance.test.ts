import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadComplianceMapping, matchCompliance } from '../src/index.js';
import type { Finding } from '../src/index.js';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'compliance-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    title: 'Finding',
    ruleId: 'missing-security-header:content-security-policy',
    severity: 'medium',
    confidence: 'auto-discovered',
    category: 'security',
    lanes: ['security'],
    occurrences: 1,
    evidence: [],
    status: 'new',
    ...overrides,
  };
}

describe('compliance mapping', () => {
  it('loads the example mapping and matches rule-specific entries before category', () => {
    const mapping = loadComplianceMapping(join(process.cwd(), 'compliance', 'mapping.yaml'));
    expect(mapping.version).toBe('1.0');
    expect(mapping.frameworks).toEqual(['PCI-DSS v4', 'SOC 2', 'ISO/IEC 27001:2022']);

    const ruleMatches = matchCompliance(mapping, finding());
    expect(ruleMatches).toEqual(
      expect.arrayContaining([
        { framework: 'PCI-DSS v4', controls: ['6.4.1'], matchedBy: 'ruleId' },
      ]),
    );

    const categoryMatches = matchCompliance(
      mapping,
      finding({ ruleId: 'some-other-security-rule' }),
    );
    expect(categoryMatches).toEqual(
      expect.arrayContaining([{ framework: 'SOC 2', controls: ['CC7.1'], matchedBy: 'category' }]),
    );
  });

  it('returns no match for unmapped findings', () => {
    const mapping = loadComplianceMapping(join(process.cwd(), 'compliance', 'mapping.yaml'));
    expect(
      matchCompliance(mapping, finding({ ruleId: 'unknown-rule', category: 'quality-debt' })),
    ).toEqual([]);
  });

  it('rejects invalid mapping files instead of rendering partial claims', () => {
    const dir = tempDir();
    const invalid = join(dir, 'invalid.yaml');
    writeFileSync(invalid, 'version: "1.0"\nmappings: nope\n', 'utf8');
    expect(() => loadComplianceMapping(invalid)).toThrow('mappings must be an array');

    const missingControls = join(dir, 'missing-controls.yaml');
    writeFileSync(missingControls, 'version: "1.0"\nmappings:\n  - category: security\n', 'utf8');
    expect(() => loadComplianceMapping(missingControls)).toThrow('controls must be an object');

    expect(() => loadComplianceMapping(join(dir, 'absent.yaml'))).toThrow(
      'compliance mapping not found',
    );
  });
});
