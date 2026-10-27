import type { RunRequest } from '@nexus/core';
import type { DiscoveryResult } from '@nexus/discover';
import { LANE_NAMES, type LaneName, type LanePlan } from './types.js';

export function planLanes(request: RunRequest, discovery: DiscoveryResult): LanePlan {
  const hasWeb = Boolean(request.web?.urls.length);
  const hasRepo = Boolean(request.repo);
  const hasApi =
    Boolean(request.api?.baseUrl || request.api?.specUrl) ||
    discovery.endpoints.some(
      (endpoint) => endpoint.method === 'GET' && !endpoint.path.includes(':'),
    );
  const explicit =
    request.lanes && Object.keys(request.lanes).length > 0 ? request.lanes : undefined;
  const lanes: LaneName[] = [];
  const reasons: string[] = [];

  for (const lane of LANE_NAMES) {
    let enabled: boolean;
    if (explicit) {
      enabled = explicit[lane] === true;
    } else {
      enabled =
        (lane === 'repo' && hasRepo) ||
        (lane === 'api' && hasApi) ||
        (lane === 'e2e' && hasWeb) ||
        (lane === 'a11y' && hasWeb) ||
        (lane === 'security' && hasWeb) ||
        (lane === 'perf' && hasWeb) ||
        false;
    }
    if (enabled) lanes.push(lane);
  }

  const unsupported = lanes.filter((lane) => lane === 'visual');
  const supported = lanes.filter((lane) => lane !== 'visual');

  if (!hasRepo && supported.includes('repo')) reasons.push('repo lane has no repository');
  if (!hasWeb && supported.some((lane) => ['e2e', 'a11y', 'security', 'perf'].includes(lane))) {
    reasons.push('browser lanes have no web target');
  }
  if (supported.includes('api') && !hasApi) {
    reasons.push('api lane has no API base URL or spec');
  }
  if (discovery.pages.length === 0 && hasWeb) {
    reasons.push('no crawled pages; browser lanes will be skipped');
  }

  return { lanes: supported, unsupported, reasons };
}
