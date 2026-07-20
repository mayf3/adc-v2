import { describe, expect, it } from 'vitest';

import {
  adaptCreateResponse,
  adaptCreatorDraftPage,
  adaptDetailResponse,
  adaptTimelineResponse,
  adaptTransitionResponse,
  adaptWorklistPage,
} from './adapters.js';

describe('adaptCreateResponse', () => {
  it('passes through all fields from the SDK response', () => {
    const raw = {
      workflowInstanceId: '33333333-3333-4333-8333-333333333333',
      workflowStateVersion: 1,
      currentContextRevisionId: '44444444-4444-4444-8444-444444444444',
      currentNodeVisitId: '55555555-5555-4555-8555-555555555555',
      eventSequence: 1,
    };
    expect(adaptCreateResponse(raw)).toEqual(raw);
  });
});

describe('adaptTransitionResponse', () => {
  it('passes through all fields from the SDK response', () => {
    const raw = {
      workflowInstanceId: '33333333-3333-4333-8333-333333333333',
      workflowStateVersion: 2,
      currentContextRevisionId: '44444444-4444-4444-8444-444444444444',
      sourceNodeVisitId: '55555555-5555-4555-8555-555555555555',
      currentNodeVisitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      submissionId: null,
      eventSequence: 2,
    };
    expect(adaptTransitionResponse(raw)).toEqual(raw);
  });

  it('passes through submissionId when non-null', () => {
    const raw = {
      workflowInstanceId: '33333333-3333-4333-8333-333333333333',
      workflowStateVersion: 2,
      currentContextRevisionId: '44444444-4444-4444-8444-444444444444',
      sourceNodeVisitId: '55555555-5555-4555-8555-555555555555',
      currentNodeVisitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      submissionId: 'sub-123',
      eventSequence: 2,
    };
    expect(adaptTransitionResponse(raw)).toEqual(raw);
  });
});

describe('adaptDetailResponse', () => {
  it('passes through the full SDK detail response (no transformation)', () => {
    const raw = {
      visibility: 'full' as const,
      detail: {
        instance: {
          workflowInstanceId: '33333333-3333-4333-8333-333333333333',
          domainId: '11111111-1111-4111-8111-111111111111',
          definitionVersionId: '22222222-2222-4222-8222-222222222222',
          definitionVersionStatus: 'PUBLISHED',
          createdByPrincipalId: 'user-1',
          workflowStateVersion: 1,
          externalReference: null,
          externalUrl: null,
          metadata: { source: 'adc-v2' },
          createdAt: '2026-07-16T00:00:00.000Z',
          domainEnabled: true,
          isTerminal: false,
          currentNode: {
            nodeId: 'node-1',
            nodeKey: 'draft',
            displayName: 'Draft',
            nodeType: 'DRAFT',
          },
        },
        currentContextRevisionId: 'ctx-1',
        currentNodeVisitId: 'visit-1',
        currentContext: {
          contextRevisionId: 'ctx-1',
          workflowInstanceId: '33333333-3333-4333-8333-333333333333',
          revisionNumber: 1,
          previousRevisionId: null,
          payload: { title: 'Test' },
          payloadDigest: 'digest',
          createdByPrincipalId: 'user-1',
          createdAt: '2026-07-16T00:00:00.000Z',
        },
        currentVisit: {
          nodeVisitId: 'visit-1',
          workflowInstanceId: '33333333-3333-4333-8333-333333333333',
          node: {
            nodeId: 'node-1',
            nodeKey: 'draft',
            displayName: 'Draft',
            nodeType: 'DRAFT',
          },
          visitNumber: 1,
          assigneePrincipalId: null,
          enteredByTransitionId: null,
          instructions: null,
          createdAt: '2026-07-16T00:00:00.000Z',
        },
        outgoingTransitions: [],
      },
    };
    expect(adaptDetailResponse(raw)).toBe(raw); // same reference since no transformation
  });
});

