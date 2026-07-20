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

export interface OboProviderConfig {
  /** auth-service Token Exchange URL (e.g. http://127.0.0.1:4001/oauth/token). */
  readonly tokenExchangeUrl: string;
  /** ADC OAuth Client ID (mc_ prefix). */
  readonly clientId: string;
  /** ADC OAuth Client Secret. */
  readonly clientSecret: string;
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
      audience: 'svc-workflow',
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

    return {
      access_token: result.access_token,
      token_type: String(result.token_type ?? 'Bearer'),
      expires_in: typeof result.expires_in === 'number' ? result.expires_in : 0,
      scope: String(result.scope ?? scope),
    };
  }
}
