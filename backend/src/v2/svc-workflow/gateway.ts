/**
 * ADC V2 Workflow Gateway — SDK-backed.
 *
 * Wraps @workflow-foundation/sdk WorkflowClient behind the V2WorkflowGateway
 * interface.  This is the only production path for Workflow network calls.
 *
 * The handwritten client (backend/src/clients/svc-workflow/) is DEPRECATED
 * and must not have production imports.
 */

import { WorkflowError } from '@workflow-foundation/sdk';
import type { WorkflowClient } from '@workflow-foundation/sdk';

import { V2HttpError } from '../schemas.js';
import { createSdkClient } from '../workflow/client-factory.js';
import {
  type WorkflowBearerTokenProvider,
  type WorkflowScope,
  DisabledWorkflowTokenProvider,
  DeprecatedDirectBearerProvider,
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
      metadata: Record<string, unknown>;
      contextPayload: Record<string, unknown>;
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
      submissionPayload?: Record<string, unknown>;
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
    // When real OBO is enabled (dev/deprecated), use the direct bearer pass-through.
    // When disabled (default), use a fail-closed provider.
    const tokenProvider: WorkflowBearerTokenProvider =
      config.workflowFeatureFlags.realOboEnabled
        ? new DeprecatedDirectBearerProvider()
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
            submissionPayload: input.submissionPayload,
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
        const result = await client.worklistAssignedToMe(query);
        return {
          items: result.items,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },

    creatorOwnedDrafts: async (query) => {
      try {
        const result = await client.worklistCreatorOwnedDrafts(query);
        return {
          items: result.items,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        throw toV2HttpError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Error mapping — convert SDK and token errors to V2HttpError
// ---------------------------------------------------------------------------

function toV2HttpError(error: unknown): never {
  // Token provider errors — fail-closed (503)
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

  // SDK WorkflowError — map to V2HttpError
  if (error instanceof WorkflowError) {
    const status = (error as { status?: number }).status ?? 502;
    const code = (error as { code?: string }).code ?? 'svc_workflow_error';
    const message = error.message ?? 'svc-workflow returned an error';
    throw new V2HttpError(status, code, message);
  }

  // Unknown — rethrow for global handler
  throw error;
}
