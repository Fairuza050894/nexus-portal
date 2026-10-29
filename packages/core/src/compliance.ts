import { existsSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Finding } from './types.js';

export type ComplianceControls = Record<string, string[]>;

export interface ComplianceRuleMapping {
  category?: string;
  ruleId?: string;
  controls: ComplianceControls;
}

export interface ComplianceMapping {
  version: string;
  frameworks: string[];
  disclaimer: string;
  mappings: ComplianceRuleMapping[];
}

export interface ComplianceMatch {
  framework: string;
  controls: string[];
  matchedBy: 'ruleId' | 'category';
}

const DEFAULT_DISCLAIMER = 'Indicative mapping, not an audit conclusion.';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`compliance mapping: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseControls(value: unknown, index: number): ComplianceControls {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`compliance mapping: mappings[${index}].controls must be an object`);
  }
  const controls: ComplianceControls = {};
  for (const [framework, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error(
        `compliance mapping: mappings[${index}].controls.${framework} must be a non-empty array`,
      );
    }
    controls[framework] = ids.map((id) => requireString(id, `controls.${framework}[]`));
  }
  return controls;
}

/** Loads and validates a compliance mapping YAML file. */
export function loadComplianceMapping(filePath: string): ComplianceMapping {
  if (!existsSync(filePath)) {
    throw new Error(`compliance mapping not found: ${filePath}`);
  }
  const raw = yaml.load(readFileSync(filePath, 'utf8')) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`compliance mapping must be an object: ${filePath}`);
  }
  const version = requireString(raw.version, 'version');
  if (!Array.isArray(raw.mappings)) {
    throw new Error('compliance mapping: mappings must be an array');
  }
  const frameworks = Array.isArray(raw.frameworks)
    ? raw.frameworks.map((value, index) => requireString(value, `frameworks[${index}]`))
    : [];
  const mappings = raw.mappings.map((entry, index): ComplianceRuleMapping => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`compliance mapping: mappings[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const category = typeof record.category === 'string' ? record.category : undefined;
    const ruleId = typeof record.ruleId === 'string' ? record.ruleId : undefined;
    if (!category && !ruleId) {
      throw new Error(`compliance mapping: mappings[${index}] needs category or ruleId`);
    }
    return {
      ...(category ? { category } : {}),
      ...(ruleId ? { ruleId } : {}),
      controls: parseControls(record.controls, index),
    };
  });
  return {
    version,
    frameworks,
    disclaimer:
      typeof raw.disclaimer === 'string' && raw.disclaimer.trim().length > 0
        ? raw.disclaimer.trim()
        : DEFAULT_DISCLAIMER,
    mappings,
  };
}

/** Rule-specific mapping wins over a category mapping. */
export function matchCompliance(mapping: ComplianceMapping, finding: Finding): ComplianceMatch[] {
  const ruleMatch = finding.ruleId
    ? mapping.mappings.find((entry) => entry.ruleId === finding.ruleId)
    : undefined;
  const selected =
    ruleMatch ??
    mapping.mappings.find(
      (entry) => entry.category !== undefined && entry.category === finding.category,
    );
  if (!selected) return [];
  const matchedBy: ComplianceMatch['matchedBy'] = ruleMatch ? 'ruleId' : 'category';
  return Object.entries(selected.controls).map(([framework, controls]) => ({
    framework,
    controls,
    matchedBy,
  }));
}
