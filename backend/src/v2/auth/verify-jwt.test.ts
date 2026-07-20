/**
 * Auth V1 JWT payload validation tests.
 *
 * Tests the pure validation logic (validateAdcPayload) which does NOT
 * require crypto or HTTP — it only validates JWT payload claims.
 *
 * The full RS256+JWKS verification path is tested via the resource-server
 * middleware tests and integration tests using generated keys.
 */

import { describe, expect, it } from 'vitest';
import type { JWTPayload } from 'jose';

import { validateAdcPayload, VerifyJwtError } from './verify-jwt.js';

const VALID_PAYLOAD: JWTPayload = {
  sub: '11111111-1111-4111-8111-111111111111',
  iss: 'auth-service',
  aud: 'svc-workflow',
  token_use: 'access',
  principal_type: 'agent',
  scope: 'adc.read svc-workflow.read',
  client_id: 'mc_testclient123',
  agent_id: 'agent-alpha',
};

const OPTIONS = {
  expectedIssuer: 'auth-service',
  expectedAudience: 'svc-workflow',
  requiredTokenUse: 'access' as const,
  requiredPrincipalType: 'agent' as const,
  requiredScopes: ['adc.read'] as readonly string[],
};

describe('validateAdcPayload', () => {
  it('accepts a valid payload', () => {
    const result = validateAdcPayload(VALID_PAYLOAD, OPTIONS, 'raw-token');
    expect(result.sub).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.principalType).toBe('agent');
    expect(result.tokenUse).toBe('access');
    expect(result.scope).toContain('adc.read');
    expect(result.clientId).toBe('mc_testclient123');
    expect(result.agentId).toBe('agent-alpha');
    expect(result.rawToken).toBe('raw-token');
  });

  describe('sub claim', () => {
    it('rejects missing sub', () => {
      const { sub: _, ...noSub } = VALID_PAYLOAD;
      expect(() => validateAdcPayload(noSub, OPTIONS)).toThrow(VerifyJwtError);
    });

    it('rejects non-string sub', () => {
      expect(() =>
        validateAdcPayload({ ...VALID_PAYLOAD, sub: 123 }, OPTIONS),
      ).toThrow(VerifyJwtError);
    });
  });

  describe('token_use claim', () => {
    it('rejects missing token_use', () => {
      const { token_use: _, ...noTokenUse } = VALID_PAYLOAD;
      expect(() => validateAdcPayload(noTokenUse, OPTIONS)).toThrow(VerifyJwtError);
    });

    it('rejects wrong token_use', () => {
      expect(() =>
        validateAdcPayload({ ...VALID_PAYLOAD, token_use: 'refresh' }, OPTIONS),
      ).toThrow(VerifyJwtError);
    });
  });

  describe('principal_type claim', () => {
    it('rejects missing principal_type', () => {
      const { principal_type: _, ...noType } = VALID_PAYLOAD;
      expect(() => validateAdcPayload(noType, OPTIONS)).toThrow(VerifyJwtError);
    });

    it('rejects wrong principal_type', () => {
      expect(() =>
        validateAdcPayload({ ...VALID_PAYLOAD, principal_type: 'user' }, OPTIONS),
      ).toThrow(VerifyJwtError);
    });
  });

  describe('scope claim', () => {
    it('rejects missing scope', () => {
      const { scope: _, ...noScope } = VALID_PAYLOAD;
      expect(() => validateAdcPayload(noScope, OPTIONS)).toThrow(VerifyJwtError);
    });

    it('rejects insufficient scope', () => {
      expect(() =>
        validateAdcPayload(
          { ...VALID_PAYLOAD, scope: 'workflow.read' },
          { ...OPTIONS, requiredScopes: ['adc.read'] },
        ),
      ).toThrow(VerifyJwtError);
    });

    it('accepts payload with additional scopes', () => {
      const result = validateAdcPayload(
        { ...VALID_PAYLOAD, scope: 'adc.read workflow.read workflow.execute' },
        OPTIONS,
      );
      expect(result.scope).toContain('adc.read');
    });
  });

  describe('error codes', () => {
    it('sets correct error code for missing sub', () => {
      try {
        validateAdcPayload({}, OPTIONS);
        expect.unreachable('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(VerifyJwtError);
        expect((e as VerifyJwtError).code).toBe('missing_sub');
      }
    });

    it('sets correct error code for invalid token_use', () => {
      try {
        validateAdcPayload({ ...VALID_PAYLOAD, token_use: 'invalid' }, OPTIONS);
        expect.unreachable('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(VerifyJwtError);
        expect((e as VerifyJwtError).code).toBe('invalid_token_use');
      }
    });

    it('sets correct error code for insufficient scope', () => {
      try {
        validateAdcPayload(
          { ...VALID_PAYLOAD, scope: 'workflow.read' },
          OPTIONS,
        );
        expect.unreachable('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(VerifyJwtError);
        expect((e as VerifyJwtError).code).toBe('insufficient_scope');
      }
    });
  });
});
