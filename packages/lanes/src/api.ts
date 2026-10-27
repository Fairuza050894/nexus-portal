import { Ajv } from 'ajv';
import { isHostAllowed, resolveHost } from '@nexus/core';
import { DiscoveryHttpClient, resolveAuth, type DiscoveredEndpoint } from '@nexus/discover';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

function statusMatches(expected: string, status: number): boolean {
  if (expected.toUpperCase() === 'DEFAULT') return status >= 400;
  const upper = expected.toUpperCase();
  if (/^[1-5]XX$/.test(upper)) return Math.floor(status / 100) === Number(upper[0]);
  return Number(expected) === status;
}

function schemaForStatus(
  schemas: Record<string, unknown> | undefined,
  status: number,
): unknown | undefined {
  if (!schemas) return undefined;
  return schemas[String(status)] ?? schemas[`${Math.floor(status / 100)}XX`] ?? schemas.default;
}

function validationErrors(
  schema: unknown,
  bodyText: string,
  components: Record<string, unknown> | undefined,
): string[] {
  if (!schema || typeof schema !== 'object') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return ['response is not valid JSON'];
  }
  const ajv = new Ajv({ strict: false, allErrors: true });
  const root = {
    ...(schema as Record<string, unknown>),
    components: { schemas: components ?? {} },
  };
  try {
    const validate = ajv.compile(root);
    if (validate(parsed)) return [];
    return (validate.errors ?? []).map(
      (error: { instancePath: string; message?: string }) =>
        `${error.instancePath || '/'} ${error.message ?? 'schema mismatch'}`,
    );
  } catch (error) {
    return [`schema validation unavailable: ${(error as Error).message}`];
  }
}

