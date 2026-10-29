import { createHash } from 'node:crypto';
import type { Finding } from '@nexus/core';

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ISO_TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?\b/gi;
const LONG_HEX_PATTERN = /\b[0-9a-f]{24,}\b/gi;

const CONFIDENCE_RANK: Record<string, number> = {
  verified: 3,
  'auto-discovered': 2,
  'needs-review': 1,
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Normalizes a page/endpoint target: removes volatile URL parts and replaces
 * dynamic identifiers with stable placeholders.
 */
export function normalizeTarget(value: string): string {
  let target = value.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(target)) {
    try {
      target = new URL(target).pathname;
    } catch {
      // Keep the raw value when it is not a parseable URL.
    }
  }
  target = target.split('#')[0]!.split('?')[0]!.trim();
  target = target
    .replace(UUID_PATTERN, ':uuid')
    .replace(ISO_TIMESTAMP_PATTERN, ':timestamp')
    .replace(LONG_HEX_PATTERN, ':token')
    .replace(/(^|\/)(\d+)(?=\/|$)/g, '$1:id');
  const collapsed = target.replace(/\/{2,}/g, '/').replace(/\s+/g, ' ');
  if (collapsed === '/') return '/';
  return collapsed.replace(/\/$/, '');
}

/** Normalizes a component/file identifier without erasing version-like numbers. */
export function normalizeComponent(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('#')[0]!
    .split('?')[0]!
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
    .replace(/\s+/g, ' ');
}

function normalizeRuleText(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:a11y|security|vitals|axe)\s*:\s*/, '')
    .replace(UUID_PATTERN, 'uuid')
    .replace(ISO_TIMESTAMP_PATTERN, 'timestamp')
    .replace(LONG_HEX_PATTERN, 'token')
    .replace(/\b\d+(?:\.\d+)?(?:ms|s|px)?\b/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export interface RuleIdentityInput {
  title: string;
  ruleId?: string;
  evidence?: Array<Record<string, unknown>>;
}

/**
 * Resolves the check identifier. Explicit `ruleId` wins, then well-known
 * evidence fields, then a normalized title fallback.
 */
export function deriveRuleId(input: RuleIdentityInput): string {
  if (input.ruleId && input.ruleId.trim().length > 0) {
    return input.ruleId.trim().toLowerCase().replace(/\s+/g, '-');
  }
  for (const item of input.evidence ?? []) {
    for (const key of ['ruleId', 'rule', 'checkId']) {
      const value = item[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim().toLowerCase().replace(/\s+/g, '-');
      }
    }
  }
  return normalizeRuleText(input.title) || 'unknown';
}

export function findingTargets(finding: Finding): string[] {
  const targets = new Set<string>();
  for (const item of finding.affected ?? []) {
    if (typeof item.page === 'string') targets.add(`page:${normalizeTarget(item.page)}`);
    if (typeof item.endpoint === 'string') {
      targets.add(`endpoint:${normalizeTarget(item.endpoint)}`);
    }
    if (typeof item.component === 'string') {
      targets.add(`component:${normalizeComponent(item.component)}`);
    }
  }
  if (targets.size === 0) {
    for (const ref of finding.codeRefs ?? []) {
      targets.add(`component:${normalizeComponent(ref.file)}`);
    }
  }
  return [...targets].sort();
}

export function fingerprintPayload(finding: Finding): string {
  const category = String(finding.category).toLowerCase();
  const ruleId = deriveRuleId({
    title: finding.title,
    ...(finding.ruleId ? { ruleId: finding.ruleId } : {}),
    evidence: finding.evidence,
  });
  return [category, ruleId, findingTargets(finding).join(',')].join('|');
}

/** Fingerprint v2: sha256 over category, rule/check id, and normalized targets. */
export function findingFingerprint(finding: Finding): string {
  return `v2:${hash(fingerprintPayload(finding))}`;
}

/** Stored fingerprint wins so historical summaries keep their identity. */
export function resolveFindingFingerprint(finding: Finding): string {
  return finding.fingerprint?.startsWith('v2:') ? finding.fingerprint : findingFingerprint(finding);
}

/** Pre-v2 key, kept only for the one-transition baseline fallback. */
export function legacyFindingFingerprint(finding: Finding): string {
  const affectedStr = finding.affected
    ? finding.affected
        .map((item) => `${String(item.page ?? '')}:${String(item.endpoint ?? '')}`)
        .sort()
        .join(',')
    : '';
  return `${finding.category}:${finding.title}:${affectedStr}`.toLowerCase();
}

/**
 * Title-only pre-v2 key. Used only when the baseline finding predates v2 and
 * therefore has no stored fingerprint/ruleId, so an affected-list change does
 * not reclassify the whole run as new. Never used between two v2 findings.
 */
export function legacyLooseFindingFingerprint(finding: Finding): string {
  return `${finding.category}:${finding.title}`.toLowerCase();
}

export function isPreV2Finding(finding: Finding): boolean {
  return !finding.fingerprint && !finding.ruleId;
}

export function findingIdentityKeys(finding: Finding): string[] {
  return [resolveFindingFingerprint(finding), `legacy:${legacyFindingFingerprint(finding)}`];
}

function stableRecordKey(record: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

function uniqueRecords(records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const key = stableRecordKey(record);
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, record]) => record);
}

