/**
 * ADC V2 Workflow Gateway — SDK-backed.
 *
 * Wraps @workflow-foundation/sdk WorkflowClient behind the V2WorkflowGateway
 * interface.  This is the only production path for Workflow network calls.
 *
 * The handwritten client (backend/src/clients/svc-workflow/) is DEPRECATED
 * and must not have production imports.
 */

import { WorkflowError, type JsonValue } from '@workflow-foundation/sdk';
import type { WorkflowClient } from '@workflow-foundation/sdk';

import { V2HttpError } from '../schemas.js';
import { createSdkClient } from '../workflow/client-factory.js';
import {
  type WorkflowBearerTokenProvider,
  type WorkflowScope,
  DisabledWorkflowTokenProvider,
  UpstreamBlockedTokenProvider,
} from '../workflow/token-provider.js';

// ---------------------------------------------------------------------------
// Gateway interface (unchanged contract for existing routes)
// ---------------------------------------------------------------------------

export interface V2WorkflowGateway {
  assertReady(): Promise<void>;
  create(
    input: {
      domainId: string;
      definitionVersionId: string;
      externalReference?: string;
      metadata: Record<string, JsonValue>;
      contextPayload: Record<string, JsonValue>;
    },
    idempotencyKey: string,
  ): Promise<{
    workflowInstanceId: string;
    workflowStateVersion: number;
    currentContextRevisionId: string;
    currentNodeVisitId: string;
    eventSequence: number;
  }>;
  detail(workflowInstanceId: string): Promise<unknown>;
  transition(
    workflowInstanceId: string,
    input: {
      transitionDefinitionId: string;
      expectedWorkflowStateVersion: number;
      submissionPayload?: JsonValue;
    },
    idempotencyKey: string,
  ): Promise<{
    workflowInstanceId: string;
    workflowStateVersion: number;
    currentContextRevisionId: string;
    sourceNodeVisitId: string;
    currentNodeVisitId: string;
    submissionId: string | null;
    eventSequence: number;
  }>;
  timeline(
    workflowInstanceId: string,
    query?: { after?: number; limit?: number },
  ): Promise<{ items: unknown[]; nextCursor: number | null }>;
  assignedToMe(query?: { cursor?: string; limit?: number }): Promise<{
    items: unknown[];
    nextCursor: string | null;
  }>;
  creatorOwnedDrafts(query?: { cursor?: string; limit?: number }): Promise<{
    items: unknown[];
    nextCursor: string | null;
  }>;
}

export type V2WorkflowGatewayFactory = (accessToken: string) => V2WorkflowGateway;

// ---------------------------------------------------------------------------
// Gateway factory — chooses token provider based on feature flags
// ---------------------------------------------------------------------------

export function createV2WorkflowGatewayFactory(config: {
  svcWorkflowBaseUrl: string;
  svcWorkflowRequestTimeoutMs: number;
  svcWorkflowMaxAttempts: number;
  workflowFeatureFlags: { realOboEnabled: boolean };
}): V2WorkflowGatewayFactory {
  return (accessToken: string) => {
    // Determine the token provider for this request.
    // REAL_OBO_PROVIDER_IMPLEMENTED=false — no production OBO provider exists.
    //
    // realOboEnabled=false → DisabledWorkflowTokenProvider (fail-closed).
    // realOboEnabled=true  → UpstreamBlockedTokenProvider (fail-closed with
    //                        clear "upstream not ready" error).
    //
    // Both paths are fail-closed.  No path selects DeprecatedDirectBearerProvider
    // (which would forward the inbound Authorization token to svc-workflow).
    const tokenProvider: WorkflowBearerTokenProvider =
      config.workflowFeatureFlags.realOboEnabled
        ? new UpstreamBlockedTokenProvider()
        : new DisabledWorkflowTokenProvider();

    const scope: WorkflowScope = 'workflow.read';

    const client = createSdkClient(config, {
      tokenProvider,
      requiredScope: scope,
      rawAuthorizationReference: accessToken,
    });

    return createGatewayFromClient(client);
  };
}

// ---------------------------------------------------------------------------
// Create a V2WorkflowGateway from an SDK WorkflowClient
// ---------------------------------------------------------------------------

