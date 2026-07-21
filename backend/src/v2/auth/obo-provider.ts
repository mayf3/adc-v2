/**
 * AuthServiceWorkflowOboTokenProvider — real OBO token provider.
 *
 * Performs RFC 8693 Token Exchange with auth-service to obtain a
 * workflow_obo token for accessing svc-workflow.
 *
 * Protocol:
 *   POST /oauth/token
 *   Authorization: Basic base64(client_id:client_secret)
 *   Content-Type: application/x-www-form-urlencoded
 *
 *   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
 *   &subject_token=<agent token>
 *   &subject_token_type=urn:ietf:params:oauth:token-type:access_token
 *   &requested_token_type=urn:ietf:params:oauth:token-type:access_token
 *   &audience=svc-workflow
 *   &scope=workflow.read
 */

import { type WorkflowBearerTokenProvider, type WorkflowTokenProviderInput, WorkflowTokenError } from '../workflow/token-provider.js';

/** Expected issued_token_type per RFC 8693 (contract provenance). */
const EXPECTED_ISSUED_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

export interface OboProviderConfig {
  /** auth-service Token Exchange URL (e.g. http://127.0.0.1:4001/oauth/token). */
  readonly tokenExchangeUrl: string;
  /** ADC OAuth Client ID (mc_ prefix). */
  readonly clientId: string;
  /** ADC OAuth Client Secret. */
  readonly clientSecret: string;
  /** Target audience for the exchanged token (e.g. svc-workflow). */
  readonly targetAudience: string;
  /** Request timeout in ms. */
  readonly requestTimeoutMs: number;
}

export interface TokenExchangeResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly scope: string;
}

/**
 * Real OBO token provider that exchanges the agent's subject token
 * for a workflow_obo token via auth-service Token Exchange.
 */
export class AuthServiceWorkflowOboTokenProvider implements WorkflowBearerTokenProvider {
  constructor(private readonly config: OboProviderConfig) {}

  async getToken(input: WorkflowTokenProviderInput): Promise<string> {
    const subjectToken = input.requestContext.rawAuthorizationReference;
    if (!subjectToken) {
      throw new WorkflowTokenError(
        'MISSING_SUBJECT_TOKEN',
        'No subject token available for OBO exchange',
      );
    }

    const response = await this.exchangeToken(subjectToken, input.requiredScope);
    return response.access_token;
  }

  private async exchangeToken(
    subjectToken: string,
    scope: string,
  ): Promise<TokenExchangeResponse> {
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: this.config.targetAudience,
      scope,
    });

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    let response: Response;
    try {
      response = await fetch(this.config.tokenExchangeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token Exchange request failed';
      throw new WorkflowTokenError('TOKEN_EXCHANGE_TRANSPORT_ERROR', message);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body ? `: ${body.slice(0, 200)}` : '';
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_FAILED',
        `Token Exchange failed (HTTP ${response.status})${detail}`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_INVALID_RESPONSE',
        'Token Exchange returned invalid JSON',
      );
    }

    const result = data as Record<string, unknown>;
    if (!result.access_token || typeof result.access_token !== 'string') {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_MISSING_TOKEN',
        'Token Exchange response missing access_token',
      );
    }

    const expiresIn = typeof result.expires_in === 'number' ? result.expires_in : 0;
    if (expiresIn <= 0) {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_INVALID_TTL',
        'Token Exchange returned invalid or missing expires_in',
      );
    }
    if (expiresIn > 300) {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_TTL_EXCEEDS_MAX',
        `Token Exchange TTL ${expiresIn}s exceeds maximum 300s`,
      );
    }

    const tokenType = String(result.token_type ?? '');
    if (tokenType !== 'Bearer') {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_UNEXPECTED_TOKEN_TYPE',
        `Token Exchange returned unexpected token_type: ${tokenType}`,
      );
    }

    // Validate issued_token_type if present (per RFC 8693).
    // The contract does not require this field, but if present it must match.
    if (result.issued_token_type !== undefined) {
      const issuedType = String(result.issued_token_type);
      if (issuedType !== EXPECTED_ISSUED_TOKEN_TYPE) {
        throw new WorkflowTokenError(
          'TOKEN_EXCHANGE_UNEXPECTED_ISSUED_TOKEN_TYPE',
          `Token Exchange returned unexpected issued_token_type: ${issuedType}`,
        );
      }
    }

    // Validate returned scope: exact match with requested scope.
    // Per contract section 5.4, the returned scope must be the 3-way intersection.
    // For V0 read-only canary, the only allowed scope is workflow.read.
    // We enforce strict equality: returned set MUST equal requested set.
    const returnedScope = result.scope;
    if (typeof returnedScope !== 'string' || returnedScope.trim().length === 0) {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_MISSING_SCOPE',
        'Token Exchange response missing or empty scope',
      );
    }
    validateScopeEquality(scope, returnedScope);

    return {
      access_token: result.access_token,
      token_type: tokenType,
      expires_in: expiresIn,
      scope: returnedScope,
    };
  }
}

/**
 * Validate that the returned scope set exactly matches the requested scope set.
 * Normalizes whitespace and ordering.
 *
 * @throws WorkflowTokenError on mismatch.
 */
export function validateScopeEquality(requested: string, returned: string): void {
  const requestedSet = normalizeScopeSet(requested);
  const returnedSet = normalizeScopeSet(returned);

  if (requestedSet.size === 0) {
    throw new WorkflowTokenError(
      'TOKEN_EXCHANGE_MALFORMED_SCOPE',
      'Requested scope is empty — cannot validate exchange response',
    );
  }

  if (returnedSet.size === 0) {
    throw new WorkflowTokenError(
      'TOKEN_EXCHANGE_MISSING_SCOPE',
      'Token Exchange response has empty scope',
    );
  }

  // Reject scope escalation: returned must not contain any scope not in requested
  for (const s of returnedSet) {
    if (!requestedSet.has(s)) {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_SCOPE_ESCALATION',
        `Token Exchange returned unexpected scope: ${s}`,
      );
    }
  }

  // Reject scope reduction: requested must not contain any scope not in returned
  for (const s of requestedSet) {
    if (!returnedSet.has(s)) {
      throw new WorkflowTokenError(
        'TOKEN_EXCHANGE_SCOPE_MISMATCH',
        `Token Exchange is missing requested scope: ${s}`,
      );
    }
  }

  // If sets are equal, we pass.
}

/** Normalize a scope string into a sorted Set of individual scopes. */
function normalizeScopeSet(scope: string): ReadonlySet<string> {
  const scopes = scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(scopes);
}
