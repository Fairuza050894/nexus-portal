import type { FindingCategory, FindingConfidence, FindingSeverity } from '@nexus/core';

export function classifySignal(signal: {
  title: string;
  message?: string;
  lane: string;
  category?: string;
  expected?: string;
  actual?: string;
  endpoint?: string;
  page?: string;
}): FindingCategory {
  if (signal.category && isValidCategory(signal.category)) {
    return signal.category as FindingCategory;
  }

  const text = `${signal.title} ${signal.message ?? ''} ${signal.actual ?? ''}`.toLowerCase();

  // 1. Environment heuristics
  if (
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504') ||
    text.includes('dns') ||
    text.includes('tls') ||
    text.includes('enotfound') ||
    text.includes('health check failed')
  ) {
    return 'environment';
  }

  // 2. Data heuristics
  if (
    text.includes('duplicate') ||
    text.includes('already exists') ||
    text.includes('unique constraint') ||
    text.includes('409')
  ) {
    return 'data';
  }

  // 3. Security heuristics
  if (
    signal.lane === 'security-passive' ||
    text.includes('security header') ||
    text.includes('content-security-policy') ||
    text.includes('strict-transport-security') ||
    text.includes('x-content-type-options') ||
    text.includes('cookie')
  ) {
    return 'security';
  }

  // 4. Accessibility heuristics
  if (signal.lane === 'a11y' || text.includes('axe') || text.includes('wcag')) {
    return 'accessibility';
  }

  // 5. Performance heuristics
  if (
    signal.lane === 'vitals-perf' ||
    text.includes('lcp') ||
    text.includes('cls') ||
    text.includes('web vitals') ||
    text.includes('ttfb')
  ) {
    return 'performance';
  }

  // 6. Test bug heuristics
  if (
    text.includes('strict mode violation') ||
    text.includes('typeerror') ||
    text.includes('syntaxerror') ||
    text.includes('locator resolved to 0 elements')
  ) {
    return 'test-bug';
  }

  // 7. App bug heuristics
  if (
    signal.lane === 'api' ||
    signal.lane === 'e2e' ||
    text.includes('schema mismatch') ||
    text.includes('status code') ||
    text.includes('expected') ||
    text.includes('500') ||
    text.includes('internal server error') ||
    text.includes('uncaught exception')
  ) {
    return 'app-bug';
  }

  // 8. Quality debt
  if (signal.lane === 'repo') {
    return 'quality-debt';
  }

  return 'unknown';
}

export function determineConfidence(signal: {
  confidence?: FindingConfidence;
  requirements?: string[];
  expected?: string;
  category?: FindingCategory | string;
  lane: string;
}): FindingConfidence {
  if (signal.confidence) {
    return signal.confidence;
  }

  // Verified: has associated requirements, user specs, or explicit expected assertions
  if (signal.requirements && signal.requirements.length > 0) {
    return 'verified';
  }
  if (signal.expected && signal.lane === 'api') {
    return 'verified';
  }

  // Auto-discovered: objectively observable invariant failure
  const cat = signal.category;
  if (
    cat === 'app-bug' ||
    cat === 'accessibility' ||
    cat === 'security' ||
    cat === 'environment'
  ) {
    return 'auto-discovered';
  }

  return 'needs-review';
}

export function determineSeverity(signal: {
  severity?: FindingSeverity;
  category?: FindingCategory | string;
  actual?: string;
  title: string;
}): FindingSeverity {
  if (signal.severity) return signal.severity;

  const text = `${signal.title} ${signal.actual ?? ''}`.toLowerCase();
  if (text.includes('critical') || text.includes('500') || text.includes('crash')) {
    return 'critical';
  }
  if (text.includes('serious') || text.includes('fail') || text.includes('error')) {
    return 'high';
  }
  if (text.includes('warning') || text.includes('moderate')) {
    return 'medium';
  }
  return 'low';
}

function isValidCategory(cat: string): boolean {
  return [
    'app-bug',
    'test-bug',
    'environment',
    'data',
    'flaky',
    'security',
    'accessibility',
    'performance',
    'quality-debt',
    'unknown',
  ].includes(cat);
}
