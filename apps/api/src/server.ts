import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { parseAuthHeader, hasMinimumRole } from './auth.js';
import { defaultEventStream } from './events.js';
import { defaultRunManager, type RunManager } from './runs.js';
import { defaultRegistry } from '@nexus/registry';
import { renderPortalHtml, createInitialState } from '@nexus/web';
import { RunStore, sendWebhookPayload } from '@nexus/core';
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

const defaultAppMap: AppMap = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'page:/',
      type: 'page',
      path: '/',
      forms: 0,
      sources: ['crawl'],
      changedRecently: false,
      risk: 0.1,
      riskFactors: [],
    },
    {
      id: 'endpoint:GET /health',
      type: 'endpoint',
      path: '/health',
      method: 'GET',
      sources: ['spec'],
      changedRecently: false,
      risk: 0.1,
      riskFactors: [],
      authRequired: false,
    },
    {
      id: 'endpoint:GET /api/todos',
      type: 'endpoint',
      path: '/api/todos',
      method: 'GET',
      sources: ['spec'],
      changedRecently: false,
      risk: 0.2,
      riskFactors: [],
      authRequired: false,
    },
    {
      id: 'endpoint:POST /api/todos',
      type: 'endpoint',
      path: '/api/todos',
      method: 'POST',
      sources: ['spec'],
      changedRecently: true,
      risk: 0.5,
      riskFactors: [],
      authRequired: false,
    },
  ],
  edges: [
    { from: 'page:/', to: 'endpoint:GET /health', kind: 'calls', confidence: 'verified' },
    { from: 'page:/', to: 'endpoint:GET /api/todos', kind: 'calls', confidence: 'verified' },
  ],
  stats: { pages: 1, endpoints: 3, code: 0, edges: 2, highRisk: 0, changed: 1 },
};

