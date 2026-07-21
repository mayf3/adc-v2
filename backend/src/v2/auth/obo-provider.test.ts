/**
 * AuthServiceWorkflowOboTokenProvider tests.
 *
 * Tests the OBO Token Exchange with a mock auth-service endpoint.
 * Covers scope validation, TTL validation, issued_token_type validation,
 * and error handling.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  AuthServiceWorkflowOboTokenProvider,
  type OboProviderConfig,
  validateScopeEquality,
} from './obo-provider.js';
import { WorkflowTokenError } from '../workflow/token-provider.js';

// ── Unit tests for validateScopeEquality (no HTTP needed) ────────────────

describe('validateScopeEquality', () => {
  function expectCode(fn: () => void, code: string) {
    try {
      fn();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WorkflowTokenError);
      expect((e as WorkflowTokenError).code).toBe(code);
    }
  }

  it('accepts exactly matching scope', () => {
    expect(() => validateScopeEquality('workflow.read', 'workflow.read')).not.toThrow();
  });

  it('accepts scope with whitespace normalization', () => {
    expect(() => validateScopeEquality('workflow.read', '  workflow.read  ')).not.toThrow();
  });

  it('rejects when scope is escalated (returned has extra scope)', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', 'workflow.read workflow.execute'),
      'TOKEN_EXCHANGE_SCOPE_ESCALATION',
    );
  });

  it('rejects when returned scope is missing a requested scope', () => {
    expectCode(
      () => validateScopeEquality('workflow.read workflow.execute', 'workflow.read'),
      'TOKEN_EXCHANGE_SCOPE_MISMATCH',
    );
  });

  it('rejects completely different scope', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', 'workflow.admin'),
      'TOKEN_EXCHANGE_SCOPE_ESCALATION',
    );
  });

  it('rejects empty returned scope', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', ''),
      'TOKEN_EXCHANGE_MISSING_SCOPE',
    );
  });

  it('rejects returned scope with only whitespace', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', '   '),
      'TOKEN_EXCHANGE_MISSING_SCOPE',
    );
  });

  it('rejects unknown scope values', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', 'workflow.read some_unknown_scope'),
      'TOKEN_EXCHANGE_SCOPE_ESCALATION',
    );
  });

  it('rejects workflow.admin escalation', () => {
    expectCode(
      () => validateScopeEquality('workflow.read', 'workflow.read workflow.admin'),
      'TOKEN_EXCHANGE_SCOPE_ESCALATION',
    );
  });
});

// ── Integration tests with mock auth-service ────────────────────────────

describe('AuthServiceWorkflowOboTokenProvider', () => {
  let mockAuthServer: Server;
  let mockAuthUrl: string;
  let config: OboProviderConfig;

  beforeAll(async () => {
    mockAuthServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/oauth/token') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const grantType = params.get('grant_type');
          const audience = params.get('audience');
          const scope = params.get('scope');
          const auth = req.headers.authorization || '';

          if (grantType !== 'urn:ietf:params:oauth:grant-type:token-exchange') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
            return;
          }

          if (audience !== 'svc-workflow') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_audience' }));
            return;
          }

          if (!auth.startsWith('Basic ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_client' }));
            return;
          }

          // Default success response with scope matching the request
          const responseScope = params.get('response_scope') || scope || 'workflow.read';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'mock-workflow-obo-token',
            token_type: 'Bearer',
            expires_in: 300,
            scope: responseScope,
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => mockAuthServer.listen(0, '127.0.0.1', resolve));
    const addr = mockAuthServer.address() as AddressInfo;
    mockAuthUrl = `http://127.0.0.1:${addr.port}`;

    config = {
      tokenExchangeUrl: `${mockAuthUrl}/oauth/token`,
      clientId: 'mc_testclient123',
      clientSecret: 'test-secret-value',
      targetAudience: 'svc-workflow',
      requestTimeoutMs: 5_000,
    };
  });

  afterAll(() => {
    mockAuthServer.close();
  });

  it('returns a token on successful exchange', async () => {
    const provider = new AuthServiceWorkflowOboTokenProvider(config);

    const token = await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-1',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-agent-token',
      },
    });

    expect(token).toBe('mock-workflow-obo-token');
  });

  it('accepts response with matching scope', async () => {
    const provider = new AuthServiceWorkflowOboTokenProvider(config);

    const token = await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-scope-ok',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-token',
      },
    });

    expect(token).toBe('mock-workflow-obo-token');
  });

  it('throws on scope escalation (response has workflow.execute)', async () => {
    // Mock auth-service that returns escalated scope
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'escalated-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'workflow.read workflow.execute',
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-escalation',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws when returned scope is workflow.admin', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'admin-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'workflow.admin',
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-admin',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws when scope is missing in response', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'no-scope-token',
        token_type: 'Bearer',
        expires_in: 300,
        // no scope field
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-noscope',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws when returned scope is empty string', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'empty-scope-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: '',
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-emptyscope',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('accepts response with matching issued_token_type', async () => {
    const provider = new AuthServiceWorkflowOboTokenProvider(config);

    const token = await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-issued-ok',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-token',
      },
    });

    expect(token).toBe('mock-workflow-obo-token');
  });

  it('throws on wrong issued_token_type', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'wrong-issued-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'workflow.read',
        issued_token_type: 'urn:ietf:params:oauth:token-type:refresh_token',
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-wrong-issued',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('accepts response without issued_token_type (optional per contract)', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'no-issued-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'workflow.read',
        // no issued_token_type — contract allows this
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    const token = await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-no-issued',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-token',
      },
    });

    expect(token).toBe('no-issued-token');

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws WorkflowTokenError when subject token is missing', async () => {
    const provider = new AuthServiceWorkflowOboTokenProvider(config);

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-2',
          route: '/api/v2/worklist',
          rawAuthorizationReference: undefined,
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);
  });

  it('throws on transport error (auth-service unreachable)', async () => {
    const badConfig: OboProviderConfig = {
      ...config,
      tokenExchangeUrl: 'http://127.0.0.1:15999/oauth/token',
      requestTimeoutMs: 100,
    };
    const provider = new AuthServiceWorkflowOboTokenProvider(badConfig);

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-3',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);
  });

  it('sends correct client credentials (Basic Auth)', async () => {
    const capturedAuth: string[] = [];
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/oauth/token') {
        capturedAuth.push(req.headers.authorization || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'captured-token',
          token_type: 'Bearer',
          expires_in: 300,
          scope: 'workflow.read',
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-4',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-token',
      },
    });

    expect(capturedAuth.length).toBe(1);
    expect(capturedAuth[0]).toMatch(/^Basic /);
    const decoded = Buffer.from(capturedAuth[0].slice(6), 'base64').toString();
    expect(decoded).toBe('mc_testclient123:test-secret-value');

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('sends correct scope and audience parameters', async () => {
    const captured: Record<string, string> = {};
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/oauth/token') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          captured.grantType = params.get('grant_type') || '';
          captured.audience = params.get('audience') || '';
          captured.scope = params.get('scope') || '';
          captured.subjectTokenType = params.get('subject_token_type') || '';
          captured.requestedTokenType = params.get('requested_token_type') || '';

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'verified-token',
            token_type: 'Bearer',
            expires_in: 300,
            scope: 'workflow.read',
          }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await provider.getToken({
      requiredScope: 'workflow.read',
      requestContext: {
        requestId: 'test-5',
        route: '/api/v2/worklist',
        rawAuthorizationReference: 'subject-token',
      },
    });

    expect(captured.grantType).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(captured.audience).toBe('svc-workflow');
    expect(captured.audience).not.toBe('adc-v2');
    expect(captured.scope).toBe('workflow.read');
    expect(captured.subjectTokenType).toBe('urn:ietf:params:oauth:token-type:access_token');
    expect(captured.requestedTokenType).toBe('urn:ietf:params:oauth:token-type:access_token');

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws on non-200 response from auth-service', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-6',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });

  it('throws on TTL exceeds 300s', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'long-ttl-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'workflow.read',
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}`;

    const provider = new AuthServiceWorkflowOboTokenProvider({
      ...config,
      tokenExchangeUrl: `${url}/oauth/token`,
    });

    await expect(
      provider.getToken({
        requiredScope: 'workflow.read',
        requestContext: {
          requestId: 'test-ttl-high',
          route: '/api/v2/worklist',
          rawAuthorizationReference: 'subject-token',
        },
      }),
    ).rejects.toThrow(WorkflowTokenError);

    await new Promise<void>((resolve) => server.close(resolve));
  });
});
