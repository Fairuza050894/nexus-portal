import type { Finding, QaConfig, RunRequest } from '@nexus/core';
import type { DiscoveryResult } from '@nexus/discover';
import type { AppMap } from '@nexus/app-map';
import type { SessionResult } from '@nexus/session';

export const LANE_NAMES = ['repo', 'api', 'e2e', 'a11y', 'visual', 'perf', 'security', 'mobile'] as const;
export type LaneName = (typeof LANE_NAMES)[number];

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface LaneTestCase {
  id: string;
  lane: LaneName;
  name: string;
  status: TestStatus;
  durationMs: number;
  feature?: string;
  requirements?: string[];
  expected?: string;
  actual?: string;
  reason?: string;
  evidence?: Array<Record<string, unknown>>;
}

export interface FindingDraft {
  title: string;
  ruleId?: string;
  severity: Finding['severity'];
  confidence: Finding['confidence'];
  category: Finding['category'];
  lane: LaneName;
  occurrences?: number;
  affected?: Array<Record<string, unknown>>;
  evidence?: Array<Record<string, unknown>>;
  expected?: string;
  actual?: string;
  suggestedOwner?: string;
  suggestedFix?: string;
}

export interface LaneResult {
  lane: LaneName;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  tests: LaneTestCase[];
  findings: Finding[];
  reason?: string;
  durationMs: number;
}

export interface LaneContext {
  runId: string;
  runDir: string;
  mode: RunRequest['mode'];
  scope: RunRequest['scope'];
  request: RunRequest;
  config: QaConfig;
  discovery: DiscoveryResult;
  appMap: AppMap;
  session?: SessionResult;
  env?: NodeJS.ProcessEnv;
  storageStatePath?: string;
}

export interface LanePlan {
  lanes: LaneName[];
  unsupported: LaneName[];
  reasons: string[];
}

export interface LaneTotals {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  lanes: LaneName[];
}

export interface LaneRunResult {
  lanes: LaneResult[];
  findings: Finding[];
  session?: SessionResult;
  totals: LaneTotals;
  warnings: string[];
}
