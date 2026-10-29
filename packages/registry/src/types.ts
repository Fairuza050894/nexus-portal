export type FieldKind =
  'text' | 'select' | 'multiselect' | 'number' | 'url' | 'path' | 'json' | 'secretRef' | 'boolean';

export interface FieldOption {
  value: string;
  label: { id: string; en: string };
  description?: { id: string; en: string };
}

export interface FieldDefinition {
  key: string;
  label: { id: string; en: string };
  kind: FieldKind;
  required?: boolean;
  options?: FieldOption[];
  placeholder?: string;
  help?: { id: string; en: string };
  min?: number;
  max?: number;
  pattern?: string;
  width?: string;
  showIf?: Record<string, unknown>;
}

export interface TestTypeModes {
  sandbox: boolean;
  staging: boolean;
  prodSafe: boolean;
}

export interface TestTypeRegistryDefinition {
  type: string;
  label: { id: string; en: string };
  icon: string;
  help: { id: string; en: string };
  lane: string;
  modes: TestTypeModes;
  requiresApproval?: boolean;
  globals: FieldDefinition[];
  columns: FieldDefinition[];
  defaults: Array<Record<string, unknown>>;
  validators: string[];
  importTemplate?: string;
}

export interface ValidationError {
  field?: string;
  message: string;
  rowIndex?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ScenarioSuggestion {
  id: string;
  title: string;
  lane: string;
  type: string;
  fields: Record<string, unknown>;
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  reason: string;
}
