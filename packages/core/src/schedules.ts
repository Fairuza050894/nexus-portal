import type { RunRequest } from './types.js';

export interface RenewableAuthorization {
  approvedBy: string;
  grantedAt: string;
  expiresAt: string;
  renewableDays: number;
}

export interface SavedRunRequest {
  id: string;
  name: string;
  environment: string;
  cronSchedule?: string;
  request: RunRequest;
  renewableAuth?: RenewableAuthorization;
  createdAt: string;
  updatedAt: string;
}

export function createRenewableAuthorization(
  approvedBy: string,
  renewableDays: number = 30,
  grantedAt: Date = new Date(),
): RenewableAuthorization {
  if (!approvedBy || approvedBy.trim().length === 0) {
    throw new Error('Renewable authorization requires a valid approver (approvedBy)');
  }
  const grantedMs = grantedAt.getTime();
  const expiresMs = grantedMs + renewableDays * 24 * 60 * 60 * 1000;

  return {
    approvedBy: approvedBy.trim(),
    grantedAt: new Date(grantedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    renewableDays,
  };
}

export function createSavedRunRequest(options: {
  id: string;
  name: string;
  environment: string;
  request: RunRequest;
  cronSchedule?: string;
  approver?: string;
  renewableDays?: number;
}): SavedRunRequest {
  const now = new Date().toISOString();
  const renewableAuth = options.approver
    ? createRenewableAuthorization(options.approver, options.renewableDays ?? 30)
    : undefined;

  return {
    id: options.id,
    name: options.name,
    environment: options.environment,
    cronSchedule: options.cronSchedule,
    request: options.request,
    renewableAuth,
    createdAt: now,
    updatedAt: now,
  };
}

export function renewAuthorization(
  savedRequest: SavedRunRequest,
  approvedBy: string,
  renewableDays: number = 30,
  now: Date = new Date(),
): SavedRunRequest {
  const renewableAuth = createRenewableAuthorization(approvedBy, renewableDays, now);
  return {
    ...savedRequest,
    renewableAuth,
    updatedAt: now.toISOString(),
  };
}

export function isAuthorizationExpired(
  savedRequest: SavedRunRequest,
  now: Date = new Date(),
): boolean {
  if (!savedRequest.renewableAuth) {
    // If request mode requires authorization, missing auth counts as expired/absent
    return savedRequest.request.mode !== 'sandbox';
  }
  const expiresMs = new Date(savedRequest.renewableAuth.expiresAt).getTime();
  return now.getTime() >= expiresMs;
}

export function validateScheduledRun(
  savedRequest: SavedRunRequest,
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  // Mode sandbox does not require renewable authorization
  if (savedRequest.request.mode === 'sandbox') {
    return { ok: true };
  }

  if (!savedRequest.renewableAuth) {
    return {
      ok: false,
      reason: `Scheduled run "${savedRequest.name}" in mode "${savedRequest.request.mode}" requires renewable authorization signed by an approver.`,
    };
  }

  if (isAuthorizationExpired(savedRequest, now)) {
    return {
      ok: false,
      reason: `Scheduled run "${savedRequest.name}" blocked: authorization expired on ${savedRequest.renewableAuth.expiresAt}. An approver must renew authorization before this schedule can execute.`,
    };
  }

  return { ok: true };
}

export interface EnvironmentLock {
  environment: string;
  runId: string;
  acquiredAt: string;
  expiresAt: number;
}

export class EnvironmentLockManager {
  private readonly locks = new Map<string, EnvironmentLock>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 60 * 60 * 1000) {
    // 1 hour default TTL
    this.defaultTtlMs = defaultTtlMs;
  }

  acquireLock(environment: string, runId: string, ttlMs?: number): boolean {
    const envKey = environment.toLowerCase().trim();
    const now = Date.now();
    const existing = this.locks.get(envKey);

    if (existing && existing.expiresAt > now) {
      if (existing.runId === runId) {
        // Re-entrant lock for same run
        existing.expiresAt = now + (ttlMs ?? this.defaultTtlMs);
        return true;
      }
      return false; // Locked by another run
    }

    this.locks.set(envKey, {
      environment: envKey,
      runId,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
    });
    return true;
  }

  releaseLock(environment: string, runId: string): boolean {
    const envKey = environment.toLowerCase().trim();
    const existing = this.locks.get(envKey);

    if (existing && existing.runId === runId) {
      this.locks.delete(envKey);
      return true;
    }
    return false;
  }

  isLocked(environment: string): boolean {
    const envKey = environment.toLowerCase().trim();
    const existing = this.locks.get(envKey);
    if (!existing) return false;

    if (existing.expiresAt <= Date.now()) {
      this.locks.delete(envKey);
      return false;
    }
    return true;
  }

  getLockOwner(environment: string): { runId: string; acquiredAt: string } | undefined {
    const envKey = environment.toLowerCase().trim();
    const existing = this.locks.get(envKey);
    if (!existing || existing.expiresAt <= Date.now()) {
      return undefined;
    }
    return { runId: existing.runId, acquiredAt: existing.acquiredAt };
  }

  clearLocks(): void {
    this.locks.clear();
  }
}

export const defaultEnvironmentLockManager = new EnvironmentLockManager();
