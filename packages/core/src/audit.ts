import { randomUUID } from 'node:crypto';
import type { AuditRecord, Authorization, RunMode } from './types.js';

export function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}_${randomUUID().slice(0, 8)}`;
}

export function newAuditRecord(
  requestedBy: string,
  mode: RunMode,
  targets: string[],
  authorization?: Authorization,
): AuditRecord {
  return {
    runId: createRunId(),
    requestedBy,
    mode,
    targets,
    authorization,
    startedAt: new Date().toISOString(),
    requestCount: 0,
  };
}

export function finishAudit(audit: AuditRecord, reason?: string): AuditRecord {
  return {
    ...audit,
    finishedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
}