function createGatewayFromClient(client: WorkflowClient): V2WorkflowGateway {
  return {
    assertReady: async () => {
      try {
        await client.ready();
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    create: async (input, idempotencyKey) => {
      try {
        const result = await client.create(
          {
            domainId: input.domainId,
            definitionVersionId: input.definitionVersionId,
            externalReference: input.externalReference,
            metadata: input.metadata,
            contextPayload: input.contextPayload,
          },
          { idempotencyKey },
        );
        return {
          workflowInstanceId: result.workflowInstanceId,
          workflowStateVersion: result.workflowStateVersion,
          currentContextRevisionId: result.currentContextRevisionId,
          currentNodeVisitId: result.currentNodeVisitId,
          eventSequence: result.eventSequence,
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    detail: async (workflowInstanceId) => {
      try {
        return await client.detail(workflowInstanceId);
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    transition: async (workflowInstanceId, input, idempotencyKey) => {
      try {
        const result = await client.transition(
          workflowInstanceId,
          {
            transitionDefinitionId: input.transitionDefinitionId,
            expectedWorkflowStateVersion: input.expectedWorkflowStateVersion,
            // Narrow ADC's JsonValue to SDK's Record<string, JsonValue>.
            // The SDK's own Zod schema validates the final payload.
            submissionPayload: input.submissionPayload as Record<string, JsonValue> | undefined,
          },
          { idempotencyKey },
        );
        return {
          workflowInstanceId: result.workflowInstanceId,
          workflowStateVersion: result.workflowStateVersion,
          currentContextRevisionId: result.currentContextRevisionId,
          sourceNodeVisitId: result.sourceNodeVisitId,
          currentNodeVisitId: result.currentNodeVisitId,
          submissionId: result.submissionId,
          eventSequence: result.eventSequence,
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    timeline: async (workflowInstanceId, query) => {
      try {
        const result = await client.timeline(workflowInstanceId, query);
        return {
          items: result.items,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    assignedToMe: async (query) => {
      try {
        const result = await client.worklistAssignedToMe(
          query ? toSdkWorklistQuery(query) : undefined,
        );
        return {
          items: result.items,
          nextCursor: toAdcCursor(result.next_cursor),
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    creatorOwnedDrafts: async (query) => {
      try {
        const result = await client.worklistCreatorOwnedDrafts(
          query ? toSdkWorklistQuery(query) : undefined,
        );
        return {
          items: result.items,
          nextCursor: toAdcCursor(result.next_cursor),
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Cursor bridging — ADC string cursor ↔ SDK structured cursor
// ---------------------------------------------------------------------------

interface SdkWorklistQuery {
  readonly beforeCreatedAt?: string;
  readonly beforeId?: string;
  readonly limit?: number;
}

interface SdkCursor {
  readonly created_at: string;
  readonly id: string;
}

/** Convert ADC's string cursor + limit to SDK's { beforeCreatedAt, beforeId, limit }. */
function toSdkWorklistQuery(adcQuery: {
  cursor?: string;
  limit?: number;
}): SdkWorklistQuery {
  if (!adcQuery.cursor) {
    return { limit: adcQuery.limit };
  }
  try {
    const parsed = JSON.parse(adcQuery.cursor) as Record<string, string>;
    return {
      beforeCreatedAt: parsed.created_at ?? parsed.beforeCreatedAt,
      beforeId: parsed.id ?? parsed.beforeId,
      limit: adcQuery.limit,
    };
  } catch {
    // If cursor is not valid JSON, pass it as beforeId for backward compatibility
    return { beforeId: adcQuery.cursor, limit: adcQuery.limit };
  }
}

/** Convert SDK's cursor object to ADC's string cursor. */
function toAdcCursor(sdkCursor: SdkCursor | null): string | null {
  if (!sdkCursor) return null;
  return JSON.stringify({ created_at: sdkCursor.created_at, id: sdkCursor.id });
}

// ---------------------------------------------------------------------------
// Error mapping — convert SDK and token errors to V2HttpError
// ---------------------------------------------------------------------------

function toV2HttpError(error: unknown): never {
  // SDK WorkflowError — may wrap a token provider error as cause
  if (error instanceof WorkflowError) {
    // Check if the cause is a token provider error (our Disabled or Blocked provider)
    const cause = (error as { cause?: unknown }).cause;
    if (
      cause &&
      typeof cause === 'object' &&
      (cause as { name?: string }).name === 'WorkflowTokenError'
    ) {
      const tokenErr = cause as { code?: string; message?: string };
      throw new V2HttpError(
        503,
        tokenErr.code ?? 'ADC_WORKFLOW_TOKEN_UNAVAILABLE',
        tokenErr.message ?? 'Workflow token is unavailable',
      );
    }

    // Other SDK errors (API responses, transport, protocol)
    const status = (error as { status?: number }).status ?? 502;
    const code = (error as { code?: string }).code ?? 'svc_workflow_error';
    const message = error.message ?? 'svc-workflow returned an error';
    throw new V2HttpError(status, code, message);
  }

  // Direct token provider errors (not wrapped by SDK — defensive)
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'WorkflowTokenError'
  ) {
    const tokenErr = error as { code?: string; message?: string };
    throw new V2HttpError(
      503,
      tokenErr.code ?? 'ADC_WORKFLOW_TOKEN_UNAVAILABLE',
      tokenErr.message ?? 'Workflow token is unavailable',
    );
  }

  // Unknown — rethrow for global handler
  throw error;
}
