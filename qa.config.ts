import { defineConfig } from '@nexus/core';

export default defineConfig({
  env: process.env.QA_ENV ?? 'local',
  baseUrl: process.env.QA_BASE_URL || undefined,
  apiUrl: process.env.QA_API_URL || undefined,
  modes: ['sandbox', 'staging', 'prod-safe'],
  allowlist: ['localhost', '127.0.0.1', '*.local', 'staging-qa-pilot.local', '*.pancaran-group.co.id'],
  gates: {
    criticalPassRate: 1,
    overallPassRate: 0.95,
    flakyRateMax: 0.02,
    a11yCriticalSeriousMax: 0,
    reqCoverageMin: 0.8,
  },
  docs: {
    language: 'id',
    redaction: true,
  },
});
