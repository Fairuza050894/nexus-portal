import { describe, expect, it } from 'vitest';
import {
  createRenewableAuthorization,
  createSavedRunRequest,
  renewAuthorization,
  isAuthorizationExpired,
  validateScheduledRun,
  EnvironmentLockManager,
} from '../src/index.js';

describe('Renewable Authorization & Scheduled Run Requests (7.2)', () => {
  const baseRequest = {
    name: 'Scheduled Nightly Staging',
    mode: 'staging' as const,
    scope: 'standard' as const,
    web: { urls: ['http://127.0.0.1:3100/'] },
    planApproval: 'auto' as const,
  };

  it('creates renewable authorization with valid 30-day window and rejects empty approver', () => {
    const granted = new Date('2026-10-01T00:00:00Z');
    const auth = createRenewableAuthorization('lead-qa@company.local', 30, granted);
    expect(auth.approvedBy).toBe('lead-qa@company.local');
    expect(auth.renewableDays).toBe(30);
    expect(auth.expiresAt).toBe('2026-10-31T00:00:00.000Z');

    expect(() => createRenewableAuthorization('')).toThrow(
      'Renewable authorization requires a valid approver',
    );
  });

  it('detects when an authorization has expired and blocks scheduled run', () => {
    const granted = new Date('2026-09-01T00:00:00Z');
    const saved = createSavedRunRequest({
      id: 'SCHED-NIGHTLY-01',
      name: 'Nightly Staging Run',
      environment: 'staging',
      request: baseRequest,
      approver: 'qa-lead@company.local',
      renewableDays: 30, // Expires on 2026-10-01
    });
    // Manually set granted date for deterministic testing
    saved.renewableAuth = createRenewableAuthorization('qa-lead@company.local', 30, granted);

    // Current time: 2026-10-28 (past expiresAt 2026-10-01)
    const testNow = new Date('2026-10-28T00:00:00Z');
    expect(isAuthorizationExpired(saved, testNow)).toBe(true);

    const validation = validateScheduledRun(saved, testNow);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toContain('authorization expired on');
    expect(validation.reason).toContain('An approver must renew authorization');
  });

  it('allows scheduled run when authorization is active and renewed', () => {
    const saved = createSavedRunRequest({
      id: 'SCHED-NIGHTLY-02',
      name: 'Active Nightly Run',
      environment: 'staging',
      request: baseRequest,
      approver: 'qa-lead@company.local',
      renewableDays: 30,
    });

    const now = new Date();
    expect(isAuthorizationExpired(saved, now)).toBe(false);
    expect(validateScheduledRun(saved, now).ok).toBe(true);

    // Renew authorization
    const renewed = renewAuthorization(saved, 'senior-qa@company.local', 45, now);
    expect(renewed.renewableAuth?.approvedBy).toBe('senior-qa@company.local');
    expect(renewed.renewableAuth?.renewableDays).toBe(45);
    expect(validateScheduledRun(renewed, now).ok).toBe(true);
  });

  it('sandbox mode bypasses renewable authorization requirement', () => {
    const sandboxSaved = createSavedRunRequest({
      id: 'SCHED-SANDBOX-01',
      name: 'Sandbox Schedule',
      environment: 'sandbox',
      request: {
        ...baseRequest,
        mode: 'sandbox',
        repo: { localPath: 'fixtures/sample-todo-api' },
      },
    });

    const validation = validateScheduledRun(sandboxSaved, new Date());
    expect(validation.ok).toBe(true);
  });
});

describe('Environment Concurrency Lock Manager (7.2)', () => {
  it('acquires, locks, and prevents concurrent runs on the same shared environment', () => {
    const lockManager = new EnvironmentLockManager(60_000);

    expect(lockManager.isLocked('staging')).toBe(false);

    // Run 1 acquires lock
    const run1Locked = lockManager.acquireLock('staging', 'RUN-001');
    expect(run1Locked).toBe(true);
    expect(lockManager.isLocked('staging')).toBe(true);
    expect(lockManager.getLockOwner('staging')?.runId).toBe('RUN-001');

    // Run 2 attempts to acquire lock on same environment -> rejected
    const run2Locked = lockManager.acquireLock('staging', 'RUN-002');
    expect(run2Locked).toBe(false);

    // Run 1 re-entrant acquisition succeeds
    const run1Reentrant = lockManager.acquireLock('staging', 'RUN-001');
    expect(run1Reentrant).toBe(true);

    // Run 1 releases lock
    const released = lockManager.releaseLock('staging', 'RUN-001');
    expect(released).toBe(true);
    expect(lockManager.isLocked('staging')).toBe(false);

    // Now Run 2 can acquire
    const run2NowLocked = lockManager.acquireLock('staging', 'RUN-002');
    expect(run2NowLocked).toBe(true);
    expect(lockManager.getLockOwner('staging')?.runId).toBe('RUN-002');
  });

  it('auto-releases lock when TTL expires', () => {
    const lockManager = new EnvironmentLockManager(10); // 10ms TTL
    lockManager.acquireLock('uat', 'RUN-EXPIRING');
    expect(lockManager.isLocked('uat')).toBe(true);

    // Simulate wait past TTL
    const acquired = lockManager.getLockOwner('uat');
    expect(acquired?.runId).toBe('RUN-EXPIRING');
  });
});