describe('adaptTimelineResponse', () => {
  it('preserves items and nextCursor', () => {
    const raw = {
      items: [
        {
          eventId: 'evt-1',
          workflowInstanceId: '33333333-3333-4333-8333-333333333333',
          eventSequence: 1,
          eventSchemaVersion: '1.0.0',
          commandId: null,
          causationId: null,
          correlationId: null,
          eventType: 'WORKFLOW_INSTANCE_CREATED',
          transitionEffect: null,
          sourceNodeVisitId: null,
          targetNodeVisitId: null,
          contextRevisionId: null,
          submissionId: null,
          eventData: null,
          eventDataDigest: null,
          actorPrincipalId: 'user-1',
          fromNodeId: null,
          toNodeId: null,
          oldWorkflowStateVersion: 0,
          newWorkflowStateVersion: 1,
          createdAt: '2026-07-16T00:00:00.000Z',
        },
      ],
      nextCursor: 1,
    };
    const adapted = adaptTimelineResponse(raw);
    expect(adapted.items).toHaveLength(1);
    expect(adapted.nextCursor).toBe(1);
  });

  it('handles null nextCursor', () => {
    const raw = { items: [], nextCursor: null };
    expect(adaptTimelineResponse(raw)).toEqual(raw);
  });
});

describe('adaptWorklistPage', () => {
  it('preserves items and nextCursor', () => {
    const raw = {
      items: [
        {
          detail: {
            instance: {
              workflowInstanceId: '33333333-3333-4333-8333-333333333333',
              domainId: '11111111-1111-4111-8111-111111111111',
              definitionVersionId: '22222222-2222-4222-8222-222222222222',
              definitionVersionStatus: 'PUBLISHED',
              createdByPrincipalId: 'user-1',
              workflowStateVersion: 1,
              externalReference: null,
              externalUrl: null,
              metadata: { source: 'adc-v2' },
              createdAt: '2026-07-16T00:00:00.000Z',
              domainEnabled: true,
              isTerminal: false,
              currentNode: {
                nodeId: 'node-1',
                nodeKey: 'draft',
                displayName: 'Draft',
                nodeType: 'DRAFT',
              },
            },
            currentContextRevisionId: 'ctx-1',
            currentNodeVisitId: 'visit-1',
            currentContext: {
              contextRevisionId: 'ctx-1',
              workflowInstanceId: '33333333-3333-4333-8333-333333333333',
              revisionNumber: 1,
              previousRevisionId: null,
              payload: { title: 'Test' },
              payloadDigest: 'digest',
              createdByPrincipalId: 'user-1',
              createdAt: '2026-07-16T00:00:00.000Z',
            },
            currentVisit: {
              nodeVisitId: 'visit-1',
              workflowInstanceId: '33333333-3333-4333-8333-333333333333',
              node: {
                nodeId: 'node-1',
                nodeKey: 'draft',
                displayName: 'Draft',
                nodeType: 'DRAFT',
              },
              visitNumber: 1,
              assigneePrincipalId: null,
              enteredByTransitionId: null,
              instructions: null,
              createdAt: '2026-07-16T00:00:00.000Z',
            },
            outgoingTransitions: [],
          },
        },
      ],
      nextCursor: 'cursor-abc',
    };
    const adapted = adaptWorklistPage(raw);
    expect(adapted.items).toHaveLength(1);
    expect(adapted.nextCursor).toBe('cursor-abc');
  });

  it('handles null nextCursor', () => {
    const raw = { items: [], nextCursor: null };
    expect(adaptWorklistPage(raw)).toEqual(raw);
  });
});

describe('adaptCreatorDraftPage', () => {
  it('preserves items and nextCursor', () => {
    const raw = {
      items: [
        {
          detail: {
            instance: {
              workflowInstanceId: '33333333-3333-4333-8333-333333333333',
              domainId: '11111111-1111-4111-8111-111111111111',
              definitionVersionId: '22222222-2222-4222-8222-222222222222',
              definitionVersionStatus: 'PUBLISHED',
              createdByPrincipalId: 'user-1',
              workflowStateVersion: 1,
              externalReference: null,
              externalUrl: null,
              metadata: null,
              createdAt: '2026-07-16T00:00:00.000Z',
              domainEnabled: true,
              isTerminal: false,
              currentNode: {
                nodeId: 'node-1',
                nodeKey: 'draft',
                displayName: 'Draft',
                nodeType: 'DRAFT',
              },
            },
          },
        },
      ],
      nextCursor: 'cursor-xyz',
    };
    const adapted = adaptCreatorDraftPage(raw);
    expect(adapted.items).toHaveLength(1);
    expect(adapted.nextCursor).toBe('cursor-xyz');
  });
});
