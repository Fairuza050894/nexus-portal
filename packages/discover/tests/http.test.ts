import { describe, expect, it } from 'vitest';
import {
  Budget,
  BudgetExhaustedError,
  CircuitBreaker,
  CircuitOpenError,
  DiscoveryHttpClient,
  DiscoveryHttpError,
  createRateLimiter,
  findMutationRequests,
  parseRetryAfter,
  resolveAuth,
  type TrafficRecord,
} from '../src/index.js';

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

function clock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe('circuit breaker and budget', () => {
  it('opens after a 429', () => {
    const breaker = new CircuitBreaker();
    breaker.record(429);
    expect(breaker.isOpen).toBe(true);
    expect(breaker.reason).toContain('429');
  });

  it('opens when more than 5% of a 20-request window is 5xx', () => {
    const breaker = new CircuitBreaker();
    for (let index = 0; index < 19; index += 1) breaker.record(200);
    expect(breaker.isOpen).toBe(false);
    breaker.record(500);
    breaker.record(500);
    expect(breaker.isOpen).toBe(true);
  });

  it('enforces the request budget', () => {
    const { now } = clock();
    const budget = new Budget('quick', now, 1000, 2);
    expect(budget.consume(now)).toBe(true);
    expect(budget.consume(now)).toBe(true);
    expect(budget.consume(now)).toBe(false);
    expect(budget.exhausted(now)).toBe(true);
  });

  it('applies mode rate spacing', async () => {
    const { now, sleep } = clock();
    const limit = createRateLimiter(10, now, sleep);
    await limit();
    await limit();
    await limit();
    expect(now()).toBeGreaterThanOrEqual(200);
  });
});

describe('DiscoveryHttpClient', () => {
  it('follows allowlisted redirects and records traffic', async () => {
    const { now, sleep } = clock();
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      now,
      sleep,
      fetchImpl: async (url) =>
        url.endsWith('/start')
          ? response(301, '', { location: '/next' })
          : response(200, '<html></html>', { 'content-type': 'text/html' }),
    });
    const result = await client.get('http://app.local/start', 'page');
    expect(result.url).toBe('http://app.local/next');
    expect(result.redirects).toEqual(['http://app.local/next']);
    expect(client.traffic).toHaveLength(2);
    expect(client.traffic[0]?.redirectTo).toBe('http://app.local/next');
  });

  it('blocks redirects to hosts outside the allowlist', async () => {
    const { now, sleep } = clock();
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      now,
      sleep,
      fetchImpl: async () => response(302, '', { location: 'http://evil.example.com' }),
    });
    await expect(client.get('http://app.local/start', 'page')).rejects.toBeInstanceOf(
      DiscoveryHttpError,
    );
    expect(client.traffic[0]?.status).toBe(302);
  });

  it('opens the circuit on 429 and enforces budget', async () => {
    const { now, sleep } = clock();
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      maxRequests: 2,
      now,
      sleep,
      fetchImpl: async () => response(429),
    });
    await expect(client.get('http://app.local/', 'page')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(client.breaker.isOpen).toBe(true);

    const healthy = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      maxRequests: 1,
      now,
      sleep,
      fetchImpl: async () => response(200),
    });
    await healthy.get('http://app.local/a', 'page');
    await expect(healthy.get('http://app.local/b', 'page')).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );
  });

  it('opens after a 5xx storm', async () => {
    const { now, sleep } = clock();
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      maxRequests: 25,
      now,
      sleep,
      fetchImpl: async () => response(500),
    });
    for (let index = 0; index < 20; index += 1) {
      await client.get(`http://app.local/${index}`, 'page');
    }
    expect(client.breaker.isOpen).toBe(true);
    await expect(client.get('http://app.local/after', 'page')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
  });

  it('sends credentials only to the original host, never across redirects', async () => {
    const { now, sleep } = clock();
    const seen: Array<{ url: string; authorization?: string }> = [];
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local', 'other.local'],
      now,
      sleep,
      authHost: 'app.local',
      authHeaders: { authorization: 'Bearer secret' },
      fetchImpl: async (url, init) => {
        seen.push({ url, authorization: init.headers?.authorization });
        return url.startsWith('http://app.local')
          ? response(302, '', { location: 'http://other.local/next' })
          : response(200);
      },
    });

    await client.get('http://app.local/start', 'page');
    expect(seen[0]?.authorization).toBe('Bearer secret');
    expect(seen[1]?.authorization).toBeUndefined();
  });

  it('rejects hosts outside the allowlist without sending a request', async () => {
    const { now, sleep } = clock();
    let called = false;
    const client = new DiscoveryHttpClient({
      mode: 'sandbox',
      scope: 'quick',
      allowlist: ['app.local'],
      now,
      sleep,
      fetchImpl: async () => {
        called = true;
        return response(200);
      },
    });
    await expect(client.get('http://evil.example.com/', 'page')).rejects.toThrow(
      /not on allowlist/,
    );
    expect(called).toBe(false);
  });
});

describe('traffic and retry helpers', () => {
  it('finds state-changing requests for prod-safe assertions', () => {
    const traffic: TrafficRecord[] = [
      { sequence: 1, method: 'GET', url: 'http://x/', kind: 'page', durationMs: 1 },
      { sequence: 2, method: 'POST', url: 'http://x/api', kind: 'form', durationMs: 1 },
    ];
    expect(findMutationRequests(traffic).map((entry) => entry.method)).toEqual(['POST']);
  });

  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('2', 0)).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 5000)).toBe(5000);
    expect(parseRetryAfter('not-a-date', 0)).toBeUndefined();
  });

  it('resolves vault/env auth references to headers without logging them', () => {
    const bearer = resolveAuth('vault:qa/app', { QA_VAULT_QA_APP: 'token123' });
    expect(bearer).toEqual({ headers: { authorization: 'Bearer token123' }, used: true });

    const basic = resolveAuth('QA_BASIC', {
      QA_BASIC: JSON.stringify({ username: 'user', password: 'pass' }),
    });
    expect(basic.headers.authorization).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );

    expect(resolveAuth('vault:missing', {}).used).toBe(false);
    expect(resolveAuth('not a ref', {}).used).toBe(false);
  });
});
