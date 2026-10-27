import {
  isHostAllowed,
  resolveHost,
  validateRedirect,
  type RunMode,
  type Scope,
} from '@nexus/core';
import {
  Budget,
  BudgetExhaustedError,
  CircuitBreaker,
  CircuitOpenError,
  REQUESTS_PER_SECOND,
  createRateLimiter,
} from './policy.js';
import type { TrafficKind, TrafficRecord } from './types.js';

export interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type DiscoveryFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal; headers?: Record<string, string> },
) => Promise<ResponseLike>;

export interface HttpClientOptions {
  mode: RunMode;
  scope: Scope;
  allowlist: string[];
  timeoutMs?: number;
  maxRedirects?: number;
  deadlineMs?: number;
  maxRequests?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: DiscoveryFetch;
  userAgent?: string;
  authHeaders?: Record<string, string>;
  authHost?: string;
}

export interface HttpResponse {
  url: string;
  status: number;
  body: string;
  headers: { get(name: string): string | null };
  redirects: string[];
}

export class DiscoveryHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryHttpError';
  }
}

const MAX_BODY_BYTES = 2_000_000;

function normalizeBody(text: string): string {
  return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
}

export class DiscoveryHttpClient {
  readonly traffic: TrafficRecord[] = [];
  readonly breaker: CircuitBreaker;
  readonly budget: Budget;
  readonly rateLimit: () => Promise<void>;

  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: DiscoveryFetch;
  private readonly allowlist: string[];
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly userAgent: string;
  private readonly authHeaders: Record<string, string>;
  private readonly authHost?: string;

  constructor(options: HttpClientOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.allowlist = options.allowlist;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.userAgent = options.userAgent ?? 'nexus-portal/0.1 (+qa)';
    this.authHeaders = options.authHeaders ?? {};
    this.authHost = options.authHost;
    this.breaker = new CircuitBreaker();
    this.budget = new Budget(options.scope, this.now, options.deadlineMs, options.maxRequests);
    this.rateLimit = createRateLimiter(REQUESTS_PER_SECOND[options.mode], this.now, this.sleep);
  }

  get requests(): number {
    return this.traffic.length;
  }

  get stopped(): { open: boolean; reason?: string; exhausted: boolean } {
    return {
      open: this.breaker.isOpen,
      reason: this.breaker.reason,
      exhausted: this.budget.exhausted(this.now),
    };
  }

  async get(url: string, kind: TrafficKind): Promise<HttpResponse> {
    if (this.breaker.isOpen) {
      throw new CircuitOpenError(`circuit open: ${this.breaker.reason ?? 'target distress'}`);
    }
    if (!this.budget.consume(this.now)) {
      throw new BudgetExhaustedError(`request budget exhausted (${this.budget.maxRequests})`);
    }

    const redirects: string[] = [];
    let current = url;
    for (let attempt = 0; attempt <= this.maxRedirects; attempt += 1) {
      const host = resolveHost(current);
      if (!host || !isHostAllowed(host, this.allowlist)) {
        throw new DiscoveryHttpError(`host not on allowlist: ${host || current}`);
      }
      await this.rateLimit();
      const startedAt = this.now();
      let recorded = false;
      try {
        const response = await this.fetchImpl(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            'user-agent': this.userAgent,
            accept: '*/*',
            ...(this.authHost && host === this.authHost ? this.authHeaders : {}),
          },
        });
        const text = normalizeBody(await response.text());
        const durationMs = Math.max(0, this.now() - startedAt);
        this.record({
          method: 'GET',
          url: current,
          kind: attempt === 0 ? kind : 'redirect',
          status: response.status,
          durationMs,
        });
        recorded = true;
        this.breaker.record(response.status);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new DiscoveryHttpError(`redirect without location from ${current}`);
          }
          const verdict = validateRedirect(current, location, this.allowlist);
          if (!verdict.allowed) {
            throw new DiscoveryHttpError(verdict.reasons.join('; '));
          }
          const next = new URL(location, current).href;
          this.traffic[this.traffic.length - 1]!.redirectTo = next;
          redirects.push(next);
          current = next;
          continue;
        }
        if (response.status === 429) {
          throw new CircuitOpenError(`429 received from ${current}`);
        }
        return {
          url: current,
          status: response.status,
          body: text,
          headers: response.headers,
          redirects,
        };
      } catch (error) {
        if (error instanceof CircuitOpenError || error instanceof DiscoveryHttpError) {
          if (!(error instanceof CircuitOpenError) && !recorded) {
            this.record({
              method: 'GET',
              url: current,
              kind: attempt === 0 ? kind : 'redirect',
              durationMs: Math.max(0, this.now() - startedAt),
              error: error.message,
            });
          }
          throw error;
        }
        this.breaker.record(599);
        this.record({
          method: 'GET',
          url: current,
          kind: attempt === 0 ? kind : 'redirect',
          durationMs: Math.max(0, this.now() - startedAt),
          error: (error as Error).message,
        });
        throw new DiscoveryHttpError(`${current}: ${(error as Error).message}`);
      }
    }
    throw new DiscoveryHttpError(`too many redirects (max ${this.maxRedirects}) for ${url}`);
  }

  private record(record: Omit<TrafficRecord, 'sequence'>): void {
    this.traffic.push({ sequence: this.traffic.length + 1, ...record });
  }
}

export function findMutationRequests(traffic: TrafficRecord[]): TrafficRecord[] {
  return traffic.filter(
    (entry) => !['GET', 'HEAD', 'OPTIONS'].includes(entry.method.toUpperCase()),
  );
}

export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}
