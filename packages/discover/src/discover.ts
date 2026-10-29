import { resolveAuth } from './auth.js';
import { DiscoveryHttpClient } from './http.js';
import { crawl } from './crawler.js';
import { importOpenApi } from './openapi.js';
import { resolveHost } from '@nexus/core';
import type { DiscoverOptions, DiscoveryResult } from './types.js';

export async function discoverTargets(options: DiscoverOptions): Promise<DiscoveryResult> {
  const resolvedAuth = resolveAuth(options.authRef, options.env);
  const authTarget = options.web?.urls[0] ?? options.api?.specUrl ?? options.api?.baseUrl ?? '';
  const authHost = authTarget ? resolveHost(authTarget) || undefined : undefined;
  const client = new DiscoveryHttpClient({
    mode: options.mode,
    scope: options.scope,
    allowlist: options.allowlist,
    timeoutMs: options.timeoutMs,
    deadlineMs: options.deadlineMs,
    now: options.now,
    sleep: options.sleep,
    fetchImpl: options.fetchImpl,
    authHeaders: {
      ...resolvedAuth.headers,
      ...(options.cookieHeader ? { cookie: options.cookieHeader } : {}),
    },
    authHost,
  });

  const warnings: string[] = [];
  let pages: DiscoveryResult['pages'] = [];
  let endpoints: DiscoveryResult['endpoints'] = [];
  let crawlMeta: DiscoveryResult['crawl'] = {
    robots: { found: false, rules: 0 },
    budget: { requests: 0, maxRequests: client.budget.maxRequests, exhausted: false },
    circuit: { open: false },
  };

  if (options.web?.urls.length) {
    const result = await crawl({
      startUrls: options.web.urls,
      allowlist: options.allowlist,
      mode: options.mode,
      scope: options.scope,
      maxDepth: options.web.maxDepth,
      excludePaths: options.web.excludePaths,
      client,
      respectRobots: options.mode === 'prod-safe',
    });
    pages = result.pages;
    endpoints = result.endpoints;
    crawlMeta = {
      robots: result.robots,
      budget: result.budget,
      circuit: result.circuit,
    };
    for (const warning of result.warnings) {
      warnings.push(warning.url ? `${warning.url}: ${warning.reason}` : warning.reason);
    }
  } else {
    warnings.push('no web URL provided; crawl skipped');
  }

  let openapi: DiscoveryResult['openapi'];
  if (options.api?.specUrl) {
    try {
      openapi = await importOpenApi(client, options.api.specUrl);
      endpoints = [...endpoints, ...openapi.endpoints];
      warnings.push(...openapi.warnings);
    } catch (error) {
      warnings.push(`OpenAPI import failed: ${(error as Error).message}`);
    }
  } else if (options.api?.baseUrl) {
    warnings.push('api.baseUrl provided without specUrl; API discovery skipped');
  }

  if (options.authRef && resolvedAuth.reason) {
    warnings.push(`authentication not applied: ${resolvedAuth.reason}`);
  }
  const authUsed = (resolvedAuth.used || Boolean(options.cookieHeader)) && Boolean(authHost);

  return {
    pages,
    endpoints,
    traffic: client.traffic,
    warnings,
    openapi,
    crawl: crawlMeta,
    auth: {
      used: authUsed,
      ...(options.authRef && !authUsed
        ? { reason: resolvedAuth.reason ?? 'auth reference has no target host' }
        : {}),
    },
  };
}
