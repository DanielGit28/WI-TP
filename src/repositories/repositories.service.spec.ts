import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { User } from '../users/entities/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'user-1', accessToken: 'gho_token', ...overrides } as User;
}

describe('RepositoriesService', () => {
  let repositoriesRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    find: jest.Mock;
  };
  let githubApiService: { getRepo: jest.Mock; createWebhook: jest.Mock; deleteWebhook: jest.Mock };
  let usersService: { findById: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let service: RepositoriesService;

  beforeEach(() => {
    repositoriesRepository = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
      findOne: jest.fn(),
      remove: jest.fn(),
      find: jest.fn(),
    };
    githubApiService = { getRepo: jest.fn(), createWebhook: jest.fn(), deleteWebhook: jest.fn() };
    usersService = { findById: jest.fn() };
    configService = { getOrThrow: jest.fn().mockReturnValue('https://app.example.com') };

    service = new RepositoriesService(
      repositoriesRepository as any,
      githubApiService as any,
      usersService as any,
      configService as any,
    );
  });

  describe('register', () => {
    it('rejects when the user does not exist, without calling GitHub', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.register('user-1', 'octocat/hello-world')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(githubApiService.getRepo).not.toHaveBeenCalled();
    });

    it.each([
      ['no slash at all', 'not-a-valid-repo-url'],
      ['too many path segments', 'owner/repo/extra'],
      ['repo segment is a path-traversal token', 'octocat/..'],
      ['owner contains a disallowed character', 'octo?cat/hello-world'],
      ['repo contains a disallowed character', 'octocat/repo#fragment'],
    ])('rejects a malformed repoUrl: %s (%s)', async (_label, repoUrl) => {
      usersService.findById.mockResolvedValue(makeUser());

      await expect(service.register('user-1', repoUrl)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(githubApiService.getRepo).not.toHaveBeenCalled();
    });

    it.each([
      ['shorthand', 'octocat/hello-world'],
      ['full URL', 'https://github.com/octocat/hello-world'],
      ['full URL with .git suffix', 'https://github.com/octocat/hello-world.git'],
    ])('accepts a valid repoUrl: %s', async (_label, repoUrl) => {
      usersService.findById.mockResolvedValue(makeUser());
      githubApiService.getRepo.mockResolvedValue({
        id: 1,
        full_name: 'octocat/hello-world',
        private: false,
        permissions: { admin: true },
      });
      githubApiService.createWebhook.mockResolvedValue({ id: 999 });

      await service.register('user-1', repoUrl);

      expect(githubApiService.getRepo).toHaveBeenCalledWith('gho_token', 'octocat', 'hello-world');
    });

    it('rejects registration when the user lacks admin access on the repo', async () => {
      usersService.findById.mockResolvedValue(makeUser());
      githubApiService.getRepo.mockResolvedValue({
        id: 1,
        full_name: 'octocat/hello-world',
        private: false,
        permissions: { admin: false },
      });

      await expect(service.register('user-1', 'octocat/hello-world')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(githubApiService.createWebhook).not.toHaveBeenCalled();
      expect(repositoriesRepository.save).not.toHaveBeenCalled();
    });

    it('installs a webhook and persists the repository on success', async () => {
      usersService.findById.mockResolvedValue(makeUser());
      githubApiService.getRepo.mockResolvedValue({
        id: 555,
        full_name: 'octocat/hello-world',
        private: true,
        permissions: { admin: true },
      });
      githubApiService.createWebhook.mockResolvedValue({ id: 999 });

      const result = await service.register('user-1', 'octocat/hello-world');

      expect(githubApiService.createWebhook).toHaveBeenCalledWith(
        'gho_token',
        'octocat',
        'hello-world',
        'https://app.example.com/webhooks/github',
        expect.any(String),
      );
      expect(result).toMatchObject({
        ownerUserId: 'user-1',
        githubRepoId: 555,
        fullName: 'octocat/hello-world',
        visibility: 'private',
        webhookId: 999,
      });
    });
  });

  describe('remove', () => {
    it('rejects when the repository does not exist', async () => {
      repositoriesRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('user-1', 'repo-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the caller does not own the repository, without touching GitHub', async () => {
      repositoriesRepository.findOne.mockResolvedValue({
        id: 'repo-1',
        ownerUserId: 'someone-else',
        fullName: 'octocat/hello-world',
        webhookId: 999,
      });

      await expect(service.remove('user-1', 'repo-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(githubApiService.deleteWebhook).not.toHaveBeenCalled();
      expect(repositoriesRepository.remove).not.toHaveBeenCalled();
    });

    it('removes the GitHub webhook and the row when the caller owns it', async () => {
      repositoriesRepository.findOne.mockResolvedValue({
        id: 'repo-1',
        ownerUserId: 'user-1',
        fullName: 'octocat/hello-world',
        webhookId: 999,
      });
      usersService.findById.mockResolvedValue(makeUser());

      await service.remove('user-1', 'repo-1');

      expect(githubApiService.deleteWebhook).toHaveBeenCalledWith(
        'gho_token',
        'octocat',
        'hello-world',
        999,
      );
      expect(repositoriesRepository.remove).toHaveBeenCalled();
    });
  });
});
