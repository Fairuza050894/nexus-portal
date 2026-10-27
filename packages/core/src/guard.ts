import {
  AuthorizationSchema,
  DEFAULT_ALLOWLIST,
  RunRequestSchema,
  type RunMode,
  type RunRequest,
} from './types.js';

const SECRET_KEY_PATTERN =
  /^(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?token|client[_-]?secret|bearer)$/i;
const SECRET_REFERENCE_PATTERN = /^(?:vault|env|secret|sops|arn|ssm|gcp|azure):/i;
const ENV_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{2,}$/;
const RAW_VALUE_PATTERNS: RegExp[] = [
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
  /^Bearer\s+\S{8,}$/i,
  /^(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-]{8,}|xox[baprs]-|AKIA)[A-Za-z0-9_-]+/,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
];

export interface GuardOptions {
  allowlist?: string[];
  allowedModes?: RunMode[];
}

export interface GuardVerdict {
  allowed: boolean;
  reasons: string[];
  runRequest?: RunRequest;
}

function isReferenceValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (/Ref$/.test(key) || key === 'ref') return !looksLikeRawSecret(value);
  return SECRET_REFERENCE_PATTERN.test(value) || ENV_REFERENCE_PATTERN.test(value);
}

function looksLikeRawSecret(value: string): boolean {
  return RAW_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function findRawSecrets(value: unknown, path = 'request'): string[] {
  if (typeof value === 'string') {
    return looksLikeRawSecret(value) ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findRawSecrets(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => {
      const entryPath = `${path}.${key}`;
      const findings: string[] = [];
      if (SECRET_KEY_PATTERN.test(key) && !isReferenceValue(key, entry)) {
        findings.push(entryPath);
      }
      if (typeof entry === 'string' && looksLikeRawSecret(entry)) {
        findings.push(entryPath);
      }
      findings.push(...findRawSecrets(entry, entryPath));
      return findings;
    });
  }
  return [];
}

function normalizeAllowlistEntry(entry: string): { wildcard: boolean; base: string } {
  const withoutScheme = entry
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '');
  const withoutPath = withoutScheme.split('/')[0] ?? '';
  const colonCount = (withoutPath.match(/:/g) ?? []).length;
  const withoutPort = colonCount === 1 ? withoutPath.replace(/:\d+$/, '') : withoutPath;
  const wildcard = withoutPort.startsWith('*.');
  const base = (wildcard ? withoutPort.slice(2) : withoutPort).replace(/\.$/, '');
  return { wildcard, base };
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

export function isHostAllowed(host: string, allowlist: string[] = DEFAULT_ALLOWLIST): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  return allowlist.some((entry) => {
    const { wildcard, base } = normalizeAllowlistEntry(entry);
    if (!base) return false;
    if (wildcard) return normalized.endsWith(`.${base}`);
    return normalized === base;
  });
}

export function isLookalike(host: string, allowlist: string[] = DEFAULT_ALLOWLIST): boolean {
  const normalized = normalizeHost(host);
  if (!normalized || isHostAllowed(normalized, allowlist)) return false;
  const compactHost = normalized.replace(/[^a-z0-9]/g, '');
  return allowlist.some((entry) => {
    const { base } = normalizeAllowlistEntry(entry);
    const compactBase = base.replace(/[^a-z0-9]/g, '');
    return compactBase.length > 0 && compactHost.includes(compactBase);
  });
}

export function resolveHost(value: string): string {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):[^\s]+$/.exec(value.trim());
    return scpLike?.[1] ? normalizeHost(scpLike[1]) : '';
  }
}

