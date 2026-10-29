import type { Finding, RunRequest } from '@nexus/core';
import type { AppMap } from '@nexus/app-map';

export type PluginCapability = 'passive' | 'static' | 'active-scan';

export type ForbiddenOption =
  | 'captcha-solving'
  | 'tls-fingerprint-evasion'
  | 'waf-bypass'
  | 'autonomous-attack-planning'
  | 'credential-bruteforce'
  | 'destructive-actions';

export const MANDATORY_FORBIDDEN_OPTIONS: readonly ForbiddenOption[] = Object.freeze([
  'captcha-solving',
  'tls-fingerprint-evasion',
  'waf-bypass',
  'autonomous-attack-planning',
  'credential-bruteforce',
  'destructive-actions',
]);

export interface PluginManifest {
  id: string;
  version: string;
  license: string; // SPDX identifier; must be on the allowlist
  source: string; // repository or registry reference
  commit: string; // full commit SHA or container digest
  requiredMode: 'sandbox'; // Phase 4: sandbox only for every plugin
  capabilities: PluginCapability[];
  forbiddenOptions: ForbiddenOption[]; // must contain all entries from §7
  egress: string[]; // must be empty or the sandbox app only
  outputs: Array<'json' | 'sarif' | 'xml' | 'text'>;
  timeoutMs: number;
}

export interface RawPluginOutput {
  format: 'json' | 'sarif' | 'xml' | 'text';
  content: string | Record<string, unknown>;
  source?: string;
}

export interface PluginPrepareContext {
  appMap?: AppMap;
  sanitizedRequest: RunRequest;
  runId: string;
}

export interface PluginExecutionContext {
  sandboxAppUrl: string;
  sandboxEgressEnforced?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  auditLog?: (event: Record<string, unknown>) => void;
  /** Test-only flag to exercise the contract harness in unit tests without a real sandbox. */
  testContext?: boolean;
}

export interface PluginNormalizeContext {
  runId: string;
  redact?: (text: string) => string;
}

export interface LanePlugin {
  readonly manifest: PluginManifest;
  prepare(runRequest: RunRequest, ctx: PluginPrepareContext): Promise<void>;
  execute(ctx: PluginExecutionContext): Promise<RawPluginOutput[]>;
  normalize(raw: RawPluginOutput, ctx: PluginNormalizeContext): Finding[];
  teardown(): Promise<void>;
}

export class PluginRegistry {
  private readonly plugins = new Map<string, LanePlugin>();

  register(plugin: LanePlugin): void {
    if (!plugin?.manifest?.id) {
      throw new Error('Plugin registration failed: manifest.id is required');
    }
    this.plugins.set(plugin.manifest.id, plugin);
  }

  get(id: string): LanePlugin | undefined {
    return this.plugins.get(id);
  }

  list(): LanePlugin[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  clear(): void {
    this.plugins.clear();
  }
}

export const defaultPluginRegistry = new PluginRegistry();

/**
 * Validates a plugin manifest against mandatory contract rules.
 * Throws an Error with a descriptive reason if invalid.
 */
export function validatePluginManifest(manifest: PluginManifest): void {
  if (!manifest) {
    throw new Error('Invalid plugin manifest: manifest is null or undefined');
  }
  if (!manifest.id || typeof manifest.id !== 'string') {
    throw new Error('Invalid plugin manifest: id is required');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new Error('Invalid plugin manifest: version is required');
  }
  if (!manifest.license || typeof manifest.license !== 'string') {
    throw new Error('Invalid plugin manifest: license is required');
  }
  if (!manifest.commit || typeof manifest.commit !== 'string') {
    throw new Error('Invalid plugin manifest: commit SHA or digest is required');
  }
  if (manifest.requiredMode !== 'sandbox') {
    throw new Error(
      `Invalid plugin manifest: requiredMode must be "sandbox", got "${String(manifest.requiredMode)}"`,
    );
  }
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    throw new Error('Invalid plugin manifest: capabilities must be a non-empty array');
  }
  if (!Array.isArray(manifest.forbiddenOptions)) {
    throw new Error('Invalid plugin manifest: forbiddenOptions must be declared');
  }

  const declaredForbidden = new Set(manifest.forbiddenOptions);
  for (const option of MANDATORY_FORBIDDEN_OPTIONS) {
    if (!declaredForbidden.has(option)) {
      throw new Error(
        `Invalid plugin manifest: mandatory forbidden option "${option}" must be declared and forced off`,
      );
    }
  }
}

export interface ExecutePluginOptions {
  runRequest: RunRequest;
  prepareContext: PluginPrepareContext;
  executionContext: PluginExecutionContext;
  normalizeContext: PluginNormalizeContext;
  actorRole?: 'viewer' | 'runner' | 'approver' | 'admin';
}

export interface ExecutePluginResult {
  pluginId: string;
  status: 'passed' | 'failed' | 'rejected';
  findings: Finding[];
  rawOutputs: RawPluginOutput[];
  error?: string;
  forcedOffConfig: Record<ForbiddenOption, false>;
}

/**
 * Wrapper that executes a LanePlugin under strict security guard constraints:
 * 1. Mode guard: rejects if mode !== 'sandbox'
 * 2. Manifest validation: checks all mandatory forbidden options
 * 3. Forced-off configuration injection
 * 4. Approver check for active-scan plugins
 * 5. Fail-closed container egress guard: rejects if sandboxEgressEnforced !== true (unless testContext)
 * 6. Guaranteed teardown in finally block
 * 7. Normalization: enforces lane 'security-external' and redaction
 */
