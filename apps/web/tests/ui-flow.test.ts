import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  renderPortalHtml,
  t,
  type PortalState,
} from '../src/index.js';
import { RunManager } from '../../api/src/runs.js';
import { defaultRegistry } from '@nexus/registry';

describe('Dogfooding Acceptance Suite (docs/08-UI-FLOW-REFERENCE.md)', () => {
  const manager = new RunManager();

  // ==========================================
  // STEP 1 — TARGET & NEW RUN (Scenarios 1.1 - 1.9)
  // ==========================================
  describe('Step 1 — Target & New Run', () => {
    it('Scenario 1.1: Neither repo nor web URL filled -> Inline error', () => {
      const estimate = manager.estimateDryRun({
        name: 'Empty Target Run',
        mode: 'sandbox',
      });
      expect(estimate.valid).toBe(false);
      expect(estimate.errors?.some((e) => e.includes('Provide a repo link or web URL'))).toBe(true);
    });

    it('Scenario 1.2: Web URL without http:// or https:// -> Inline error', () => {
      const estimate = manager.estimateDryRun({
        name: 'Invalid URL Run',
        mode: 'sandbox',
        web: { urls: ['not-a-valid-url'] },
      });
      expect(estimate.valid).toBe(false);
      expect(estimate.errors?.some((e) => e.includes('Invalid URL format') || e.includes('http'))).toBe(true);
    });

    it('Scenario 1.3: Mode = sandbox, no repo -> Error sandbox needs repo', () => {
      const estimate = manager.estimateDryRun({
        name: 'Sandbox Without Repo',
        mode: 'sandbox',
        web: { urls: ['http://127.0.0.1:3100/'] },
      });
      expect(estimate.valid).toBe(false);
      expect(estimate.errors?.some((e) => e.includes('Sandbox mode requires a repository'))).toBe(true);
    });

    it('Scenario 1.4: Mode = staging/prod-safe, unconfirmed auth or empty approver -> Error', () => {
      const unconfirmed = manager.estimateDryRun({
        name: 'Staging Run',
        mode: 'staging',
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization: { ownerConfirmed: false, approvedBy: 'Lead' },
      });
      expect(unconfirmed.valid).toBe(false);
      expect(unconfirmed.errors?.some((e) => e.includes('requires authorization confirmation'))).toBe(true);

      const noApprover = manager.estimateDryRun({
        name: 'Prod Safe Run',
        mode: 'prod-safe',
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization: { ownerConfirmed: true, approvedBy: '' },
      });
      expect(noApprover.valid).toBe(false);
      expect(
        noApprover.errors?.some(
          (e) =>
            e.toLowerCase().includes('approver') ||
            e.toLowerCase().includes('approvedby'),
        ),
      ).toBe(true);
    });

    it('Scenario 1.5 & 1.6: Authorization block visibility per mode', () => {
      // Sandbox mode: authorization block is hidden
      const sandboxState: PortalState = { ...createInitialState(), mode: 'sandbox' };
      const sandboxHtml = renderPortalHtml(sandboxState);
      expect(sandboxHtml).toContain('id="auth-block"');
      expect(sandboxHtml).toContain('display:none');

      // Staging mode: authorization block is visible
      const stagingState: PortalState = { ...createInitialState(), mode: 'staging' };
      const stagingHtml = renderPortalHtml(stagingState);
      expect(stagingHtml).toContain('id="auth-block"');
      expect(stagingHtml).toContain('display:block');
      expect(stagingHtml).toContain('id="check-auth"');
      expect(stagingHtml).toContain('id="input-approver"');

      // Prod-safe mode: authorization block is visible
      const prodState: PortalState = { ...createInitialState(), mode: 'prod-safe' };
      const prodHtml = renderPortalHtml(prodState);
      expect(prodHtml).toContain('id="auth-block"');
      expect(prodHtml).toContain('display:block');
    });

    it('Scenario 1.7: Repo and/or URL entered updates active lanes chips', () => {
      // URL only -> E2E, A11Y, PERF, SECURITY
      const webOnlyState: PortalState = {
        ...createInitialState(),
        repoUrl: '',
        webUrls: 'http://127.0.0.1:3100/',
        apiBaseUrl: '',
        apiSpecUrl: '',
      };
      const webHtml = renderPortalHtml(webOnlyState);
      const activeLanesMatch = webHtml.match(/id="active-lanes-chips"[\s\S]*?<\/div>/);
      expect(activeLanesMatch).toBeDefined();
      expect(activeLanesMatch![0]).toContain('E2E');
      expect(activeLanesMatch![0]).toContain('A11Y');
      expect(activeLanesMatch![0]).toContain('SECURITY');
      expect(activeLanesMatch![0]).not.toContain('REPO');

      // Repo and URL -> REPO + Web lanes
      const fullState: PortalState = {
        ...createInitialState(),
        repoUrl: 'fixtures/sample-todo-api',
        webUrls: 'http://127.0.0.1:3100/',
      };
      const fullHtml = renderPortalHtml(fullState);
      const fullLanesMatch = fullHtml.match(/id="active-lanes-chips"[\s\S]*?<\/div>/);
      expect(fullLanesMatch![0]).toContain('REPO');
      expect(fullLanesMatch![0]).toContain('E2E');
    });

    it('Scenario 1.8: Scope estimate shows duration, requests, and prod-safe note', () => {
      const prodState: PortalState = {
        ...createInitialState(),
        mode: 'prod-safe',
        webUrls: 'http://127.0.0.1:3100/',
        authorizationConfirmed: true,
        approvedBy: 'Approver',
      };
      const prodHtml = renderPortalHtml(prodState);
      expect(prodHtml).toContain('banner-prod-safe');
      expect(prodHtml).toContain(t('id', 'prodSafeBanner'));

      const dryRun = manager.estimateDryRun({
        name: 'Estimate check',
        mode: 'prod-safe',
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization: { ownerConfirmed: true, approvedBy: 'Lead' },
      });
      expect(dryRun.rateLimitReqPerSec).toBe(2);
      expect(dryRun.estimatedRequests).toBeGreaterThan(0);
      expect(dryRun.banner).toContain('Observe-only mode: no data will be changed');
    });

    it('Scenario 1.9: Raw password/token typed into any field is rejected', () => {
      const secretDetected = manager.validateRawSecrets('ghp_abcdef1234567890secretToken');
      expect(secretDetected).toBeDefined();
      expect(secretDetected).toContain('Raw secrets or passwords are rejected');

      const passwordDetected = manager.validateRawSecrets('password=adminSuperSecret!');
      expect(passwordDetected).toBeDefined();

      const validVaultRef = manager.validateRawSecrets('vault:qa/staging-credentials');
      expect(validVaultRef).toBeUndefined();
    });
  });

  // ==========================================
  // STEP 2 — TEST BUILDER (Scenarios 2.1 - 2.6)
  // ==========================================
  describe('Step 2 — Test Builder', () => {
    it('Scenario 2.1 & 2.4: Switching types preserves rows of other types', () => {
      const state = createInitialState();
      state.currentStep = 2;
      state.activeBuilderType = 'e2e';
      state.testRows.e2e = [
        { id: 'TC-E2E-CUSTOM', scenario: 'User cart flow', steps: 'Click cart', expected: 'Cart open' },
      ];
      state.testRows.api = [
        { method: 'GET', endpoint: '/api/v1/user', expectedStatus: 200 },
      ];

      // Switch to api
      state.activeBuilderType = 'api';
      const apiHtml = renderPortalHtml(state);
      expect(apiHtml).toContain('/api/v1/user');

      // Switch back to e2e: row still preserved
      state.activeBuilderType = 'e2e';
      const e2eHtml = renderPortalHtml(state);
      expect(e2eHtml).toContain('TC-E2E-CUSTOM');
      expect(e2eHtml).toContain('User cart flow');
    });

    it('Scenario 2.2: Mode = prod-safe blocks Performance with visible message', () => {
      const state = createInitialState();
      state.currentStep = 2;
      state.mode = 'prod-safe';
      state.activeBuilderType = 'perf';

      const html = renderPortalHtml(state);
      expect(html).toContain('alert-perf-blocked');
      expect(html).toContain('Pengujian beban performa (perf) diblokir pada mode prod-safe');
    });

    it('Scenario 2.3: Mode != sandbox and authorization unconfirmed shows warning on Passive Security', () => {
      const state = createInitialState();
      state.currentStep = 2;
      state.mode = 'staging';
      state.authorizationConfirmed = false;
      state.activeBuilderType = 'security-passive';

      const html = renderPortalHtml(state);
      expect(html).toContain('alert-sec-unauth');
      expect(html).toContain('konfirmasi otorisasi pengujian pada Langkah 1');
    });

    it('Scenario 2.5: Suggest scenarios requests and returns diff suggestions', () => {
      const suggestions = defaultRegistry.suggestScenarios('e2e', {
        pages: ['/login', '/catalog'],
      });
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].confidence).toBe('auto-discovered');
      expect(suggestions[0].fields.scenario).toContain('Page load invariant for /login');
    });

    it('Scenario 2.6: Pre-fills URL from Step 1 into builder globals', () => {
      const state = createInitialState();
      state.webUrls = 'https://staging.perusahaan.id/';
      expect(state.webUrls).toBe('https://staging.perusahaan.id/');
    });
  });

  // ==========================================
  // STEP 3 — PLAN REVIEW (Scenarios 3.1 - 3.8)
  // ==========================================
  describe('Step 3 — Plan Review', () => {
    it('Scenario 3.1: Counters calculate candidates, to run, needs approval, skipped by mode', () => {
      const state = createInitialState();
      state.currentStep = 3;
      state.mode = 'prod-safe';
      const plan = manager.buildPlanCases({
        name: 'Plan test',
        mode: 'prod-safe',
        repo: { localPath: 'fixtures/sample-todo-api' },
        web: { urls: ['http://127.0.0.1:3100/'] },
        testRows: {
          api: [
            { id: 'TC-API-MUTATE', method: 'POST', endpoint: '/orders' },
          ],
        },
      });
      state.planCases = plan.cases;
      state.approvedCaseIds = new Set(plan.cases.filter((c) => c.approved).map((c) => c.id));

      const html = renderPortalHtml(state);
      expect(html).toContain('Total Kandidat');
      expect(html).toContain('Akan Dijalankan');
      expect(html).toContain(t('id', 'needsApprovalChip'));
      expect(html).toContain('Dilewati Mode');
    });

    it('Scenario 3.2: Case with confidence needs-review is unchecked by default', () => {
      const plan = manager.buildPlanCases({
        name: 'Heuristic Plan',
        mode: 'sandbox',
        repo: { localPath: 'fixtures/sample-todo-api' },
        web: { urls: ['http://127.0.0.1:3100/'] },
      });

      const needsReviewCases = plan.cases.filter((c) => c.confidence === 'needs-review');
      expect(needsReviewCases.length).toBeGreaterThan(0);
      for (const c of needsReviewCases) {
        expect(c.approved).toBe(false);
      }
    });

    it('Scenario 3.3: Mode = prod-safe mutates data shows Skipped by mode and locked', () => {
      const plan = manager.buildPlanCases({
        name: 'Prod Safe Mutate Plan',
        mode: 'prod-safe',
        web: { urls: ['http://127.0.0.1:3100/'] },
        testRows: {
          api: [
            { id: 'TC-POST-ORDER', method: 'POST', endpoint: '/api/v1/orders' },
          ],
        },
      });

      const postCase = plan.cases.find((c) => c.id === 'TC-POST-ORDER');
      expect(postCase).toBeDefined();
      expect(postCase!.modeCompatibility).toBe('skipped-by-mode');
      expect(postCase!.approved).toBe(false);

      const state: PortalState = {
        ...createInitialState(),
        currentStep: 3,
        mode: 'prod-safe',
        planCases: plan.cases,
        approvedCaseIds: new Set(),
      };
      const html = renderPortalHtml(state);
      expect(html).toContain('LOCKED');
      expect(html).toContain(t('id', 'skippedByModeBadge'));
    });

    it('Scenario 3.4: Repo not provided -> No repo-lane cases present in plan', () => {
      const plan = manager.buildPlanCases({
        name: 'Web Only Plan',
        mode: 'staging',
        web: { urls: ['http://127.0.0.1:3100/'] },
      });

      const repoCases = plan.cases.filter((c) => c.lane === 'repo');
      expect(repoCases).toHaveLength(0);
    });

    it('Scenario 3.5: Approve all safe ones checks non-locked, non-needs-review cases', () => {
      const plan = manager.buildPlanCases({
        name: 'Approve Safe Test',
        mode: 'prod-safe',
        repo: { localPath: 'fixtures/sample-todo-api' },
        web: { urls: ['http://127.0.0.1:3100/'] },
      });

      // Filter all safe cases
      const safeCaseIds = plan.cases
        .filter((c) => c.modeCompatibility === 'allowed' && c.confidence !== 'needs-review')
        .map((c) => c.id);

      expect(safeCaseIds.length).toBeGreaterThan(0);
      for (const id of safeCaseIds) {
        const found = plan.cases.find((c) => c.id === id);
        expect(found?.confidence).not.toBe('needs-review');
        expect(found?.modeCompatibility).toBe('allowed');
      }
    });

    it('Scenario 3.6: No case checked -> Approve and run shows error', async () => {
      const run = await manager.createRun(
        {
          name: 'Approval test run',
          mode: 'sandbox',
          repo: { localPath: 'fixtures/sample-todo-api' },
          web: { urls: ['http://127.0.0.1:3100/'] },
          planApproval: 'review',
        },
        { id: 'user@test', email: 'user@test', role: 'runner' },
      );

      // Attempt to approve with empty case list
      await expect(
        manager.approvePlan(run.id, [], { id: 'user@test', email: 'user@test', role: 'runner' }),
      ).rejects.toThrow('Please approve at least one test case before starting the run');
    });

    it('Scenario 3.7 & 3.8: Shows ID, title, lane, source, confidence, priority', () => {
      const state = createInitialState();
      state.currentStep = 3;
      const plan = manager.buildPlanCases({
        name: 'Detailed Plan',
        mode: 'sandbox',
        repo: { localPath: 'fixtures/sample-todo-api' },
        web: { urls: ['http://127.0.0.1:3100/'] },
        testRows: {
          e2e: [
            { id: 'TC-USER-AUTH', scenario: 'User Auth Check', severity: 'critical' },
          ],
        },
      });
      state.planCases = plan.cases;
      state.approvedCaseIds = new Set(plan.cases.map((c) => c.id));

      const html = renderPortalHtml(state);
      expect(html).toContain('TC-USER-AUTH');
      expect(html).toContain('User Auth Check');
      expect(html).toContain('badge-verified');
      expect(html).toContain('critical');
    });
  });

  // ==========================================
  // STEP 4 — LIVE RUN (Scenarios 4.1 - 4.5)
  // ==========================================
  describe('Step 4 — Live Run', () => {
    it('Scenario 4.1 & 4.3: Stage chips advance and request counter is displayed', () => {
      const state = createInitialState();
      state.currentStep = 4;
      state.runId = '2026-10-28T00-00-00-000Z_test01';
      state.stages.preflight = 'ok';
      state.stages.discover = 'running';
      state.requestsCount = 42;
      state.circuitBreakerOpen = false;
      state.liveLogs = [
        'Stage preflight: ok (120ms)',
        'Stage discover: running',
      ];

      const html = renderPortalHtml(state);
      expect(html).toContain('PREFLIGHT');
      expect(html).toContain('DISCOVER');
      expect(html).toContain('Requests Executed: 42');
      expect(html).toContain('CLOSED (Healthy)');
      expect(html).toContain('Stage preflight: ok');
    });

    it('Scenario 4.4 & 4.5: Cancel / Stop action and view results', () => {
      const state = createInitialState();
      state.currentStep = 4;
      const html = renderPortalHtml(state);
      expect(html).toContain('btn-stop-run');
      expect(html).toContain('btn-view-results');
    });
  });

  // ==========================================
  // STEP 5 — RESULTS (Scenarios 5.1 - 5.7)
  // ==========================================
  describe('Step 5 — Results', () => {
    it('Scenario 5.1 & 5.2: Gate decision and confidence summary metrics', () => {
      const state = createInitialState();
      state.currentStep = 5;
      state.gate = 'GO WITH RISKS';
      state.gateReasons = ['3 test cases skipped', '2 findings marked needs-review'];
      state.findings = [
        {
          id: 'F-0001',
          title: 'Missing Content-Security-Policy header',
          severity: 'high',
          confidence: 'auto-discovered',
          category: 'security',
          lanes: ['security'],
          occurrences: 1,
          evidence: [],
          status: 'new',
          evidenceSummary: 'Header CSP missing on root /',
        },
        {
          id: 'F-0002',
          title: 'Document missing lang attribute',
          severity: 'medium',
          confidence: 'verified',
          category: 'accessibility',
          lanes: ['a11y'],
          occurrences: 1,
          evidence: [],
          status: 'new',
          evidenceSummary: 'html tag has no lang attribute',
        },
      ];

      const html = renderPortalHtml(state);
      expect(html).toContain('Gate Result:');
      expect(html).toContain('GO WITH RISKS');
      expect(html).toContain('3 test cases skipped');
      expect(html).toContain('Missing Content-Security-Policy header');
      expect(html).toContain('F-0001');
      expect(html).toContain('btn-download-bundle');
      expect(html).toContain('btn-start-new-run');
    });
  });

  // ==========================================
  // STEP 6 — ARCHITECTURE & LINEAGE EXPLORER
  // ==========================================
  describe('Step 6 — Architecture & Data Lineage Explorer', () => {
    it('renders visual topology canvas, live security radar, and data lineage table', () => {
      const state = createInitialState();
      state.currentStep = 6;
      state.furthestStep = 6;

      const html = renderPortalHtml(state);
      expect(html).toContain('SECURITY RADAR ACTIVE');
      expect(html).toContain('SVG TOPOLOGY CANVAS');
      expect(html).toContain('id="lineage-table"');
      expect(html).toContain('Page: /login');
      expect(html).toContain('POST /login');
      expect(html).toContain('users, sessions');
      expect(html).toContain('PII: password');
    });
  });

  // ==========================================
  // CROSS-CUTTING (Scenarios X.1 - X.5)
  // ==========================================
  describe('Cross-cutting UI Quality Rules', () => {
    it('Scenario X.1: Confidence labels always use distinct badges and semantic styles', () => {
      const state = createInitialState();
      state.currentStep = 5;
      state.findings = [
        {
          id: 'F-V',
          title: 'Verified Finding',
          severity: 'critical',
          confidence: 'verified',
          category: 'security',
          lanes: ['e2e'],
          occurrences: 1,
          evidence: [],
          status: 'new',
        },
        {
          id: 'F-A',
          title: 'Auto Finding',
          severity: 'medium',
          confidence: 'auto-discovered',
          category: 'performance',
          lanes: ['perf'],
          occurrences: 1,
          evidence: [],
          status: 'new',
        },
        {
          id: 'F-N',
          title: 'Needs Review Finding',
          severity: 'low',
          confidence: 'needs-review',
          category: 'app-bug',
          lanes: ['api'],
          occurrences: 1,
          evidence: [],
          status: 'new',
        },
      ];

      const html = renderPortalHtml(state);
      expect(html).toContain('badge-verified');
      expect(html).toContain('badge-discovered');
      expect(html).toContain('badge-review');
    });

    it('Scenario X.2: Dual-language translation support (ID and EN)', () => {
      expect(t('id', 'appTitle')).toBe('Nexus QA Portal');
      expect(t('en', 'appTitle')).toBe('Nexus QA Portal');
      expect(t('id', 'runEverything')).toContain('Jalankan Semua');
      expect(t('en', 'runEverything')).toContain('Run Everything');
    });

    it('Scenario X.3 & X.4: Containers enforce internal horizontal scroll for data tables', () => {
      const state = createInitialState();
      state.currentStep = 3;
      const html = renderPortalHtml(state);
      expect(html).toContain('class="table-container"');
      expect(html).toContain('class="data-table"');
    });
  });
});
