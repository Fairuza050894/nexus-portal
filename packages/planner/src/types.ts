import type { AppMap } from '@nexus/app-map';
import type { DiscoveryResult, RepoAnalysis } from '@nexus/discover';
import type { RequirementRow, RunRequest } from '@nexus/core';

export type PlanCaseSource = 'invariant' | 'spec' | 'crawl' | 'repo-route' | 'requirement' | 'user';

export type PlanCaseConfidence = 'verified' | 'auto-discovered' | 'needs-review';

export type PlanCasePriority = 'critical' | 'high' | 'medium' | 'low';

export interface PlannedTestCase {
  id: string;
  title: string;
  lane: string;
  type: string;
  source: PlanCaseSource;
  confidence: PlanCaseConfidence;
  priority: PlanCasePriority;
  riskScore: number; // 0.0 to 1.0 (from AppMap & change analysis)
  target: {
    page?: string;
    endpoint?: string;
    component?: string;
  };
  requirements?: string[];
  params?: Record<string, unknown>;
  assertionType: 'invariant' | 'spec-schema' | 'status-check' | 'business-requirement';
  estDurationMs: number;
  modeCompatibility: 'allowed' | 'skipped-by-mode';
  reason?: string;
}

export interface PlanOptions {
  appMap: AppMap;
  discovery?: DiscoveryResult;
  repoAnalysis?: RepoAnalysis;
  requirements?: RequirementRow[];
  changedFiles?: string[];
  mode: RunRequest['mode'];
  scope: RunRequest['scope'];
  existingRows?: Record<string, Array<Record<string, unknown>>>;
}

export interface PlanResult {
  cases: PlannedTestCase[];
  stats: {
    total: number;
    verified: number;
    autoDiscovered: number;
    needsReview: number;
    coveragePercent: number;
    byLane: Record<string, number>;
  };
  uncoveredRequirements: string[];
  riskOrdering: string[]; // Ordered list of PlannedTestCase IDs (highest risk first)
}

export interface ScenarioDiff {
  type: string;
  added: PlannedTestCase[];
  modified: Array<{
    id: string;
    original: Record<string, unknown>;
    proposed: PlannedTestCase;
    changes: string[];
  }>;
  unchanged: Array<{ id: string }>;
}

export interface SelfHealingSuggestion {
  caseId: string;
  lane: string;
  target: string;
  kind: 'status-drift' | 'schema-drift' | 'selector-drift';
  expected: unknown;
  observed: unknown;
  suggestedPatch: Record<string, unknown>;
  confidence: 'needs-review';
  reason: string;
}
