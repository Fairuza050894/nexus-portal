import { redactValue, type Finding, type FindingCategory } from '@nexus/core';
import { dedupeFindings, findingFingerprint } from './fingerprint.js';

export interface ExternalFindingsAdapter<Raw = unknown> {
  id: string;
  tool: string;
  version?: string;
  import(raw: Raw): Finding[];
}

interface SarifRule {
  id?: string;
  name?: string;
  shortDescription?: { text?: string };
  defaultConfiguration?: { level?: string };
  properties?: Record<string, unknown>;
  tags?: string[];
}

interface SarifResult {
  ruleId?: string;
  ruleIndex?: number;
  level?: string;
  kind?: string;
  message?: { text?: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number };
    };
    logicalLocations?: Array<{ fullyQualifiedName?: string; kind?: string }>;
  }>;
  properties?: Record<string, unknown>;
}

interface SarifRun {
  tool?: {
    driver?: {
      name?: string;
      version?: string;
      rules?: SarifRule[];
    };
  };
  results?: SarifResult[];
}

const KNOWN_CATEGORIES: Record<string, true> = {
  'app-bug': true,
  'test-bug': true,
  environment: true,
  data: true,
  flaky: true,
  security: true,
  accessibility: true,
  performance: true,
  'quality-debt': true,
  unknown: true,
};

function categoryOf(result: SarifResult, rule: SarifRule | undefined): FindingCategory {
  const candidate =
    (typeof result.properties?.category === 'string'
      ? result.properties.category
      : typeof rule?.properties?.category === 'string'
        ? rule.properties.category
        : undefined) ?? '';
  if (KNOWN_CATEGORIES[candidate]) return candidate as FindingCategory;
  const tags = [...(rule?.tags ?? [])].map((tag) => tag.toLowerCase());
  if (tags.includes('accessibility') || tags.includes('a11y')) return 'accessibility';
  if (tags.includes('performance')) return 'performance';
  if (tags.includes('quality')) return 'quality-debt';
  return 'security';
}

function rawSeverityOf(
  result: SarifResult,
  rule: SarifRule | undefined,
): { severity: Finding['severity']; raw: string } {
  const explicit =
    (typeof result.properties?.severity === 'string'
      ? result.properties.severity
      : typeof rule?.properties?.severity === 'string'
        ? rule.properties.severity
        : undefined) ?? '';
  if (['critical', 'high', 'medium', 'low', 'info'].includes(explicit.toLowerCase())) {
    return { severity: explicit.toLowerCase() as Finding['severity'], raw: explicit };
  }

  const securitySeverity =
    result.properties?.['security-severity'] ?? rule?.properties?.['security-severity'];
  const numeric = typeof securitySeverity === 'string' ? Number(securitySeverity) : NaN;
  if (Number.isFinite(numeric)) {
    const severity: Finding['severity'] =
      numeric >= 9 ? 'critical' : numeric >= 7 ? 'high' : numeric >= 4 ? 'medium' : numeric > 0 ? 'low' : 'info';
    return { severity, raw: String(securitySeverity) };
  }

  const level = (result.level ?? rule?.defaultConfiguration?.level ?? 'warning').toLowerCase();
  const severity: Finding['severity'] =
    level === 'error' ? 'high' : level === 'warning' ? 'medium' : level === 'note' ? 'low' : 'info';
  return { severity, raw: level };
}

function confidenceOf(
  result: SarifResult,
  rule: SarifRule | undefined,
  hasLocation: boolean,
): Finding['confidence'] {
  const precision =
    result.properties?.precision ??
    rule?.properties?.precision ??
    rule?.properties?.confidence;
  const normalized = typeof precision === 'string' ? precision.toLowerCase() : '';
  if (!hasLocation) return 'needs-review';
  if (result.kind === 'review' || normalized === 'low' || normalized === 'medium') {
    return 'needs-review';
  }
  if (normalized === 'high' || normalized === 'very-high' || normalized === '') {
    return 'auto-discovered';
  }
  return 'needs-review';
}

