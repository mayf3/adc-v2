import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateWorkflowInstanceInput,
  ExecuteWorkflowTransitionInput,
  WorkflowInstanceDetail,
  WorkflowInstanceSummary,
} from '../clients/svc-workflow/contracts.js';
import { createV2App } from './app.js';
import type { V2Config } from './config.js';
import type { V2WorkflowGateway } from './svc-workflow/gateway.js';

const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';
const CONTEXT_ID = '44444444-4444-4444-8444-444444444444';
const VISIT_ID = '55555555-5555-4555-8555-555555555555';
const TRANSITION_ID = '66666666-6666-4666-8666-666666666666';
const NODE_ID = '77777777-7777-4777-8777-777777777777';
const TARGET_NODE_ID = '88888888-8888-4888-8888-888888888888';

const config: V2Config = {
  nodeEnv: 'test',
  port: 4100,
  frontendOrigins: ['http://localhost:5173'],
  svcWorkflowBaseUrl: 'http://127.0.0.1:8989',
  svcWorkflowRequestTimeoutMs: 35_000,
  svcWorkflowMaxAttempts: 3,
  definitionBindings: [{
    scenarioKey: 'development-delivery',
    displayName: 'Development delivery',
    domainId: '11111111-1111-4111-8111-111111111111',
    definitionVersionId: '22222222-2222-4222-8222-222222222222',
    definitionDigest: 'sha256:test-definition',
  }],
};

const summary: WorkflowInstanceSummary = {
  workflowInstanceId: INSTANCE_ID,
  domainId: config.definitionBindings[0].domainId,
  definitionVersionId: config.definitionBindings[0].definitionVersionId,
  definitionVersionStatus: 'PUBLISHED',
  createdByPrincipalId: '99999999-9999-4999-8999-999999999999',
  workflowStateVersion: 1,
  externalReference: null,
  externalUrl: null,
  metadata: { source: 'adc-v2' },
  createdAt: '2026-07-16T00:00:00.000Z',
  domainEnabled: true,
  isTerminal: false,
  currentNode: {
    nodeId: NODE_ID,
    nodeKey: 'draft',
    displayName: 'Draft',
    nodeType: 'DRAFT',
  },
};