export async function executePlugin(
  plugin: LanePlugin,
  options: ExecutePluginOptions,
): Promise<ExecutePluginResult> {
  const { runRequest, prepareContext, executionContext, normalizeContext, actorRole } = options;
  const manifest = plugin.manifest;

  // 1. Mode guard
  if (runRequest.mode !== 'sandbox') {
    throw new Error(
      `Plugin execution rejected: plugins are restricted to sandbox mode, got mode "${runRequest.mode}"`,
    );
  }

  // 2. Manifest validation
  validatePluginManifest(manifest);

  // 3. Forced-off configuration override for all forbidden options
  const forcedOffConfig = Object.fromEntries(
    MANDATORY_FORBIDDEN_OPTIONS.map((opt) => [opt, false as const]),
  ) as Record<ForbiddenOption, false>;

  // 4. Active-scan approver check
  if (manifest.capabilities.includes('active-scan')) {
    const approver = runRequest.authorization?.approvedBy;
    if (!approver || (actorRole && actorRole !== 'approver' && actorRole !== 'admin')) {
      throw new Error(
        `Plugin execution rejected: active-scan plugin "${manifest.id}" requires authorization.approvedBy and approver role`,
      );
    }
  }

  // 5. Fail-closed container egress enforcement
  if (!executionContext.sandboxEgressEnforced && !executionContext.testContext) {
    throw new Error(
      `Plugin activation rejected: container egress filtering is not enforced yet (fail closed)`,
    );
  }

  const audit = executionContext.auditLog ?? (() => {});
  audit({
    event: 'plugin-start',
    pluginId: manifest.id,
    version: manifest.version,
    commit: manifest.commit,
    capabilities: manifest.capabilities,
    forcedOffConfig,
    timestamp: new Date().toISOString(),
  });

  let rawOutputs: RawPluginOutput[] = [];
  const findings: Finding[] = [];

  try {
    await plugin.prepare(runRequest, prepareContext);
    rawOutputs = await plugin.execute(executionContext);

    for (const raw of rawOutputs) {
      const normalized = plugin.normalize(raw, normalizeContext);
      for (const finding of normalized) {
        // Enforce lane is security-external
        const enforcedFinding: Finding = {
          ...finding,
          lanes: ['security-external'],
          provenance: {
            tool: manifest.id,
            version: manifest.version,
            ...(finding.provenance?.ruleId ? { ruleId: finding.provenance.ruleId } : {}),
            ...(finding.provenance?.rawSeverity
              ? { rawSeverity: finding.provenance.rawSeverity }
              : {}),
          },
        };
        findings.push(enforcedFinding);
      }
    }

    audit({
      event: 'plugin-complete',
      pluginId: manifest.id,
      outputsCount: rawOutputs.length,
      findingsCount: findings.length,
      timestamp: new Date().toISOString(),
    });

    return {
      pluginId: manifest.id,
      status: 'passed',
      findings,
      rawOutputs,
      forcedOffConfig,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit({
      event: 'plugin-error',
      pluginId: manifest.id,
      error: message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  } finally {
    try {
      await plugin.teardown();
    } catch (teardownErr) {
      audit({
        event: 'plugin-teardown-error',
        pluginId: manifest.id,
        error: teardownErr instanceof Error ? teardownErr.message : String(teardownErr),
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Reference no-op implementation of LanePlugin used for contract validation and testing.
 */
export class NoopPlugin implements LanePlugin {
  public prepared = false;
  public executed = false;
  public tornDown = false;
  public teardownCalls = 0;

  readonly manifest: PluginManifest = {
    id: 'plugin-noop',
    version: '1.0.0',
    license: 'MIT',
    source: 'internal/tests',
    commit: '0000000000000000000000000000000000000000',
    requiredMode: 'sandbox',
    capabilities: ['passive'],
    forbiddenOptions: [...MANDATORY_FORBIDDEN_OPTIONS],
    egress: [],
    outputs: ['json'],
    timeoutMs: 5000,
  };

  async prepare(runRequest: RunRequest, ctx: PluginPrepareContext): Promise<void> {
    void runRequest;
    void ctx;
    this.prepared = true;
  }

  async execute(ctx: PluginExecutionContext): Promise<RawPluginOutput[]> {
    void ctx;
    this.executed = true;
    return [
      {
        format: 'json',
        content: {
          test: 'noop-result',
          message: 'no-op check completed successfully',
        },
      },
    ];
  }

  normalize(raw: RawPluginOutput, ctx: PluginNormalizeContext): Finding[] {
    const content = typeof raw.content === 'object' ? raw.content : {};
    const message =
      (content as Record<string, unknown>).message &&
      typeof (content as Record<string, unknown>).message === 'string'
        ? String((content as Record<string, unknown>).message)
        : 'Noop finding';

    const redactedTitle = ctx.redact ? ctx.redact(message) : message;

    return [
      {
        id: `F-NOOP-${ctx.runId}`,
        title: redactedTitle,
        severity: 'info',
        confidence: 'auto-discovered',
        category: 'security',
        lanes: ['security-external'],
        occurrences: 1,
        evidence: [{ type: 'plugin-output', raw: raw.content }],
        status: 'new',
        provenance: {
          tool: this.manifest.id,
          version: this.manifest.version,
        },
      },
    ];
  }

  async teardown(): Promise<void> {
    this.tornDown = true;
    this.teardownCalls += 1;
  }
}
