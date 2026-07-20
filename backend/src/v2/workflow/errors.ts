/**
 * ADC V2 Workflow SDK error mapping.
 *
 * Maps @workflow-foundation/sdk errors to ADC V2 HTTP error responses.
 * Does NOT re-implement Workflow error semantics — only translates.
 */

import { WorkflowError } from '@workflow-foundation/sdk';
import type { ZodError } from 'zod';

import { V2HttpError } from '../schemas.js';

export type ErrorHandlerResult = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  upstreamRequestId?: string;
};

/**
 * Map a caught error to an ADC V2 HTTP error response shape.
 * Returns undefined if the error is not a workflow SDK error.
 */
export function mapWorkflowSdkError(error: unknown): ErrorHandlerResult | undefined {
  if (!(error instanceof WorkflowError)) return undefined;

  // WorkflowError structure from the SDK
  const wfError = error as WorkflowError & {
    status?: number;
    code?: string;
    details?: unknown;
    upstreamRequestId?: string;
  };

  const status = wfError.status ?? 502;
  const code = wfError.code ?? 'svc_workflow_error';
  const message = wfError.message ?? 'svc-workflow returned an error';
  const details = wfError.details;
  const upstreamRequestId = wfError.upstreamRequestId;

  return { status, code, message, details, upstreamRequestId };
}

/**
 * Convert a WorkflowError to an ADC V2HttpError.
 * Used in request handlers to throw typed errors that the global error handler
 * can process uniformly.
 */
export function toV2HttpError(error: unknown): V2HttpError | undefined {
  if (!(error instanceof WorkflowError)) return undefined;

  const mapped = mapWorkflowSdkError(error);
  if (!mapped) return undefined;

  return new V2HttpError(mapped.status, mapped.code, mapped.message, mapped.details);
}

/**
 * Determine if an error is a ZodError.
 */
export function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'ZodError'
  );
}