const detail: WorkflowInstanceDetail = {
  visibility: 'full',
  detail: {
    instance: summary,
    currentContextRevisionId: CONTEXT_ID,
    currentNodeVisitId: VISIT_ID,
    currentContext: {
      contextRevisionId: CONTEXT_ID,
      workflowInstanceId: INSTANCE_ID,
      revisionNumber: 1,
      previousRevisionId: null,
      payload: { title: 'Direct workflow item' },
      payloadDigest: 'digest',
      createdByPrincipalId: '99999999-9999-4999-8999-999999999999',
      createdAt: '2026-07-16T00:00:00.000Z',
    },
    currentVisit: {
      nodeVisitId: VISIT_ID,
      workflowInstanceId: INSTANCE_ID,
      node: {
        nodeId: NODE_ID,
        nodeKey: 'draft',
        displayName: 'Draft',
        nodeType: 'DRAFT',
      },
      visitNumber: 1,
      assigneePrincipalId: '99999999-9999-4999-8999-999999999999',
      enteredByTransitionId: null,
      instructions: null,
      createdAt: '2026-07-16T00:00:00.000Z',
    },
    outgoingTransitions: [{
      transitionId: TRANSITION_ID,
      transitionKey: 'submit',
      displayName: 'Submit',
      transitionEffect: 'ADVANCE',
      targetNode: {
        nodeId: TARGET_NODE_ID,
        nodeKey: 'review',
        displayName: 'Review',
        nodeType: 'REVIEW',
      },
      submissionSchema: null,
      executableForActor: true,
      blockedReason: null,
    }],
  },
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function serve(gateway: V2WorkflowGateway) {
  const seenTokens: string[] = [];
  const app = createV2App({
    config,
    gatewayFactory(token) {
      seenTokens.push(token);
      return gateway;
    },
  });
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server has no TCP address');
  return { baseUrl: `http://127.0.0.1:${address.port}`, seenTokens };
}

function mockGateway(): V2WorkflowGateway {
  return {
    assertReady: vi.fn(async () => undefined),
    create: vi.fn(async () => ({
      workflowInstanceId: INSTANCE_ID,
      workflowStateVersion: 1,
      currentContextRevisionId: CONTEXT_ID,
      currentNodeVisitId: VISIT_ID,
      eventSequence: 1,
    })),
    detail: vi.fn(async () => detail),
    transition: vi.fn(async () => ({
      workflowInstanceId: INSTANCE_ID,
      workflowStateVersion: 2,
      currentContextRevisionId: CONTEXT_ID,
      sourceNodeVisitId: VISIT_ID,
      currentNodeVisitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      submissionId: null,
      eventSequence: 2,
    })),
    timeline: vi.fn(async () => ({ items: [], nextCursor: null })),
    assignedToMe: vi.fn(async () => ({ items: [summary], nextCursor: null })),
    creatorOwnedDrafts: vi.fn(async () => ({ items: [], nextCursor: null })),
  };
}

describe('ADC V2 no-authority adapter', () => {
  it('creates a WorkflowInstance directly from an immutable binding and caller idempotency key', async () => {
    const gateway = mockGateway();
    const { baseUrl, seenTokens } = await serve(gateway);
    const response = await fetch(`${baseUrl}/api/v2/workflow-instances`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer subject-agent-token',
        'content-type': 'application/json',
        'idempotency-key': 'adc-v2-create-test-1',
      },
      body: JSON.stringify({
        scenarioKey: 'development-delivery',
        title: 'Direct workflow item',
        description: 'No local Requirement is created.',
        acceptanceCriteria: ['SVC is the only authority'],
        references: [{ type: 'git_commit', uri: 'git://repo/commit', digest: 'sha256:abc' }],
        additionalContext: { priority: 'P1' },
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe(`/api/v2/workflow-instances/${INSTANCE_ID}`);
    expect(await response.json()).toMatchObject({ workflowInstanceId: INSTANCE_ID });
    expect(seenTokens).toEqual(['subject-agent-token']);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    const [input, idempotencyKey] = vi.mocked(gateway.create).mock.calls[0] as [
      CreateWorkflowInstanceInput,
      string,
    ];
    expect(idempotencyKey).toBe('adc-v2-create-test-1');
    expect(input).toEqual({
      domainId: config.definitionBindings[0].domainId,
      definitionVersionId: config.definitionBindings[0].definitionVersionId,
      metadata: {
        source: 'adc-v2',
        scenarioKey: 'development-delivery',
        definitionDigest: 'sha256:test-definition',
      },
      contextPayload: {
        priority: 'P1',
        title: 'Direct workflow item',
        description: 'No local Requirement is created.',
        acceptanceCriteria: 'SVC is the only authority',
        references: [{ type: 'git_commit', uri: 'git://repo/commit', digest: 'sha256:abc' }],
      },
    });
    expect(JSON.stringify(input)).not.toMatch(/actorPrincipalId|assignee|currentStep|stateVersion/);
  });

  it('rejects actor injection and missing bearer before calling svc-workflow', async () => {
    const gateway = mockGateway();
    const { baseUrl } = await serve(gateway);
    const missingBearer = await fetch(`${baseUrl}/api/v2/workflow-instances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'test' },
      body: JSON.stringify({ actorPrincipalId: 'injected' }),
    });
    expect(missingBearer.status).toBe(401);

    const actorInjection = await fetch(`${baseUrl}/api/v2/workflow-instances`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer subject-agent-token',
        'content-type': 'application/json',
        'idempotency-key': 'test',
      },
      body: JSON.stringify({
        scenarioKey: 'development-delivery',
        title: 'Injected actor',
        description: 'This request must be rejected.',
        acceptanceCriteria: ['Actor comes from JWT sub'],
        references: [],
        actorPrincipalId: '99999999-9999-4999-8999-999999999999',
      }),
    });
    expect(actorInjection.status).toBe(400);
    expect(gateway.create).not.toHaveBeenCalled();
  });

  it('maps malformed JSON to a client error without invoking svc-workflow', async () => {
    const gateway = mockGateway();
    const { baseUrl } = await serve(gateway);
    const response = await fetch(`${baseUrl}/api/v2/workflow-instances`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer subject-agent-token',
        'content-type': 'application/json',
        'idempotency-key': 'test',
      },
      body: '{"broken":',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } });
    expect(gateway.create).not.toHaveBeenCalled();
  });

  it('proxies detail, timeline, and transition without deriving workflow state', async () => {
    const gateway = mockGateway();
    const { baseUrl } = await serve(gateway);
    const headers = { authorization: 'Bearer subject-agent-token' };

    const detailResponse = await fetch(`${baseUrl}/api/v2/workflow-instances/${INSTANCE_ID}`, { headers });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toEqual(detail);

    const timelineResponse = await fetch(
      `${baseUrl}/api/v2/workflow-instances/${INSTANCE_ID}/timeline?after=0&limit=100`,
      { headers },
    );
    expect(timelineResponse.status).toBe(200);
    expect(gateway.timeline).toHaveBeenCalledWith(INSTANCE_ID, { after: 0, limit: 100 });

    const transitionResponse = await fetch(
      `${baseUrl}/api/v2/workflow-instances/${INSTANCE_ID}/transitions`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': 'adc-v2-transition-test-1',
        },
        body: JSON.stringify({
          transitionDefinitionId: TRANSITION_ID,
          expectedWorkflowStateVersion: 1,
          submissionPayload: { summary: 'complete' },
        }),
      },
    );
    expect(transitionResponse.status).toBe(200);
    const [id, input, key] = vi.mocked(gateway.transition).mock.calls[0] as [
      string,
      ExecuteWorkflowTransitionInput,
      string,
    ];
    expect({ id, input, key }).toEqual({
      id: INSTANCE_ID,
      input: {
        transitionDefinitionId: TRANSITION_ID,
        expectedWorkflowStateVersion: 1,
        submissionPayload: { summary: 'complete' },
      },
      key: 'adc-v2-transition-test-1',
    });
  });

  it('returns worklist from svc-workflow without maintaining a local projection', async () => {
    const gateway = mockGateway();
    const { baseUrl, seenTokens } = await serve(gateway);
    const response = await fetch(`${baseUrl}/api/v2/worklist?kind=assigned`, {
      headers: { authorization: 'Bearer subject-agent-token' },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(seenTokens).toContain('subject-agent-token');
    expect(gateway.assignedToMe).toHaveBeenCalledTimes(1);
  });

  it('returns creator-owned-drafts worklist', async () => {
    const gateway = mockGateway();
    const { baseUrl } = await serve(gateway);
    const response = await fetch(`${baseUrl}/api/v2/worklist?kind=creator-drafts`, {
      headers: { authorization: 'Bearer subject-agent-token' },
    });
    expect(response.status).toBe(200);
    expect(gateway.creatorOwnedDrafts).toHaveBeenCalledTimes(1);
  });

  it('publishes only non-sensitive binding choices without pretending to validate a bearer', async () => {
    const gateway = mockGateway();
    const { baseUrl, seenTokens } = await serve(gateway);
    const response = await fetch(`${baseUrl}/api/v2/definition-bindings`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ scenarioKey: 'development-delivery', displayName: 'Development delivery' }],
    });
    expect(seenTokens).toEqual([]);
  });

  it('has no Prisma, legacy route, or legacy env import in the V2 runtime', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const runtimeFiles = fs.readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    for (const relativeName of runtimeFiles) {
      const contents = fs.readFileSync(path.join(directory, relativeName), 'utf8');
      expect(contents, relativeName).not.toMatch(/@prisma|lib\/prisma|routes\/requirements|config\/env/);
    }
  });
});
