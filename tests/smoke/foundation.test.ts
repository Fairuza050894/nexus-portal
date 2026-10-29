import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import { listZipNames, verifyDocs } from '@nexus/doc-engine';
import type { SandboxSession } from '@nexus/sandbox';
import { runPipeline } from '../../apps/cli/src/pipeline.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCAL_PATH = 'fixtures/sample-todo-api';
const artifactsRoot = mkdtempSync(join(tmpdir(), 'qa-foundation-'));

afterAll(() => {
  rmSync(artifactsRoot, { recursive: true, force: true });
});

function discoveryFrom(output: unknown): { traffic: Array<{ method: string }> } | undefined {
  if (output && typeof output === 'object' && 'discovery' in output) {
    const discovery = output.discovery;
    if (discovery && typeof discovery === 'object' && 'traffic' in discovery) {
      const traffic = discovery.traffic;
      if (Array.isArray(traffic)) {
        return {
          traffic: traffic.filter((item): item is { method: string } =>
            Boolean(
              item &&
              typeof item === 'object' &&
              'method' in item &&
              typeof item.method === 'string',
            ),
          ),
        };
      }
    }
  }
  return undefined;
}

function failuresFrom(output: unknown): string[] {
  if (output && typeof output === 'object' && 'failures' in output) {
    const value = output.failures;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
  return [];
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function startSite(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createHttpServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<title>URL only</title><a href="/health">health</a><a href="/api/todos">todos</a><form method="post" action="/api/todos"><input name="text"></form>',
      );
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (req.method === 'GET' && req.url === '/api/todos') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    if (req.method === 'GET' && req.url === '/openapi.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          openapi: '3.0.3',
          info: { title: 'URL only API', version: '1.0.0' },
          paths: {
            '/api/todos': {
              get: { summary: 'List todos' },
              post: { summary: 'Create todo' },
            },
          },
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not found"}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('foundation pipeline', () => {
  it('runs intake → sandbox health → gate → docs → bundle honestly', async () => {
    const port = await freePort();
    const request = RunRequestSchema.parse({
      name: 'foundation smoke',
      mode: 'sandbox',
      scope: 'quick',
      repo: { localPath: LOCAL_PATH },
      web: { urls: [`http://127.0.0.1:${port}/`] },
      api: { baseUrl: `http://127.0.0.1:${port}` },
      lanes: {
        repo: true,
        api: true,
        e2e: true,
        a11y: true,
        visual: false,
        perf: true,
        security: true,
      },
      planApproval: 'auto',
    });
    const config = QaConfigSchema.parse({
      env: 'test',
      modes: ['sandbox'],
      allowlist: ['127.0.0.1', 'localhost'],
      docs: {
        compliance: { enabled: true, mappingPath: 'compliance/mapping.yaml' },
      },
    });

    const result = await runPipeline({
      rootDir: REPO_ROOT,
      artifactsRoot,
      config,
      request,
      requestedBy: 'vitest',
      trigger: 'test',
    });

    expect(result.status).toBe('complete');
    expect(result.exitCode).toBe(0);
    expect(result.gate).toBe('GO WITH RISKS');
    expect(result.stages.discover?.status).toBe('ok');
    expect(result.stages.plan?.status).toBe('ok');
    expect(result.stages.execute?.status).toBe('ok');
    expect(result.stages.model?.status).toBe('ok');

    const discoverOutput = result.stages.discover?.output as {
      sandbox: { isolation: string; healthOk: boolean; teardown: { ok: boolean } };
      discovery: {
        pages: Array<{ path: string }>;
        endpoints: Array<{ method: string; path: string; source: string }>;
        repo?: { routes: Array<{ method: string; path: string }> };
        traffic: Array<{ method: string }>;
        warnings: string[];
      };
      failures: string[];
    };
    expect(discoverOutput.sandbox.isolation).toBe('process');
    expect(discoverOutput.sandbox.healthOk).toBe(true);
    expect(discoverOutput.sandbox.teardown.ok).toBe(true);
    expect(discoverOutput.failures).toEqual([]);
    expect(discoverOutput.discovery.pages.map((entry) => entry.path)).toContain('/');
    expect(discoverOutput.discovery.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/todos' }),
        expect.objectContaining({ method: 'POST', path: '/api/todos' }),
      ]),
    );
    expect(discoverOutput.discovery.repo?.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/todos' }),
        expect.objectContaining({ method: 'POST', path: '/api/todos' }),
      ]),
    );
    expect(discoverOutput.discovery.traffic.every((entry) => entry.method === 'GET')).toBe(true);

    expect(existsSync(join(artifactsRoot, 'artifacts', 'runs', result.runId, 'app-map.json'))).toBe(
      true,
    );
    expect(result.docsDir && existsSync(join(result.docsDir, 'index.html'))).toBe(true);
    expect(result.docsDir && existsSync(join(result.docsDir, 'report.md'))).toBe(true);
    const report = readFileSync(join(result.docsDir!, 'report.md'), 'utf8');
    expect(report).toContain('Application Map');
    expect(report).toContain('## Lane');
    expect(report).toContain('## Temuan');
    expect(existsSync(join(result.docsDir!, 'executive-summary.pdf'))).toBe(true);
    expect(existsSync(join(result.docsDir!, 'test-catalogue.xlsx'))).toBe(true);
    const verification = verifyDocs(result.docsDir!, { requirePdf: true });
    expect(verification.errors).toEqual([]);
    expect(verification.ok).toBe(true);
    expect(readFileSync(join(result.docsDir!, 'findings-register.html'), 'utf8')).toContain(
      'Indicative mapping, not an audit conclusion.',
    );
    expect(result.bundlePath && existsSync(result.bundlePath)).toBe(true);

    const zip = readFileSync(result.bundlePath!);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(listZipNames(zip)).toEqual(
      expect.arrayContaining([
        'index.html',
        'report.md',
        'run-summary.json',
        'app-map.json',
        'discovery.json',
        'lanes.json',
        'session.json',
        'findings.json',
        'checksums.txt',
        'evidence/session/root.png',
      ]),
    );

    const summary = JSON.parse(readFileSync(join(result.docsDir!, 'run-summary.json'), 'utf8'));
    expect(summary.run.status).toBe('complete');
    expect(summary.gate.decision).toBe('GO WITH RISKS');
    expect(summary.totals.tests).toBeGreaterThan(0);
    expect(summary.totals.failed).toBe(0);
    expect(summary.totals.lanes).toEqual(
      expect.arrayContaining(['repo', 'api', 'e2e', 'a11y', 'perf', 'security']),
    );
    expect(summary.lanes.length).toBe(6);
    expect(summary.session).toMatchObject({ pages: 1 });
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.appMap).toMatchObject({ pages: 1, endpoints: 4, path: 'app-map.json' });
    expect(summary.appMap.edges).toBeGreaterThanOrEqual(3);
    expect(summary.tests.length).toBe(summary.totals.tests);
    expect(summary.coverage).toMatchObject({ requirementsTotal: 4, requirementsCovered: 0 });
    expect(
      summary.findings.every((finding: { firstSeenRun?: string }) => finding.firstSeenRun),
    ).toBe(true);
    expect(
      existsSync(
        join(artifactsRoot, 'artifacts', 'runs', result.runId, 'evidence', 'session', 'root.png'),
      ),
    ).toBe(true);

    await expect(
      fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow();

    const resumed = await runPipeline({
      rootDir: REPO_ROOT,
      artifactsRoot,
      config,
      request,
      requestedBy: 'vitest',
      trigger: 'test',
      resumeRunId: result.runId,
    });
    expect(resumed.status).toBe('complete');
    expect(resumed.stages.discover?.resumed).toBeUndefined();
    expect(resumed.stages.discover?.status).toBe('ok');
    expect(resumed.stages.execute?.status).toBe('ok');
  });

  it('still produces an INCOMPLETE report and bundle when the sandbox build fails', async () => {
    const port = await freePort();
    const request = RunRequestSchema.parse({
      name: 'failed sandbox',
      mode: 'sandbox',
      repo: { localPath: LOCAL_PATH },
      web: { urls: [`http://127.0.0.1:${port}/health`] },
      lanes: {
        repo: false,
        api: false,
        e2e: false,
        a11y: false,
        visual: false,
        perf: false,
        security: false,
      },
    });
    const config = QaConfigSchema.parse({
      env: 'test',
      modes: ['sandbox'],
      allowlist: ['127.0.0.1'],
    });
    const failedSandbox = async (): Promise<SandboxSession> => ({
      appUrl: undefined,
      repoDir: undefined,
      stop: async () => ({ ok: true }),
      result: {
        ok: false,
        healthOk: false,
        logs: ['build failed'],
        limitations: [],
        teardown: { ok: true },
        durationMs: 5,
        error: 'build failed',
        reason: 'sandbox stage failed',
      },
    });

    const result = await runPipeline({
      rootDir: REPO_ROOT,
      artifactsRoot,
      config,
      request,
      requestedBy: 'vitest',
      trigger: 'test',
      sandboxStarter: failedSandbox,
    });

    expect(result.status).toBe('incomplete');
    expect(result.exitCode).toBe(3);
    expect(result.gate).toBe('NO-GO');
    expect(result.stages.discover?.status).toBe('ok');
    const failures = failuresFrom(result.stages.discover?.output);
    expect(failures.some((failure) => failure.includes('build failed'))).toBe(true);
    expect(result.summary.run.status).toBe('incomplete');
    expect(result.docsDir && existsSync(join(result.docsDir, 'report.md'))).toBe(true);
    expect(result.bundlePath && existsSync(join(result.bundlePath))).toBe(true);
  });

  it('builds an Application Map for a URL-only target', async () => {
    const site = await startSite();
    try {
      const request = RunRequestSchema.parse({
        name: 'url only',
        mode: 'staging',
        web: { urls: [`${site.url}/`] },
        authorization: { ownerConfirmed: true },
        lanes: {},
      });
      const config = QaConfigSchema.parse({
        env: 'test',
        modes: ['staging'],
        allowlist: ['127.0.0.1'],
      });
      const result = await runPipeline({
        rootDir: REPO_ROOT,
        artifactsRoot,
        config,
        request,
        requestedBy: 'vitest',
        trigger: 'test',
      });

      expect(result.status).toBe('complete');
      expect(result.stages.discover?.status).toBe('ok');
      expect(result.stages.model?.status).toBe('ok');
      expect(result.summary.appMap).toMatchObject({ pages: 1, endpoints: 3 });
    } finally {
      await site.close();
    }
  });

  it('never sends state-changing requests in prod-safe and still maps them', async () => {
    const site = await startSite();
    try {
      const request = RunRequestSchema.parse({
        name: 'prod safe',
        mode: 'prod-safe',
        web: { urls: [`${site.url}/`] },
        authorization: { ownerConfirmed: true, approvedBy: 'qa-lead' },
        lanes: {},
      });
      const config = QaConfigSchema.parse({
        env: 'test',
        modes: ['prod-safe'],
        allowlist: ['127.0.0.1'],
      });
      const result = await runPipeline({
        rootDir: REPO_ROOT,
        artifactsRoot,
        config,
        request,
        requestedBy: 'vitest',
        trigger: 'test',
      });

      expect(result.status).toBe('complete');
      const discovery = discoveryFrom(result.stages.discover?.output);
      expect(discovery?.traffic.length).toBeGreaterThan(0);
      expect(discovery?.traffic.every((entry) => entry.method === 'GET')).toBe(true);
      expect(result.summary.appMap?.endpoints).toBeGreaterThanOrEqual(3);
    } finally {
      await site.close();
    }
  });

  it('builds an Application Map from an OpenAPI spec for an API-only target', async () => {
    const site = await startSite();
    try {
      const request = RunRequestSchema.parse({
        name: 'api only',
        mode: 'staging',
        api: { baseUrl: site.url, specUrl: `${site.url}/openapi.json` },
        authorization: { ownerConfirmed: true },
        lanes: {},
      });
      const config = QaConfigSchema.parse({
        env: 'test',
        modes: ['staging'],
        allowlist: ['127.0.0.1'],
      });
      const result = await runPipeline({
        rootDir: REPO_ROOT,
        artifactsRoot,
        config,
        request,
        requestedBy: 'vitest',
        trigger: 'test',
      });

      expect(result.status).toBe('complete');
      expect(result.summary.appMap).toMatchObject({ pages: 0, endpoints: 2 });
      const appMapPath = join(artifactsRoot, 'artifacts', 'runs', result.runId, 'app-map.json');
      const map = JSON.parse(readFileSync(appMapPath, 'utf8')) as {
        nodes: Array<{ id: string; spec?: boolean }>;
      };
      expect(map.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'api:GET /api/todos', spec: true }),
          expect.objectContaining({ id: 'api:POST /api/todos', spec: true }),
        ]),
      );
    } finally {
      await site.close();
    }
  });
});
