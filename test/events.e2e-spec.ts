import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setTestEnv } from './setup/test-env';
import { startTestPostgres, TestPostgres } from './setup/postgres-container';
import { User } from '../src/users/entities/user.entity';
import { Repository as RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { WebhookEvent } from '../src/events/entities/webhook-event.entity';

interface EventListItem {
  deliveryId: string;
  eventType: string;
}

describe('GET /events visibility scoping (e2e)', () => {
  let pg: TestPostgres;
  let app: INestApplication;
  let dataSource: DataSource;
  let owner: User;
  let stranger: User;
  let publicRepo: RepositoryEntity;
  let privateRepo: RepositoryEntity;

  beforeAll(async () => {
    pg = await startTestPostgres();
    setTestEnv(pg.databaseUrl);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    const usersRepo = dataSource.getRepository(User);
    const reposRepo = dataSource.getRepository(RepositoryEntity);
    const eventsRepo = dataSource.getRepository(WebhookEvent);

    owner = await usersRepo.save({
      githubId: 1,
      githubLogin: 'owner',
      avatarUrl: null,
      accessToken: 'token-a',
    });
    stranger = await usersRepo.save({
      githubId: 2,
      githubLogin: 'stranger',
      avatarUrl: null,
      accessToken: 'token-b',
    });

    publicRepo = await reposRepo.save({
      ownerUserId: owner.id,
      githubRepoId: 1,
      fullName: 'owner/public-repo',
      visibility: 'public',
      webhookId: 1,
      webhookSecret: 's1',
    });
    privateRepo = await reposRepo.save({
      ownerUserId: owner.id,
      githubRepoId: 2,
      fullName: 'owner/private-repo',
      visibility: 'private',
      webhookId: 2,
      webhookSecret: 's2',
    });

    await eventsRepo.save([
      {
        provider: 'github',
        deliveryId: 'd-public',
        eventType: 'push',
        repositoryName: 'owner/public-repo',
        repositoryId: publicRepo.id,
        rawPayload: {},
      },
      {
        provider: 'github',
        deliveryId: 'd-private',
        eventType: 'push',
        repositoryName: 'owner/private-repo',
        repositoryId: privateRepo.id,
        rawPayload: {},
      },
      {
        // predates per-repo registration — no matched repo, no owner to
        // scope to, so it should behave like a public event.
        provider: 'github',
        deliveryId: 'd-legacy',
        eventType: 'push',
        repositoryName: 'someone/legacy-repo',
        repositoryId: null,
        rawPayload: {},
      },
      {
        provider: 'github',
        deliveryId: 'd-star',
        eventType: 'star',
        repositoryName: 'owner/public-repo',
        repositoryId: publicRepo.id,
        rawPayload: {},
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await pg.stop();
  });

  function tokenFor(user: User): string {
    return app.get(JwtService).sign({ sub: user.id });
  }

  it('shows only public + unmatched events to an anonymous caller', async () => {
    const response = await request(app.getHttpServer()).get('/events').expect(200);
    const deliveryIds = (response.body as EventListItem[]).map((e) => e.deliveryId);

    expect(deliveryIds).toEqual(expect.arrayContaining(['d-public', 'd-legacy', 'd-star']));
    expect(deliveryIds).not.toContain('d-private');
  });

  it("also shows the owner's private repo events when authenticated as them", async () => {
    const response = await request(app.getHttpServer())
      .get('/events')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .expect(200);
    const deliveryIds = (response.body as EventListItem[]).map((e) => e.deliveryId);

    expect(deliveryIds).toEqual(
      expect.arrayContaining(['d-public', 'd-private', 'd-legacy', 'd-star']),
    );
  });

  it("does not show another user's private repo events", async () => {
    const response = await request(app.getHttpServer())
      .get('/events')
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .expect(200);
    const deliveryIds = (response.body as EventListItem[]).map((e) => e.deliveryId);

    expect(deliveryIds).not.toContain('d-private');
  });

  it('ignores an invalid bearer token rather than rejecting the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/events')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(200);
    const deliveryIds = (response.body as EventListItem[]).map((e) => e.deliveryId);

    expect(deliveryIds).not.toContain('d-private');
  });

  it('filters by eventType', async () => {
    const response = await request(app.getHttpServer())
      .get('/events?eventType=star')
      .expect(200);

    const events = response.body as EventListItem[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.eventType === 'star')).toBe(true);
  });

  it('filters by repository', async () => {
    const response = await request(app.getHttpServer())
      .get('/events?repository=owner/public-repo')
      .expect(200);

    const events = response.body as EventListItem[];
    expect(events.map((e) => e.deliveryId)).toEqual(
      expect.arrayContaining(['d-public', 'd-star']),
    );
  });

  it('reports counts by event type via /events/stats', async () => {
    const response = await request(app.getHttpServer()).get('/events/stats').expect(200);

    const starRow = (response.body as { eventType: string; count: number }[]).find(
      (row) => row.eventType === 'star',
    );
    expect(starRow?.count).toBeGreaterThanOrEqual(1);
  });
});
