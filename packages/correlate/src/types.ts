import type { Finding, FindingCategory, FindingConfidence, FindingSeverity } from '@nexus/core';
import type { AppMap } from '@nexus/app-map';

export interface RawSignal {
  id?: string;
  lane: string;
  title: string;
  ruleId?: string;
  category?: FindingCategory | string;
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  page?: string;
  endpoint?: string;
  component?: string;
  message?: string;
  stack?: string;
  expected?: string;
  actual?: string;
  affected?: Array<Record<string, unknown>>;
  occurrences?: number;
  evidence?: Array<Record<string, unknown>>;
  reproduction?: string[];
  requirements?: string[];
  codeFile?: string;
  codeLine?: number;
  commit?: string;
  suggestedOwner?: string;
  suggestedFix?: string;
}

export interface CorrelationOptions {
  appMap?: AppMap;
  recentCommits?: Array<{ hash: string; author: string; files: string[] }>;
  codeOwners?: Record<string, string>;
  failureOverrides?: Record<
    string,
    { category?: FindingCategory; owner?: string; reason?: string }
  >;
  currentRunId?: string;
}

export interface BaselineComparisonOptions {
  baselineFindings?: Finding[];
  baselineRunId?: string;
  mode?: 'standard' | 'retest-new';
  baselineTotals?: { passed: number; total: number };
  currentTotals?: { passed: number; total: number };
  currentRunId?: string;
  /** Older runs, newest first. Used to detect findings that were fixed and came back. */
  history?: Array<{ runId: string; findings: Finding[] }>;
}

export interface CorrelationResult {
  findings: Finding[];
  confidenceTotals: {
    verified: number;
    autoDiscovered: number;
    needsReview: number;
  };
  categoryTotals: Record<string, number>;
  severityTotals: Record<FindingSeverity, number>;
}
