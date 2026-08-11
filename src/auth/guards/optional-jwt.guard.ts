import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../auth.service';
import { RequestWithUser } from '../request-with-user';

/**
 * Same token extraction as JwtAuthGuard, but never blocks the request —
 * used by routes like GET /events that behave differently for a signed-in
 * caller (see their private repos too) but are also open to the public.
 * An invalid/expired token is treated the same as no token, not an error.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token);
        request.userId = payload.sub;
      } catch {
        // Ignore — treat as unauthenticated rather than rejecting the request.
      }
    }

    return true;
  }
}
