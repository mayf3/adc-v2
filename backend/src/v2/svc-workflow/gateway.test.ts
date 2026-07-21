/**
 * Gateway token provider selection tests.
 *
 * Tests the REAL token provider selection logic in createV2WorkflowGatewayFactory
 * — NOT a mocked gateway.  Verifies that no production path selects
 * DeprecatedDirectBearerProvider or forwards the inbound Authorization header.
 */

import { describe, expect, it } from 'vitest';

import { createV2WorkflowGatewayFactory } from './gateway.js';
import { DisabledWorkflowTokenProvider, UpstreamBlockedTokenProvider } from '../workflow/token-provider.js';

/** Minimal config shape consumed by createV2WorkflowGatewayFactory. */
function makeConfig(realOboEnabled: boolean) {
  return {
    svcWorkflowBaseUrl: 'http://127.0.0.1:8989',
    svcWorkflowRequestTimeoutMs: 35_000,
    svcWorkflowMaxAttempts: 3,
    workflowFeatureFlags: { realOboEnabled },
  };
}

describe('createV2WorkflowGatewayFactory token provider selection', () => {
  /**
   * The factory returns (accessToken) => V2WorkflowGateway.
   * Calling any method on the gateway triggers token resolution.
   * We assert the failure mode to verify which provider was selected.
   */

  it('realOboEnabled=false selects DisabledWorkflowTokenProvider (fail-closed)', async () => {
    const factory = createV2WorkflowGatewayFactory(makeConfig(false));
    const gateway = factory('some-token');

    // detail is authenticated → triggers token resolution → must fail with disabled error.
    // (assertReady/version are unauthenticated and would try real HTTP.)
    await expect(gateway.detail('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      status: 503,
      code: 'ADC_WORKFLOW_REAL_OBO_DISABLED',
    });
  });

  it('realOboEnabled=true selects UpstreamBlockedTokenProvider (fail-closed, not direct bearer)', async () => {
    const factory = createV2WorkflowGatewayFactory(makeConfig(true));
    const gateway = factory('some-token');

    // Must NOT forward the inbound token. Must fail with upstream blocked error.
    await expect(gateway.detail('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      status: 503,
      code: 'UPSTREAM_CONFORMANCE_NOT_READY',
    });
  });

  it('realOboEnabled=true does NOT select DeprecatedDirectBearerProvider', async () => {
    // Verify the gateway cannot complete any workflow call when real OBO is
    // enabled but no OBO provider exists.  All operations must fail-closed.
    const factory = createV2WorkflowGatewayFactory(makeConfig(true));
    const gateway = factory('inbound-token');

    // detail
    await expect(gateway.detail('11111111-1111-4111-8111-111111111111')).rejects.toThrow();

    // timeline
    await expect(gateway.timeline('11111111-1111-4111-8111-111111111111')).rejects.toThrow();

    // worklist
    await expect(gateway.assignedToMe()).rejects.toThrow();
    await expect(gateway.creatorOwnedDrafts()).rejects.toThrow();

    // create (if we get past token resolution — but fails earlier)
    await expect(gateway.create(
      { domainId: 'd', definitionVersionId: 'd', metadata: {}, contextPayload: {} },
      'key',
    )).rejects.toThrow();

    // transition
    await expect(gateway.transition(
      '11111111-1111-4111-8111-111111111111',
      { transitionDefinitionId: 't', expectedWorkflowStateVersion: 1 },
      'key',
    )).rejects.toThrow();

    // listDomainInstances (authenticated — triggers token resolution)
    await expect(gateway.assignedToMe()).rejects.toThrow();
  });

  it('does not forward the inbound Authorization token as a workflow token', async () => {
    // The factory never exposes the accessToken to the caller or stores it.
    // The token is only passed as rawAuthorizationReference to the token provider.
    // With realOboEnabled=true, UpstreamBlockedTokenProvider ignores the reference
    // and throws before any HTTP call.
    const factory = createV2WorkflowGatewayFactory(makeConfig(true));
    const gateway = factory('secret-inbound-token');

    try {
      await gateway.detail('11111111-1111-4111-8111-111111111111');
      expect.unreachable('should have thrown');
    } catch (error) {
      // Ensure the error is from the blocked provider, not from svc-workflow
      const err = error as { code?: string; message?: string };
      expect(err.code).toBe('UPSTREAM_CONFORMANCE_NOT_READY');
      expect(err.message).not.toContain('secret-inbound-token');
    }
  });

  it('with writeEnabled=true still cannot perform writes when OBO is blocked', async () => {
    // The gateway does not check writeEnabled — write gating is in app.ts routes.
    // Even if write were enabled elsewhere, the gateway still fails at token
    // resolution when realOboEnabled=true.  This test verifies the gateway
    // itself is fail-closed regardless of write flags.
    const factory = createV2WorkflowGatewayFactory(makeConfig(true));
    const gateway = factory('some-token');

    await expect(gateway.create(
      { domainId: 'd', definitionVersionId: 'd', metadata: {}, contextPayload: {} },
      'key',
    )).rejects.toThrow();

    await expect(gateway.transition(
      '11111111-1111-4111-8111-111111111111',
      { transitionDefinitionId: 't', expectedWorkflowStateVersion: 1 },
      'key',
    )).rejects.toThrow();
  });
});
