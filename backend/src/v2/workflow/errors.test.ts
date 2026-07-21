import { WorkflowError } from '@workflow-foundation/sdk';
import { describe, expect, it } from 'vitest';

import { mapWorkflowSdkError, toV2HttpError } from './errors.js';
import { V2HttpError } from '../schemas.js';

describe('mapWorkflowSdkError', () => {
  it('returns undefined for non-WorkflowError', () => {
    expect(mapWorkflowSdkError(new Error('random'))).toBeUndefined();
    expect(mapWorkflowSdkError('string')).toBeUndefined();
    expect(mapWorkflowSdkError(null)).toBeUndefined();
    expect(mapWorkflowSdkError(undefined)).toBeUndefined();
  });

  it('maps a WorkflowError to error handler result', () => {
    const error = new WorkflowError('Instance not found', {
      kind: 'api',
      operation: 'detail',
      status: 404,
      code: 'workflow_instance_not_found_or_not_visible',
      details: { instanceId: 'abc' },
      requestId: 'req-1',
      responseRequestId: 'upstream-req-1',
    });

    const result = mapWorkflowSdkError(error);
    expect(result).toBeDefined();
    expect(result!.status).toBe(404);
    expect(result!.code).toBe('workflow_instance_not_found_or_not_visible');
    expect(result!.message).toBe('Instance not found');
    expect(result!.details).toEqual({ instanceId: 'abc' });
  });

  it('maps a transport WorkflowError with status 503', () => {
    const error = new WorkflowError('svc-workflow unavailable', {
      kind: 'transport',
      operation: 'create',
      status: 503,
      code: 'service_unavailable',
      requestId: 'req-1',
    });

    const result = mapWorkflowSdkError(error);
    expect(result).toBeDefined();
    expect(result!.status).toBe(503);
    expect(result!.code).toBe('service_unavailable');
  });
});

describe('toV2HttpError', () => {
  it('returns undefined for non-WorkflowError', () => {
    expect(toV2HttpError(new Error('random'))).toBeUndefined();
  });

  it('converts a WorkflowError to V2HttpError', () => {
    const error = new WorkflowError('conflict', {
      kind: 'api',
      operation: 'transition',
      status: 409,
      code: 'workflow_state_version_conflict',
      details: { currentVersion: 2, expectedVersion: 1 },
      requestId: 'req-1',
    });

    const result = toV2HttpError(error);
    expect(result).toBeInstanceOf(V2HttpError);
    expect(result!.status).toBe(409);
    expect(result!.code).toBe('workflow_state_version_conflict');
    expect(result!.message).toBe('conflict');
  });
});
