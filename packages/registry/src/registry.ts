import type { AppMap } from '@nexus/app-map';
import { BUILTIN_DEFINITIONS } from './definitions.js';
import type {
  FieldDefinition,
  ScenarioSuggestion,
  TestTypeRegistryDefinition,
  ValidationError,
  ValidationResult,
} from './types.js';

export class TestTypeRegistry {
  private readonly definitions = new Map<string, TestTypeRegistryDefinition>();

  constructor(initial: readonly TestTypeRegistryDefinition[] = BUILTIN_DEFINITIONS) {
    for (const def of initial) {
      this.register(def);
    }
  }

  register(definition: TestTypeRegistryDefinition): void {
    if (!definition?.type) {
      throw new Error('TestTypeRegistry: definition.type is required');
    }
    this.definitions.set(definition.type, definition);
  }

  get(type: string): TestTypeRegistryDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): TestTypeRegistryDefinition[] {
    return Array.from(this.definitions.values());
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  isTypeAllowedInMode(
    type: string,
    mode: 'sandbox' | 'staging' | 'prod-safe',
  ): { allowed: boolean; reason?: string } {
    const def = this.get(type);
    if (!def) {
      return { allowed: false, reason: `Unknown test type "${type}"` };
    }

    if (mode === 'prod-safe' && !def.modes.prodSafe) {
      return {
        allowed: false,
        reason: `${def.label.en} (${type}) is not allowed in prod-safe mode to prevent state mutation or load disruption.`,
      };
    }

    if (mode === 'staging' && !def.modes.staging) {
      return {
        allowed: false,
        reason: `${def.label.en} (${type}) is not allowed in staging mode.`,
      };
    }

    if (mode === 'sandbox' && !def.modes.sandbox) {
      return {
        allowed: false,
        reason: `${def.label.en} (${type}) is not allowed in sandbox mode.`,
      };
    }

    return { allowed: true };
  }

  validateField(
    field: FieldDefinition,
    value: unknown,
    options: { allowlist?: string[]; mode?: string } = {},
  ): ValidationError | undefined {
    // 1. Required check
    if (field.required) {
      if (value === undefined || value === null || value === '') {
        return {
          field: field.key,
          message: `${field.label.en} is required`,
        };
      }
    }

    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    // 2. Secret reference check (mandatory §6: raw secrets must be rejected)
    if (field.kind === 'secretRef') {
      const strVal = String(value).trim();
      if (!strVal.startsWith('vault:')) {
        return {
          field: field.key,
          message: 'Raw secrets are rejected. Use a vault reference (e.g., "vault:service/key").',
        };
      }
      return undefined;
    }

    // Check for accidental raw secret leak in other text fields
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (
        (lower.includes('bearer ') ||
          lower.includes('ghp_') ||
          lower.includes('eyjhbgcio') ||
          /password\s*[:=]/i.test(value)) &&
        !value.startsWith('vault:')
      ) {
        return {
          field: field.key,
          message: 'Value appears to contain raw credentials. Use vault references only.',
        };
      }
    }

    // 3. URL check
    if (field.kind === 'url') {
      try {
        const parsed = new URL(String(value));
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return {
            field: field.key,
            message: 'URL must use http or https protocol',
          };
        }
        if (options.allowlist && options.allowlist.length > 0) {
          const host = parsed.hostname;
          const matched = options.allowlist.some((pattern) => {
            if (pattern.startsWith('*.')) {
              const suffix = pattern.slice(2);
              return host === suffix || host.endsWith('.' + suffix);
            }
            return host === pattern;
          });
          if (!matched) {
            return {
              field: field.key,
              message: `Host "${host}" is not on the approved allowlist (${options.allowlist.join(', ')})`,
            };
          }
        }
      } catch {
        return {
          field: field.key,
          message: 'Invalid URL format',
        };
      }
    }

    // 4. Number check
    if (field.kind === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
        return {
          field: field.key,
          message: 'Must be a valid number',
        };
      }
      if (field.min !== undefined && num < field.min) {
        return {
          field: field.key,
          message: `Minimum value is ${field.min}`,
        };
      }
      if (field.max !== undefined && num > field.max) {
        return {
          field: field.key,
          message: `Maximum value is ${field.max}`,
        };
      }
    }

    // 5. Select check
    if (field.kind === 'select' && field.options) {
      const allowed = new Set(field.options.map((o) => o.value));
      if (!allowed.has(String(value))) {
        return {
          field: field.key,
          message: `Invalid option "${String(value)}". Allowed: ${Array.from(allowed).join(', ')}`,
        };
      }
    }

    // 6. JSON check
    if (field.kind === 'json') {
      if (typeof value === 'string' && value.trim().length > 0) {
        try {
          JSON.parse(value);
        } catch {
          return {
            field: field.key,
            message: 'Invalid JSON payload format',
          };
        }
      }
    }

    return undefined;
  }

  validateRow(
    type: string,
    row: Record<string, unknown>,
    rowIndex?: number,
    options: { allowlist?: string[]; mode?: string } = {},
  ): ValidationResult {
    const def = this.get(type);
    if (!def) {
      return {
        valid: false,
        errors: [{ message: `Cannot validate row: unknown test type "${type}"`, rowIndex }],
      };
    }

    const errors: ValidationError[] = [];

    // Mode-aware check: prod-safe blocks state-changing HTTP methods
    if (options.mode === 'prod-safe' && type === 'api') {
      const method = String(row.method ?? '').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        errors.push({
          field: 'method',
          message: `State-changing method "${method}" is blocked in prod-safe mode`,
          rowIndex,
        });
      }
    }

    for (const column of def.columns) {
      const err = this.validateField(column, row[column.key], options);
      if (err) {
        errors.push({ ...err, rowIndex });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateTestRows(
    type: string,
    rows: Array<Record<string, unknown>>,
    options: {
      globals?: Record<string, unknown>;
      allowlist?: string[];
      mode?: 'sandbox' | 'staging' | 'prod-safe';
    } = {},
  ): ValidationResult {
    const def = this.get(type);
    if (!def) {
      return {
        valid: false,
        errors: [{ message: `Cannot validate test rows: unknown test type "${type}"` }],
      };
    }

    const errors: ValidationError[] = [];

    // 1. Mode check for type
    if (options.mode) {
      const modeCheck = this.isTypeAllowedInMode(type, options.mode);
      if (!modeCheck.allowed) {
        errors.push({ message: modeCheck.reason ?? 'Type forbidden in mode' });
      }
    }

    // 2. Validate globals
    if (options.globals) {
      for (const globalField of def.globals) {
        const err = this.validateField(globalField, options.globals[globalField.key], options);
        if (err) {
          errors.push(err);
        }
      }
    }

    // 3. Validator: atLeastOneRow
    if (def.validators.includes('atLeastOneRow') && (!rows || rows.length === 0)) {
      errors.push({
        message: `At least one test row is required for ${def.label.en}`,
      });
    }

    // 4. Validate individual rows
    rows.forEach((row, idx) => {
      const rowResult = this.validateRow(type, row, idx, options);
      errors.push(...rowResult.errors);
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  suggestScenarios(
    type: string,
    context: {
      targetUrl?: string;
      appMap?: AppMap;
      endpoints?: string[];
      pages?: string[];
    },
  ): ScenarioSuggestion[] {
    const suggestions: ScenarioSuggestion[] = [];
    if (type === 'e2e') {
      const pages: string[] = context.pages?.length
        ? context.pages
        : context.appMap?.nodes.filter((n) => n.type === 'page').map((n) => n.path ?? '/') ?? ['/'];
      pages.forEach((page, idx) => {
        suggestions.push({
          id: `SUG-E2E-${String(idx + 1).padStart(3, '0')}`,
          title: `Verify page load and layout invariants on ${page}`,
          lane: 'e2e',
          type: 'e2e',
          fields: {
            id: `TC-E2E-${String(idx + 1).padStart(3, '0')}`,
            scenario: `Page load invariant for ${page}`,
            steps: `Navigate to ${page}; verify HTTP 200 and document title`,
            expected: 'Page renders without fatal DOM or console errors',
            severity: 'high',
            requirement: 'REQ-INVARIANT-PAGE',
          },
          confidence: 'auto-discovered',
          reason: `Proposed from discovered page route "${page}"`,
        });
      });
    } else if (type === 'api') {
      const endpoints: string[] = context.endpoints?.length
        ? context.endpoints
        : context.appMap?.nodes
            .filter((n) => n.type === 'endpoint')
            .map((n) => `${n.method ?? 'GET'} ${n.path ?? '/'}`) ?? ['GET /health'];
      endpoints.forEach((ep, idx) => {
        const [method, path] = ep.split(' ');
        suggestions.push({
          id: `SUG-API-${String(idx + 1).padStart(3, '0')}`,
          title: `Schema and status contract check for ${method} ${path}`,
          lane: 'api',
          type: 'api',
          fields: {
            method: method ?? 'GET',
            endpoint: path ?? '/health',
            expectedStatus: 200,
            schemaCheck: true,
            severity: 'high',
          },
          confidence: 'auto-discovered',
          reason: `Discovered from API route / OpenAPI spec: ${ep}`,
        });
      });
    } else if (type === 'a11y') {
      const pages: string[] = context.pages?.length
        ? context.pages
        : context.appMap?.nodes.filter((n) => n.type === 'page').map((n) => n.path ?? '/') ?? ['/'];
      pages.forEach((page, idx) => {
        suggestions.push({
          id: `SUG-A11Y-${String(idx + 1).padStart(3, '0')}`,
          title: `WCAG 2.1 AA audit on ${page}`,
          lane: 'a11y',
          type: 'a11y',
          fields: {
            pageName: page === '/' ? 'Home' : page.replace(/^\//, ''),
            path: page,
            failThreshold: 'serious',
          },
          confidence: 'auto-discovered',
          reason: `Accessibility coverage for page "${page}"`,
        });
      });
    } else if (type === 'security-passive') {
      suggestions.push({
        id: 'SUG-SEC-001',
        title: 'Audit HTTP Security Headers',
        lane: 'security',
        type: 'security-passive',
        fields: {
          check: 'security-headers',
          path: '/',
          severity: 'high',
        },
        confidence: 'auto-discovered',
        reason: 'Recommended baseline passive security header audit',
      });
      suggestions.push({
        id: 'SUG-SEC-002',
        title: 'Audit Cookie Security Flags',
        lane: 'security',
        type: 'security-passive',
        fields: {
          check: 'cookie-security',
          path: '/',
          severity: 'high',
        },
        confidence: 'auto-discovered',
        reason: 'Recommended baseline cookie security audit',
      });
    }

    return suggestions;
  }
}

export const defaultRegistry = new TestTypeRegistry();
