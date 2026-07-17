import { WorkflowClient } from '../../clients/svc-workflow/client.js';
import type {
  CreateWorkflowInstanceInput,
  CreateWorkflowInstanceResult,
  ExecuteWorkflowTransitionInput,
  ExecuteWorkflowTransitionResult,
  WorkflowInstanceDetail,
  WorkflowTimelinePage,
  WorkflowTimelineQuery,
  WorklistCursorQuery,
  WorklistPage,
} from '../../clients/svc-workflow/contracts.js';
import type { V2Config } from '../config.js';

export interface V2WorkflowGateway {
  assertReady(): Promise<void>;
  create(
    input: CreateWorkflowInstanceInput,
    idempotencyKey: string,
  ): Promise<CreateWorkflowInstanceResult>;
  detail(workflowInstanceId: string): Promise<WorkflowInstanceDetail>;
  transition(
    workflowInstanceId: string,
    input: ExecuteWorkflowTransitionInput,
    idempotencyKey: string,
  ): Promise<ExecuteWorkflowTransitionResult>;
  timeline(
    workflowInstanceId: string,
    query?: WorkflowTimelineQuery,
  ): Promise<WorkflowTimelinePage>;
  assignedToMe(query?: WorklistCursorQuery): Promise<WorklistPage>;
  creatorOwnedDrafts(query?: WorklistCursorQuery): Promise<WorklistPage>;
}

export type V2WorkflowGatewayFactory = (accessToken: string) => V2WorkflowGateway;

export function createV2WorkflowGatewayFactory(config: V2Config): V2WorkflowGatewayFactory {
  return (accessToken) => {
    const client = new WorkflowClient({
      baseUrl: config.svcWorkflowBaseUrl,
      requestTimeoutMs: config.svcWorkflowRequestTimeoutMs,
      maxAttempts: config.svcWorkflowMaxAttempts,
      accessTokenProvider: () => accessToken,
    });
    return {
      assertReady: () => client.assertSmokeReady(),
      create: (input, idempotencyKey) => client.create(input, { idempotencyKey }),
      detail: (workflowInstanceId) => client.detail(workflowInstanceId),
      transition: (workflowInstanceId, input, idempotencyKey) =>
        client.transition(workflowInstanceId, input, { idempotencyKey }),
      timeline: (workflowInstanceId, query) => client.timeline(workflowInstanceId, query),
      assignedToMe: (query) => client.assignedToMe(query),
      creatorOwnedDrafts: (query) => client.creatorOwnedDrafts(query),
    };
  };
}