function affectedOf(result: SarifResult): {
  affected: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
} {
  const affected: Array<Record<string, unknown>> = [];
  const evidence: Array<Record<string, unknown>> = [];
  for (const location of result.locations ?? []) {
    const uri = location.physicalLocation?.artifactLocation?.uri;
    if (uri) {
      affected.push({ component: uri });
      evidence.push({
        type: 'external-location',
        uri,
        ...(location.physicalLocation?.region?.startLine
          ? { line: location.physicalLocation.region.startLine }
          : {}),
      });
    }
    for (const logical of location.logicalLocations ?? []) {
      const name = logical.fullyQualifiedName;
      if (!name) continue;
      if (/^[A-Z]+\s+\//.test(name)) affected.push({ endpoint: name });
      else if (/^\//.test(name) || /^https?:\/\//.test(name)) affected.push({ page: name });
      else affected.push({ component: name });
      evidence.push({ type: 'external-location', uri: name });
    }
  }
  return { affected, evidence };
}

function importResult(
  result: SarifResult,
  run: SarifRun,
  index: number,
): Finding {
  const driver = run.tool?.driver;
  const rule =
    (result.ruleIndex !== undefined ? driver?.rules?.[result.ruleIndex] : undefined) ??
    driver?.rules?.find((candidate) => candidate.id === result.ruleId);
  const ruleId = result.ruleId ?? rule?.id ?? `external-rule-${index + 1}`;
  const { severity, raw } = rawSeverityOf(result, rule);
  const { affected, evidence } = affectedOf(result);
  const hasLocation = affected.length > 0;
  const title =
    result.message?.text?.trim() ||
    rule?.shortDescription?.text?.trim() ||
    `External finding ${ruleId}`;
  const finding: Finding = {
    id: '',
    title,
    ruleId,
    severity,
    confidence: confidenceOf(result, rule, hasLocation),
    category: categoryOf(result, rule),
    lanes: ['security-external'],
    occurrences: 1,
    ...(affected.length > 0 ? { affected } : {}),
    evidence: [
      ...evidence,
      {
        type: 'external',
        tool: driver?.name ?? 'unknown',
        version: driver?.version,
        ruleId,
        level: result.level ?? rule?.defaultConfiguration?.level,
        rawSeverity: raw,
      },
    ],
    actual: result.message?.text,
    status: 'new',
    provenance: {
      tool: driver?.name ?? 'unknown',
      ...(driver?.version ? { version: driver.version } : {}),
      ruleId,
      rawSeverity: raw,
    },
  };
  finding.fingerprint = findingFingerprint(finding);
  return redactValue(finding);
}

/**
 * Imports SARIF 2.1.0 results into the unified Finding model. No scanner is
 * executed; the input is treated as untrusted data and redacted before use.
 */
export function importSarifFindings(sarif: unknown): Finding[] {
  if (!sarif || typeof sarif !== 'object') {
    throw new Error('external SARIF must be an object');
  }
  const log = sarif as { version?: unknown; runs?: unknown };
  if (log.version !== '2.1.0') {
    throw new Error('external SARIF must declare version 2.1.0');
  }
  if (!Array.isArray(log.runs)) {
    throw new Error('external SARIF must contain a runs array');
  }

  const findings: Finding[] = [];
  for (const rawRun of log.runs) {
    if (!rawRun || typeof rawRun !== 'object') continue;
    const run = rawRun as SarifRun;
    for (const [index, result] of (run.results ?? []).entries()) {
      if (!result || typeof result !== 'object') continue;
      findings.push(importResult(result, run, index));
    }
  }
  return dedupeFindings(findings);
}

export const sarifFindingsAdapter: ExternalFindingsAdapter = {
  id: 'sarif',
  tool: 'sarif',
  import: (raw) => importSarifFindings(raw),
};

export function ingestExternalFindings<Raw>(
  adapter: ExternalFindingsAdapter<Raw>,
  raw: Raw,
): Finding[] {
  return dedupeFindings(adapter.import(raw));
}
