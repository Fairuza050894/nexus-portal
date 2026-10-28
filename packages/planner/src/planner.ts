import {
  generateCrawlCases,
  generateInvariants,
  generateRepoRouteCases,
  generateRequirementCases,
  generateSpecCases,
} from './generators.js';
import { orderCasesByRisk } from './selection.js';
import type { PlanOptions, PlanResult, PlannedTestCase } from './types.js';

export function createExecutionPlan(options: PlanOptions): PlanResult {
  const rawCases: PlannedTestCase[] = [];

  // 1. Invariants
  rawCases.push(...generateInvariants(options));

  // 2. Spec-driven cases
  rawCases.push(...generateSpecCases(options));

  // 3. Crawl-based cases
  rawCases.push(...generateCrawlCases(options));

  // 4. Repo-route cases
  rawCases.push(...generateRepoRouteCases(options));

  // 5. Requirement cases
  rawCases.push(...generateRequirementCases(options));

  // 6. User-provided test rows
  if (options.existingRows) {
    for (const [lane, rows] of Object.entries(options.existingRows)) {
      if (Array.isArray(rows)) {
        rows.forEach((row, idx) => {
          const caseId =
            typeof row.id === 'string'
              ? row.id
              : `TC-USER-${lane.toUpperCase()}-${String(idx + 1).padStart(3, '0')}`;
          const title =
            typeof row.scenario === 'string'
              ? row.scenario
              : `User defined test row ${lane} #${idx + 1}`;
          const isMutating =
            lane === 'api' &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(row.method ?? '').toUpperCase());

          rawCases.push({
            id: caseId,
            title,
            lane,
            type: lane,
            source: 'user',
            confidence: 'verified',
            priority: (row.severity as PlannedTestCase['priority']) ?? 'high',
            riskScore: 0.5,
            target: {
              endpoint: typeof row.endpoint === 'string' ? row.endpoint : undefined,
              page: typeof row.path === 'string' ? row.path : undefined,
            },
            assertionType: 'business-requirement',
            estDurationMs: 2000,
            modeCompatibility:
              options.mode === 'prod-safe' && isMutating ? 'skipped-by-mode' : 'allowed',
            reason: 'User-provided explicit test row',
          });
        });
      }
    }
  }

  // Deduplicate cases by ID
  const seenIds = new Set<string>();
  const dedupedCases: PlannedTestCase[] = [];
  for (const c of rawCases) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      dedupedCases.push(c);
    }
  }

  // Order cases by risk (highest risk first)
  const { orderedCases, riskOrdering } = orderCasesByRisk(
    dedupedCases,
    options.changedFiles ?? [],
    options.appMap,
  );

  // Calculate coverage stats
  const total = orderedCases.length;
  const verified = orderedCases.filter((c) => c.confidence === 'verified').length;
  const autoDiscovered = orderedCases.filter((c) => c.confidence === 'auto-discovered').length;
  const needsReview = orderedCases.filter((c) => c.confidence === 'needs-review').length;

  const byLane: Record<string, number> = {};
  for (const c of orderedCases) {
    byLane[c.lane] = (byLane[c.lane] ?? 0) + 1;
  }

  // Requirement coverage
  const allReqs = options.requirements ?? [];
  const coveredReqIds = new Set<string>();
  for (const c of orderedCases) {
    for (const reqId of c.requirements ?? []) {
      coveredReqIds.add(reqId);
    }
  }

  const uncoveredRequirements: string[] = [];
  for (const r of allReqs) {
    if (!coveredReqIds.has(r.id)) {
      uncoveredRequirements.push(r.id);
    }
  }

  const coveragePercent =
    allReqs.length > 0
      ? Number(((coveredReqIds.size / allReqs.length) * 100).toFixed(1))
      : 100.0;

  return {
    cases: orderedCases,
    stats: {
      total,
      verified,
      autoDiscovered,
      needsReview,
      coveragePercent,
      byLane,
    },
    uncoveredRequirements,
    riskOrdering,
  };
}
