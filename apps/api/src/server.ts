import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { parseAuthHeader, hasMinimumRole } from './auth.js';
import { defaultEventStream } from './events.js';
import { defaultRunManager, type RunManager } from './runs.js';
import { defaultRegistry } from '@nexus/registry';
import { renderPortalHtml, createInitialState } from '@nexus/web';
import { RunStore } from '@nexus/core';
import { extractDatabaseSchema } from '@nexus/discover';
import { buildFullStackLineage, type AppMap } from '@nexus/app-map';

export interface ServerOptions {
  port?: number;
  host?: string;
  runManager?: RunManager;
  webDistDir?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Role, X-User-Email',
  });
  res.end(json);
}

function sendError(res: ServerResponse, status: number, message: string, details?: unknown): void {
  sendJson(res, status, { error: message, ...(details ? { details } : {}) });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 5 * 1024 * 1024) {
      req.destroy();
      reject(new Error('Payload too large (max 5MB)'));
    }
  });
  req.on('end', () => {
    if (!body.trim()) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(body));
    } catch (err) {
      reject(new Error(`Malformed JSON body: ${(err as Error).message}`));
    }
  });
  req.on('error', reject);
  return promise;
}

export function createApiServer(options: ServerOptions = {}): Server {
  const manager = options.runManager ?? defaultRunManager;
  const webDist = options.webDistDir ?? join(manager.getRootDir(), 'apps/web/dist');

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Role, X-User-Email',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    const user = parseAuthHeader(req.headers as Record<string, string | string[] | undefined>);

    try {
      // 1. Health check
      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
          user,
        });
        return;
      }

      // 2. Registry definitions
      if (method === 'GET' && pathname === '/api/registry') {
        sendJson(res, 200, {
          types: defaultRegistry.list(),
        });
        return;
      }

      // 3. Dry run estimation
      if (method === 'POST' && pathname === '/api/runs/dry-run') {
        const body = await readJsonBody(req);
        const estimate = manager.estimateDryRun(body);
        sendJson(res, estimate.valid ? 200 : 400, estimate);
        return;
      }

      // 4. Create Run
      if (method === 'POST' && pathname === '/api/runs') {
        if (!hasMinimumRole(user.role, 'runner')) {
          sendError(res, 403, 'Permission denied: runner role required to create runs');
          return;
        }
        const body = await readJsonBody(req);
        try {
          const run = await manager.createRun(body, user);
          sendJson(res, 201, run);
        } catch (err) {
          sendError(res, 400, (err as Error).message);
        }
        return;
      }

      // 5. List Runs
      if (method === 'GET' && pathname === '/api/runs') {
        const runs = manager.listRuns();
        sendJson(res, 200, { runs });
        return;
      }

      // 6. Get Specific Run or Sub-resources (/api/runs/:id/...)
      const runMatch = pathname.match(/^\/api\/runs\/([A-Za-z0-9._-]+)(?:\/(.*))?$/);
      if (runMatch) {
        const runId = runMatch[1];
        const subAction = runMatch[2];

        // 6a. Server-Sent Events stream: /api/runs/:id/events
        if (subAction === 'events' && method === 'GET') {
          defaultEventStream.subscribe(runId, res);
          return;
        }

        // 6b. Plan approval: POST /api/runs/:id/plan/approve
        if (subAction === 'plan/approve' && method === 'POST') {
          if (!hasMinimumRole(user.role, 'approver') && !hasMinimumRole(user.role, 'runner')) {
            sendError(res, 403, 'Permission denied: role insufficient to approve plan');
            return;
          }
          const body = (await readJsonBody(req)) as { approvedCaseIds?: string[] };
          try {
            const approved = await manager.approvePlan(runId, body.approvedCaseIds ?? [], user);
            sendJson(res, 200, approved);
          } catch (err) {
            sendError(res, 400, (err as Error).message);
          }
          return;
        }

        // 6c. Stop run: POST /api/runs/:id/stop
        if (subAction === 'stop' && method === 'POST') {
          try {
            const stopped = manager.stopRun(runId);
            sendJson(res, 200, stopped);
          } catch (err) {
            sendError(res, 400, (err as Error).message);
          }
          return;
        }

        // 6d. Bundle download: GET /api/runs/:id/bundle
        if (subAction === 'bundle' && method === 'GET') {
          const bundlePath = manager.getBundlePath(runId);
          if (!bundlePath) {
            sendError(res, 404, `Bundle for run "${runId}" not found or run still in progress`);
            return;
          }
          const stat = statSync(bundlePath);
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="qa-${runId}.zip"`,
            'Access-Control-Allow-Origin': '*',
          });
          createReadStream(bundlePath).pipe(res);
          return;
        }

        // 6e. Document download/view: GET /api/runs/:id/docs/:name
        if (subAction && subAction.startsWith('docs/') && method === 'GET') {
          const docName = subAction.replace(/^docs\//, '');
          const doc = manager.getDocContent(runId, docName);
          if (!doc) {
            sendError(res, 404, `Document "${docName}" not found for run "${runId}"`);
            return;
          }
          res.writeHead(200, {
            'Content-Type': doc.contentType,
            'Content-Length': doc.content.length,
            'Access-Control-Allow-Origin': '*',
          });
          res.end(doc.content);
          return;
        }

        // 6f. Single Run Detail: GET /api/runs/:id
        if (!subAction && method === 'GET') {
          const run = manager.getRun(runId);
          if (!run) {
            sendError(res, 404, `Run "${runId}" not found`);
            return;
          }
          sendJson(res, 200, run);
          return;
        }
        // 6g. Run lineage: GET /api/runs/:id/lineage
        if (subAction === 'lineage' && method === 'GET') {
          const run = manager.getRun(runId);
          const rootDir = manager.getRootDir();
          const dbSchema = extractDatabaseSchema(rootDir);
          const summary = run?.summary ?? RunStore.readSummaryById(rootDir, runId);
          const appMap: AppMap = {
            schemaVersion: '1.0',
            generatedAt: new Date().toISOString(),
            nodes: [
              { id: 'page:/', type: 'page', path: '/', forms: 0, sources: ['crawl'], changedRecently: false, risk: 0.1, riskFactors: [] },
              { id: 'endpoint:GET /health', type: 'endpoint', path: '/health', method: 'GET', sources: ['spec'], changedRecently: false, risk: 0.1, riskFactors: [], authRequired: false },
              { id: 'endpoint:GET /api/todos', type: 'endpoint', path: '/api/todos', method: 'GET', sources: ['spec'], changedRecently: false, risk: 0.2, riskFactors: [], authRequired: false },
            ],
            edges: [],
            stats: { pages: 1, endpoints: 2, code: 0, edges: 0, highRisk: 0, changed: 0 },
          };
          const topology = buildFullStackLineage({
            appMap,
            dbSchema,
            findings: summary?.findings ?? [],
          });
          sendJson(res, 200, topology);
          return;
        }

      }

      // 7. Scenario suggestions: POST /api/suggest/:type
      const suggestMatch = pathname.match(/^\/api\/suggest\/([A-Za-z0-9._-]+)$/);
      if (suggestMatch && method === 'POST') {
        const type = suggestMatch[1];
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        const suggestions = defaultRegistry.suggestScenarios(type, {
          targetUrl: typeof body.url === 'string' ? body.url : undefined,
          endpoints: Array.isArray(body.endpoints) ? body.endpoints : undefined,
          pages: Array.isArray(body.pages) ? body.pages : undefined,
        });
        sendJson(res, 200, { suggestions });
        return;
      }

      // 8. Row import: POST /api/import/:type
      const importMatch = pathname.match(/^\/api\/import\/([A-Za-z0-9._-]+)$/);
      if (importMatch && method === 'POST') {
        const type = importMatch[1];
        const body = (await readJsonBody(req)) as { rows?: Array<Record<string, unknown>> };
        const rows = body.rows ?? [];
        const validation = defaultRegistry.validateTestRows(type, rows);
        sendJson(res, validation.valid ? 200 : 400, {
          valid: validation.valid,
          rowsCount: rows.length,
          errors: validation.errors,
        });
        return;
      }
      // 8b. Global Lineage & Topology: GET /api/lineage
      if (pathname === '/api/lineage' && method === 'GET') {
        const rootDir = manager.getRootDir();
        const dbSchema = extractDatabaseSchema(rootDir);
        const defaultAppMap: AppMap = {
          schemaVersion: '1.0',
          generatedAt: new Date().toISOString(),
          nodes: [
            { id: 'page:/', type: 'page', path: '/', forms: 0, sources: ['crawl'], changedRecently: false, risk: 0.1, riskFactors: [] },
            { id: 'endpoint:GET /health', type: 'endpoint', path: '/health', method: 'GET', sources: ['spec'], changedRecently: false, risk: 0.1, riskFactors: [], authRequired: false },
            { id: 'endpoint:GET /api/todos', type: 'endpoint', path: '/api/todos', method: 'GET', sources: ['spec'], changedRecently: false, risk: 0.2, riskFactors: [], authRequired: false },
            { id: 'endpoint:POST /api/todos', type: 'endpoint', path: '/api/todos', method: 'POST', sources: ['spec'], changedRecently: true, risk: 0.5, riskFactors: [], authRequired: false },
          ],
          edges: [
            { from: 'page:/', to: 'endpoint:GET /health', kind: 'calls', confidence: 'verified' },
            { from: 'page:/', to: 'endpoint:GET /api/todos', kind: 'calls', confidence: 'verified' },
          ],
          stats: { pages: 1, endpoints: 3, code: 0, edges: 2, highRisk: 0, changed: 1 },
        };
        const topology = buildFullStackLineage({ appMap: defaultAppMap, dbSchema });
        sendJson(res, 200, topology);
        return;
      }


      // 9. Web App & Static serving
      if (method === 'GET' || method === 'HEAD') {
        if (pathname === '/' || pathname === '/index.html') {
          const stepParam = Number(url.searchParams.get('step') || 1);
          const langParam = url.searchParams.get('lang');
          const state = createInitialState();
          state.language = langParam === 'en' ? 'en' : 'id';
          state.furthestStep = 5;
          if (stepParam >= 1 && stepParam <= 5) {
            state.currentStep = stepParam as 1 | 2 | 3 | 4 | 5;
          }
          if (state.currentStep === 3) {
            const plan = manager.buildPlanCases({
              name: 'Sample Plan',
              mode: 'sandbox',
              repo: { localPath: 'fixtures/sample-todo-api' },
              web: { urls: ['http://127.0.0.1:3100/'] },
            });
            state.planCases = plan.cases;
            state.approvedCaseIds = new Set(plan.cases.filter((c) => c.approved).map((c) => c.id));
          } else if (state.currentStep === 4) {
            state.runId = '2026-10-28T00-00-00-000Z_sample';
            state.stages = {
              preflight: 'ok',
              discover: 'ok',
              'app-map': 'running',
              lanes: 'pending',
              correlate: 'pending',
              document: 'pending',
            };
            state.requestsCount = 28;
            state.liveLogs = [
              'Stage preflight: ok (45ms)',
              'Stage discover: ok (320ms) - 2 pages, 3 endpoints found',
              'Stage app-map: running (inferred 4 edges)',
            ];
          } else if (state.currentStep === 5) {
            state.gate = 'GO WITH RISKS';
            state.gateReasons = [
              'Coverage kebutuhan 0.0% (di bawah batas minimum 80%)',
              '3 kasus pengujian dilewati pada repositori statis',
              '2 temuan tergolong needs-review',
            ];
            state.findings = [
              {
                id: 'F-0001',
                title: 'Missing Content-Security-Policy HTTP header',
                severity: 'high',
                confidence: 'auto-discovered',
                category: 'security',
                lanes: ['security'],
                occurrences: 1,
                evidence: [],
                status: 'new',
                evidenceSummary: 'Header CSP tidak terdeteksi pada response root /',
              },
              {
                id: 'F-0002',
                title: 'Elemen formulir belum memiliki label aksesibilitas',
                severity: 'medium',
                confidence: 'verified',
                category: 'accessibility',
                lanes: ['a11y'],
                occurrences: 1,
                evidence: [],
                status: 'new',
                evidenceSummary: 'WCAG 2.1 AA 4.1.2: Name, Role, Value',
              },
            ];
          }
          const html = renderPortalHtml(state);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html),
            'Access-Control-Allow-Origin': '*',
          });
          if (method === 'HEAD') res.end();
          else res.end(html);
          return;
        }

        const safePath = pathname.replace(/^\//, '');
        const targetFile = join(webDist, safePath);
        if (existsSync(targetFile) && statSync(targetFile).isFile()) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          if (method === 'HEAD') res.end();
          else createReadStream(targetFile).pipe(res);
          return;
        }
      }
      sendError(res, 404, `Endpoint not found: ${method} ${pathname}`);
    } catch (err) {
      sendError(res, 500, `Internal Server Error: ${(err as Error).message}`);
    }
  });

  return server;
}
