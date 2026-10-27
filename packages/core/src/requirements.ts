import { existsSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { CoverageSummary, Finding, RequirementRow, RunTestSummary } from './types.js';

export interface RequirementDefinition {
  id: string;
  title: string;
  area?: string;
  severity?: string;
  acceptance: string[];
}

interface RawRequirement {
  id?: unknown;
  title?: unknown;
  area?: unknown;
  severity?: unknown;
  acceptance?: unknown;
}

/**
 * Loads a requirements YAML file. Returns undefined when the file does not
 * exist; throws when the file exists but cannot be parsed, so a broken
 * requirements source never silently degrades coverage to zero.
 */
export function loadRequirements(filePath: string): RequirementDefinition[] | undefined {
  if (!existsSync(filePath)) return undefined;
  const parsed = yaml.load(readFileSync(filePath, 'utf8'));
  const raw = (parsed as { requirements?: unknown } | undefined)?.requirements;
  if (!Array.isArray(raw)) {
    throw new Error(`requirements file has no requirements[] list: ${filePath}`);
  }
  return raw.map((entry, index) => {
    const item = entry as RawRequirement;
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error(`requirements[${index}] is missing an id`);
    }
    if (typeof item.title !== 'string' || item.title.length === 0) {
      throw new Error(`requirement ${item.id} is missing a title`);
    }
    const acceptance = Array.isArray(item.acceptance)
      ? item.acceptance.map((line) => String(line))
      : typeof item.acceptance === 'string'
        ? [item.acceptance]
        : [];
    return {
      id: item.id,
      title: item.title,
      ...(typeof item.area === 'string' ? { area: item.area } : {}),
      ...(typeof item.severity === 'string' ? { severity: item.severity } : {}),
      acceptance,
    };
  });
}

/**
 * Joins requirements with the tests and findings that reference them. A
 * requirement is covered only by an explicit reference; inferred coverage is
 * never reported.
 */
export function requirementRows(
  definitions: RequirementDefinition[],
  tests: RunTestSummary[],
  findings: Finding[],
): { rows: RequirementRow[]; coverage: CoverageSummary } {
  const rows: RequirementRow[] = definitions.map((definition) => {
    const testIds = new Set<string>();
    for (const test of tests) {
      if (test.requirements?.includes(definition.id)) testIds.add(test.id);
    }
    for (const finding of findings) {
      if (finding.requirements?.includes(definition.id) && finding.affected) {
        for (const item of finding.affected) {
          const testId = typeof item.test === 'string' ? item.test : undefined;
          if (testId) testIds.add(testId);
        }
      }
    }
    return {
      id: definition.id,
      title: definition.title,
      ...(definition.area ? { area: definition.area } : {}),
      ...(definition.severity ? { severity: definition.severity } : {}),
      acceptance: definition.acceptance,
      tests: [...testIds].sort(),
      covered: testIds.size > 0,
    };
  });

  const featureCoverage: Record<string, { total: number; passed: number; covered: boolean }> = {};
  for (const test of tests) {
    const key = test.feature ?? test.lane;
    const bucket = featureCoverage[key] ?? { total: 0, passed: 0, covered: false };
    bucket.total += 1;
    if (test.status === 'passed') bucket.passed += 1;
    if (test.requirements && test.requirements.length > 0) bucket.covered = true;
    featureCoverage[key] = bucket;
  }

  const covered = rows.filter((row) => row.covered).length;
  return {
    rows,
    coverage: {
      requirementsTotal: rows.length,
      requirementsCovered: covered,
      featureCoverage,
      uncovered: rows.filter((row) => !row.covered).map((row) => row.id),
    },
  };
}
