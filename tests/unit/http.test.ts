import { describe, expect, it } from 'vitest';
import { probeUrl } from '../../apps/cli/src/http.js';

function response(status: number, location?: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => (name === 'location' ? (location ?? null) : null) },
    body: null,
  };
}

describe('probeUrl', () => {
  it('returns ok for an allowlisted 200 response', async () => {
    const result = await probeUrl('http://127.0.0.1:3100/health', ['127.0.0.1'], {}, async () =>
      response(200),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.redirects).toEqual([]);
  });

  it('blocks redirects to hosts outside the allowlist', async () => {
    const result = await probeUrl('http://127.0.0.1:3100/health', ['127.0.0.1'], {}, async () =>
      response(302, 'http://evil.example.com/steal'),
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(302);
    expect(result.error).toContain('redirect');
  });

  it('follows allowlisted redirects', async () => {
    const calls: string[] = [];
    const result = await probeUrl('http://127.0.0.1:3100/', ['127.0.0.1'], {}, async (url) => {
      calls.push(url);
      return calls.length === 1 ? response(301, '/health') : response(200);
    });
    expect(result.ok).toBe(true);
    expect(result.finalUrl).toBe('http://127.0.0.1:3100/health');
    expect(result.redirects).toEqual(['http://127.0.0.1:3100/health']);
  });

  it('rejects direct requests to hosts outside the allowlist', async () => {
    const result = await probeUrl('http://evil.example.com', ['127.0.0.1'], {}, async () =>
      response(200),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not on allowlist');
  });
});
