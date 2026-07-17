import { apiClient } from './api-client';
import type {
  CreateWorkflowInput,
  DefinitionBinding,
  ExecuteTransitionInput,
  TimelineEvent,
  TimelineResult,
  WorkflowInstance,
  WorkflowNode,
  WorkflowTransition,
  WorklistItem,
} from './types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function first<T>(record: JsonRecord, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key] as T;
  }
  return undefined;
}

function unwrap(value: unknown): unknown {
  const record = asRecord(value);
  return record.data !== undefined ? record.data : value;
}

function listFrom(value: unknown, ...keys: string[]): unknown[] {
  const payload = unwrap(value);
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function normalizeNode(value: unknown): WorkflowNode | undefined {
  const node = asRecord(value);
  if (Object.keys(node).length === 0) return undefined;
  return {
    nodeId: first(node, 'nodeId', 'node_id'),
    nodeKey: first(node, 'nodeKey', 'node_key', 'key'),
    displayName: first(node, 'displayName', 'display_name', 'name'),
    nodeType: first(node, 'nodeType', 'node_type', 'type'),
  };
}

function normalizeTransition(value: unknown): WorkflowTransition {
  const transition = asRecord(value);
  return {
    transitionId: first(transition, 'transitionId', 'transition_id', 'id'),
    transitionDefinitionId: first(
      transition,
      'transitionDefinitionId',
      'transition_definition_id',
      'transitionId',
      'transition_id',
      'id',
    ),
    transitionKey: first(transition, 'transitionKey', 'transition_key', 'key'),
    displayName: first(transition, 'displayName', 'display_name', 'name'),
    transitionEffect: first(transition, 'transitionEffect', 'transition_effect', 'effect'),
    targetNode: normalizeNode(first(transition, 'targetNode', 'target_node')),
    submissionSchema: first(transition, 'submissionSchema', 'submission_schema'),
    executableForActor: first<boolean>(transition, 'executableForActor', 'executable_for_actor') === true,
    blockedReason: first(transition, 'blockedReason', 'blocked_reason'),
  };
}

function normalizeInstance(value: unknown): WorkflowInstance {
  const envelope = asRecord(unwrap(value));
  const detailCandidate = first(envelope, 'detail');
  const detail = Object.keys(asRecord(detailCandidate)).length > 0
    ? asRecord(detailCandidate)
    : envelope;
  const instanceCandidate = first(detail, 'instance');
  const instance = Object.keys(asRecord(instanceCandidate)).length > 0
    ? asRecord(instanceCandidate)
    : detail;
  const visit = asRecord(first(detail, 'currentVisit', 'current_visit'));
  const contextRevision = asRecord(first(detail, 'currentContext', 'current_context'));
  const contextPayload = asRecord(first(contextRevision, 'payload'));
  const transitions = first<unknown[]>(
    detail,
    'outgoingTransitions',
    'outgoing_transitions',
    'executableTransitions',
    'availableTransitions',
    'actions',
  ) ?? [];
  const workflowInstanceId = first<string>(
    instance,
    'workflowInstanceId',
    'workflow_instance_id',
    'instanceId',
    'id',
  ) ?? '';

  return {
    workflowInstanceId,
    workflowStateVersion: first(instance, 'workflowStateVersion', 'workflow_state_version', 'version'),
    definitionVersionId: first(instance, 'definitionVersionId', 'definition_version_id'),
    definitionVersionStatus: first(instance, 'definitionVersionStatus', 'definition_version_status', 'status'),
    createdByPrincipalId: first(instance, 'createdByPrincipalId', 'created_by_principal_id'),
    createdAt: first(instance, 'createdAt', 'created_at'),
    isTerminal: first(instance, 'isTerminal', 'is_terminal'),
    currentNode: normalizeNode(first(instance, 'currentNode', 'current_node') ?? first(visit, 'node')),
    currentAssigneePrincipalId: first(
      visit,
      'assigneePrincipalId',
      'assignee_principal_id',
    ),
    context: Object.keys(contextPayload).length > 0
      ? contextPayload
      : asRecord(first(instance, 'context', 'contextPayload', 'context_payload')),
    outgoingTransitions: transitions.map(normalizeTransition),
    visibility: first(envelope, 'visibility'),
    raw: envelope,
  };
}

function normalizeTimelineEvent(value: unknown): TimelineEvent {
  const event = asRecord(value);
  return {
    eventId: first(event, 'eventId', 'event_id', 'id') ?? '',
    eventSequence: first(event, 'eventSequence', 'event_sequence', 'sequence'),
    eventType: first(event, 'eventType', 'event_type', 'type'),
    transitionEffect: first(event, 'transitionEffect', 'transition_effect'),
    actorPrincipalId: first(event, 'actorPrincipalId', 'actor_principal_id'),
    oldWorkflowStateVersion: first(event, 'oldWorkflowStateVersion', 'old_workflow_state_version'),
    newWorkflowStateVersion: first(event, 'newWorkflowStateVersion', 'new_workflow_state_version'),
    createdAt: first(event, 'createdAt', 'created_at'),
    eventData: first(event, 'eventData', 'event_data', 'data'),
  };
}

export function describeApiError(error: unknown): string {
  const errorObj = error as { status?: number; response?: { error?: { message?: string } } };
  if (errorObj.response?.error?.message) return errorObj.response.error.message;
  if (error instanceof Error) return error.message;
  return '请求失败，请稍后重试。';
}

export function apiStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

export const v2Api = {
  async getDefinitionBindings(): Promise<DefinitionBinding[]> {
    const response = await apiClient.get('/definition-bindings');
    return listFrom(response.data, 'items', 'bindings', 'definitionBindings').map((item) => {
      const binding = asRecord(item);
      return {
        scenarioKey: first<string>(binding, 'scenarioKey', 'scenario_key', 'key') ?? '',
        displayName: first<string>(binding, 'displayName', 'display_name', 'name'),
      };
    }).filter((binding) => binding.scenarioKey.length > 0);
  },

  async getWorklist(kind: 'assigned' | 'creator-drafts'): Promise<WorklistItem[]> {
    const response = await apiClient.get(
      '/worklist',
      { params: { kind } },
    );
    return listFrom(response.data, 'items', 'worklist').map((item) => {
      const record = asRecord(item);
      const instance = normalizeInstance(record);
      const context = instance.context ?? {};
      return {
        workflowInstanceId: instance.workflowInstanceId,
        title: first<string>(record, 'title') ?? first<string>(context, 'title'),
        status: first<string>(record, 'status') ?? instance.definitionVersionStatus,
        currentNode: instance.currentNode,
        assignee: first<string | null>(record, 'assignee', 'assigneePrincipalId', 'assignee_principal_id')
          ?? instance.currentAssigneePrincipalId,
        updatedAt: first<string>(record, 'updatedAt', 'updated_at') ?? instance.createdAt,
      };
    }).filter((item) => item.workflowInstanceId.length > 0);
  },

  async createWorkflowInstance(
    input: CreateWorkflowInput,
    idempotencyKey: string,
  ): Promise<WorkflowInstance> {
    const response = await apiClient.post(
      '/workflow-instances',
      input,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return normalizeInstance(response.data);
  },

  async getWorkflowInstance(id: string): Promise<WorkflowInstance> {
    const response = await apiClient.get(
      `/workflow-instances/${encodeURIComponent(id)}`,
    );
    return normalizeInstance(response.data);
  },

  async getTimeline(id: string): Promise<TimelineResult> {
    const response = await apiClient.get(
      `/workflow-instances/${encodeURIComponent(id)}/timeline`,
    );
    const payload = asRecord(unwrap(response.data));
    return {
      items: listFrom(response.data, 'items', 'events').map(normalizeTimelineEvent),
      nextCursor: first(payload, 'nextCursor', 'next_cursor'),
    };
  },

  async executeTransition(
    id: string,
    input: ExecuteTransitionInput,
    idempotencyKey: string,
  ): Promise<WorkflowInstance> {
    const response = await apiClient.post(
      `/workflow-instances/${encodeURIComponent(id)}/transitions`,
      input,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return normalizeInstance(response.data);
  },
};
