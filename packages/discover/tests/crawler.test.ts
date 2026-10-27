import { describe, expect, it } from 'vitest';
import { crawl, type DiscoveryFetch } from '../src/index.js';

interface Page {
  status?: number;
  body: string;
  type: string;
  headers?: Record<string, string>;
}

function site(pages: Record<string, Page>): { fetchImpl: DiscoveryFetch; requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    fetchImpl: async (url) => {
      requested.push(url);
      const page = pages[new URL(url).pathname] ?? {
        status: 404,
        body: 'not found',
        type: 'text/plain',
      };
      return {
        status: page.status ?? 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? page.type
              : (page.headers?.[name.toLowerCase()] ?? null),
        },
        text: async () => page.body,
      };
    },
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

describe('crawler', () => {
  it('crawls same-origin pages to the depth limit, records forms, and excludes paths', async () => {
    const { fetchImpl, requested } = site({
      '/': {
        body: [
          '<html><head><title>Home</title></head><body>',
          '<a href="/a">A</a><a href="/b">B</a>',
          '<a href="/private">P</a><a href="https://external.example/x">E</a>',
          '<form method="post" action="/api/items"><input name="x"></form>',
          '</body></html>',
        ].join(''),
        type: 'text/html',
      },
      '/a': { body: '<a href="/c">C</a>', type: 'text/html' },
      '/b': { body: '{"ok":true}', type: 'application/json' },
      '/c': { body: '<p>c</p>', type: 'text/html' },
    });
    const { now, sleep } = clock();

    const result = await crawl({
      startUrls: ['http://app.local/'],
      allowlist: ['app.local'],
      mode: 'sandbox',
      scope: 'quick',
      maxDepth: 2,
      excludePaths: ['/private'],
      fetchImpl,
      now,
      sleep,
    });

    expect(result.pages.map((page) => page.path).sort()).toEqual(['/', '/a', '/c']);
    expect(result.pages[0]?.title).toBe('Home');
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/b', source: 'traffic' }),
        expect.objectContaining({ method: 'POST', path: '/api/items', source: 'crawl' }),
      ]),
    );
    expect(requested).not.toContain('http://app.local/private');
    expect(requested.some((url) => url.includes('external.example'))).toBe(false);
    expect(result.traffic.every((entry) => entry.method === 'GET')).toBe(true);
  });

  it('honors maxDepth', async () => {
    const { fetchImpl } = site({
      '/': { body: '<a href="/a">A</a>', type: 'text/html' },
      '/a': { body: '<a href="/c">C</a>', type: 'text/html' },
      '/c': { body: '<p>c</p>', type: 'text/html' },
    });
    const { now, sleep } = clock();
    const result = await crawl({
      startUrls: ['http://app.local/'],
      allowlist: ['app.local'],
      mode: 'sandbox',
      scope: 'quick',
      maxDepth: 1,
      fetchImpl,
      now,
      sleep,
    });
    expect(result.pages.map((page) => page.path).sort()).toEqual(['/', '/a']);
  });

  it('honors robots.txt in prod-safe and never sends a non-GET request', async () => {
    const { fetchImpl, requested } = site({
      '/robots.txt': {
        body: 'User-agent: *\nDisallow: /a\nAllow: /a/public\n',
        type: 'text/plain',
      },
      '/': { body: '<a href="/a">A</a><a href="/b">B</a>', type: 'text/html' },
      '/a': { body: '<p>hidden</p>', type: 'text/html' },
      '/b': { body: '<p>b</p>', type: 'text/html' },
    });
    const { now, sleep } = clock();
    const result = await crawl({
      startUrls: ['http://app.local/'],
      allowlist: ['app.local'],
      mode: 'prod-safe',
      scope: 'quick',
      fetchImpl,
      now,
      sleep,
    });

    expect(requested).toContain('http://app.local/robots.txt');
    expect(requested).not.toContain('http://app.local/a');
    expect(requested).toContain('http://app.local/b');
    expect(result.robots).toEqual({ found: true, rules: 2 });
    expect(result.warnings.some((warning) => warning.reason.includes('robots'))).toBe(true);
    expect(result.traffic.every((entry) => entry.method === 'GET')).toBe(true);
  });

  it('retries a 503 once when Retry-After is short', async () => {
    let attempts = 0;
    const { now, sleep } = clock();
    const fetchImpl: DiscoveryFetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          status: 503,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'retry-after' ? '0' : 'text/html'),
          },
          text: async () => 'busy',
        };
      }
      return {
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<title>Recovered</title>',
      };
    };
    const result = await crawl({
      startUrls: ['http://app.local/'],
      allowlist: ['app.local'],
      mode: 'sandbox',
      scope: 'quick',
      fetchImpl,
      now,
      sleep,
    });
    expect(attempts).toBe(2);
    expect(result.pages[0]?.title).toBe('Recovered');
  });

  it('opens the circuit on 429 and reports it', async () => {
    const { now, sleep } = clock();
    const result = await crawl({
      startUrls: ['http://app.local/'],
      allowlist: ['app.local'],
      mode: 'sandbox',
      scope: 'quick',
      now,
      sleep,
      fetchImpl: async () => ({
        status: 429,
        headers: { get: () => null },
        text: async () => '',
      }),
    });
    expect(result.circuit.open).toBe(true);
    expect(result.circuit.reason).toContain('429');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
