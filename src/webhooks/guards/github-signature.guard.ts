import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * GitHub signs webhook deliveries by HMAC-SHA256'ing the *raw* request
 * body with your webhook secret, then sending it as the
 * X-Hub-Signature-256 header. Verification has to happen against the raw
 * bytes — re-serializing the parsed JSON body won't produce an identical
 * signature, since key order/whitespace can differ. That's why `rawBody`
 * capture is enabled in main.ts.
 */
@Injectable()
export class GithubSignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET');

    if (!secret) {
      // Fail closed: a misconfigured server should never accept unverified webhooks.
      throw new UnauthorizedException('Webhook secret is not configured');
    }
    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }
    if (!request.rawBody) {
      throw new UnauthorizedException('Raw body unavailable for verification');
    }

    const expected =
      'sha256=' + createHmac('sha256', secret).update(request.rawBody).digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    // timingSafeEqual prevents leaking information via response-time
    // differences (a naive === comparison is vulnerable to timing attacks).
    // Buffers must be equal length before comparing, or timingSafeEqual throws.
    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