function loadAppMapForRun(rootDir: string, runId: string | undefined): AppMap | undefined {
  if (!runId) return undefined;
  const possiblePaths = [
    join(rootDir, 'artifacts', 'runs', runId, 'app-map.json'),
    join(rootDir, 'runs', runId, 'app-map.json'),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8')) as AppMap;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
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
      // 3b. Plan preview
      if (method === 'POST' && pathname === '/api/runs/plan-preview') {
        const body = await readJsonBody(req);
        try {
          const plan = manager.buildPlanCases(body);
          sendJson(res, 200, plan);
        } catch (err) {
          sendError(res, 400, (err as Error).message);
        }
        return;
      }

      // 3c. Git Webhook Ingestion: POST /api/webhooks/git & POST /api/webhooks/github
      if (
        method === 'POST' &&
        (pathname === '/api/webhooks/git' || pathname === '/api/webhooks/github')
      ) {
        const body = (await readJsonBody(req)) as Record<string, any>;
        const ref =
          body.ref || (body.pull_request ? body.pull_request.head?.ref : 'main') || 'main';
        const branch = String(ref).replace(/^refs\/heads\//, '');
        const commit = body.after || (body.head_commit ? body.head_commit.id : '') || 'c23db59';
        const repoUrl = body.repository?.clone_url || body.repository?.html_url || body.repo;
        const sender = body.sender?.login || body.pusher?.name || 'git-webhook';
        const action = body.action || (body.commits ? 'push' : 'webhook');

        const runPayload = {
          name: `Git Webhook [${action}]: ${branch}@${commit ? String(commit).slice(0, 7) : 'head'}`,
          mode: 'sandbox',
          repo: repoUrl ? { url: repoUrl } : { localPath: 'fixtures/sample-todo-api' },
          web: { urls: ['http://127.0.0.1:3100'] },
          authorization: {
            ownerConfirmed: true,
            approvedBy: sender,
          },
        };

        try {
          const run = await manager.createRun(runPayload, {
            id: `webhook:${sender}`,
            email: `webhook-${sender}@nexus.local`,
            role: 'runner',
          });
          sendJson(res, 202, {
            ok: true,
            runId: run.id,
            status: run.status,
            branch,
            commit: commit ? String(commit).slice(0, 7) : undefined,
            message: `Automated QA pipeline triggered by ${sender} on ${branch}`,
          });
        } catch (err) {
          sendError(res, 400, (err as Error).message);
        }
        return;
      }

      // 3d. Test Notification Dispatch: POST /api/notify/test
      if (method === 'POST' && pathname === '/api/notify/test') {
        const body = (await readJsonBody(req)) as {
          channel?: 'slack' | 'teams' | 'generic';
          webhookUrl?: string;
          message?: string;
        };

        const channel = body.channel ?? 'slack';
        const webhookUrl = body.webhookUrl;

        if (!webhookUrl) {
          sendError(res, 400, 'Missing webhookUrl in request body');
          return;
        }

        const payload =
          channel === 'slack'
            ? {
                text:
                  body.message || '🔔 [Test Alert] Nexus-Portal notification delivery verified!',
                attachments: [
                  {
                    color: '#238636',
                    title: 'Nexus-Portal Real-Time Alert System',
                    text: 'Webhook connection established and operational.',
                  },
                ],
              }
            : channel === 'teams'
              ? {
                  '@type': 'MessageCard',
                  '@context': 'https://schema.org/extensions',
                  themeColor: '238636',
                  summary: 'Nexus-Portal Test Alert',
                  sections: [
                    {
                      activityTitle: 'Nexus-Portal Real-Time Alert System',
                      activitySubtitle: body.message || 'Webhook connection verified',
                    },
                  ],
                }
              : {
                  event: 'test.alert',
                  message: body.message || 'Nexus-Portal test notification',
                  timestamp: new Date().toISOString(),
                };

        const dispatchResult = await sendWebhookPayload(webhookUrl, payload, channel);
        sendJson(res, dispatchResult.success ? 200 : 502, dispatchResult);
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
          const appMap = loadAppMapForRun(rootDir, runId) ?? defaultAppMap;
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

        const topology = buildFullStackLineage({ appMap: defaultAppMap, dbSchema });
        sendJson(res, 200, topology);
        return;
      }

      // 9. Web App & Static serving
      if (method === 'GET' || method === 'HEAD') {
        if (pathname === '/' || pathname === '/index.html') {
          const stepQuery = url.searchParams.get('step');
          const langParam = url.searchParams.get('lang');
          const rootDir = manager.getRootDir();
          const latestId = RunStore.latestRunId(rootDir);
          let targetRunId = url.searchParams.get('runId') || latestId;
          let realSummary = targetRunId
            ? RunStore.readSummaryById(rootDir, targetRunId)
            : undefined;

          if (
            (!realSummary ||
              realSummary.run.status !== 'complete' ||
              realSummary.findings.length === 0) &&
            latestId &&
            latestId !== targetRunId
          ) {
            const latestSummary = RunStore.readSummaryById(rootDir, latestId);
            if (
              latestSummary &&
              latestSummary.run.status === 'complete' &&
              latestSummary.findings.length > 0
            ) {
              targetRunId = latestId;
              realSummary = latestSummary;
            }
          }
          const state = createInitialState();
          state.language = langParam === 'en' ? 'en' : 'id';
          state.furthestStep = 6;

          if (realSummary) {
            state.runId = targetRunId;
            state.gate = realSummary.gate.decision;
            state.gateReasons = realSummary.gate.reasons;
            state.findings = realSummary.findings;
            state.webUrls =
              realSummary.environment?.baseUrl ?? 'https://mobospace-sandbox.pancaran-group.co.id/';
            state.requestsCount = realSummary.totals.tests;

            if (realSummary.stages) {
              const stageKeyMap: Record<string, string> = {
                preflight: 'preflight',
                discover: 'discover',
                model: 'app-map',
                execute: 'lanes',
                correlate: 'correlate',
                document: 'document',
              };

              const mappedStages: Record<
                string,
                'pending' | 'running' | 'ok' | 'failed' | 'skipped'
              > = {
                preflight: 'pending',
                discover: 'pending',
                'app-map': 'pending',
                lanes: 'pending',
                correlate: 'pending',
                document: 'pending',
              };
              const mappedDurations: Record<string, number> = {};
              const formatTime = (iso?: string) => {
                if (!iso) return new Date().toLocaleTimeString();
                try {
                  return new Date(iso).toLocaleTimeString();
                } catch {
                  return iso;
                }
              };

              const logs: string[] = [
                `[${formatTime(realSummary.run.startedAt)}] [RUN] Inisialisasi pipeline untuk target: ${state.webUrls}`,
                `[${formatTime(realSummary.run.startedAt)}] [RUN] Run ID: ${targetRunId} | Mode: ${realSummary.run.mode.toUpperCase()}`,
                `[${formatTime(realSummary.run.startedAt)}] [STATUS] Memulai eksekusi stage pipeline...`,
              ];

              for (const [stKey, stSummary] of Object.entries(realSummary.stages)) {
                const targetKey = stageKeyMap[stKey] ?? stKey;
                if (targetKey in mappedStages) {
                  mappedStages[targetKey] = stSummary.status;
                }
                mappedDurations[targetKey] = stSummary.durationMs;
                const timeStr = formatTime(stSummary.finishedAt || stSummary.startedAt);
                logs.push(
                  `[${timeStr}] [STAGE] Stage [${targetKey}]: ${stSummary.status.toUpperCase()} (${stSummary.durationMs}ms)`,
                );
              }

              logs.push(
                `[${formatTime(realSummary.run.finishedAt)}] [COMPLETE] Pipeline selesai dengan Keputusan Gate: ${realSummary.gate.decision} (Total durasi: ${realSummary.run.durationMs}ms)`,
              );

              state.stages = mappedStages;
              state.stageDurations = mappedDurations;
              state.liveLogs = logs;
              state.lanes = realSummary.lanes as unknown as typeof state.lanes;
            }

            const appMap = loadAppMapForRun(rootDir, targetRunId) ?? defaultAppMap;
            const dbSchema = extractDatabaseSchema(rootDir);
            state.topology = buildFullStackLineage({
              appMap,
              dbSchema,
              findings: realSummary.findings ?? [],
            });
          } else {
            const dbSchema = extractDatabaseSchema(rootDir);
            state.topology = buildFullStackLineage({
              appMap: defaultAppMap,
              dbSchema,
              findings: [],
            });
          }
          // Default to Step 5 (Results) if a real run is loaded, otherwise respect ?step=
          if (stepQuery) {
            const s = Number(stepQuery);
            if (s >= 1 && s <= 6) state.currentStep = s as 1 | 2 | 3 | 4 | 5 | 6;
          } else if (realSummary) {
            state.currentStep = 5;
          }

          try {
            const plan = manager.buildPlanCases({
              name: state.name || 'Sample Plan',
              mode: state.mode || 'staging',
              repo: state.repoUrl
                ? { localPath: state.repoUrl }
                : { localPath: 'fixtures/sample-todo-api' },
              web: { urls: [state.webUrls || 'https://mobospace-sandbox.pancaran-group.co.id/'] },
              authorization: {
                ownerConfirmed: true,
                approvedBy: state.approvedBy || 'approver@company.local',
              },
              testRows: state.testRows,
            });
            state.planCases = plan.cases;
            state.approvedCaseIds = new Set(plan.cases.filter((c) => c.approved).map((c) => c.id));
          } catch {
            // fallback if build fails
          }
          if (state.currentStep === 4 && !realSummary) {
            state.stages = {
              preflight: 'pending',
              discover: 'pending',
              'app-map': 'pending',
              lanes: 'pending',
              correlate: 'pending',
              document: 'pending',
            };
            state.liveLogs = [
              `[${new Date().toLocaleTimeString()}] [STATUS] Menunggu eksekusi pipeline dimulai...`,
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
