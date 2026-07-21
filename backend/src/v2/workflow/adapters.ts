/**
 * ADC V2 Workflow Product Adapters.
 *
 * Transforms official SDK DTOs into ADC V2 Response ViewModels.
 *
 * Adapters ONLY perform:
 *   - Field selection
 *   - Display naming
 *   - Null value normalization
 *   - Page composition
 *
 * Adapters MUST NOT:
 *   - Infer executable actions from state
 *   - Determine instance visibility locally
 *   - Filter other users' data to simulate authorization
 *   - Rebuild Timeline semantics
 *   - Rebuild Workflow error codes
 */

import type {
  CreateWorkflowInstanceResponse,
  ExecuteWorkflowTransitionResponse,
  TimelineResponse,
  WorkflowInstanceDetailResponse,
  WorklistPage,
} from '@workflow-foundation/sdk';

// ---------------------------------------------------------------------------
// Create WorkflowInstance response
// ---------------------------------------------------------------------------

export interface AdcCreateWorkflowInstanceResponse {
  workflowInstanceId: string;
  workflowStateVersion: number;
  currentContextRevisionId: string;
  currentNodeVisitId: string;
  eventSequence: number;
}

export function adaptCreateResponse(
  raw: CreateWorkflowInstanceResponse,
): AdcCreateWorkflowInstanceResponse {
  return {
    workflowInstanceId: raw.workflowInstanceId,
    workflowStateVersion: raw.workflowStateVersion,
    currentContextRevisionId: raw.currentContextRevisionId,
    currentNodeVisitId: raw.currentNodeVisitId,
    eventSequence: raw.eventSequence,
  };
}

// ---------------------------------------------------------------------------
// Transition response
// ---------------------------------------------------------------------------

export interface AdcTransitionResponse {
  workflowInstanceId: string;
  workflowStateVersion: number;
  currentContextRevisionId: string;
  sourceNodeVisitId: string;
  currentNodeVisitId: string;
  submissionId: string | null;
  eventSequence: number;
}

export function adaptTransitionResponse(
  raw: ExecuteWorkflowTransitionResponse,
): AdcTransitionResponse {
  return {
    workflowInstanceId: raw.workflowInstanceId,
    workflowStateVersion: raw.workflowStateVersion,
    currentContextRevisionId: raw.currentContextRevisionId,
    sourceNodeVisitId: raw.sourceNodeVisitId,
    currentNodeVisitId: raw.currentNodeVisitId,
    submissionId: raw.submissionId,
    eventSequence: raw.eventSequence,
  };
}

// ---------------------------------------------------------------------------
// Detail response
// ---------------------------------------------------------------------------

/**
 * ADC V2 detail response view-model.
 * Uses the SDK's discriminated union type directly — we only select and
 * normalize fields, never interpret authorization or state.
 */
export type AdcDetailResponse = WorkflowInstanceDetailResponse;

export function adaptDetailResponse(
  raw: WorkflowInstanceDetailResponse,
): AdcDetailResponse {
  // SDK types are authoritative; ADC passes them through after null normalization.
  return raw;
}

// ---------------------------------------------------------------------------
// Timeline response
// ---------------------------------------------------------------------------

export interface AdcTimelineResponse {
  items: TimelineResponse['items'];
  nextCursor: number | null;
}

export function adaptTimelineResponse(raw: TimelineResponse): AdcTimelineResponse {
  return {
    items: raw.items,
    nextCursor: raw.nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Worklist responses (assigned + creator drafts)
// ---------------------------------------------------------------------------

export interface AdcWorklistPage {
  items: WorklistPage['items'];
  nextCursor: string | null;
}

export function adaptWorklistPage(raw: WorklistPage): AdcWorklistPage {
  return {
    items: raw.items,
    nextCursor: raw.next_cursor
      ? JSON.stringify({ created_at: raw.next_cursor.created_at, id: raw.next_cursor.id })
      : null,
  };
}

// ---------------------------------------------------------------------------
// Creator drafts page
// ---------------------------------------------------------------------------

import type { CreatorDraftPage } from '@workflow-foundation/sdk';

export interface AdcCreatorDraftPage {
  items: CreatorDraftPage['items'];
  nextCursor: string | null;
}

export function adaptCreatorDraftPage(raw: CreatorDraftPage): AdcCreatorDraftPage {
  return {
    items: raw.items,
    nextCursor: raw.next_cursor
      ? JSON.stringify({ created_at: raw.next_cursor.created_at, id: raw.next_cursor.id })
      : null,
  };
}
