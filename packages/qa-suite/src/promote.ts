import { defaultCatalogue, TestCatalogue } from './catalogue.js';
import type { PromotedTest, PromotionRequest, PromotionResult } from './types.js';

const CASE_ID_PATTERN = /^TC-[A-Z0-9]+-\d{3,}$/;

export async function promoteTestCase(
  request: PromotionRequest,
  catalogue: TestCatalogue = defaultCatalogue,
): Promise<PromotionResult> {
  const { candidate, requestedBy, runVerificationFn } = request;

  // 1. Metadata and convention validation
  if (!candidate?.id) {
    return {
      promoted: false,
      runsPassed: 0,
      runsTotal: 0,
      error: 'Promotion rejected: candidate test case must have an ID',
    };
  }

  if (!CASE_ID_PATTERN.test(candidate.id)) {
    return {
      promoted: false,
      runsPassed: 0,
      runsTotal: 0,
      error: `Promotion rejected: candidate ID "${candidate.id}" does not follow the required convention (TC-<AREA>-<NNN>)`,
    };
  }

  // 2. Strict confidence rule (Acceptance 6.3):
  // No business assertion without a requirement/spec/user row. Only "verified" cases can be promoted!
  if (candidate.confidence !== 'verified') {
    return {
      promoted: false,
      runsPassed: 0,
      runsTotal: 0,
      error: `Promotion rejected: candidate carries confidence "${candidate.confidence}". Only "verified" cases backed by formal requirements, spec, or user rows can be promoted to the regression suite.`,
    };
  }

  // 3. 3x Green verification check
  const REQUIRED_PASSES = 3;
  let runsPassed = 0;

  for (let i = 1; i <= REQUIRED_PASSES; i++) {
    try {
      const passed = await runVerificationFn(candidate, i);
      if (!passed) {
        return {
          promoted: false,
          runsPassed,
          runsTotal: REQUIRED_PASSES,
          error: `Promotion rejected: verification run #${i} failed (requires ${REQUIRED_PASSES}x consecutive green passes with 0% flakiness)`,
        };
      }
      runsPassed += 1;
    } catch (err) {
      return {
        promoted: false,
        runsPassed,
        runsTotal: REQUIRED_PASSES,
        error: `Promotion rejected: error during verification run #${i}: ${(err as Error).message}`,
      };
    }
  }

  // 4. Construct PromotedTest and add to catalogue
  const targetSummary = candidate.target.endpoint ?? candidate.target.page ?? candidate.target.component ?? 'app';
  const promotedTest: PromotedTest = {
    id: candidate.id,
    title: candidate.title,
    lane: candidate.lane,
    type: candidate.type,
    source: candidate.source,
    confidence: 'verified',
    requirements: candidate.requirements ?? [],
    promotedAt: new Date().toISOString(),
    promotedBy: requestedBy,
    verifiedRunsCount: REQUIRED_PASSES,
    flakyRate: 0.0,
    traceability: {
      requirements: candidate.requirements ?? [],
      target: targetSummary,
    },
  };

  catalogue.add(promotedTest);

  return {
    promoted: true,
    test: promotedTest,
    runsPassed: REQUIRED_PASSES,
    runsTotal: REQUIRED_PASSES,
  };
}
