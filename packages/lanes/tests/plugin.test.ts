import { describe, expect, it } from 'vitest';
import { RunRequestSchema } from '@nexus/core';
import {
  MANDATORY_FORBIDDEN_OPTIONS,
  NoopPlugin,
  PluginRegistry,
  defaultPluginRegistry,
  executePlugin,
  validatePluginManifest,
  type LanePlugin,
  type PluginManifest,
} from '../src/plugin.js';

describe('Plugin Manifest Validation and Contract', () => {
  it('validates a correct manifest matching the Phase 4 specification', () => {
    const plugin = new NoopPlugin();
    expect(() => validatePluginManifest(plugin.manifest)).not.toThrow();
  });

  it('rejects a manifest when requiredMode is not sandbox', () => {
    const plugin = new NoopPlugin();
    const manifest = {
      ...plugin.manifest,
      requiredMode: 'staging' as unknown as 'sandbox',
    };
    expect(() => validatePluginManifest(manifest)).toThrow(/requiredMode must be "sandbox"/);
  });

  it('rejects a manifest missing any mandatory forbidden option', () => {
    const plugin = new NoopPlugin();
    for (const option of MANDATORY_FORBIDDEN_OPTIONS) {
      const incompleteForbidden = plugin.manifest.forbiddenOptions.filter((opt) => opt !== option);
      const manifest: PluginManifest = {
        ...plugin.manifest,
        forbiddenOptions: incompleteForbidden,
      };
      expect(() => validatePluginManifest(manifest)).toThrow(
        new RegExp(`mandatory forbidden option "${option}" must be declared and forced off`),
      );
    }
  });

  it('rejects a manifest missing essential metadata (id, version, license, commit)', () => {
    const plugin = new NoopPlugin();
    expect(() => validatePluginManifest({ ...plugin.manifest, id: '' })).toThrow(/id is required/);
    expect(() => validatePluginManifest({ ...plugin.manifest, version: '' })).toThrow(
      /version is required/,
    );
    expect(() => validatePluginManifest({ ...plugin.manifest, license: '' })).toThrow(
      /license is required/,
    );
    expect(() => validatePluginManifest({ ...plugin.manifest, commit: '' })).toThrow(
      /commit SHA or digest is required/,
    );
    expect(() => validatePluginManifest({ ...plugin.manifest, capabilities: [] })).toThrow(
      /capabilities must be a non-empty array/,
    );
  });
});

describe('Plugin Registry', () => {
  it('is disabled by default and supports register, get, list, has, clear', () => {
    const registry = new PluginRegistry();
    expect(registry.list()).toHaveLength(0);

    const plugin = new NoopPlugin();
    registry.register(plugin);

    expect(registry.has('plugin-noop')).toBe(true);
    expect(registry.get('plugin-noop')).toBe(plugin);
    expect(registry.list()).toEqual([plugin]);

    registry.clear();
    expect(registry.list()).toHaveLength(0);
    expect(registry.has('plugin-noop')).toBe(false);
  });

  it('rejects registration when plugin manifest id is missing', () => {
    const registry = new PluginRegistry();
    const invalidPlugin = {
      manifest: {} as unknown as PluginManifest,
      prepare: async () => {},
      execute: async () => [],
      normalize: () => [],
      teardown: async () => {},
    };
    expect(() => registry.register(invalidPlugin)).toThrow(/manifest\.id is required/);
  });

  it('defaultPluginRegistry is instantiated empty by default', () => {
    expect(defaultPluginRegistry).toBeInstanceOf(PluginRegistry);
    expect(defaultPluginRegistry.list()).toHaveLength(0);
  });
});

