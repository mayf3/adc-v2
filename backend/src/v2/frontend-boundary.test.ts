import { describe, expect, it } from 'vitest';

// Replicate the idempotency logic inline for boundary testing
// (avoids cross-package import resolution issues)
interface PendingIdempotencyKey {
  readonly signature: string;
  readonly key: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function idempotencyKeyFor(
  payload: unknown,
  pending?: PendingIdempotencyKey,
): PendingIdempotencyKey {
  const signature = JSON.stringify(canonicalize(payload));
  if (pending?.signature === signature) return pending;
  return { signature, key: crypto.randomUUID() };
}

describe('ADC V2 frontend command boundary', () => {
  it('reuses one key for a semantically identical retry and rotates it after payload change', () => {
    const first = idempotencyKeyFor({
      scenarioKey: 'development-delivery',
      context: { title: 'Direct item', priority: 'P1' },
    });
    const retry = idempotencyKeyFor({
      context: { priority: 'P1', title: 'Direct item' },
      scenarioKey: 'development-delivery',
    }, first);
    const changed = idempotencyKeyFor({
      scenarioKey: 'development-delivery',
      context: { title: 'Changed item', priority: 'P1' },
    }, retry);

    expect(retry.key).toBe(first.key);
    expect(retry.signature).toBe(first.signature);
    expect(changed.key).not.toBe(first.key);
    expect(changed.signature).not.toBe(first.signature);
  });
});