export async function runApiLane(context: LaneContext): Promise<LaneResult> {
  const startedAt = Date.now();
  const allowlist = context.config.allowlist;
  const apiBase = context.request.api?.baseUrl;
  const webBase = context.request.web?.urls[0]
    ? new URL(context.request.web.urls[0]).origin
    : undefined;
  const specBase = context.discovery.openapi?.servers[0];
  const base = [apiBase, webBase, specBase].find((candidate) => {
    if (!candidate) return false;
    const host = resolveHost(candidate);
    return Boolean(host && isHostAllowed(host, allowlist));
  });
  if (!base) {
    return {
      lane: 'api',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no allowlisted API base URL',
      durationMs: Date.now() - startedAt,
    };
  }

  const candidates = context.appMap.nodes
    .filter((node) => node.type === 'endpoint' && node.method === 'GET' && node.path)
    .filter((node) => !node.path!.includes(':') && !node.path!.includes('*'))
    .map((node) => `${node.method} ${node.path}`)
    .filter((key, index, all) => all.indexOf(key) === index)
    .slice(0, context.scope === 'quick' ? 10 : context.scope === 'standard' ? 50 : 200);

  if (candidates.length === 0) {
    return {
      lane: 'api',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no parameter-free GET endpoints to verify',
      durationMs: Date.now() - startedAt,
    };
  }

  const auth = resolveAuth(context.request.auth?.ref, context.env ?? process.env);
  const client = new DiscoveryHttpClient({
    mode: context.mode,
    scope: context.scope,
    allowlist,
    maxRequests: Math.max(20, candidates.length * 2),
    timeoutMs: 10_000,
    authHeaders: auth.headers,
    authHost: resolveHost(base),
  });
  const anonymous = new DiscoveryHttpClient({
    mode: context.mode,
    scope: context.scope,
    allowlist,
    maxRequests: Math.max(20, candidates.length * 2),
    timeoutMs: 10_000,
  });

  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];
  let testIndex = 0;

  for (const key of candidates) {
    const [method, path] = key.split(' ', 2);
    const endpoint = context.discovery.endpoints.find(
      (entry): entry is DiscoveredEndpoint =>
        entry.method.toUpperCase() === method && entry.path === path,
    );
    const url = new URL(path!, base).href;
    const started = Date.now();
    try {
      const response = await client.get(url, 'api');
      const expectedStatuses = endpoint?.responseSchemas
        ? Object.keys(endpoint.responseSchemas)
        : [];
      const statusOk =
        expectedStatuses.length > 0
          ? expectedStatuses.some((expected) => statusMatches(expected, response.status))
          : response.status < 400;
      const schema = schemaForStatus(endpoint?.responseSchemas, response.status);
      const schemaErrors =
        statusOk && schema
          ? validationErrors(schema, response.body, context.discovery.openapi?.components)
          : [];
      const passed = statusOk && schemaErrors.length === 0;
      tests.push({
        id: `TC-API-${String(++testIndex).padStart(3, '0')}`,
        lane: 'api',
        name: `${method} ${path} returns an acceptable response`,
        status: passed ? 'passed' : 'failed',
        durationMs: Date.now() - started,
        expected:
          expectedStatuses.length > 0
            ? `status in [${expectedStatuses.join(', ')}]${schema ? ' + schema match' : ''}`
            : 'status <400',
        actual:
          `status=${response.status}` +
          (schemaErrors.length > 0 ? `; ${schemaErrors.slice(0, 3).join('; ')}` : ''),
        evidence: [{ type: 'api', url, status: response.status }],
      });
      if (!passed) {
        drafts.push({
          title: `${method} ${path} did not match the expected contract`,
          ruleId: `api-contract:${method}:${path}`,
          severity: response.status >= 500 ? 'high' : 'medium',
          confidence: expectedStatuses.length > 0 ? 'verified' : 'auto-discovered',
          category: 'app-bug',
          lane: 'api',
          affected: [{ endpoint: `${method} ${path}`, url }],
          expected:
            expectedStatuses.length > 0
              ? `status in [${expectedStatuses.join(', ')}]${schema ? ' + schema match' : ''}`
              : 'status <400',
          actual:
            `status=${response.status}` +
            (schemaErrors.length > 0 ? `; ${schemaErrors.slice(0, 3).join('; ')}` : ''),
          evidence: [{ type: 'api', url, status: response.status }],
        });
      }
    } catch (error) {
      tests.push({
        id: `TC-API-${String(++testIndex).padStart(3, '0')}`,
        lane: 'api',
        name: `${method} ${path} request`,
        status: 'failed',
        durationMs: Date.now() - started,
        expected: 'request completes',
        actual: (error as Error).message,
        evidence: [{ type: 'api', url }],
      });
      drafts.push({
        title: `API request failed: ${method} ${path}`,
        ruleId: 'api-request-failed',
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'environment',
        lane: 'api',
        affected: [{ endpoint: `${method} ${path}`, url }],
        actual: (error as Error).message,
        evidence: [{ type: 'api', url }],
      });
    }

    if (endpoint?.authRequired && endpoint.source === 'spec') {
      const unauthorizedStart = Date.now();
      try {
        const unauthorized = await anonymous.get(url, 'api');
        const rejected = unauthorized.status === 401 || unauthorized.status === 403;
        tests.push({
          id: `TC-API-${String(++testIndex).padStart(3, '0')}`,
          lane: 'api',
          name: `${method} ${path} rejects unauthenticated access`,
          status: rejected ? 'passed' : 'failed',
          durationMs: Date.now() - unauthorizedStart,
          expected: 'HTTP 401 or 403 without credentials',
          actual: `status=${unauthorized.status}`,
          evidence: [{ type: 'api', url, authenticated: false }],
        });
        if (!rejected) {
          drafts.push({
            title: `Authentication bypass suspected on ${method} ${path}`,
            ruleId: 'auth-bypass',
            severity: 'high',
            confidence: 'auto-discovered',
            category: 'security',
            lane: 'api',
            affected: [{ endpoint: `${method} ${path}`, url }],
            expected: 'HTTP 401 or 403 without credentials',
            actual: `HTTP ${unauthorized.status}`,
            evidence: [{ type: 'api', url, authenticated: false }],
          });
        }
      } catch (error) {
        tests.push({
          id: `TC-API-${String(++testIndex).padStart(3, '0')}`,
          lane: 'api',
          name: `${method} ${path} rejects unauthenticated access`,
          status: 'failed',
          durationMs: Date.now() - unauthorizedStart,
          actual: (error as Error).message,
        });
      }
    }
  }

  return {
    lane: 'api',
    status: tests.some((test) => test.status === 'failed') ? 'failed' : 'passed',
    tests,
    findings: toFindings(drafts),
    durationMs: Date.now() - startedAt,
  };
}
