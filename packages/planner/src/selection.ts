import type { AppMap } from '@nexus/app-map';
import type { PlannedTestCase } from './types.js';

export function orderCasesByRisk(
  cases: PlannedTestCase[],
  changedFiles: string[] = [],
  appMap?: AppMap,
): { orderedCases: PlannedTestCase[]; riskOrdering: string[] } {
  const normalizedChanged = new Set(changedFiles.map((f) => f.toLowerCase().trim()));

  const scoredCases = cases.map((c) => {
    let effectiveRisk = c.riskScore;

    // Check if target matches changed file directly
    const targetPath = (
      c.target.page ??
      c.target.endpoint ??
      c.target.component ??
      ''
    ).toLowerCase();
    const isDirectlyChanged = Array.from(normalizedChanged).some(
      (cf) => targetPath.includes(cf) || cf.includes(targetPath),
    );

    if (isDirectlyChanged) {
      effectiveRisk = Math.min(1.0, effectiveRisk * 1.5 + 0.3);
    } else if (appMap) {
      // Check if target is adjacent to a changed node in AppMap
      const adjacentToChanged = appMap.nodes.some(
        (n) =>
          n.changedRecently &&
          (n.path?.toLowerCase().includes(targetPath) || targetPath.includes(n.id.toLowerCase())),
      );
      if (adjacentToChanged) {
        effectiveRisk = Math.min(1.0, effectiveRisk * 1.25 + 0.15);
      }
    }

    return {
      caseItem: { ...c, riskScore: Number(effectiveRisk.toFixed(2)) },
      sortWeight: effectiveRisk,
    };
  });

  // Sort descending by risk (highest risk first)
  scoredCases.sort((a, b) => b.sortWeight - a.sortWeight);

  const orderedCases = scoredCases.map((s) => s.caseItem);
  const riskOrdering = orderedCases.map((c) => c.id);

  return { orderedCases, riskOrdering };
}
