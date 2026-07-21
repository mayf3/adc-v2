/**
 * ADC Auth V1 Resource Server middleware.
 *
 * Verifies inbound Bearer tokens against the Auth V1 Contract:
 * - Algorithm: RS256 only
 * - JWKS from auth-service
 * - Expected audience: adc-v2
 * - Required scope: adc.read
 * - Required token_use: access
 * - Required principal_type: agent
 *
 * On success, attaches VerifiedRequestContext to the request.
 * On failure, returns 401 with a structured error.
 */

import type { RequestHandler } from 'express';

import { V2HttpError } from '../schemas.js';
import { bearerFromRequest } from './request-principal.js';
import { setVerifiedContext, getVerifiedContext } from './authenticated-request.js';
import type { JwkSet } from './jwk-cache.js';
import type { VerifiedRequestContext } from './request-context.js';
import { verifyAdcToken, type VerifyJwtOptions } from './verify-jwt.js';

export interface ResourceServerConfig {
  readonly jwks: JwkSet;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly requiredTokenUse: string;
  readonly requiredPrincipalType: string;
  readonly requiredScopes: readonly string[];
}

export function createResourceServerMiddleware(
  config: ResourceServerConfig,
): RequestHandler {
  const verifyOptions: VerifyJwtOptions = {
    expectedIssuer: config.expectedIssuer,
    expectedAudience: config.expectedAudience,
    requiredTokenUse: config.requiredTokenUse,
    requiredPrincipalType: config.requiredPrincipalType,
    requiredScopes: config.requiredScopes,
  };

  return async (req, _res, next) => {
    try {
      const token = bearerFromRequest(req);

      const result = await verifyAdcToken(config.jwks, token, verifyOptions);

      const context: VerifiedRequestContext = {
        verifiedSubjectPrincipalId: result.sub,
        verifiedAdcScopes: result.scope,
        verifiedAdcScopeSet: new Set(result.scope.split(/\s+/).filter(Boolean)),
        requestId: (req.headers['x-request-id'] as string) || 'unknown',
        opaqueSubjectToken: result.rawToken,
        agentId: result.agentId,
        clientId: result.clientId,
      };

      setVerifiedContext(req, context);
      next();
    } catch (error) {
      if (error instanceof V2HttpError) {
        return next(error);
      }
      // VerifyJwtError or other errors → 401
      const err = error as { code?: string };
      const code = err.code ?? 'invalid_token';
      const message = error instanceof Error ? error.message : 'Token verification failed';

      // Don't leak internal error details
      return next(new V2HttpError(401, code, message));
    }
  };
}

/**
 * Require verified request context on a route.
 * Must be used after the resource-server middleware.
 */
export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    if (!getVerifiedContext(req)) {
      return next(new V2HttpError(401, 'authentication_required', 'Authentication is required'));
    }
    next();
  };
}

/**
 * Require a specific ADC scope on the route.
 */
export function requireScope(scope: string): RequestHandler {
  return (req, _res, next) => {
    const ctx = getVerifiedContext(req);
    if (!ctx) {
      return next(new V2HttpError(401, 'authentication_required', 'Authentication is required'));
    }
    if (!ctx.verifiedAdcScopeSet.has(scope)) {
      return next(
        new V2HttpError(403, 'insufficient_scope', `Required scope: ${scope}`),
      );
    }
    next();
  };
}
