import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { ZodError } from 'zod';

import { WorkflowError } from '@workflow-foundation/sdk';

import { bearerFromRequest } from './auth/request-principal.js';
import { getVerifiedContext } from './auth/authenticated-request.js';
import { createResourceServerMiddleware, requireAuth } from './auth/resource-server.js';
import { createJwkSet } from './auth/jwk-cache.js';
import type { V2Config } from './config.js';
import { DefinitionBindingRegistry } from './definitions/bindings.js';
import {
  createWorkflowSchema,
  parseIdempotencyKey,
  timelineQuerySchema,
  transitionWorkflowSchema,
  V2HttpError,
  worklistQuerySchema,
  workflowInstanceIdSchema,
} from './schemas.js';
import {
  createV2WorkflowGatewayFactory,
  type V2WorkflowGatewayFactory,
} from './svc-workflow/gateway.js';
import { WorkflowWriteDisabledError } from './workflow/feature-flags.js';

interface V2AppDependencies {
  config: V2Config;
  gatewayFactory?: V2WorkflowGatewayFactory;
}

const asyncHandler = (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function createV2App(dependencies: V2AppDependencies) {
  const { config } = dependencies;
  const gatewayFactory =
    dependencies.gatewayFactory ?? createV2WorkflowGatewayFactory(config);
  const bindings = new DefinitionBindingRegistry(config.definitionBindings);
  const app = express();

  app.disable('x-powered-by');
  const requestIds = new WeakMap<Request, string>();
  app.use((req, res, next) => {
    const requestId = randomUUID();
    requestIds.set(req, requestId);
    res.setHeader('x-request-id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      return callback(null, config.frontendOrigins.includes(origin));
    },
  }));
  app.use(express.json({ limit: '2mb' }));

  // ── Auth V1 Resource Server middleware (gated by feature flag) ──────────
  let authMiddleware: RequestHandler | null = null;
  if (config.workflowFeatureFlags.authV1ResourceServerEnabled) {
    const jwks = createJwkSet({
      jwksUrl: `${config.authServiceBaseUrl.replace(/\/+$/, '')}/.well-known/jwks.json`,
      cacheTtlMs: config.authJwksCacheTtlMs,
    });
    authMiddleware = createResourceServerMiddleware({
      jwks,
      expectedIssuer: config.authJwtIssuer,
      expectedAudience: config.authAdcAudience,
      requiredTokenUse: 'access',
      requiredPrincipalType: 'agent',
      requiredScopes: ['adc.read'],
    });
  }

  // ── Public routes (no auth required) ────────────────────────────────────

  app.get('/api/v2/health', asyncHandler(async (_req, res) => {
    await gatewayFactory('health-probe-not-used').assertReady();
    res.json({ status: 'ready', authority: 'svc-workflow', localBusinessDatabase: false });
  }));

  app.get('/api/v2/definition-bindings', asyncHandler(async (_req, res) => {
    res.json({
      items: bindings.list().map(({ scenarioKey, displayName }) => ({ scenarioKey, displayName })),
    });
  }));

  // ── Authenticated routes ────────────────────────────────────────────────

  app.get('/api/v2/worklist', authMiddleware ?? asyncHandler(bearerFallback), asyncHandler(async (req, res) => {
    const token = resolveToken(req);
    const query = worklistQuerySchema.parse(req.query);
    const worklist = await (query.kind === 'assigned'
      ? gatewayFactory(token).assignedToMe({ cursor: query.cursor, limit: query.limit })
      : gatewayFactory(token).creatorOwnedDrafts({ cursor: query.cursor, limit: query.limit }));
    res.json({
      items: worklist.items,
      nextCursor: worklist.nextCursor,
    });
  }));

  app.post('/api/v2/workflow-instances', authMiddleware ?? asyncHandler(bearerFallback), asyncHandler(async (req, res) => {
    // Write gating: fail-closed before any SDK call
    if (!config.workflowFeatureFlags.writeEnabled) {
      throw new V2HttpError(503, 'ADC_WORKFLOW_WRITE_DISABLED', 'Workflow write operations are disabled');
    }

    const token = resolveToken(req);
    const idempotencyKey = parseIdempotencyKey(req.get('idempotency-key'));
    const body = createWorkflowSchema.parse(req.body);
    const binding = bindings.resolve(body.scenarioKey);
    if (!binding) {
      throw new V2HttpError(422, 'definition_binding_not_found', 'Unknown ADC V2 scenario key');
    }
    const contextPayload = {
      ...(body.additionalContext ?? {}),
      title: body.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria.join('\n'),
      references: body.references,
    };
    const result = await gatewayFactory(token).create({
      domainId: binding.domainId,
      definitionVersionId: binding.definitionVersionId,
      externalReference: body.externalReference,
      metadata: {
        source: 'adc-v2',
        scenarioKey: binding.scenarioKey,
        definitionDigest: binding.definitionDigest,
      },
      contextPayload,
    }, idempotencyKey);
    res.location(`/api/v2/workflow-instances/${result.workflowInstanceId}`);
    res.status(201).json(result);
  }));

  app.get('/api/v2/workflow-instances/:workflowInstanceId', authMiddleware ?? asyncHandler(bearerFallback), asyncHandler(async (req, res) => {
    const token = resolveToken(req);
    const workflowInstanceId = workflowInstanceIdSchema.parse(req.params.workflowInstanceId);
    res.json(await gatewayFactory(token).detail(workflowInstanceId));
  }));

  app.get('/api/v2/workflow-instances/:workflowInstanceId/timeline', authMiddleware ?? asyncHandler(bearerFallback), asyncHandler(async (req, res) => {
    const token = resolveToken(req);
    const workflowInstanceId = workflowInstanceIdSchema.parse(req.params.workflowInstanceId);
    const query = timelineQuerySchema.parse(req.query);
    res.json(await gatewayFactory(token).timeline(workflowInstanceId, query));
  }));

  app.post('/api/v2/workflow-instances/:workflowInstanceId/transitions', authMiddleware ?? asyncHandler(bearerFallback), asyncHandler(async (req, res) => {
    // Write gating: fail-closed before any SDK call
    if (!config.workflowFeatureFlags.writeEnabled) {
      throw new V2HttpError(503, 'ADC_WORKFLOW_WRITE_DISABLED', 'Workflow write operations are disabled');
    }

    const token = resolveToken(req);
    const workflowInstanceId = workflowInstanceIdSchema.parse(req.params.workflowInstanceId);
    const idempotencyKey = parseIdempotencyKey(req.get('idempotency-key'));
    const body = transitionWorkflowSchema.parse(req.body);
    res.json(await gatewayFactory(token).transition(workflowInstanceId, body, idempotencyKey));
  }));

  app.use((_req, _res, next) => {
    next(new V2HttpError(404, 'route_not_found', 'Route not found'));
  });
  app.use(errorHandler(config, requestIds));
  return app;
}

