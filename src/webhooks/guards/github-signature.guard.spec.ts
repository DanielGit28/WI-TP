import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { GithubSignatureGuard, RequestWithGithubDelivery } from './github-signature.guard';
import { Repository } from '../../repositories/entities/repository.entity';

const WEBHOOK_SECRET = 'the-repos-webhook-secret';
const REPO_FULL_NAME = 'octocat/hello-world';

function sign(body: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function makeContext(request: Partial<RequestWithGithubDelivery>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function makeRegisteredRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-id',
    fullName: REPO_FULL_NAME,
    webhookSecret: WEBHOOK_SECRET,
    ...overrides,
  } as Repository;
}

describe('GithubSignatureGuard', () => {
  let repositoriesRepository: { findOne: jest.Mock };
  let guard: GithubSignatureGuard;

  beforeEach(() => {
    repositoriesRepository = { findOne: jest.fn() };
    guard = new GithubSignatureGuard(repositoriesRepository as any);
  });

  it('accepts a correctly signed delivery for a registered repo and attaches it to the request', async () => {
    const rawBody = Buffer.from(JSON.stringify({ repository: { full_name: REPO_FULL_NAME } }));
    const repository = makeRegisteredRepository();
    repositoriesRepository.findOne.mockResolvedValue(repository);

    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': sign(rawBody, WEBHOOK_SECRET) },
      rawBody,
      body: { repository: { full_name: REPO_FULL_NAME } },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.repository).toBe(repository);
    expect(repositoriesRepository.findOne).toHaveBeenCalledWith({
      where: { fullName: REPO_FULL_NAME },
    });
  });

  it('rejects a delivery with no X-Hub-Signature-256 header', async () => {
    const request: Partial<RequestWithGithubDelivery> = {
      headers: {},
      rawBody: Buffer.from('{}'),
      body: {},
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a delivery with no raw body captured', async () => {
    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': 'sha256=whatever' },
      rawBody: undefined,
      body: {},
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a delivery whose body has no repository.full_name, without querying the DB", async () => {
    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': 'sha256=whatever' },
      rawBody: Buffer.from('{}'),
      body: {},
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repositoriesRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a delivery for a repo that is not registered', async () => {
    const rawBody = Buffer.from(JSON.stringify({ repository: { full_name: REPO_FULL_NAME } }));
    repositoriesRepository.findOne.mockResolvedValue(null);

    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': sign(rawBody, WEBHOOK_SECRET) },
      rawBody,
      body: { repository: { full_name: REPO_FULL_NAME } },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a delivery signed with the wrong secret', async () => {
    const rawBody = Buffer.from(JSON.stringify({ repository: { full_name: REPO_FULL_NAME } }));
    repositoriesRepository.findOne.mockResolvedValue(makeRegisteredRepository());

    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': sign(rawBody, 'a-completely-different-secret') },
      rawBody,
      body: { repository: { full_name: REPO_FULL_NAME } },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a delivery whose raw body was tampered with after signing', async () => {
    const originalBody = Buffer.from(
      JSON.stringify({ repository: { full_name: REPO_FULL_NAME } }),
    );
    const signature = sign(originalBody, WEBHOOK_SECRET);
    const tamperedBody = Buffer.from(
      JSON.stringify({ repository: { full_name: REPO_FULL_NAME }, injected: true }),
    );
    repositoriesRepository.findOne.mockResolvedValue(makeRegisteredRepository());

    const request: Partial<RequestWithGithubDelivery> = {
      headers: { 'x-hub-signature-256': signature },
      rawBody: tamperedBody,
      body: { repository: { full_name: REPO_FULL_NAME } },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
