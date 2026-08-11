import { Request } from 'express';

export interface RequestWithUser extends Request {
  userId?: string; // set by JwtAuthGuard/OptionalJwtGuard from the token's `sub` claim
}
