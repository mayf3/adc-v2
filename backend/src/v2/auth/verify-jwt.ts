/**
 * Auth V1 JWT verification.
 *
 * Verifies RS256 JWTs using the auth-service JWKS endpoint.
 * Enforces the Auth V1 contract claims.
 */

import { jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

import type { JwkSet } from './jwk-cache.js';

export interface VerifyJwtOptions {
  /** Expected issuer (must match `iss` claim). */
  readonly expectedIssuer: string;
  /** Expected audience (must match `aud` claim). */
  readonly expectedAudience: string;
  /** Required `token_use` value. */
  readonly requiredTokenUse: string;
  /** Required `principal_type` value. */
  readonly requiredPrincipalType: string;
  /** Required scope(s) — all must be present in the token's `scope` claim. */
  readonly requiredScopes: readonly string[];
}

/**
 * Result of a successful JWT verification.
 */
export interface VerifiedTokenResult {
  readonly sub: string;
  readonly principalType: string;
  readonly tokenUse: string;
  readonly scope: string;
  readonly agentId?: string;
  readonly clientId?: string;
  readonly rawToken: string;
}

/**
 * Verify a Bearer token against the Auth V1 contract.
 *
 * @throws VerifyJwtError on any verification failure.
 */
export async function verifyAdcToken(
  jwks: JwkSet,
  token: string,
  options: VerifyJwtOptions,
): Promise<VerifiedTokenResult> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: options.expectedIssuer,
      audience: options.expectedAudience,
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (error) {
    // Convert jose errors to our domain error
    const message = error instanceof Error ? error.message : 'JWT verification failed';
    throw new VerifyJwtError('verify_failed', message, error);
  }

  return validateAdcPayload(payload, options, token);
}

/**
 * Validate JWT payload claims against the Auth V1 contract.
 *
 * This is a pure validation function (no crypto) that can be tested
 * with any payload shape, without requiring an actual JWKS or HTTP call.
 *
 * @throws VerifyJwtError on any validation failure.
 */
export function validateAdcPayload(
  payload: JWTPayload,
  options: VerifyJwtOptions,
  rawToken?: string,
): VerifiedTokenResult {
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') {
    throw new VerifyJwtError('missing_sub', 'Token is missing required sub claim');
  }

  const tokenUse = String(payload.token_use ?? '');
  if (tokenUse !== options.requiredTokenUse) {
    throw new VerifyJwtError(
      'invalid_token_use',
      `Expected token_use=${options.requiredTokenUse}, got ${tokenUse}`,
    );
  }

  const principalType = String(payload.principal_type ?? '');
  if (principalType !== options.requiredPrincipalType) {
    throw new VerifyJwtError(
      'invalid_principal_type',
      `Expected principal_type=${options.requiredPrincipalType}, got ${principalType}`,
    );
  }

  const scope = String(payload.scope ?? '');
  const scopeSet = new Set(scope.split(/\s+/).filter(Boolean));
  for (const required of options.requiredScopes) {
    if (!scopeSet.has(required)) {
      throw new VerifyJwtError(
        'insufficient_scope',
        `Token is missing required scope: ${required}`,
      );
    }
  }

  const clientId = payload.client_id ? String(payload.client_id) : undefined;
  const agentId = payload.agent_id ? String(payload.agent_id) : undefined;

  return {
    sub,
    principalType,
    tokenUse,
    scope,
    agentId,
    clientId,
    rawToken: rawToken ?? '',
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VerifyJwtError extends Error {
  readonly name = 'VerifyJwtError';
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
