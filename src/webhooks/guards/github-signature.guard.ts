import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { Repository } from '../../repositories/entities/repository.entity';

export interface RequestWithGithubDelivery extends Request {
  rawBody?: Buffer;
  repository?: Repository; // set on success, so downstream code doesn't re-query it
}

/**
 * GitHub signs webhook deliveries by HMAC-SHA256'ing the *raw* request
 * body with the webhook's secret, then sending it as the
 * X-Hub-Signature-256 header. Verification has to happen against the raw
 * bytes — re-serializing the parsed JSON body won't produce an identical
 * signature, since key order/whitespace can differ. That's why `rawBody`
 * capture is enabled in main.ts.
 *
 * Each registered repo has its own secret (see RepositoriesService), so
 * unlike a single-tenant setup there's no one secret to check against —
 * the repo has to be identified first. Express's body-parser middleware
 * already runs before Nest guards, so `request.body` (parsed, but not yet
 * validated/transformed by the ValidationPipe) is available here to read
 * `repository.full_name` from. The signature is still verified against
 * the raw bytes, never the parsed/re-serialized body — same approach
 * multi-tenant webhook systems (Stripe Connect, GitHub Apps) use.
 */
@Injectable()
export class GithubSignatureGuard implements CanActivate {
  constructor(
    @InjectRepository(Repository)
    private readonly repositoriesRepository: TypeOrmRepository<Repository>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithGithubDelivery>();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const fullName = (request.body as { repository?: { full_name?: string } })?.repository
      ?.full_name;

    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }
    if (!request.rawBody) {
      throw new UnauthorizedException('Raw body unavailable for verification');
    }
    if (!fullName) {
      throw new NotFoundException('Repository not registered');
    }

    const repository = await this.repositoriesRepository.findOne({ where: { fullName } });
    // Not found and "found but not authorized" should look identical to
    // an unauthenticated caller — there's no legitimate reason for an
    // outside caller to distinguish the two.
    if (!repository) {
      throw new NotFoundException('Repository not registered');
    }

    const expected =
      'sha256=' +
      createHmac('sha256', repository.webhookSecret).update(request.rawBody).digest('hex');

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

    request.repository = repository;
    return true;
  }
}
