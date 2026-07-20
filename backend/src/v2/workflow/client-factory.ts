/**
 * ADC V2 SDK WorkflowClient factory.
 *
 * Creates @workflow-foundation/sdk WorkflowClient instances with:
 * - The ADC-configured base URL, timeout, and retry settings
 * - An SDK-compatible TokenProvider bridged from ADC's WorkflowBearerTokenProvider
 *
 * The bridge ensures the SDK never receives ADC-internal objects (routing, request, etc.).
 */

import { WorkflowClient, type WorkflowClientConfig } from '@workflow-foundation/sdk';

import type { V2Config } from '../config.js';
import type { WorkflowBearerTokenProvider, WorkflowScope } from './token-provider.js';

export type { WorkflowClient } from '@workflow-foundation/sdk';

export interface SdkClientFactoryOptions {
  /** ADC token provider used to resolve workflow bearer tokens. */
  tokenProvider: WorkflowBearerTokenProvider;
  /** The workflow scope required for this client's requests. */
  requiredScope: WorkflowScope;
  /**
   * Optional opaque subject token reference.
   * Passed to the token provider as rawAuthorizationReference.
   * Must NOT be inspected/parsed by this factory.
   */
  rawAuthorizationReference?: string;
}

/**
 * Create an SDK WorkflowClient configured from ADC V2 environment.
 *
 * The tokenProvider bridge converts ADC's rich TokenProviderInput into
 * the SDK's simple `() => Promise<string>` contract.  No ADC request
 * context objects leak into the SDK.
 */
export function createSdkClient(
  config: Pick<V2Config, 'svcWorkflowBaseUrl' | 'svcWorkflowRequestTimeoutMs' | 'svcWorkflowMaxAttempts'>,
  options: SdkClientFactoryOptions,
): WorkflowClient {
  const sdkConfig: WorkflowClientConfig = {
    baseUrl: config.svcWorkflowBaseUrl,
    requestTimeoutMs: config.svcWorkflowRequestTimeoutMs,
    maxAttempts: config.svcWorkflowMaxAttempts,
    tokenProvider: () =>
      options.tokenProvider.getToken({
        requiredScope: options.requiredScope,
        requestContext: {
          requestId: 'sdk-client',  // populated per-request upstream
          route: 'sdk-client',
          rawAuthorizationReference: options.rawAuthorizationReference,
        },
      }),
  };

  return new WorkflowClient(sdkConfig);
}
