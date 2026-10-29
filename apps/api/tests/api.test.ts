import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiServer } from '../src/server.js';
import { RunManager } from '../src/runs.js';

describe('Apps API Server Endpoints & Security Guards', () => {
  let server: Server;
  let baseUrl: string;
  let runManager: RunManager;
  beforeAll(async () => {
    runManager = new RunManager();
    server = createApiServer({ runManager });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/health returns ok status and user identity', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Authorization: 'Bearer test-admin' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe('ok');
    expect((json.user as Record<string, unknown>).role).toBe('admin');
  });

  it('GET /api/registry returns all registered test types', async () => {
    const res = await fetch(`${baseUrl}/api/registry`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { types: Array<{ type: string }> };
    expect(json.types.map((t) => t.type)).toContain('e2e');
    expect(json.types.map((t) => t.type)).toContain('api');
    expect(json.types.map((t) => t.type)).toContain('perf');
  });

  it('POST /api/runs/dry-run validates targets and mode constraints', async () => {
    // 1. Empty target -> rejected
    const emptyRes = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'empty run', mode: 'sandbox' }),
    });
    expect(emptyRes.status).toBe(400);
    const emptyJson = (await emptyRes.json()) as { errors: string[] };
    expect(emptyJson.errors.some((e) => e.includes('Provide a repo link or web URL'))).toBe(true);

    // 2. Raw secret -> rejected
    const secretRes = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'secret run',
        mode: 'sandbox',
        repo: { url: 'https://github.com/org/repo' },
        auth: { ref: 'ghp_myRawGitHubToken1234567890' },
      }),
    });
    expect(secretRes.status).toBe(400);
    const secretJson = (await secretRes.json()) as { errors: string[] };
    expect(secretJson.errors.some((e) => e.includes('Raw secrets or passwords are rejected'))).toBe(
      true,
    );

    // 3. Staging missing approval -> rejected
    const stagingRes = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'staging run',
        mode: 'staging',
        web: { urls: ['http://127.0.0.1:3100/'] },
      }),
    });
    expect(stagingRes.status).toBe(400);
    const stagingJson = (await stagingRes.json()) as { errors: string[] };
    expect(stagingJson.errors.some((e) => e.includes('authorization confirmation'))).toBe(true);

    // 4. Valid staging with approval -> valid estimate
    const validRes = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'valid staging',
        mode: 'staging',
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization: { ownerConfirmed: true, approvedBy: 'Lead QA' },
      }),
    });
    expect(validRes.status).toBe(200);
    const validJson = (await validRes.json()) as { valid: boolean; activeLanes: string[] };
    expect(validJson.valid).toBe(true);
    expect(validJson.activeLanes).toContain('e2e');
    expect(validJson.activeLanes).toContain('a11y');
  });

  it('POST /api/runs enforces role permissions and creates run with plan review', async () => {
    const validPayload = {
      name: 'Pilot test run',
      mode: 'sandbox',
      repo: { localPath: 'fixtures/sample-todo-api' },
      web: { urls: ['http://127.0.0.1:3100/'] },
      planApproval: 'review',
    };

    // Viewer role cannot create run (403)
    const viewerRes = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-viewer',
      },
      body: JSON.stringify(validPayload),
    });
    expect(viewerRes.status).toBe(403);

    // Runner role can create sandbox run (201)
    const runnerRes = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-runner',
      },
      body: JSON.stringify(validPayload),
    });
    expect(runnerRes.status).toBe(201);
    const run = (await runnerRes.json()) as {
      id: string;
      status: string;
      plan: { cases: Array<{ id: string; confidence: string; approved: boolean }> };
    };
    expect(run.status).toBe('reviewing-plan');
    expect(run.plan.cases.length).toBeGreaterThan(0);

    // Verify needs-review cases are unchecked by default (Scenario 3.2)
    const needsReviewCase = run.plan.cases.find((c) => c.confidence === 'needs-review');
    if (needsReviewCase) {
      expect(needsReviewCase.approved).toBe(false);
    }

    // Approve plan with empty list -> rejected (Scenario 3.6)
    const emptyApproveRes = await fetch(`${baseUrl}/api/runs/${run.id}/plan/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-runner',
      },
      body: JSON.stringify({ approvedCaseIds: [] }),
    });
    expect(emptyApproveRes.status).toBe(400);

    // Stop run (Scenario 4.5)
    const stopRes = await fetch(`${baseUrl}/api/runs/${run.id}/stop`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-runner' },
    });
    expect(stopRes.status).toBe(200);
    const stoppedRun = (await stopRes.json()) as { status: string };
    expect(stoppedRun.status).toBe('cancelled');
  });

  it('POST /api/suggest/:type returns scenario suggestions from targets', async () => {
    const res = await fetch(`${baseUrl}/api/suggest/e2e`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://127.0.0.1:3100',
        pages: ['/', '/login', '/dashboard'],
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { suggestions: Array<{ id: string; title: string }> };
    expect(json.suggestions).toHaveLength(3);
    expect(json.suggestions[0].title).toContain('Verify page load and layout invariants');
  });

  it('POST /api/import/:type validates imported table rows', async () => {
    const invalidRes = await fetch(`${baseUrl}/api/import/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ method: 'INVALID_VERB', endpoint: 'not-a-path', expectedStatus: 'not-a-number' }],
      }),
    });
    expect(invalidRes.status).toBe(400);
    const invalidJson = (await invalidRes.json()) as { valid: boolean; errors: unknown[] };
    expect(invalidJson.valid).toBe(false);
    expect(invalidJson.errors.length).toBeGreaterThan(0);
  });

  it('GET /api/lineage returns full-stack architecture topology and DB schema', async () => {
    const res = await fetch(`${baseUrl}/api/lineage`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { nodes: unknown[]; edges: unknown[]; lineage: unknown[] };
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.edges)).toBe(true);
    expect(Array.isArray(json.lineage)).toBe(true);
  });

  it('RunManager cleanly and completely loads qa.config.ts', () => {
    const config = runManager.getConfig();
    expect(config.modes).toContain('sandbox');
    expect(config.modes).toContain('staging');
    expect(config.modes).toContain('prod-safe');
    expect(config.allowlist).toContain('127.0.0.1');
    expect(config.allowlist).toContain('staging-qa-pilot.local');
    expect(config.gates.criticalPassRate).toBe(1);
    expect(config.gates.overallPassRate).toBe(0.95);
  });

  it('POST /api/runs/dry-run resolves relative api.specUrl against baseUrl or web.urls[0]', async () => {
    // 1. Relative specUrl resolved against api.baseUrl
    const resBase = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'spec relative to baseUrl',
        mode: 'staging',
        authorization: { ownerConfirmed: true, approvedBy: 'Lead QA' },
        api: { baseUrl: 'http://127.0.0.1:3100', specUrl: '/openapi.json' },
      }),
    });
    expect(resBase.status).toBe(200);
    const jsonBase = (await resBase.json()) as {
      valid: boolean;
      activeLanes: string[];
      targets: string[];
    };
    expect(jsonBase.valid).toBe(true);
    expect(jsonBase.activeLanes).toContain('api');
    expect(jsonBase.targets).toContain('http://127.0.0.1:3100/openapi.json');

    // 2. Relative specUrl resolved against web.urls[0]
    const resWeb = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'spec relative to web.urls[0]',
        mode: 'staging',
        authorization: { ownerConfirmed: true, approvedBy: 'Lead QA' },
        web: { urls: ['http://127.0.0.1:3100/'] },
        api: { specUrl: '/openapi.json' },
      }),
    });
    expect(resWeb.status).toBe(200);
    const jsonWeb = (await resWeb.json()) as {
      valid: boolean;
      activeLanes: string[];
      targets: string[];
    };
    expect(jsonWeb.valid).toBe(true);
    expect(jsonWeb.activeLanes).toContain('api');
    expect(jsonWeb.targets).toContain('http://127.0.0.1:3100/openapi.json');

    // 3. Full URL specUrl
    const resFull = await fetch(`${baseUrl}/api/runs/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'spec full URL',
        mode: 'staging',
        authorization: { ownerConfirmed: true, approvedBy: 'Lead QA' },
        api: { specUrl: 'http://127.0.0.1:3100/openapi.json' },
      }),
    });
    expect(resFull.status).toBe(200);
    const jsonFull = (await resFull.json()) as { valid: boolean; activeLanes: string[] };
    expect(jsonFull.valid).toBe(true);
    expect(jsonFull.activeLanes).toContain('api');
  });

  it('POST /api/runs/plan-preview returns plan cases without creating a run', async () => {
    const res = await fetch(`${baseUrl}/api/runs/plan-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'preview run',
        mode: 'sandbox',
        repo: { localPath: 'fixtures/sample-todo-api' },
        web: { urls: ['http://127.0.0.1:3100/'] },
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      cases: Array<{ id: string; title: string; lane: string }>;
    };
    expect(Array.isArray(json.cases)).toBe(true);
    expect(json.cases.length).toBeGreaterThan(0);
    expect(json.cases.some((c) => c.lane === 'e2e')).toBe(true);
  });

  it('GET / always initializes planCases so Step 3 is never empty', async () => {
    const res = await fetch(`${baseUrl}/?step=1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Verify Step 3 table contains plan case rows even on initial render
    expect(html).toContain('TC-');
    expect(html).toContain('plan-table');
  });

  it('GET /?step=4 renders stage cards and does not hang on pending if real run is loaded', async () => {
    const res = await fetch(`${baseUrl}/?step=4`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('stage-card-preflight');
    expect(html).toContain('stage-card-lanes');
    expect(html).toContain('stage-card-app-map');
    expect(html).toContain('telemetry-requests');
    expect(html).toContain('telemetry-circuit');
  });
});
