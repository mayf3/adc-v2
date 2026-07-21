/**
 * Verified ADC V2 request context.
 *
 * Built by the Auth V1 Resource Server middleware after successful
 * JWT verification.  This is the trusted principal identity for
 * the remainder of the request lifecycle.
 *
 * Rules (from contract section 4):
 * - verifiedSubjectPrincipalId = token.sub (the original Agent Principal)
 * - ADC must NOT parse or modify token.sub
 * - ADC must NOT infer principal from display name, email, body, query, etc.
 */

export interface VerifiedRequestContext {
  /** The original Agent Principal from token.sub. */
  readonly verifiedSubjectPrincipalId: string;
  /** Space-delimited scopes that were verified on the inbound token. */
  readonly verifiedAdcScopes: string;
  /** ADC-level scopes as a Set for fast lookup. */
  readonly verifiedAdcScopeSet: ReadonlySet<string>;
  /** Unique request ID. */
  readonly requestId: string;
  /** Trace ID (if available). */
  readonly traceId?: string;
  /** The original subject token (opaque — must NOT be inspected by ADC). */
  readonly opaqueSubjectToken: string;
  /** Agent ID from the token (if present). */
  readonly agentId?: string;
  /** Client ID from the token (if present). */
  readonly clientId?: string;
}