export function validateRunRequest(input: unknown, options: GuardOptions = {}): GuardVerdict {
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST;
  const reasons = findRawSecrets(input).map(
    (path) => `raw secret/token detected at ${path} (use a secret reference)`,
  );

  const parsed = RunRequestSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      reasons.push(`${issue.path.join('.') || 'request'}: ${issue.message}`);
    }
    return { allowed: false, reasons };
  }

  const request = parsed.data;
  const mode = request.mode;

  if (options.allowedModes && !options.allowedModes.includes(mode)) {
    reasons.push(`mode ${mode} is not enabled in qa.config.ts`);
  }

  if (!request.repo && !request.web && !request.api) {
    reasons.push('at least one target (repo, web, or api) is required');
  }

  if (request.repo?.localPath && mode !== 'sandbox') {
    reasons.push('repo.localPath is only allowed in sandbox mode');
  }

  if (mode !== 'sandbox') {
    const authorization = request.authorization;
    const parsedAuthorization = AuthorizationSchema.safeParse(authorization);
    if (!authorization || !parsedAuthorization.success) {
      reasons.push(`${mode} requires authorization { ownerConfirmed: true }`);
    } else if (!authorization.ownerConfirmed) {
      reasons.push(`${mode} requires ownerConfirmed=true`);
    } else if (mode === 'prod-safe' && !authorization.approvedBy) {
      reasons.push('prod-safe requires a named approvedBy');
    }
  }

  if (mode === 'prod-safe' && request.lanes?.perf === true) {
    reasons.push('perf lane is blocked in prod-safe');
  }
  if (mode === 'staging' && request.lanes?.perf === true && !request.authorization?.perfApproved) {
    reasons.push('perf lane in staging requires authorization.perfApproved=true');
  }

  const targetUrls = [
    ...(request.web?.urls ?? []),
    ...(request.api?.baseUrl ? [request.api.baseUrl] : []),
    ...(request.api?.specUrl ? [request.api.specUrl] : []),
    ...(request.repo?.url ? [request.repo.url] : []),
  ];
  const hosts = [...new Set(targetUrls.map(resolveHost).filter(Boolean))];
  const blockedHosts = hosts.filter((host) => !isHostAllowed(host, allowlist));
  if (blockedHosts.length > 0) {
    reasons.push(`hosts not on allowlist: ${blockedHosts.join(', ')}`);
  }
  const lookalikes = hosts.filter((host) => isLookalike(host, allowlist));
  if (lookalikes.length > 0) {
    reasons.push(`lookalike host blocked: ${lookalikes.join(', ')}`);
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    allowed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    runRequest: uniqueReasons.length === 0 ? request : undefined,
  };
}

export function validateRedirect(
  fromUrl: string,
  location: string,
  allowlist: string[] = DEFAULT_ALLOWLIST,
): GuardVerdict {
  let target: string;
  try {
    target = new URL(location, fromUrl).href;
  } catch {
    return { allowed: false, reasons: [`invalid redirect target from ${fromUrl}`] };
  }
  const host = resolveHost(target);
  if (!isHostAllowed(host, allowlist)) {
    const lookalike = isLookalike(host, allowlist);
    return {
      allowed: false,
      reasons: [
        `${lookalike ? 'lookalike redirect' : 'redirect host not on allowlist'}: ${host || target}`,
      ],
    };
  }
  return { allowed: true, reasons: [] };
}

export function prodSafeBlocksMutation(
  method: string,
  path: string,
): { blocked: boolean; reason?: string } {
  if (/^(POST|PUT|PATCH|DELETE)$/i.test(method.trim())) {
    return {
      blocked: true,
      reason: `prod-safe observe-only: ${method.toUpperCase()} ${path} skipped by mode`,
    };
  }
  return { blocked: false };
}

export function targetsOf(request: RunRequest): string[] {
  const targets: string[] = [];
  if (request.repo?.url) targets.push(request.repo.url);
  if (request.repo?.localPath) targets.push(`local:${request.repo.localPath}`);
  targets.push(...(request.web?.urls ?? []));
  if (request.api?.baseUrl) targets.push(request.api.baseUrl);
  if (request.api?.specUrl) targets.push(request.api.specUrl);
  return targets;
}
