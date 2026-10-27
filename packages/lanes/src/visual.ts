import type { SessionResult } from '@nexus/session';
import type { LaneContext, LaneResult } from './types.js';

export function runVisualLane(
  _context: LaneContext,
  session: SessionResult | undefined,
): LaneResult {
  return {
    lane: 'visual',
    status: 'skipped',
    tests: [],
    findings: [],
    reason: session ? 'screenshots captured; baseline comparison is Phase 8' : 'no browser session',
    durationMs: 0,
  };
}