function mergeDuplicateFindings(left: Finding, right: Finding): Finding {
  const fingerprint = resolveFindingFingerprint(left);
  const severity =
    (SEVERITY_RANK[right.severity] ?? 0) > (SEVERITY_RANK[left.severity] ?? 0)
      ? right.severity
      : left.severity;
  const confidence =
    (CONFIDENCE_RANK[right.confidence] ?? 0) > (CONFIDENCE_RANK[left.confidence] ?? 0)
      ? right.confidence
      : left.confidence;
  const affected = uniqueRecords([...(left.affected ?? []), ...(right.affected ?? [])]);
  const evidence = uniqueRecords([...left.evidence, ...right.evidence]);
  const codeRefs = [...(left.codeRefs ?? []), ...(right.codeRefs ?? [])].filter(
    (ref, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.file === ref.file &&
          candidate.line === ref.line &&
          candidate.commit === ref.commit,
      ) === index,
  );
  const requirements = [
    ...new Set([...(left.requirements ?? []), ...(right.requirements ?? [])]),
  ].sort();

  return {
    ...left,
    severity,
    confidence,
    fingerprint,
    lanes: [...new Set([...left.lanes, ...right.lanes])].sort(),
    occurrences: left.occurrences + right.occurrences,
    ...(affected.length > 0 ? { affected } : {}),
    evidence,
    ...((left.expected ?? right.expected) ? { expected: left.expected ?? right.expected } : {}),
    ...((left.actual ?? right.actual) ? { actual: left.actual ?? right.actual } : {}),
    ...((left.reproduction ?? right.reproduction)
      ? { reproduction: left.reproduction ?? right.reproduction }
      : {}),
    ...(codeRefs.length > 0 ? { codeRefs } : {}),
    ...(requirements.length > 0 ? { requirements } : {}),
    ...((left.suggestedOwner ?? right.suggestedOwner)
      ? { suggestedOwner: left.suggestedOwner ?? right.suggestedOwner }
      : {}),
    ...((left.suggestedFix ?? right.suggestedFix)
      ? { suggestedFix: left.suggestedFix ?? right.suggestedFix }
      : {}),
  };
}

/**
 * Collapses findings with the same fingerprint into one finding with summed
 * occurrences and a deduplicated affected list. IDs are reassigned in
 * fingerprint order so the output is deterministic.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byFingerprint = new Map<string, Finding>();
  for (const finding of findings) {
    const fingerprint = resolveFindingFingerprint(finding);
    const normalized = finding.fingerprint === fingerprint ? finding : { ...finding, fingerprint };
    const existing = byFingerprint.get(fingerprint);
    byFingerprint.set(
      fingerprint,
      existing ? mergeDuplicateFindings(existing, normalized) : normalized,
    );
  }
  return [...byFingerprint.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, finding], index) => ({
      ...finding,
      id: `F-${String(index + 1).padStart(4, '0')}`,
    }));
}
