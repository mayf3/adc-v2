/**
 * ADC V2 Workflow Bearer Token Provider.
 *
 * This is the ADC-internal interface for obtaining a Workflow bearer token.
 * It MUST NOT parse JWT claims, resolve principals, or cache request objects.
 *
 * Current allowed implementations (section 5):
 *   - FakeProvider (test only)
 *   - DisabledProvider (fail-closed)
 *   - BlockedProvider (returns UPSTREAM_CONFORMANCE_NOT_READY)
 *
 * The old direct-bearer-pass-through pattern (DeprecatedDirectBearerProvider)
 * is kept for dev migration only, marked DEPRECATED, and must NOT be used
 * in production or enabled by default.
 */

export type WorkflowScope = 'workflow.read' | 'workflow.execute';

export interface AdcRequestContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly route: string;
  readonly requiredAdcScope?: string;
  readonly requiredWorkflowScope?: WorkflowScope;
  /**
   * Opaque reference to the subject's bearer token.
   * The provider must NOT inspect or parse this value.
   */
  readonly rawAuthorizationReference?: string;
}

export interface WorkflowTokenProviderInput {
  readonly requiredScope: WorkflowScope;
  readonly requestContext: AdcRequestContext;
}

export interface WorkflowBearerTokenProvider {
  getToken(input: WorkflowTokenProviderInput): Promise<string>;
}

// ---------------------------------------------------------------------------
// Allowed implementations
// ---------------------------------------------------------------------------

/**
 * Fake provider that returns a fixed token.
 * For test use only.
 */
export class FakeWorkflowTokenProvider implements WorkflowBearerTokenProvider {
  constructor(private readonly token: string = 'fake-workflow-token-for-test') {}

  async getToken(_input: WorkflowTokenProviderInput): Promise<string> {
    return this.token;
  }
}

/**
 * Disabled provider that always throws.
 * This is the default production provider — fail-closed.
 */
export class DisabledWorkflowTokenProvider implements WorkflowBearerTokenProvider {
  async getToken(_input: WorkflowTokenProviderInput): Promise<string> {
    throw new WorkflowTokenDisabledError();
  }
}

/**
 * Blocked provider that indicates upstream conformance is not ready.
 * This is a softer failure than DisabledProvider for development awareness.
 */
export class UpstreamBlockedTokenProvider implements WorkflowBearerTokenProvider {
  async getToken(_input: WorkflowTokenProviderInput): Promise<string> {
    throw new WorkflowTokenUpstreamBlockedError();
  }
}

// ---------------------------------------------------------------------------
// Deprecated implementation (direct bearer passthrough)
// ---------------------------------------------------------------------------

/**
 * @deprecated Direct bearer passthrough — does not perform real OBO token exchange.
 * Only for temporary dev use. Must NOT be enabled in production.
 */
export class DeprecatedDirectBearerProvider implements WorkflowBearerTokenProvider {
  async getToken(input: WorkflowTokenProviderInput): Promise<string> {
    const ref = input.requestContext.rawAuthorizationReference;
    if (!ref) {
      throw new WorkflowTokenDisabledError();
    }
    return ref;
  }
}

// ---------------------------------------------------------------------------
// Token provider factory
// ---------------------------------------------------------------------------

export type TokenProviderKind = 'disabled' | 'blocked' | 'fake' | 'deprecated-direct';

export function createTokenProvider(
  kind: TokenProviderKind,
  options?: { fakeToken?: string },
): WorkflowBearerTokenProvider {
  switch (kind) {
    case 'fake':
      return new FakeWorkflowTokenProvider(options?.fakeToken);
    case 'blocked':
      return new UpstreamBlockedTokenProvider();
    case 'deprecated-direct':
      return new DeprecatedDirectBearerProvider();
    case 'disabled':
    default:
      return new DisabledWorkflowTokenProvider();
  }
}

// ---------------------------------------------------------------------------
// Token errors
// ---------------------------------------------------------------------------

export class WorkflowTokenError extends Error {
  readonly name = 'WorkflowTokenError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class WorkflowTokenDisabledError extends WorkflowTokenError {
  constructor() {
    super('ADC_WORKFLOW_REAL_OBO_DISABLED', 'Real OBO token exchange is disabled');
  }
}

export class WorkflowTokenUpstreamBlockedError extends WorkflowTokenError {
  constructor() {
    super(
      'UPSTREAM_CONFORMANCE_NOT_READY',
      'Upstream auth-service conformance is not ready yet',
    );
  }
}
