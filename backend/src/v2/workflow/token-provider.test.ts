import { describe, expect, it } from 'vitest';

import {
  type AdcRequestContext,
  type WorkflowBearerTokenProvider,
  type WorkflowTokenProviderInput,
  DeprecatedDirectBearerProvider,
  DisabledWorkflowTokenProvider,
  FakeWorkflowTokenProvider,
  UpstreamBlockedTokenProvider,
  WorkflowTokenDisabledError,
  WorkflowTokenUpstreamBlockedError,
  createTokenProvider,
} from './token-provider.js';

const testContext: AdcRequestContext = {
  requestId: 'test-req-1',
  route: '/api/v2/workflow-instances',
  requiredWorkflowScope: 'workflow.read',
};

function makeInput(
  overrides?: Partial<WorkflowTokenProviderInput>,
): WorkflowTokenProviderInput {
  return {
    requiredScope: 'workflow.read',
    requestContext: testContext,
    ...overrides,
  };
}

describe('FakeWorkflowTokenProvider', () => {
  it('returns the configured fake token', async () => {
    const provider = new FakeWorkflowTokenProvider('my-fake-token');
    const token = await provider.getToken(makeInput());
    expect(token).toBe('my-fake-token');
  });

  it('returns a default token when none is configured', async () => {
    const provider = new FakeWorkflowTokenProvider();
    const token = await provider.getToken(makeInput());
    expect(token).toBe('fake-workflow-token-for-test');
  });

  it('ignores the input scope and context', async () => {
    const provider = new FakeWorkflowTokenProvider('static-token');
    const token = await provider.getToken(
      makeInput({ requiredScope: 'workflow.execute', requestContext: { ...testContext, requestId: 'other' } }),
    );
    expect(token).toBe('static-token');
  });
});

describe('DisabledWorkflowTokenProvider', () => {
  it('throws WorkflowTokenDisabledError', async () => {
    const provider = new DisabledWorkflowTokenProvider();
    await expect(provider.getToken(makeInput())).rejects.toThrow(WorkflowTokenDisabledError);
  });

  it('throws with code ADC_WORKFLOW_REAL_OBO_DISABLED', async () => {
    const provider = new DisabledWorkflowTokenProvider();
    try {
      await provider.getToken(makeInput());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowTokenDisabledError);
      expect((error as WorkflowTokenDisabledError).code).toBe('ADC_WORKFLOW_REAL_OBO_DISABLED');
    }
  });
});

describe('UpstreamBlockedTokenProvider', () => {
  it('throws WorkflowTokenUpstreamBlockedError', async () => {
    const provider = new UpstreamBlockedTokenProvider();
    await expect(provider.getToken(makeInput())).rejects.toThrow(WorkflowTokenUpstreamBlockedError);
  });

  it('throws with code UPSTREAM_CONFORMANCE_NOT_READY', async () => {
    const provider = new UpstreamBlockedTokenProvider();
    try {
      await provider.getToken(makeInput());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowTokenUpstreamBlockedError);
      expect((error as WorkflowTokenUpstreamBlockedError).code).toBe('UPSTREAM_CONFORMANCE_NOT_READY');
    }
  });
});

describe('DeprecatedDirectBearerProvider', () => {
  it('returns the raw authorization reference when present', async () => {
    const provider = new DeprecatedDirectBearerProvider();
    const token = await provider.getToken(
      makeInput({
        requestContext: { ...testContext, rawAuthorizationReference: 'my-bearer-token' },
      }),
    );
    expect(token).toBe('my-bearer-token');
  });

  it('throws when no rawAuthorizationReference is present', async () => {
    const provider = new DeprecatedDirectBearerProvider();
    await expect(
      provider.getToken(makeInput({ requestContext: { ...testContext, rawAuthorizationReference: undefined } })),
    ).rejects.toThrow(WorkflowTokenDisabledError);
  });
});

describe('createTokenProvider factory', () => {
  it('creates a disabled provider by default', () => {
    const provider = createTokenProvider('disabled');
    expect(provider).toBeInstanceOf(DisabledWorkflowTokenProvider);
  });

  it('creates a fake provider', () => {
    const provider = createTokenProvider('fake', { fakeToken: 'custom' });
    expect(provider).toBeInstanceOf(FakeWorkflowTokenProvider);
  });

  it('creates a blocked provider', () => {
    const provider = createTokenProvider('blocked');
    expect(provider).toBeInstanceOf(UpstreamBlockedTokenProvider);
  });

  it('creates a deprecated direct provider', () => {
    const provider = createTokenProvider('deprecated-direct');
    expect(provider).toBeInstanceOf(DeprecatedDirectBearerProvider);
  });

  it('treats unknown kind as disabled', () => {
    const provider = createTokenProvider('unknown' as never);
    expect(provider).toBeInstanceOf(DisabledWorkflowTokenProvider);
  });
});

describe('WorkflowBearerTokenProvider interface contract', () => {
  it('providers are asynchronous (return Promise)', async () => {
    const fakeResult = new FakeWorkflowTokenProvider('test').getToken(makeInput());
    expect(fakeResult).toBeInstanceOf(Promise);
    await expect(fakeResult).resolves.toBe('test');

    const disabledResult = new DisabledWorkflowTokenProvider().getToken(makeInput());
    expect(disabledResult).toBeInstanceOf(Promise);
    await expect(disabledResult).rejects.toThrow();

    const blockedResult = new UpstreamBlockedTokenProvider().getToken(makeInput());
    expect(blockedResult).toBeInstanceOf(Promise);
    await expect(blockedResult).rejects.toThrow();

    const directResult = new DeprecatedDirectBearerProvider().getToken(makeInput());
    expect(directResult).toBeInstanceOf(Promise);
    await expect(directResult).rejects.toThrow();
  });
});
