import { describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import {
  generateK6Script,
  generateK6K8sManifest,
  parseK6SummaryMetrics,
  runK6LoadLane,
  runK6DistributedK8sLane,
  K8sK6Client,
  type K6ScenarioConfig,
} from '../src/index.js';
import type { LaneContext } from '../src/types.js';

describe('k6 Load Testing Engine & SLA Thresholds (8.2 & 11)', () => {
  function makeContext(
    mode: 'sandbox' | 'staging' | 'prod-safe',
    perfApproved: boolean = false,
  ): LaneContext {
    return {
      runId: 'RUN-K6-01',
      runDir: '/tmp',
      mode,
      scope: 'quick',
      request: RunRequestSchema.parse({
        name: 'k6 test',
        mode,
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization:
          mode !== 'sandbox'
            ? { ownerConfirmed: true, approvedBy: 'Lead', perfApproved }
            : undefined,
      }),
      config: QaConfigSchema.parse({ env: 'test', allowlist: ['127.0.0.1'] }),
      discovery: {
        pages: [],
        endpoints: [],
        traffic: [],
        warnings: [],
        crawl: {
          robots: { found: false, rules: 0 },
          budget: { requests: 0, maxRequests: 0, exhausted: false },
          circuit: { open: false },
        },
        auth: { used: false },
      },
      appMap: {
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
        stats: { pages: 0, endpoints: 0, code: 0, edges: 0, highRisk: 0, changed: 0 },
      },
    };
  }

  const sampleScenarios: K6ScenarioConfig[] = [
    {
      scenario: 'Fetch items list',
      endpoint: '/api/v1/items',
      vus: 10,
      duration: '15s',
      p95MaxMs: 400,
      errorRateMaxPercent: 1.0,
    },
  ];

  it('generates valid k6 script with thresholds and checks', () => {
    const script = generateK6Script('http://127.0.0.1:3100', sampleScenarios);
    expect(script).toContain("import http from 'k6/http';");
    expect(script).toContain('p(95)<400');
    expect(script).toContain('rate<0.01');
    expect(script).toContain("http.get('http://127.0.0.1:3100/api/v1/items')");
  });

  it('strictly blocks k6 load testing in prod-safe mode (Mode Guard)', () => {
    const ctx = makeContext('prod-safe', true);
    const result = runK6LoadLane(ctx, sampleScenarios);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('strictly forbidden in prod-safe mode');
  });

  it('requires perfApproved=true in staging mode', () => {
    const ctxUnapproved = makeContext('staging', false);
    const unapprovedResult = runK6LoadLane(ctxUnapproved, sampleScenarios);
    expect(unapprovedResult.status).toBe('skipped');
    expect(unapprovedResult.reason).toContain('requires authorization.perfApproved=true');

    const ctxApproved = makeContext('staging', true);
    const approvedResult = runK6LoadLane(ctxApproved, sampleScenarios);
    expect(approvedResult.status).toBe('passed');
    expect(approvedResult.tests[0].status).toBe('passed');
  });

  describe('Kubernetes Distributed Load Testing via k6-operator (Fase 11)', () => {
    it('generates valid Kubernetes ConfigMap and K6 Custom Resource (CRD) manifests', () => {
      const script = generateK6Script('http://127.0.0.1:3100', sampleScenarios);
      const manifests = generateK6K8sManifest({
        name: 'k6-load-pilot',
        namespace: 'qa-runners',
        parallelism: 4,
        script,
        runnerImage: 'grafana/k6:0.50.0',
        cpuLimit: '2000m',
        memoryLimit: '2Gi',
      });

      // 1. Verify ConfigMap
      expect(manifests.configMap.kind).toBe('ConfigMap');
      expect(manifests.configMap.metadata.name).toBe('k6-load-pilot-script');
      expect(manifests.configMap.metadata.namespace).toBe('qa-runners');
      expect(manifests.configMap.data['test.js']).toContain("import http from 'k6/http';");

      // 2. Verify K6 CR
      expect(manifests.k6Cr.kind).toBe('K6');
      expect(manifests.k6Cr.apiVersion).toBe('k6.io/v1alpha1');
      expect(manifests.k6Cr.metadata.name).toBe('k6-load-pilot');
      expect(manifests.k6Cr.spec.parallelism).toBe(4);
      expect(manifests.k6Cr.spec.script.configMap.name).toBe('k6-load-pilot-script');
      expect(manifests.k6Cr.spec.runner.image).toBe('grafana/k6:0.50.0');
      expect(manifests.k6Cr.spec.runner.resources.limits.cpu).toBe('2000m');
      expect(manifests.k6Cr.spec.cleanup).toBe('post');

      // 3. Verify formatted multi-document YAML
      expect(manifests.yaml).toContain('kind: ConfigMap');
      expect(manifests.yaml).toContain('---');
      expect(manifests.yaml).toContain('kind: K6');
      expect(manifests.yaml).toContain('k6.io/v1alpha1');
    });

    it('parses k6 CLI text summary metrics accurately', () => {
      const sampleCliOutput = `
          /\ _     ___   __ _
         /   \    |   \ |  /
        /  =  \   | |) || <
       / _____ \  |___/ |_ \

     execution: local
        script: test.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 15s max duration (exec: default)

     ✓ status is 200

     checks.........................: 100.00% ✓ 1500      ✗ 0
     data_received..................: 420 kB  28 kB/s
     data_sent......................: 130 kB  8.6 kB/s
     http_req_blocked...............: avg=1.2ms   min=0s     med=1ms    max=15ms   p(90)=2ms    p(95)=3.5ms
     http_req_connecting............: avg=400µs   min=0s     med=0s     max=5ms    p(90)=1ms    p(95)=1.5ms
     http_req_duration..............: avg=125.4ms min=12.1ms med=110.2ms max=450.8ms p(90)=220.1ms p(95)=285.5ms
     http_req_failed................: 0.00%   ✓ 0         ✗ 1500
     http_reqs......................: 1500    100/s
     iteration_duration.............: avg=1.12s   min=1.01s  med=1.11s  max=1.45s  p(90)=1.22s  p(95)=1.28s
     iterations.....................: 1500    100/s
     vus............................: 1       min=1       max=10
     vus_max........................: 10      min=10      max=10
      `;

      const result = parseK6SummaryMetrics(sampleCliOutput, {
        p95MaxMs: 400,
        errorRateMaxPercent: 1.0,
      });

      expect(result.p95Ms).toBe(286);
      expect(result.errorRatePercent).toBe(0);
      expect(result.totalRequests).toBe(1500);
      expect(result.passed).toBe(true);
      expect(result.reason).toContain('p95 286ms <= threshold 400ms');
    });

    it('parses k6 JSON metric outputs accurately', () => {
      const sampleJson = {
        metrics: {
          http_req_duration: {
            values: {
              avg: 320,
              'p(95)': 540,
              max: 950,
            },
          },
          http_req_failed: {
            values: {
              rate: 0.035, // 3.5%
            },
          },
          http_reqs: {
            values: {
              count: 2400,
            },
          },
        },
      };

      const result = parseK6SummaryMetrics(sampleJson, {
        p95MaxMs: 500,
        errorRateMaxPercent: 1.0,
      });

      expect(result.p95Ms).toBe(540);
      expect(result.errorRatePercent).toBe(3.5);
      expect(result.totalRequests).toBe(2400);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('SLA breach');
    });

    it('orchestrates complete K8s load test lifecycle via K8sK6Client', async () => {
      const executedCommands: string[] = [];
      const mockExec = async (cmd: string) => {
        executedCommands.push(cmd);
        if (cmd.includes('kubectl get k6')) {
          return { stdout: 'finished', stderr: '', exitCode: 0 };
        }
        if (cmd.includes('kubectl logs')) {
          return {
            stdout:
              'http_req_duration..............: avg=110ms min=20ms med=100ms max=300ms p(90)=180ms p(95)=215ms\nhttp_req_failed................: 0.00%\nhttp_reqs......................: 800',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: 'ok', stderr: '', exitCode: 0 };
      };

      const client = new K8sK6Client({
        namespace: 'k8s-qa',
        parallelism: 3,
        exec: mockExec,
      });

      const res = await client.runScenario(sampleScenarios[0], 'http://127.0.0.1:3100', 'run-test');
      expect(res.passed).toBe(true);
      expect(res.p95Ms).toBe(215);
      expect(res.totalRequests).toBe(800);

      // Verify command sequences executed
      expect(executedCommands.some((c) => c.includes('kubectl apply -n k8s-qa'))).toBe(true);
      expect(executedCommands.some((c) => c.includes('kubectl get k6'))).toBe(true);
      expect(executedCommands.some((c) => c.includes('kubectl logs'))).toBe(true);
      expect(executedCommands.some((c) => c.includes('kubectl delete k6'))).toBe(true);
      expect(executedCommands.some((c) => c.includes('kubectl delete configmap'))).toBe(true);
    });

    it('executes runK6DistributedK8sLane with Mode Guard enforcement', async () => {
      const executed: string[] = [];
      const client = new K8sK6Client({
        exec: async (c) => {
          executed.push(c);
          if (c.includes('kubectl logs')) {
            return {
              stdout: 'http_req_duration: p(95)=180ms\nhttp_req_failed: 0.0%\nhttp_reqs: 500',
              stderr: '',
              exitCode: 0,
            };
          }
          return { stdout: 'finished', stderr: '', exitCode: 0 };
        },
      });

      // 1. Prod-safe is blocked
      const prodCtx = makeContext('prod-safe', true);
      const prodRes = await runK6DistributedK8sLane(prodCtx, sampleScenarios, client);
      expect(prodRes.status).toBe('skipped');
      expect(prodRes.reason).toContain('strictly forbidden in prod-safe mode');

      // 2. Staging unapproved is blocked
      const stagingUnapproved = makeContext('staging', false);
      const stgRes1 = await runK6DistributedK8sLane(stagingUnapproved, sampleScenarios, client);
      expect(stgRes1.status).toBe('skipped');
      expect(stgRes1.reason).toContain('requires authorization.perfApproved=true');

      // 3. Staging approved succeeds
      const stagingApproved = makeContext('staging', true);
      const stgRes2 = await runK6DistributedK8sLane(stagingApproved, sampleScenarios, client);
      expect(stgRes2.status).toBe('passed');
      expect(stgRes2.tests[0].status).toBe('passed');
      expect(stgRes2.tests[0].name).toContain('K8s Distributed k6 SLA');
    });
  });
});