/**
 * Resolve the bearer token for a request.
 * When Auth V1 is active, uses the verified opaque subject token.
 * Otherwise, falls back to extracting from the Authorization header.
 */
function resolveToken(req: Request): string {
  const ctx = getVerifiedContext(req);
  if (ctx) {
    return ctx.opaqueSubjectToken;
  }
  return bearerFromRequest(req);
}

/**
 * Fallback handler for when Auth V1 middleware is not active.
 * Simply calls next() — the resolver will use bearerFromRequest.
 */
const bearerFallback: RequestHandler = (_req, _res, next) => next();

function errorHandler(config: V2Config, requestIds: WeakMap<Request, string>): ErrorRequestHandler {
  return (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const rid = String(requestIds.get(req) ?? '');

    // Zod validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Request validation failed', details: error.flatten() },
        requestId: rid,
      });
    }

    // ADC V2 HTTP errors (includes mapped SDK errors from gateway)
    if (error instanceof V2HttpError) {
      return res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: rid,
      });
    }

    // SDK WorkflowError (direct — not yet mapped by gateway)
    if (error instanceof WorkflowError) {
      const wfErr = error as WorkflowError & { status?: number; code?: string };
      const status = wfErr.status ?? 502;
      const code = wfErr.code ?? 'svc_workflow_error';
      return res.status(status).json({
        error: { code, message: error.message },
        requestId: rid,
      });
    }

    // Workflow write disabled error
    if (error instanceof WorkflowWriteDisabledError) {
      return res.status(503).json({
        error: { code: error.code, message: error.message },
        requestId: rid,
      });
    }

    // Client HTTP errors (malformed request, etc.)
    if (isClientHttpError(error)) {
      const status = error.status;
      return res.status(status).json({
        error: {
          code: status === 413 ? 'payload_too_large' : 'invalid_request',
          message: status === 413 ? 'Request payload is too large' : 'Request could not be parsed',
        },
        requestId: rid,
      });
    }

    console.error(`[adc-v2:${rid}] unhandled error`, error);
    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        ...(config.nodeEnv === 'development' && error instanceof Error
          ? { details: { name: error.name } }
          : {}),
      },
      requestId: rid,
    });
  };
}

function isClientHttpError(error: unknown): error is { status: number } {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500;
}
