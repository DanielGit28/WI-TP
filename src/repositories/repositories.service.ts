import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from './entities/repository.entity';
import { GithubApiService } from '../github/github-api.service';
import { UsersService } from '../users/users.service';

const GITHUB_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;
const SHORTHAND_PATTERN = /^([^/\s]+)\/([^/\s]+)$/;

// GitHub's actual username/repo-name character rules, not just "no
// slashes" — rejects '..', '?', '#', etc. before they ever reach the
// GitHub API request built from these values.
const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_NAME_PATTERN = /^(?!\.{1,2}$)[a-zA-Z0-9._-]{1,100}$/;

const INVALID_REPO_URL_MESSAGE =
  'repoUrl must be a GitHub URL or "owner/repo" (e.g. "octocat/hello-world")';

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = GITHUB_URL_PATTERN.exec(repoUrl) ?? SHORTHAND_PATTERN.exec(repoUrl);
  if (!match) {
    throw new BadRequestException(INVALID_REPO_URL_MESSAGE);
  }

  const [, owner, repo] = match;
  if (!OWNER_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo)) {
    throw new BadRequestException(INVALID_REPO_URL_MESSAGE);
  }

  return { owner, repo };
}

@Injectable()
export class RepositoriesService {
  constructor(
    @InjectRepository(Repository)
    private readonly repositoriesRepository: TypeOrmRepository<Repository>,
    private readonly githubApiService: GithubApiService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async register(userId: string, repoUrl: string): Promise<Repository> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const githubRepo = await this.githubApiService.getRepo(user.accessToken, owner, repo);

    if (!githubRepo.permissions?.admin) {
      throw new ForbiddenException(
        'You need admin access on this repo to register its webhook',
      );
    }

    const webhookSecret = randomBytes(32).toString('hex');
    const webhookUrl = `${this.configService.getOrThrow<string>('APP_BASE_URL')}/webhooks/github`;
    const hook = await this.githubApiService.createWebhook(
      user.accessToken,
      owner,
      repo,
      webhookUrl,
      webhookSecret,
    );

    const repository = this.repositoriesRepository.create({
      ownerUserId: user.id,
      githubRepoId: githubRepo.id,
      fullName: githubRepo.full_name,
      visibility: githubRepo.private ? 'private' : 'public',
      webhookId: hook.id,
      webhookSecret,
    });
    return this.repositoriesRepository.save(repository);
  }

  async remove(userId: string, repositoryId: string): Promise<void> {
    const repository = await this.repositoriesRepository.findOne({
      where: { id: repositoryId },
    });
    if (!repository) {
      throw new NotFoundException('Repository not found');
    }
    if (repository.ownerUserId !== userId) {
      throw new ForbiddenException('You do not own this repository');
    }

    const user = await this.usersService.findById(userId);
    if (user) {
      const [owner, repo] = repository.fullName.split('/');
      await this.githubApiService.deleteWebhook(user.accessToken, owner, repo, repository.webhookId);
    }

    await this.repositoriesRepository.remove(repository);
  }

  findMine(userId: string): Promise<Repository[]> {
    return this.repositoriesRepository.find({ where: { ownerUserId: userId } });
  }

  findPublic(): Promise<Repository[]> {
    return this.repositoriesRepository.find({ where: { visibility: 'public' } });
  }
}
