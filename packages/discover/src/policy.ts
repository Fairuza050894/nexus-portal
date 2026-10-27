import type { RunMode, Scope } from '@nexus/core';

export const REQUESTS_PER_SECOND: Record<RunMode, number> = {
  sandbox: 20,
  staging: 10,
  'prod-safe': 2,
};

export const SCOPE_LIMITS: Record<
  Scope,
  { maxRequests: number; maxPages: number; deadlineMs: number }
> = {
  quick: { maxRequests: 60, maxPages: 20, deadlineMs: 10 * 60_000 },
  standard: { maxRequests: 300, maxPages: 100, deadlineMs: 30 * 60_000 },
  deep: { maxRequests: 1500, maxPages: 500, deadlineMs: 90 * 60_000 },
  custom: { maxRequests: 300, maxPages: 100, deadlineMs: 30 * 60_000 },
};

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export class Budget {
  requests = 0;
  readonly maxRequests: number;
  readonly deadline: number;

  constructor(scope: Scope, now: () => number, deadlineMs?: number, maxRequests?: number) {
    const limits = SCOPE_LIMITS[scope];
    this.maxRequests = maxRequests ?? limits.maxRequests;
    this.deadline = now() + (deadlineMs ?? limits.deadlineMs);
  }

  consume(now: () => number): boolean {
    if (this.exhausted(now)) return false;
    this.requests += 1;
    return true;
  }

  exhausted(now: () => number): boolean {
    return this.requests >= this.maxRequests || now() >= this.deadline;
  }
}

export class CircuitBreaker {
  #statuses: number[] = [];
  #reason?: string;

  constructor(
    private readonly maxRequestsWindow = 20,
    private readonly errorRateThreshold = 0.05,
  ) {}

  record(status: number): void {
    if (this.#reason) return;
    if (status === 429) {
      this.#reason = '429 received from target';
      return;
    }
    this.#statuses.push(status);
    if (this.#statuses.length < this.maxRequestsWindow) return;
    const errors = this.#statuses.filter((code) => code >= 500).length;
    if (errors / this.#statuses.length > this.errorRateThreshold) {
      this.#reason = `${errors}/${this.#statuses.length} responses were 5xx`;
    }
    this.#statuses.shift();
  }

  get isOpen(): boolean {
    return Boolean(this.#reason);
  }

  get reason(): string | undefined {
    return this.#reason;
  }
}

export function createRateLimiter(
  requestsPerSecond: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
): () => Promise<void> {
  const intervalMs = 1000 / requestsPerSecond;
  let nextAllowed = 0;
  return async () => {
    const wait = nextAllowed - now();
    if (wait > 0) await sleep(wait);
    nextAllowed = Math.max(nextAllowed, now()) + intervalMs;
  };
}

export function maxPagesFor(scope: Scope, override?: number): number {
  return override ?? SCOPE_LIMITS[scope].maxPages;
}

export function maxDepthFor(scope: Scope, override?: number): number {
  if (override !== undefined) return override;
  return scope === 'quick' ? 1 : scope === 'standard' ? 3 : 5;
}
