import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../request-with-user';

// Reads the userId set by JwtAuthGuard/OptionalJwtGuard. Undefined when
// used behind OptionalJwtGuard and the caller wasn't authenticated.
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.userId;
  },
);
