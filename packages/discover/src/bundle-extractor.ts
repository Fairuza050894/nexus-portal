import type { DiscoveredEndpoint } from './types.js';

export interface ReverseEngineeredArtifacts {
  endpoints: DiscoveredEndpoint[];
  clientRoutes: string[];
}

/**
 * Reverse-engineers client-side JavaScript bundles to discover hidden API endpoints,
 * route paths, and HTTP methods without requiring original source code or OpenAPI specs.
 *
 * Implements the black-box web bundle reverse-engineering principle of REA (Reverse Engineer Anything).
 */
export function reverseEngineerBundle(content: string): ReverseEngineeredArtifacts {
  const endpoints: DiscoveredEndpoint[] = [];
  const seenEndpoints = new Set<string>();
  const seenPaths = new Set<string>();
  const clientRoutes = new Set<string>();

  if (!content || typeof content !== 'string') {
    return { endpoints: [], clientRoutes: [] };
  }

  // 1. Match fetch() calls: fetch('/api/v1/users', { method: 'POST' }) or fetch('/api/...')
  const fetchPattern =
    /\bfetch\s*\(\s*['"`]([^'"`\s?#]+)[^'"`]*['"`](?:\s*,\s*\{[\s\S]*?\bmethod\s*:\s*['"`]([A-Z]+)['"`])?/gi;
  for (const match of content.matchAll(fetchPattern)) {
    const rawPath = match[1];
    const method = (match[2] || 'GET').toUpperCase();
    if (isValidApiPath(rawPath)) {
      const normalizedPath = normalizeApiPath(rawPath);
      const key = `${method} ${normalizedPath}`;
      seenPaths.add(normalizedPath);
      if (!seenEndpoints.has(key)) {
        seenEndpoints.add(key);
        endpoints.push({
          method,
          path: normalizedPath,
          rawPath,
          source: 'crawl',
          confidence: 'auto-discovered',
          tags: ['reverse-engineered', 'bundle-extract'],
          authRequired: isLikelyAuthenticated(normalizedPath),
        });
      }
    }
  }

  // 2. Match axios.<method>('...') calls: axios.post('/api/auth/login')
  const axiosMethodPattern =
    /\baxios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s?#]+)['"`]/gi;
  for (const match of content.matchAll(axiosMethodPattern)) {
    const method = match[1].toUpperCase();
    const rawPath = match[2];
    if (isValidApiPath(rawPath)) {
      const normalizedPath = normalizeApiPath(rawPath);
      const key = `${method} ${normalizedPath}`;
      seenPaths.add(normalizedPath);
      if (!seenEndpoints.has(key)) {
        seenEndpoints.add(key);
        endpoints.push({
          method,
          path: normalizedPath,
          rawPath,
          source: 'crawl',
          confidence: 'auto-discovered',
          tags: ['reverse-engineered', 'bundle-extract'],
          authRequired: isLikelyAuthenticated(normalizedPath),
        });
      }
    }
  }

  // 3. Match common API URL string literals in bundle: e.g. "/api/v1/todos", "/v1/auth/login"
  const apiUrlPattern =
    /['"`](\/(?:api|v[0-9]+|rest|graphql|auth)(?:\/[a-zA-Z0-9_\-.:{}$]+)*)['"`]/gi;
  for (const match of content.matchAll(apiUrlPattern)) {
    const rawPath = match[1];
    if (isValidApiPath(rawPath)) {
      const normalizedPath = normalizeApiPath(rawPath);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        const key = `GET ${normalizedPath}`;
        if (!seenEndpoints.has(key)) {
          seenEndpoints.add(key);
          endpoints.push({
            method: 'GET',
            path: normalizedPath,
            rawPath,
            source: 'crawl',
            confidence: 'auto-discovered',
            tags: ['reverse-engineered', 'bundle-extract'],
            authRequired: isLikelyAuthenticated(normalizedPath),
          });
        }
      }
    }
  }

  // 4. Match Client-side routing definitions (React Router, Vue Router, Next.js page paths)
  // e.g. path: "/dashboard", <Route path="/orders/:id"
  const routePattern = /(?:path\s*:\s*|<Route[^>]*\bpath\s*=\s*)['"`](\/[a-zA-Z0-9_\-.:/]+)['"`]/gi;
  for (const match of content.matchAll(routePattern)) {
    const routePath = match[1];
    if (
      routePath.length > 1 &&
      !routePath.startsWith('/api') &&
      !routePath.startsWith('/static') &&
      !routePath.startsWith('/assets')
    ) {
      const sanitized = routePath.replace(/\/:[a-zA-Z0-9_]+/g, '');
      if (sanitized && sanitized !== '/') {
        clientRoutes.add(sanitized);
      }
    }
  }

  return {
    endpoints,
    clientRoutes: [...clientRoutes],
  };
}

function isValidApiPath(path: string): boolean {
  if (!path || !path.startsWith('/')) return false;
  if (path.length < 3 || path.length > 150) return false;
  // Ignore static assets
  if (/\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?|ico|map|json|html)$/i.test(path)) return false;
  return true;
}

function normalizeApiPath(path: string): string {
  let p = path.split('?')[0];
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

function isLikelyAuthenticated(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('/admin') ||
    lower.includes('/dashboard') ||
    lower.includes('/user') ||
    lower.includes('/account') ||
    lower.includes('/secure') ||
    lower.includes('/orders') ||
    lower.includes('/profile') ||
    lower.includes('/me')
  );
}
