/**
 * JWKS fetcher and cache for Auth V1 Resource Server.
 *
 * Fetches public keys from auth-service's JWKS endpoint and caches them
 * for the configured TTL.  Uses ETag for conditional re-fetch.
 */

import { createRemoteJWKSet, type JWK, type JWTPayload } from 'jose';

export interface JwkCacheConfig {
  /** auth-service JWKS URL (e.g. http://127.0.0.1:4001/.well-known/jwks.json). */
  readonly jwksUrl: string;
  /** How long (ms) to cache the JWK Set before re-fetching. */
  readonly cacheTtlMs: number;
}

/**
 * Public JWK Set consumer backed by jose's createRemoteJWKSet.
 *
 * createRemoteJWKSet handles:
 * - HTTP caching via ETag / Cache-Control
 * - JWK rotation
 * - kid-based key selection
 */
export function createJwkSet(config: JwkCacheConfig) {
  const url = new URL(config.jwksUrl);
  const jwks = createRemoteJWKSet(url, {
    cacheMaxAge: config.cacheTtlMs / 1000, // jose expects seconds
    cooldownDuration: 30_000, // 30s cooldown on fetch error
  });
  return jwks;
}

export type JwkSet = ReturnType<typeof createJwkSet>;

/**
 * Result of JWT verification.
 */
export interface VerifiedToken extends JWTPayload {
  /** Verified `sub` claim (MachinePrincipal UUID). */
  readonly sub: string;
  /** Verified `iss` claim. */
  readonly iss: string;
  /** Verified `aud` claim. */
  readonly aud: string;
  /** Verified `token_use` claim. */
  readonly token_use?: string;
  /** Verified `principal_type` claim. */
  readonly principal_type?: string;
  /** Verified `scope` claim (space-delimited). */
  readonly scope?: string;
  /** Verified `agent_id` claim (if present). */
  readonly agent_id?: string;
  /** Verified `client_id` claim. */
  readonly client_id?: string;
  /** Original JWT string. */
  readonly rawToken: string;
}
