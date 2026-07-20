/**
 * ADC V2 Workflow SDK feature flags.
 *
 * All flags default to false (fail-closed).
 * No automatic fallback between paths.
 */

export interface WorkflowSdkFeatureFlags {
  /** Master switch for the official SDK v1 path. Default false. */
  readonly sdkV1Enabled: boolean;
  /** Real OBO token exchange. Default false (blocked by upstream). */
  readonly realOboEnabled: boolean;
  /** Auth V1 resource server middleware. Default false. */
  readonly authV1ResourceServerEnabled: boolean;
  /** Write operations (create, transition). Default false. */
  readonly writeEnabled: boolean;
}

export const WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS: WorkflowSdkFeatureFlags = {
  sdkV1Enabled: false,
  realOboEnabled: false,
  authV1ResourceServerEnabled: false,
  writeEnabled: false,
} as const;

const ENV_KEY_MAP: Record<keyof WorkflowSdkFeatureFlags, string> = {
  sdkV1Enabled: 'ADC_WORKFLOW_SDK_V1_ENABLED',
  realOboEnabled: 'ADC_WORKFLOW_REAL_OBO_ENABLED',
  authV1ResourceServerEnabled: 'ADC_AUTH_V1_RESOURCE_SERVER_ENABLED',
  writeEnabled: 'ADC_WORKFLOW_WRITE_ENABLED',
};

/**
 * Load feature flags from environment variables.
 * Only truthy values ('1', 'true', 'yes') enable a flag.
 */
export function loadWorkflowSdkFeatureFlags(
  source: Record<string, string | undefined> = process.env,
): WorkflowSdkFeatureFlags {
  const flags = { ...WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS };
  for (const [key, envKey] of Object.entries(ENV_KEY_MAP)) {
    const raw = source[envKey];
    if (raw !== undefined) {
      const normalized = raw.trim().toLowerCase();
      (flags as Record<string, boolean>)[key] =
        normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
  }
  return Object.freeze(flags) as WorkflowSdkFeatureFlags;
}

/**
 * Assert that write operations are allowed.
 * Must be called before any write path invokes the SDK.
 */
export function requireWriteEnabled(flags: WorkflowSdkFeatureFlags): void {
  if (!flags.writeEnabled) {
    throw new WorkflowWriteDisabledError();
  }
}

export class WorkflowWriteDisabledError extends Error {
  readonly name = 'WorkflowWriteDisabledError';
  readonly code = 'ADC_WORKFLOW_WRITE_DISABLED';
  constructor() {
    super('Workflow write operations are disabled by configuration');
  }
}
