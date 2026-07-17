export interface DefinitionBinding {
  scenarioKey: string;
  displayName?: string;
}

export interface CreateWorkflowInput {
  scenarioKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  references: ExternalReference[];
  additionalContext?: Record<string, unknown>;
}

export interface ExternalReference {
  type: string;
  uri: string;
  digest: string;
}

export interface WorkflowNode {
  nodeId?: string;
  nodeKey?: string;
  displayName?: string;
  nodeType?: string;
}

export interface WorkflowTransition {
  transitionId?: string;
  transitionDefinitionId?: string;
  transitionKey?: string;
  displayName?: string;
  transitionEffect?: string;
  targetNode?: WorkflowNode;
  submissionSchema?: unknown;
  executableForActor: boolean;
  blockedReason?: string | null;
}

export interface WorkflowInstance {
  workflowInstanceId: string;
  workflowStateVersion?: number;
  definitionVersionId?: string;
  definitionVersionStatus?: string;
  createdByPrincipalId?: string;
  createdAt?: string;
  isTerminal?: boolean;
  currentNode?: WorkflowNode;
  currentAssigneePrincipalId?: string | null;
  context?: Record<string, unknown>;
  outgoingTransitions: WorkflowTransition[];
  visibility?: string;
  raw: Record<string, unknown>;
}

export interface WorklistItem {
  workflowInstanceId: string;
  title?: string;
  status?: string;
  currentNode?: WorkflowNode;
  assignee?: string | null;
  updatedAt?: string;
}

export interface TimelineEvent {
  eventId: string;
  eventSequence?: number;
  eventType?: string;
  transitionEffect?: string | null;
  actorPrincipalId?: string;
  oldWorkflowStateVersion?: number;
  newWorkflowStateVersion?: number;
  createdAt?: string;
  eventData?: unknown;
}

export interface TimelineResult {
  items: TimelineEvent[];
  nextCursor?: number | string | null;
}

export interface ExecuteTransitionInput {
  transitionDefinitionId: string;
  expectedWorkflowStateVersion: number;
  submissionPayload?: unknown;
}
