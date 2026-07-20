/**
 * Authenticated request helpers.
 *
 * Provides type-safe access to the verified request context without
 * requiring Express module augmentation (which is unreliable with tsx/vitest).
 */

import type { Request } from 'express';

import type { VerifiedRequestContext } from './request-context.js';

/**
 * Get the verified request context from an Express request.
 * Returns undefined if the request has not been authenticated.
 */
export function getVerifiedContext(req: Request): VerifiedRequestContext | undefined {
  return (req as unknown as Record<string, unknown>).verifiedRequestContext as
    | VerifiedRequestContext
    | undefined;
}

/**
 * Set the verified request context on an Express request.
 */
export function setVerifiedContext(req: Request, context: VerifiedRequestContext): void {
  (req as unknown as Record<string, unknown>).verifiedRequestContext = context;
}
