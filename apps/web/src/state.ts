import type { Finding, RunRequest } from '@nexus/core';
import type { FullStackTopology } from '@nexus/app-map';
import type { SupportedLanguage } from './i18n.js';
export interface PlanCase {
  id: string;
  title: string;
  lane: string;
  source: 'user' | 'spec' | 'crawl' | 'repo-route' | 'requirement' | 'invariant';
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  priority: 'critical' | 'high' | 'medium' | 'low';
  modeCompatibility: 'allowed' | 'skipped-by-mode';
  approved: boolean;
  estDurationMs: number;
}

export type PortalStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface PortalState {
  currentStep: PortalStep;
  furthestStep: PortalStep;
  language: SupportedLanguage;
  userRole: 'viewer' | 'runner' | 'approver' | 'admin';

  // Step 1: Target Inputs
  name: string;
  mode: RunRequest['mode'];
  scope: RunRequest['scope'];
  repoUrl: string;
  webUrls: string;
  apiBaseUrl: string;
  apiSpecUrl: string;
  authorizationConfirmed: boolean;
  approvedBy: string;

  // Step 2: Builder State
  activeBuilderType: string;
  builderGlobals: Record<string, Record<string, unknown>>;
  testRows: Record<string, Array<Record<string, unknown>>>;

  // Step 3: Plan Review State
  planCases: PlanCase[];
  approvedCaseIds: Set<string>;

  // Step 4: Live Run State
  runId?: string;
  runStatus?: string;
  stages: Record<string, 'pending' | 'running' | 'ok' | 'failed' | 'skipped'>;
  liveLogs: string[];
  requestsCount: number;
  circuitBreakerOpen: boolean;

  // Step 5: Results State
  gate?: 'GO' | 'GO WITH RISKS' | 'NO-GO';
  gateReasons: string[];
  findings: Finding[];
  selectedFinding?: Finding;
  notCovered: Array<{ id: string; title: string; reason: string }>;
  bundleUrl?: string;

  // Step 6: Architecture & Lineage
  topology?: FullStackTopology;

  // UI status
  validationErrors: Record<string, string>;
  isSubmitting: boolean;
}

export function createInitialState(): PortalState {
  return {
    currentStep: 1,
    furthestStep: 1,
    language: 'id',
    userRole: 'runner',

    name: 'Sample QA Run',
    mode: 'sandbox',
    scope: 'quick',
    repoUrl: 'fixtures/sample-todo-api',
    webUrls: 'http://127.0.0.1:3100/',
    apiBaseUrl: 'http://127.0.0.1:3100',
    apiSpecUrl: '/openapi.json',
    authorizationConfirmed: false,
    approvedBy: '',

    activeBuilderType: 'e2e',
    builderGlobals: {},
    testRows: {
      e2e: [
        {
          id: 'TC-E2E-001',
          scenario: 'Pemeriksaan integritas DOM dan navigasi awal',
          steps: 'Buka URL target; tunggu selector #root; verifikasi status 200',
          expected: 'Halaman berhasil dimuat tanpa error konsol',
          severity: 'high',
          requirement: 'REQ-INVARIANT-01',
        },
      ],
      api: [
        {
          method: 'GET',
          endpoint: '/health',
          expectedStatus: 200,
          schemaCheck: true,
          severity: 'critical',
        },
      ],
    },

    planCases: [],
    approvedCaseIds: new Set(),

    stages: {
      preflight: 'pending',
      discover: 'pending',
      'app-map': 'pending',
      lanes: 'pending',
      correlate: 'pending',
      document: 'pending',
    },
    liveLogs: [],
    requestsCount: 0,
    circuitBreakerOpen: false,

    gateReasons: [],
    findings: [],
    notCovered: [],

    validationErrors: {},
    isSubmitting: false,
  };
}
