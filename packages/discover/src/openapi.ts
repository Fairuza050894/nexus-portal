import yaml from 'js-yaml';
import type { DiscoveryHttpClient } from './http.js';
import type { DiscoveredEndpoint, OpenApiImport } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function normalizePath(raw: string): string {
  const withParams = raw.replace(/\{([^}]+)\}/g, ':$1');
  if (withParams.length > 1 && withParams.endsWith('/')) return withParams.slice(0, -1);
  return withParams || '/';
}

function parseBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  return yaml.load(trimmed);
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> } | undefined>;
}

function responseSchemas(operation: OpenApiOperation): Record<string, unknown> | undefined {
  const schemas: Record<string, unknown> = {};
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    const content = response?.content ?? {};
    const schema = content['application/json']?.schema ?? content['*/*']?.schema;
    if (schema) schemas[status] = schema;
  }
  return Object.keys(schemas).length > 0 ? schemas : undefined;
}

interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation> | undefined>;
  security?: Array<Record<string, string[]>>;
  components?: { schemas?: Record<string, unknown> };
}

export async function importOpenApi(
  client: DiscoveryHttpClient,
  specUrl: string,
): Promise<OpenApiImport> {
  const response = await client.get(specUrl, 'spec');
  if (response.status >= 400) {
    throw new Error(`OpenAPI spec returned ${response.status} at ${specUrl}`);
  }

  let document: OpenApiDocument;
  try {
    const parsed = parseBody(response.body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('spec root is not an object');
    }
    document = parsed as OpenApiDocument;
  } catch (error) {
    throw new Error(`invalid OpenAPI document at ${specUrl}: ${(error as Error).message}`);
  }

  const warnings: string[] = [];
  if (!document.openapi) {
    warnings.push(
      document.swagger
        ? `Swagger ${document.swagger} is not fully supported; treated as OpenAPI 3`
        : 'missing openapi version field',
    );
  }

  const endpoints: DiscoveredEndpoint[] = [];
  const seen = new Set<string>();
  for (const [rawPath, item] of Object.entries(document.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object') continue;
      const path = normalizePath(rawPath);
      const key = `${method.toUpperCase()} ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const security = operation.security ?? document.security ?? [];
      endpoints.push({
        method: method.toUpperCase(),
        path,
        rawPath,
        source: 'spec',
        confidence: 'verified',
        operationId: operation.operationId,
        summary: operation.summary,
        tags: operation.tags ?? [],
        authRequired: security.length > 0,
        responseSchemas: responseSchemas(operation),
      });
    }
  }
  if (endpoints.length === 0) warnings.push('spec contains no operations');

  return {
    title: document.info?.title,
    version: document.info?.version,
    servers: (document.servers ?? []).flatMap((server) => (server.url ? [server.url] : [])),
    schemaNames: Object.keys(document.components?.schemas ?? {}),
    components: document.components?.schemas,
    endpoints,
    warnings,
  };
}