describe('Plugin Execution Guard Rules', () => {
  const baseRequest = RunRequestSchema.parse({
    name: 'plugin-test',
    mode: 'sandbox',
    web: { urls: ['http://127.0.0.1:3100/'] },
  });

  it('rejects execution in staging or prod-safe mode (mode guard)', async () => {
    const plugin = new NoopPlugin();
    const stagingRequest = RunRequestSchema.parse({
      name: 'staging-test',
      mode: 'staging',
      web: { urls: ['http://127.0.0.1:3100/'] },
      authorization: { ownerConfirmed: true },
    });
    const prodRequest = RunRequestSchema.parse({
      name: 'prod-test',
      mode: 'prod-safe',
      web: { urls: ['http://127.0.0.1:3100/'] },
      authorization: { ownerConfirmed: true, approvedBy: 'Lead QA' },
    });

    await expect(
      executePlugin(plugin, {
        runRequest: stagingRequest,
        prepareContext: { runId: 'run-1', sanitizedRequest: stagingRequest },
        executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
        normalizeContext: { runId: 'run-1' },
      }),
    ).rejects.toThrow(/plugins are restricted to sandbox mode, got mode "staging"/);

    await expect(
      executePlugin(plugin, {
        runRequest: prodRequest,
        prepareContext: { runId: 'run-2', sanitizedRequest: prodRequest },
        executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
        normalizeContext: { runId: 'run-2' },
      }),
    ).rejects.toThrow(/plugins are restricted to sandbox mode, got mode "prod-safe"/);
  });

  it('rejects active-scan plugins when authorization.approvedBy is missing or role is insufficient', async () => {
    const activePlugin: LanePlugin = {
      manifest: {
        id: 'active-plugin',
        version: '1.0.0',
        license: 'Apache-2.0',
        source: 'internal',
        commit: '1234567890abcdef1234567890abcdef12345678',
        requiredMode: 'sandbox',
        capabilities: ['active-scan'],
        forbiddenOptions: [...MANDATORY_FORBIDDEN_OPTIONS],
        egress: ['http://127.0.0.1:3100'],
        outputs: ['json'],
        timeoutMs: 10000,
      },
      prepare: async () => {},
      execute: async () => [],
      normalize: () => [],
      teardown: async () => {},
    };

    // No approvedBy
    await expect(
      executePlugin(activePlugin, {
        runRequest: baseRequest,
        prepareContext: { runId: 'run-active', sanitizedRequest: baseRequest },
        executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
        normalizeContext: { runId: 'run-active' },
        actorRole: 'approver',
      }),
    ).rejects.toThrow(/requires authorization\.approvedBy and approver role/);

    // With approvedBy but role is runner
    const approvedRequest = RunRequestSchema.parse({
      ...baseRequest,
      authorization: { ownerConfirmed: true, approvedBy: 'SecLead' },
    });
    await expect(
      executePlugin(activePlugin, {
        runRequest: approvedRequest,
        prepareContext: { runId: 'run-active', sanitizedRequest: approvedRequest },
        executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
        normalizeContext: { runId: 'run-active' },
        actorRole: 'runner',
      }),
    ).rejects.toThrow(/requires authorization\.approvedBy and approver role/);

    // With approvedBy and approver role -> succeeds
    const result = await executePlugin(activePlugin, {
      runRequest: approvedRequest,
      prepareContext: { runId: 'run-active', sanitizedRequest: approvedRequest },
      executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
      normalizeContext: { runId: 'run-active' },
      actorRole: 'approver',
    });
    expect(result.status).toBe('passed');
  });

  it('fails closed when container egress is not enforced in a non-test run', async () => {
    const plugin = new NoopPlugin();
    await expect(
      executePlugin(plugin, {
        runRequest: baseRequest,
        prepareContext: { runId: 'run-egress', sanitizedRequest: baseRequest },
        executionContext: {
          sandboxAppUrl: 'http://127.0.0.1:3100',
          sandboxEgressEnforced: false, // Not enforced
          testContext: false, // Real run context
        },
        normalizeContext: { runId: 'run-egress' },
      }),
    ).rejects.toThrow(/container egress filtering is not enforced yet \(fail closed\)/);
  });

  it('executes no-op plugin in test context, enforces lane security-external and redaction', async () => {
    const plugin = new NoopPlugin();
    const auditLogs: Array<Record<string, unknown>> = [];

    const result = await executePlugin(plugin, {
      runRequest: baseRequest,
      prepareContext: { runId: 'run-100', sanitizedRequest: baseRequest },
      executionContext: {
        sandboxAppUrl: 'http://127.0.0.1:3100',
        testContext: true,
        auditLog: (ev) => auditLogs.push(ev),
      },
      normalizeContext: {
        runId: 'run-100',
        redact: (str) => str.replace(/completed/g, '[REDACTED]'),
      },
    });

    expect(result.status).toBe('passed');
    expect(plugin.prepared).toBe(true);
    expect(plugin.executed).toBe(true);
    expect(plugin.tornDown).toBe(true);

    // Verified forced-off config
    for (const opt of MANDATORY_FORBIDDEN_OPTIONS) {
      expect(result.forcedOffConfig[opt]).toBe(false);
    }

    // Findings normalization
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.lanes).toEqual(['security-external']);
    expect(finding.provenance?.tool).toBe('plugin-noop');
    expect(finding.title).toContain('[REDACTED]');

    // Audit logs recorded start and complete
    expect(auditLogs.some((l) => l.event === 'plugin-start')).toBe(true);
    expect(auditLogs.some((l) => l.event === 'plugin-complete')).toBe(true);
  });

  it('guarantees teardown runs even when prepare, execute, or normalize throws', async () => {
    let tornDown = false;
    const failingPlugin: LanePlugin = {
      manifest: new NoopPlugin().manifest,
      prepare: async () => {},
      execute: async () => {
        throw new Error('Simulation of tool crash or network timeout');
      },
      normalize: () => [],
      teardown: async () => {
        tornDown = true;
      },
    };

    await expect(
      executePlugin(failingPlugin, {
        runRequest: baseRequest,
        prepareContext: { runId: 'run-fail', sanitizedRequest: baseRequest },
        executionContext: { sandboxAppUrl: 'http://127.0.0.1:3100', testContext: true },
        normalizeContext: { runId: 'run-fail' },
      }),
    ).rejects.toThrow(/Simulation of tool crash or network timeout/);

    expect(tornDown).toBe(true);
  });
});
