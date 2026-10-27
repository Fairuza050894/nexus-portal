import { z } from 'zod';
import { DEFAULT_ALLOWLIST, RunModeSchema } from './types.js';

export const QaConfigSchema = z
  .object({
    env: z.string().min(1).default('local'),
    baseUrl: z.string().url().optional(),
    apiUrl: z.string().url().optional(),
    modes: z.array(RunModeSchema).min(1).default(['sandbox']),
    allowlist: z.array(z.string().min(1)).default(DEFAULT_ALLOWLIST),
    gates: z
      .object({
        criticalPassRate: z.number().min(0).max(1).default(1),
        overallPassRate: z.number().min(0).max(1).default(0.95),
        flakyRateMax: z.number().min(0).max(1).default(0.02),
        a11yCriticalSeriousMax: z.number().int().min(0).default(0),
        reqCoverageMin: z.number().min(0).max(1).default(0.8),
      })
      .strict()
      .default({}),
    docs: z
      .object({
        language: z.enum(['id', 'en']).default('id'),
        redaction: z.boolean().default(true),
      })
      .strict()
      .default({}),
  })
  .strict();

export type QaConfig = z.infer<typeof QaConfigSchema>;
export type QaConfigInput = z.input<typeof QaConfigSchema>;

export function defineConfig(config: QaConfigInput): QaConfig {
  return QaConfigSchema.parse(config);
}

export const DEFAULT_QA_CONFIG: QaConfig = QaConfigSchema.parse({});
