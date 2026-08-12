import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GithubApiService } from '../src/github/github-api.service';
import { setTestEnv } from './setup/test-env';
import { startTestPostgres, TestPostgres } from './setup/postgres-container';
import { User } from '../src/users/entities/user.entity';
import { Repository as RepositoryEntity } from '../src/repositories/entities/repository.entity';

// "e2e" here means real HTTP requests through the full Nest stack against a
// real (Testcontainers) Postgres — not real calls to GitHub's live API,
// which would make these tests slow, flaky, and dependent on live
// credentials. GithubApiService is overridden at the DI level instead.
describe('Auth + Repositories (e2e)', () => {
  let pg: TestPostgres;
  let app: INestApplication;
  let dataSource: DataSource;
  let githubApiMock: {
    exchangeCodeForToken: jest.Mock;
    getAuthenticatedUser: jest.Mock;
    getRepo: jest.Mock;
    createWebhook: jest.Mock;
    deleteWebhook: jest.Mock;
  };

  beforeAll(async () => {
    pg = await startTestPostgres();
    setTestEnv(pg.databaseUrl);

    githubApiMock = {
      exchangeCodeForToken: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      getRepo: jest.fn(),
      createWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GithubApiService)
      .useValue(githubApiMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    await pg.stop();
  });

  // Completes a full OAuth login against the mocked GithubApiService and
  // returns the issued JWT — shared by every spec below that needs an
  // authenticated caller.
  async function login(githubId: number, githubLogin: string): Promise<string> {
    const start = await request(app.getHttpServer()).get('/auth/github');
    const cookie = (start.headers['set-cookie'] as unknown as string[])[0];
    const state = new URL(start.headers.location).searchParams.get('state');

    githubApiMock.exchangeCodeForToken.mockResolvedValueOnce(`gho_token_${githubId}`);
    githubApiMock.getAuthenticatedUser.mockResolvedValueOnce({
      id: githubId,
      login: githubLogin,
      avatar_url: null,
    });

    const callback = await request(app.getHttpServer())
      .get(`/auth/github/callback?code=some-code&state=${state}`)
      .set('Cookie', cookie);

    return (callback.body as { token: string }).token;
  }

  describe('GET /auth/github', () => {
    it('sets a state cookie and redirects to GitHub', async () => {
      const response = await request(app.getHttpServer()).get('/auth/github');

      expect(response.status).toBe(302);
      expect((response.headers['set-cookie'] as unknown as string[])[0]).toMatch(
        /gh_oauth_state=/,
      );
      expect(response.headers.location).toContain('https://github.com/login/oauth/authorize');
    });
  });

  describe('GET /auth/github/callback', () => {
    it('rejects when the state does not match the cookie', async () => {
      const start = await request(app.getHttpServer()).get('/auth/github');
      const cookie = (start.headers['set-cookie'] as unknown as string[])[0];

      const response = await request(app.getHttpServer())
        .get('/auth/github/callback?code=abc&state=wrong-state')
        .set('Cookie', cookie);

      expect(response.status).toBe(401);
      expect(githubApiMock.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('issues a JWT and upserts a user on a valid callback', async () => {
      const token = await login(101, 'octocat');

      expect(token).toEqual(expect.any(String));

      const user = await dataSource.getRepository(User).findOne({ where: { githubId: 101 } });
      expect(user?.githubLogin).toBe('octocat');
    });
  });

  describe('POST /repositories', () => {
    it('returns 403 when the user lacks admin access on the repo', async () => {
      const token = await login(102, 'no-admin-user');
      githubApiMock.getRepo.mockResolvedValueOnce({
        id: 1,
        full_name: 'no-admin-user/some-repo',
        private: false,
        permissions: { admin: false },
      });

      const response = await request(app.getHttpServer())
        .post('/repositories')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoUrl: 'no-admin-user/some-repo' });

      expect(response.status).toBe(403);
      expect(githubApiMock.createWebhook).not.toHaveBeenCalled();
    });

    it('registers the repo and installs a webhook when the user has admin access', async () => {
      const token = await login(103, 'repo-owner');
      githubApiMock.getRepo.mockResolvedValueOnce({
        id: 2,
        full_name: 'repo-owner/another-repo',
        private: false,
        permissions: { admin: true },
      });
      githubApiMock.createWebhook.mockResolvedValueOnce({ id: 777 });

      const response = await request(app.getHttpServer())
        .post('/repositories')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoUrl: 'repo-owner/another-repo' });

      expect(response.status).toBe(201);
      const created = response.body as Record<string, unknown>;
      expect(created).toMatchObject({ fullName: 'repo-owner/another-repo' });
      expect(created.webhookSecret).toBeUndefined();
      expect(created.owner).toBeUndefined();

      const saved = await dataSource
        .getRepository(RepositoryEntity)
        .findOne({ where: { fullName: 'repo-owner/another-repo' } });
      expect(saved?.webhookId).toBe(777);
    });

    it('rejects registration without a bearer token', async () => {
      const response = await request(app.getHttpServer())
        .post('/repositories')
        .send({ repoUrl: 'someone/some-repo' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /repositories/:id', () => {
    it("removes the GitHub webhook and the row when the caller owns it", async () => {
      const token = await login(104, 'delete-owner');
      githubApiMock.getRepo.mockResolvedValueOnce({
        id: 3,
        full_name: 'delete-owner/to-delete',
        private: false,
        permissions: { admin: true },
      });
      githubApiMock.createWebhook.mockResolvedValueOnce({ id: 555 });

      const created = await request(app.getHttpServer())
        .post('/repositories')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoUrl: 'delete-owner/to-delete' });

      const response = await request(app.getHttpServer())
        .delete(`/repositories/${(created.body as { id: string }).id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
      expect(githubApiMock.deleteWebhook).toHaveBeenCalledWith(
        'gho_token_104',
        'delete-owner',
        'to-delete',
        555,
      );

      const stillThere = await dataSource
        .getRepository(RepositoryEntity)
        .findOne({ where: { fullName: 'delete-owner/to-delete' } });
      expect(stillThere).toBeNull();
    });
  });
});
