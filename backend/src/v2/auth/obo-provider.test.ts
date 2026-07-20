/**
 * AuthServiceWorkflowOboTokenProvider tests.
 *
 * Tests the OBO Token Exchange with a mock auth-service endpoint.
 */

import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { AuthServiceWorkflowOboTokenProvider, type OboProviderConfig } from './obo-provider.js';
import { WorkflowTokenError } from '../workflow/token-provider.js';

describe('AuthServiceWorkflowOboTokenProvider', () => {
  let mockAuthServer: Server;
  let mockAuthUrl: string;
  let config: OboProviderConfig;

  beforeAll(async () => {
    // Start a mock auth-service that responds to Token Exchange requests
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

          // Basic validation
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

          // Check client credentials
          if (!auth.startsWith('Basic ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_client' }));
            return;
          }

          // Success
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'mock-workflow-obo-token',
            token_type: 'Bearer',
            expires_in: 300,
            scope: scope || 'workflow.read',
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
    // Verify it contains base64-encoded client_id:client_secret
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
});
