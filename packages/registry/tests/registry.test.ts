import { describe, expect, it } from 'vitest';
import {
  defaultRegistry,
  TestTypeRegistry,
  type TestTypeRegistryDefinition,
} from '../src/index.js';

describe('TestTypeRegistry Built-in Definitions', () => {
  it('loads all 6 initial test types defined in specification', () => {
    const registry = new TestTypeRegistry();
    const types = registry.list().map((d) => d.type);
    expect(types).toContain('e2e');
    expect(types).toContain('api');
    expect(types).toContain('a11y');
    expect(types).toContain('perf');
    expect(types).toContain('visual');
    expect(types).toContain('security-passive');
    expect(registry.list()).toHaveLength(6);
  });

  it('correctly registers and retrieves custom test type definitions', () => {
    const registry = new TestTypeRegistry();
    const customDef: TestTypeRegistryDefinition = {
      type: 'custom-fuzz',
      label: { id: 'Fuzzing Khusus', en: 'Custom Fuzzing' },
      icon: 'sparkles',
      help: { id: 'Uji fuzzer kustom', en: 'Custom fuzz test' },
      lane: 'security',
      modes: { sandbox: true, staging: false, prodSafe: false },
      globals: [],
      columns: [],
      defaults: [],
      validators: [],
    };
    registry.register(customDef);
    expect(registry.has('custom-fuzz')).toBe(true);
    expect(registry.get('custom-fuzz')).toBe(customDef);
  });
});

describe('Mode Compatibility Rules', () => {
  it('blocks performance testing in prod-safe mode', () => {
    const registry = defaultRegistry;
    const prodCheck = registry.isTypeAllowedInMode('perf', 'prod-safe');
    expect(prodCheck.allowed).toBe(false);
    expect(prodCheck.reason).toContain('not allowed in prod-safe mode');

    const stagingCheck = registry.isTypeAllowedInMode('perf', 'staging');
    expect(stagingCheck.allowed).toBe(true);

    const sandboxCheck = registry.isTypeAllowedInMode('perf', 'sandbox');
    expect(sandboxCheck.allowed).toBe(true);
  });

  it('allows safe types like E2E and A11Y in all three modes', () => {
    const registry = defaultRegistry;
    for (const mode of ['sandbox', 'staging', 'prod-safe'] as const) {
      expect(registry.isTypeAllowedInMode('e2e', mode).allowed).toBe(true);
      expect(registry.isTypeAllowedInMode('a11y', mode).allowed).toBe(true);
    }
  });
});

describe('Field and Secret Validation', () => {
  const registry = defaultRegistry;

  it('strictly rejects raw secrets and requires vault: aliases', () => {
    const secretField = registry.get('e2e')!.globals.find((g) => g.key === 'login')!;

    // Raw password
    const rawErr = registry.validateField(secretField, 'mySecretP@ssw0rd!');
    expect(rawErr).toBeDefined();
    expect(rawErr!.message).toContain('Raw secrets are rejected. Use a vault reference');

    // Valid vault reference
    const validVault = registry.validateField(secretField, 'vault:qa/staging-admin');
    expect(validVault).toBeUndefined();
  });

  it('detects accidental raw credentials in text fields', () => {
    const textField = registry.get('e2e')!.columns.find((c) => c.key === 'steps')!;
    const err = registry.validateField(textField, 'use token Bearer eyJhbGciOi...');
    expect(err).toBeDefined();
    expect(err!.message).toContain('Value appears to contain raw credentials');
  });

  it('validates URL format and respects allowlist', () => {
    const urlField = registry.get('e2e')!.globals.find((g) => g.key === 'url')!;

    // Invalid format
    const badUrl = registry.validateField(urlField, 'not-a-url');
    expect(badUrl).toBeDefined();

    // Not on allowlist
    const forbiddenHost = registry.validateField(urlField, 'https://evil.external.com', {
      allowlist: ['127.0.0.1', 'staging.local'],
    });
    expect(forbiddenHost).toBeDefined();
    expect(forbiddenHost!.message).toContain('not on the approved allowlist');

    // On allowlist with wildcard
    const allowed = registry.validateField(urlField, 'https://api.staging.local', {
      allowlist: ['127.0.0.1', '*.staging.local'],
    });
    expect(allowed).toBeUndefined();
  });
});

describe('Row and Table Validation', () => {
  const registry = defaultRegistry;

  it('blocks state-changing API methods in prod-safe mode', () => {
    const postRow = {
      method: 'POST',
      endpoint: '/orders',
      expectedStatus: 201,
      severity: 'critical',
    };
    const prodCheck = registry.validateRow('api', postRow, 0, { mode: 'prod-safe' });
    expect(prodCheck.valid).toBe(false);
    expect(prodCheck.errors[0].message).toContain('State-changing method "POST" is blocked in prod-safe mode');

    const getRow = {
      method: 'GET',
      endpoint: '/health',
      expectedStatus: 200,
      severity: 'high',
    };
    const safeCheck = registry.validateRow('api', getRow, 0, { mode: 'prod-safe' });
    expect(safeCheck.valid).toBe(true);
  });

  it('enforces atLeastOneRow validator for tables requiring rows', () => {
    const emptyCheck = registry.validateTestRows('e2e', []);
    expect(emptyCheck.valid).toBe(false);
    expect(emptyCheck.errors.some((e) => e.message.includes('At least one test row is required'))).toBe(true);

    const populatedCheck = registry.validateTestRows('e2e', [
      {
        id: 'TC-01',
        scenario: 'Login',
        steps: 'Click button',
        expected: 'Dashboard shown',
        severity: 'high',
      },
    ]);
    expect(populatedCheck.valid).toBe(true);
  });
});

describe('Scenario Suggestions', () => {
  const registry = defaultRegistry;

  it('suggests e2e and api scenarios from discovered routes', () => {
    const e2eSuggestions = registry.suggestScenarios('e2e', {
      pages: ['/', '/login', '/dashboard'],
    });
    expect(e2eSuggestions).toHaveLength(3);
    expect(e2eSuggestions[0].fields.scenario).toContain('Page load invariant');
    expect(e2eSuggestions[0].confidence).toBe('auto-discovered');

    const apiSuggestions = registry.suggestScenarios('api', {
      endpoints: ['GET /health', 'POST /orders'],
    });
    expect(apiSuggestions).toHaveLength(2);
    expect(apiSuggestions[0].fields.endpoint).toBe('/health');
    expect(apiSuggestions[0].fields.method).toBe('GET');
  });

  it('suggests passive security baseline checks', () => {
    const secSuggestions = registry.suggestScenarios('security-passive', {});
    expect(secSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(secSuggestions.some((s) => s.fields.check === 'security-headers')).toBe(true);
    expect(secSuggestions.some((s) => s.fields.check === 'cookie-security')).toBe(true);
  });
});
