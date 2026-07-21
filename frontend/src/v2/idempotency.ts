export interface PendingIdempotencyKey {
  readonly signature: string;
  readonly key: string;
}

export function idempotencyKeyFor(
  payload: unknown,
  pending?: PendingIdempotencyKey,
): PendingIdempotencyKey {
  const signature = JSON.stringify(canonicalize(payload));
  if (pending?.signature === signature) return pending;
  return { signature, key: newIdempotencyKey() };
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

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `adc-v2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
