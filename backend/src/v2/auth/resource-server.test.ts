/**
 * Auth V1 Resource Server middleware tests.
 *
 * Test the middleware behavior: requireAuth and requireScope.
 * Full RS256+JWKS integration requires an HTTP-accessible JWKS endpoint.
 * The payload validation logic is tested separately in verify-jwt.test.ts.
 */

import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requireAuth, requireScope } from './resource-server.js';
import { setVerifiedContext } from './authenticated-request.js';
import type { VerifiedRequestContext } from './request-context.js';

function mockReqRes() {
  const req = {} as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

function makeContext(overrides?: Partial<VerifiedRequestContext>): VerifiedRequestContext {
  return {
    verifiedSubjectPrincipalId: '11111111-1111-4111-8111-111111111111',
    verifiedAdcScopes: 'adc.read',
    verifiedAdcScopeSet: new Set(['adc.read']),
    requestId: 'test-req-1',
    opaqueSubjectToken: 'raw-token-value',
    ...overrides,
  };
}

describe('requireAuth', () => {
  it('calls next() when verified context is present', () => {
    const { req, res, next } = mockReqRes();
    setVerifiedContext(req, makeContext());

    requireAuth()(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when verified context is missing', () => {
    const { req, res, next } = mockReqRes();

    requireAuth()(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'authentication_required' }),
    );
  });
});

describe('requireScope', () => {
  it('calls next() when required scope is present', () => {
    const { req, res, next } = mockReqRes();
    setVerifiedContext(req, makeContext({ verifiedAdcScopeSet: new Set(['adc.read', 'workflow.read']) }));

    requireScope('adc.read')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when required scope is missing', () => {
    const { req, res, next } = mockReqRes();
    setVerifiedContext(req, makeContext({ verifiedAdcScopeSet: new Set(['workflow.read']) }));

    requireScope('adc.read')(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'insufficient_scope' }),
    );
  });

  it('returns 401 when no auth context', () => {
    const { req, res, next } = mockReqRes();

    requireScope('adc.read')(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'authentication_required' }),
    );
  });
});
