import { BudgetExhaustedError, CircuitOpenError, maxDepthFor, maxPagesFor } from './policy.js';
import {
  DiscoveryHttpClient,
  parseRetryAfter,
  type DiscoveryFetch,
  type HttpClientOptions,
} from './http.js';
import { loadRobots, type RobotsRules } from './robots.js';
import { reverseEngineerBundle } from './bundle-extractor.js';
import type {
  CrawlResult,
  CrawlWarning,
  DiscoveredEndpoint,
  DiscoveredForm,
  DiscoveredPage,
} from './types.js';

export interface CrawlOptions {
  startUrls: string[];
  allowlist: string[];
  mode: HttpClientOptions['mode'];
  scope: HttpClientOptions['scope'];
  maxDepth?: number;
  excludePaths?: string[];
  maxPages?: number;
  respectRobots?: boolean;
  client?: DiscoveryHttpClient;
  fetchImpl?: DiscoveryFetch;
  timeoutMs?: number;
  deadlineMs?: number;
  maxRequests?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface QueueItem {
  url: string;
  depth: number;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeUrl(raw: string, base: string): string | undefined {
  try {
    const url = new URL(decodeEntities(raw), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    const baseUrl = new URL(base);
    if (
      baseUrl.protocol === 'https:' &&
      url.protocol === 'http:' &&
      url.hostname === baseUrl.hostname
    ) {
      url.protocol = 'https:';
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function extractPage(
  html: string,
  baseUrl: string,
): {
  title?: string;
  links: string[];
  forms: DiscoveredForm[];
  scripts: string[];
  inlineScripts: string[];
} {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const links = new Set<string>();
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(hrefPattern)) {
    const normalized = normalizeUrl(match[1] ?? match[2] ?? match[3] ?? '', baseUrl);
    if (normalized) links.add(normalized);
  }
  const forms: DiscoveredForm[] = [];
  const formPattern = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  for (const match of html.matchAll(formPattern)) {
    const tag = match[0]?.slice(0, 500) ?? '';
    const actionMatch = /\baction\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const methodMatch = /\bmethod\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const action = normalizeUrl(
      actionMatch?.[1] ?? actionMatch?.[2] ?? actionMatch?.[3] ?? baseUrl,
      baseUrl,
    );
    if (!action) continue;
    forms.push({
      action,
      method: (methodMatch?.[1] ?? methodMatch?.[2] ?? methodMatch?.[3] ?? 'GET').toUpperCase(),
    });
  }

  const scripts: string[] = [];
  const scriptSrcPattern = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(scriptSrcPattern)) {
    const normalized = normalizeUrl(match[1] ?? match[2] ?? match[3] ?? '', baseUrl);
    if (normalized) scripts.push(normalized);
  }

  const inlineScripts: string[] = [];
  const inlineScriptPattern =
    /<script\b(?![^>]*\btype\s*=\s*['"](?:application\/ld\+json|application\/json)['"])[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(inlineScriptPattern)) {
    const code = match[1]?.trim();
    if (code && code.length > 10) {
      inlineScripts.push(code);
    }
  }

  return { title, links: [...links], forms, scripts, inlineScripts };
}

function isExcluded(url: URL, excludePaths: string[]): boolean {
  const path = normalizePath(url.pathname);
  return excludePaths.some((entry) => {
    const normalized = normalizePath(entry);
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function endpointFromUrl(
  url: string,
  method: string,
  source: DiscoveredEndpoint['source'],
): DiscoveredEndpoint {
  const path = normalizePath(new URL(url).pathname);
  return {
    method,
    path,
    source,
    confidence: source === 'traffic' ? 'auto-discovered' : 'needs-review',
    tags: [],
    authRequired: false,
    rawPath: path,
  };
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const client =
    options.client ??
    new DiscoveryHttpClient({
      mode: options.mode,
      scope: options.scope,
      allowlist: options.allowlist,
      timeoutMs: options.timeoutMs,
      deadlineMs: options.deadlineMs,
      maxRequests: options.maxRequests,
      now,
      sleep,
      fetchImpl: options.fetchImpl,
    });

  const warnings: CrawlWarning[] = [];
  const pages: DiscoveredPage[] = [];
  const endpoints: DiscoveredEndpoint[] = [];
  const seenEndpoints = new Set<string>();
  const visited = new Set<string>();
  const visitedScripts = new Set<string>();
  const retriedAfter = new Set<string>();
  const queue: QueueItem[] = [];
  const maxDepth = maxDepthFor(options.scope, options.maxDepth);
  const maxPages = maxPagesFor(options.scope, options.maxPages);
  const excludePaths = options.excludePaths ?? [];
  const startUrls = options.startUrls.map((url) => new URL(url).href);
  const allowedOrigins = new Set(startUrls.map((url) => new URL(url).origin));

  for (const url of startUrls) {
    const normalized = normalizeUrl(url, url);
    if (normalized) queue.push({ url: normalized, depth: 0 });
  }

  let robots: RobotsRules | undefined;
  let robotsFound = false;
  const shouldRespectRobots = options.respectRobots ?? options.mode === 'prod-safe';
  if (shouldRespectRobots && startUrls[0]) {
    const loaded = await loadRobots(client, new URL(startUrls[0]).origin);
    robots = loaded.rules;
    robotsFound = loaded.found;
  }

  let crawled = 0;
  while (
    queue.length > 0 &&
    crawled < maxPages &&
    !client.stopped.open &&
    !client.stopped.exhausted
  ) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);
    let parsed: URL;
    try {
      parsed = new URL(item.url);
    } catch {
      continue;
    }
    if (!allowedOrigins.has(parsed.origin)) {
      warnings.push({ url: item.url, reason: 'skipped: cross-origin link' });
      continue;
    }
    if (isExcluded(parsed, excludePaths)) {
      warnings.push({ url: item.url, reason: 'skipped: excluded path' });
      continue;
    }
    if (robots && !robots.isAllowed(`${parsed.pathname}${parsed.search}`)) {
      warnings.push({ url: item.url, reason: 'skipped: disallowed by robots.txt' });
      continue;
    }

    crawled += 1;
    try {
      const response = await client.get(item.url, 'page');
      if (response.status === 503 && !retriedAfter.has(item.url)) {
        const waitMs = parseRetryAfter(response.headers.get('retry-after'), now());
        if (waitMs !== undefined && waitMs <= 10_000) {
          retriedAfter.add(item.url);
          visited.delete(item.url);
          await sleep(waitMs);
          queue.unshift(item);
          continue;
        }
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (response.status >= 500) {
        warnings.push({ url: item.url, reason: `HTTP ${response.status}` });
      }
      const finalUrl = new URL(response.url);
      if (contentType.includes('text/html')) {
        const extracted = extractPage(response.body, response.url);
        pages.push({
          url: response.url,
          path: normalizePath(finalUrl.pathname),
          status: response.status,
          contentType,
          title: extracted.title,
          depth: item.depth,
          links: extracted.links,
          forms: extracted.forms,
        });
        if (item.depth < maxDepth) {
          for (const link of extracted.links) {
            const normalized = normalizeUrl(link, response.url);
            if (!normalized || visited.has(normalized)) continue;
            const linkUrl = new URL(normalized);
            if (!allowedOrigins.has(linkUrl.origin) || isExcluded(linkUrl, excludePaths)) {
              continue;
            }
            queue.push({ url: normalized, depth: item.depth + 1 });
          }
        }
        for (const form of extracted.forms) {
          const endpoint = endpointFromUrl(form.action, form.method, 'crawl');
          const key = `${endpoint.method} ${endpoint.path}`;
          if (!seenEndpoints.has(key)) {
            seenEndpoints.add(key);
            endpoints.push(endpoint);
          }
        }

        // Reverse-engineer client-side bundles & inline scripts (REA methodology)
        for (const inlineCode of extracted.inlineScripts) {
          const reResult = reverseEngineerBundle(inlineCode);
          for (const ep of reResult.endpoints) {
            const key = `${ep.method} ${ep.path}`;
            if (!seenEndpoints.has(key)) {
              seenEndpoints.add(key);
              endpoints.push(ep);
            }
          }
          if (item.depth < maxDepth) {
            for (const route of reResult.clientRoutes) {
              const fullUrl = normalizeUrl(route, response.url);
              if (fullUrl && !visited.has(fullUrl)) {
                queue.push({ url: fullUrl, depth: item.depth + 1 });
              }
            }
          }
        }

        for (const scriptUrl of extracted.scripts) {
          try {
            const sUrl = new URL(scriptUrl);
            if (
              allowedOrigins.has(sUrl.origin) &&
              !visitedScripts.has(scriptUrl) &&
              visitedScripts.size < 5
            ) {
              visitedScripts.add(scriptUrl);
              const scriptRes = await client.get(scriptUrl, 'page');
              if (scriptRes.status === 200 && scriptRes.body) {
                const reResult = reverseEngineerBundle(scriptRes.body);
                for (const ep of reResult.endpoints) {
                  const key = `${ep.method} ${ep.path}`;
                  if (!seenEndpoints.has(key)) {
                    seenEndpoints.add(key);
                    endpoints.push(ep);
                  }
                }
              }
            }
          } catch {
            // Ignore script bundle download errors during crawl
          }
        }
      } else if (response.status < 500) {
        const endpoint = endpointFromUrl(response.url, 'GET', 'traffic');
        const key = `${endpoint.method} ${endpoint.path}`;
        if (!seenEndpoints.has(key)) {
          seenEndpoints.add(key);
          endpoints.push(endpoint);
        }
      }
    } catch (error) {
      warnings.push({ url: item.url, reason: (error as Error).message });
      if (error instanceof CircuitOpenError || error instanceof BudgetExhaustedError) break;
    }
  }

  if (queue.length > 0) {
    warnings.push({
      reason: `crawl stopped with ${queue.length} URL(s) queued (pages=${pages.length}, budget=${client.budget.requests}/${client.budget.maxRequests})`,
    });
  }

  return {
    pages,
    endpoints,
    traffic: client.traffic,
    warnings,
    robots: { found: robotsFound, rules: robots?.rules.length ?? 0 },
    budget: {
      requests: client.budget.requests,
      maxRequests: client.budget.maxRequests,
      exhausted: client.stopped.exhausted,
    },
    circuit: { open: client.stopped.open, reason: client.stopped.reason },
  };
}
