import { jsonValueSchema } from '@workflow-foundation/sdk';
import { z } from 'zod';

export const workflowInstanceIdSchema = z.string().uuid();

const externalReferenceSchema = z
  .object({
    type: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    uri: z.string().trim().min(1).max(2048),
    digest: z.string().trim().min(1).max(256),
  })
  .strict();

const reservedContextKeys = new Set([
  'title',
  'description',
  'acceptanceCriteria',
  'references',
]);

export const createWorkflowSchema = z
  .object({
    scenarioKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().min(1).max(50_000),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
    references: z.array(externalReferenceSchema).max(100).default([]),
    additionalContext: z.record(jsonValueSchema).optional(),
    externalReference: z
      .string()
      .refine((value) => [...value].length <= 512, 'must not exceed 512 Unicode characters')
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of Object.keys(value.additionalContext ?? {})) {
      if (reservedContextKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['additionalContext', key],
          message: 'must not override an ADC V2 core context field',
        });
      }
    }
  });

export const transitionWorkflowSchema = z
  .object({
    transitionDefinitionId: z.string().uuid(),
    expectedWorkflowStateVersion: z.number().int().positive(),
    submissionPayload: jsonValueSchema.optional(),
  })
  .strict();

export const timelineQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const worklistQuerySchema = z
  .object({
    kind: z.enum(['assigned', 'creator-drafts']).default('assigned'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export function parseIdempotencyKey(value: string | undefined): string {
  if (
    value === undefined ||
    value.length < 1 ||
    value.length > 128 ||
    ![...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e;
    })
  ) {
    throw new V2HttpError(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key must contain 1-128 visible ASCII characters',
    );
  }
  return value;
}

export class V2HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'V2HttpError';
  }
}
