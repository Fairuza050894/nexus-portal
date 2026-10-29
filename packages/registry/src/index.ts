export { TestTypeRegistry, defaultRegistry } from './registry.js';

export {
  E2E_DEFINITION,
  API_DEFINITION,
  A11Y_DEFINITION,
  PERF_DEFINITION,
  VISUAL_DEFINITION,
  SECURITY_PASSIVE_DEFINITION,
  BUILTIN_DEFINITIONS,
} from './definitions.js';

export type {
  FieldKind,
  FieldOption,
  FieldDefinition,
  TestTypeModes,
  TestTypeRegistryDefinition,
  ValidationError,
  ValidationResult,
  ScenarioSuggestion,
} from './types.js';
