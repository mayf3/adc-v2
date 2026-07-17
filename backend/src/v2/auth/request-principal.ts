import type { Request } from 'express';

import { V2HttpError } from '../schemas.js';

export function bearerFromRequest(req: Request): string {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer ([\x21-\x7e]{1,16384})$/);
  if (!match) {
    throw new V2HttpError(401, 'bearer_token_required', 'Bearer access token is required');
  }
  return match[1];
}
