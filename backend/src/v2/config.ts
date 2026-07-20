import 'dotenv/config';
import { z } from 'zod';

import {
  loadWorkflowSdkFeatureFlags,
  type WorkflowSdkFeatureFlags,
} from './workflow/feature-flags.js';

const definitionBindingSchema = z
  .object({
    scenarioKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    displayName: z.string().trim().min(1).max(120),
    domainId: z.string().uuid(),
    definitionVersionId: z.string().uuid(),
    definitionDigest: z.string().trim().min(1).max(256),
  })
  .strict();

export type V2DefinitionBinding = z.infer<typeof definitionBindingSchema>;

export interface V2Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly frontendOrigins: readonly string[];
  readonly svcWorkflowBaseUrl: string;
  readonly svcWorkflowRequestTimeoutMs: number;
  readonly svcWorkflowMaxAttempts: number;
  readonly definitionBindings: readonly V2DefinitionBinding[];
  /** Workflow SDK feature flags (all default-off, fail-closed). */
  readonly workflowFeatureFlags: WorkflowSdkFeatureFlags;
}

const sourceSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ADC_V2_PORT: z.coerce.number().int().positive().default(4100),
  ADC_V2_FRONTEND_ORIGINS: z.string().default('http://localhost:5173'),
  ADC_V2_DEFINITION_BINDINGS_JSON: z.string().min(1),
  SVC_WORKFLOW_BASE_URL: z.string().url().default('http://127.0.0.1:8989'),
  SVC_WORKFLOW_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(35_000),
  SVC_WORKFLOW_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(3),
});

export function loadV2Config(source: NodeJS.ProcessEnv = process.env): V2Config {
  const parsed = sourceSchema.parse(source);
  let rawBindings: unknown;
  try {
    rawBindings = JSON.parse(parsed.ADC_V2_DEFINITION_BINDINGS_JSON) as unknown;
  } catch {
    throw new Error('ADC_V2_DEFINITION_BINDINGS_JSON must be valid JSON');
  }

  const definitionBindings = Object.freeze(
    z.array(definitionBindingSchema).min(1).parse(rawBindings)
      .map((binding) => Object.freeze({ ...binding })),
  );
  const scenarioKeys = new Set<string>();
  for (const binding of definitionBindings) {
    if (scenarioKeys.has(binding.scenarioKey)) {
      throw new Error(`duplicate ADC V2 scenario key: ${binding.scenarioKey}`);
    }
    scenarioKeys.add(binding.scenarioKey);
  }

  const frontendOrigins = Object.freeze(
    parsed.ADC_V2_FRONTEND_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (parsed.NODE_ENV === 'production' && frontendOrigins.length === 0) {
    throw new Error('ADC_V2_FRONTEND_ORIGINS is required in production');
  }

  const workflowFeatureFlags = loadWorkflowSdkFeatureFlags(source);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.ADC_V2_PORT,
    frontendOrigins,
    svcWorkflowBaseUrl: parsed.SVC_WORKFLOW_BASE_URL,
    svcWorkflowRequestTimeoutMs: parsed.SVC_WORKFLOW_REQUEST_TIMEOUT_MS,
    svcWorkflowMaxAttempts: parsed.SVC_WORKFLOW_MAX_ATTEMPTS,
    definitionBindings,
    workflowFeatureFlags,
  };
}
