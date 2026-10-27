import { describe, expect, it } from 'vitest';
import { DiscoveryHttpClient, importOpenApi } from '../src/index.js';

function client(body: string, status = 200): DiscoveryHttpClient {
  return new DiscoveryHttpClient({
    mode: 'sandbox',
    scope: 'quick',
    allowlist: ['app.local'],
    fetchImpl: async () => ({
      status,
      headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
      text: async () => body,
    }),
  });
}

describe('OpenAPI importer', () => {
  it('extracts operations, security, schemas, and normalizes path params', async () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Shop', version: '1.0.0' },
      servers: [{ url: 'https://shop.example.com' }],
      security: [{ bearer: [] }],
      paths: {
        '/orders/{id}': {
          get: { operationId: 'getOrder', summary: 'Get an order', tags: ['orders'] },
          delete: { operationId: 'deleteOrder', security: [] },
        },
        '/health': { get: { summary: 'Health' } },
      },
      components: { schemas: { Order: {}, Error: {} } },
    };
    const result = await importOpenApi(
      client(JSON.stringify(spec)),
      'http://app.local/openapi.json',
    );

    expect(result.title).toBe('Shop');
    expect(result.version).toBe('1.0.0');
    expect(result.servers).toEqual(['https://shop.example.com']);
    expect(result.schemaNames).toEqual(['Order', 'Error']);
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: '/orders/:id',
          rawPath: '/orders/{id}',
          authRequired: true,
          source: 'spec',
          confidence: 'verified',
        }),
        expect.objectContaining({ method: 'DELETE', path: '/orders/:id', authRequired: false }),
        expect.objectContaining({ method: 'GET', path: '/health', authRequired: true }),
      ]),
    );
  });

  it('parses YAML specs', async () => {
    const spec = [
      'openapi: 3.0.3',
      'info:',
      '  title: YAML API',
      '  version: 2.0.0',
      'paths:',
      '  /api/todos:',
      '    get:',
      '      summary: List todos',
    ].join('\n');
    const result = await importOpenApi(client(spec), 'http://app.local/openapi.yaml');
    expect(result.title).toBe('YAML API');
    expect(result.endpoints[0]).toEqual(
      expect.objectContaining({ method: 'GET', path: '/api/todos', summary: 'List todos' }),
    );
  });

  it('fails on non-2xx responses', async () => {
    await expect(
      importOpenApi(client('missing', 404), 'http://app.local/openapi.json'),
    ).rejects.toThrow(/returned 404/);
  });
});
