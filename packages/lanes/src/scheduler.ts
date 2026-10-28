import { join } from 'node:path';
import { resolveHost } from '@nexus/core';
import { resolveAuth } from '@nexus/discover';
import { parseCookieString, runInstrumentedSession, type SessionResult } from '@nexus/session';
import { runA11yLane } from './a11y.js';
import { runApiLane } from './api.js';
import { runE2eLane } from './e2e.js';
import { runPerfLane } from './perf.js';
import { runRepoLane } from './repo.js';
import { runSecurityLane } from './security.js';
import { runVisualLane } from './visual.js';
import type { LaneContext, LaneName, LaneResult, LaneRunResult } from './types.js';

function errorLane(lane: LaneName, error: unknown, startedAt: number): LaneResult {
  return {
    lane,
    status: 'error',
    tests: [],
    findings: [],
    reason: (error as Error).message,
    durationMs: Date.now() - startedAt,
  };
}

function skippedLane(lane: LaneName, reason: string): LaneResult {
  return { lane, status: 'skipped', tests: [], findings: [], reason, durationMs: 0 };
}

function sessionTargets(context: LaneContext) {
  const seen = new Set<string>();
  const targets = context.discovery.pages
    .map((page) => ({ url: page.url, path: page.path }))
    .filter((target) => {
      if (seen.has(target.url)) return false;
      seen.add(target.url);
      return true;
    });
  if (targets.length > 0) return targets;
  return (context.request.web?.urls ?? []).map((url) => {
    const parsed = new URL(url);
    return { url, path: parsed.pathname };
  });
}

function aggregateTests(lanes: LaneResult[]): LaneRunResult['totals'] {
  const tests = lanes.flatMap((lane) => lane.tests);
  return {
    tests: tests.length,
    passed: tests.filter((test) => test.status === 'passed').length,
    failed: tests.filter((test) => test.status === 'failed').length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    lanes: lanes.map((lane) => lane.lane),
  };
}

export async function runLanes(context: LaneContext, selected: LaneName[]): Promise<LaneRunResult> {
  const warnings: string[] = [];
  const selectedSet = new Set(selected);
  const needsSession =
    selectedSet.has('e2e') ||
    selectedSet.has('a11y') ||
    selectedSet.has('security') ||
    selectedSet.has('perf') ||
    selectedSet.has('visual');
  const targets = needsSession ? sessionTargets(context) : [];

  const auth = resolveAuth(context.request.auth?.ref, context.env ?? process.env);
  const firstTarget = targets[0]?.url;
  const authHost = firstTarget ? resolveHost(firstTarget) || undefined : undefined;

  const sessionPromise: Promise<SessionResult | undefined> = (() => {
    if (context.session) return Promise.resolve(context.session);
    if (!needsSession || targets.length === 0) return Promise.resolve(undefined);
    const authConfig = context.request.auth;
    const isInteractive = Boolean(authConfig?.interactive || authConfig?.roles?.includes('guided-login'));
    let cookieList: Array<{ name: string; value: string; domain?: string; path?: string }> | undefined;
    if (authConfig?.cookies && firstTarget) {
      const host = resolveHost(firstTarget);
      cookieList = parseCookieString(authConfig.cookies, host);
    }
    return runInstrumentedSession({
      pages: targets,
      allowlist: context.config.allowlist,
      artifactDir: join(context.runDir, 'evidence', 'session'),
      authHeaders: auth.headers,
      authHost,
      headless: !isInteractive,
      interactiveLogin: isInteractive,
      cookies: cookieList,
      maxPages: context.scope === 'quick' ? 5 : context.scope === 'standard' ? 20 : 50,
    });
  })();

  const apiPromise = selectedSet.has('api')
    ? runApiLane(context).catch((error) => errorLane('api', error, Date.now()))
    : Promise.resolve(undefined);

  const [sessionOutcome, api] = await Promise.all([
    sessionPromise
      .then((session) => ({ session }))
      .catch((error: unknown) => {
        warnings.push(`browser session failed: ${(error as Error).message}`);
        return { error };
      }),
    apiPromise,
  ]);

  const session = 'session' in sessionOutcome ? sessionOutcome.session : undefined;
  const sessionError = 'error' in sessionOutcome ? sessionOutcome.error : undefined;

  const laneResults: LaneResult[] = [];

  if (selectedSet.has('repo')) {
    try {
      laneResults.push(runRepoLane(context, context.discovery.repo));
    } catch (error) {
      laneResults.push(errorLane('repo', error, Date.now()));
    }
  }

  if (api) laneResults.push(api);

  for (const lane of ['e2e', 'a11y', 'perf', 'security'] as const) {
    if (!selectedSet.has(lane)) continue;
    try {
      if (sessionError) {
        laneResults.push(errorLane(lane, sessionError, Date.now()));
        continue;
      }
      if (lane === 'e2e') laneResults.push(runE2eLane(context, session));
      if (lane === 'a11y') laneResults.push(runA11yLane(context, session));
      if (lane === 'perf') laneResults.push(runPerfLane(context, session));
      if (lane === 'security') laneResults.push(runSecurityLane(context, session));
    } catch (error) {
      laneResults.push(errorLane(lane, error, Date.now()));
    }
  }

  if (selectedSet.has('visual')) {
    laneResults.push(runVisualLane(context, session));
  }

  for (const lane of selected) {
    if (!laneResults.some((result) => result.lane === lane)) {
      laneResults.push(
        skippedLane(lane, 'lane did not produce a result (missing input or unsupported)'),
      );
    }
  }

  let findingIndex = 0;
  for (const lane of laneResults) {
    lane.findings = lane.findings.map((finding) => {
      findingIndex += 1;
      return { ...finding, id: `F-${String(findingIndex).padStart(4, '0')}` };
    });
  }
  const findings = laneResults.flatMap((lane) => lane.findings);
  return {
    lanes: laneResults,
    findings,
    ...(session ? { session } : {}),
    totals: aggregateTests(laneResults),
    warnings,
  };
}
