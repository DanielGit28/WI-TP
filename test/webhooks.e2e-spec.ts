import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setTestEnv } from './setup/test-env';
import { startTestPostgres, TestPostgres } from './setup/postgres-container';
import { User } from '../src/users/entities/user.entity';
import { Repository as RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { WebhookEvent } from '../src/events/entities/webhook-event.entity';

const WEBHOOK_SECRET = 'the-repos-webhook-secret';

function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

// The single highest-value spec in this suite: it exercises the exact
// raw-body-capture -> guard -> ValidationPipe pipeline that broke silently
// twice this session (content-type mismatch, then a DI wiring gap) without
// any test catching it until manual poking of the running app did.
describe('POST /webhooks/github (e2e)', () => {
  let pg: TestPostgres;
  let app: INestApplication;
  let dataSource: DataSource;
  let registeredRepo: RepositoryEntity;

  beforeAll(async () => {
    pg = await startTestPostgres();
    setTestEnv(pg.databaseUrl);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
    await app.init();

    dataSource = app.get(DataSource);

    const user = await dataSource.getRepository(User).save({
      githubId: 1,
      githubLogin: 'octocat',
      avatarUrl: null,
      accessToken: 'gho_test_token',
    });

    registeredRepo = await dataSource.getRepository(RepositoryEntity).save({
      ownerUserId: user.id,
      githubRepoId: 123,
      fullName: 'octocat/hello-world',
      visibility: 'public',
      webhookId: 999,
      webhookSecret: WEBHOOK_SECRET,
    });
  });

  afterAll(async () => {
    await app.close();
    await pg.stop();
  });

  it('accepts a correctly signed delivery and persists a normalized event', async () => {
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      commits: [{ id: 'abc' }],
      repository: { full_name: 'octocat/hello-world' },
      sender: { login: 'octocat' },
    });
    const deliveryId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', sign(body, WEBHOOK_SECRET))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, status: 'created' });

    const saved = await dataSource.getRepository(WebhookEvent).findOne({ where: { deliveryId } });
    expect(saved).not.toBeNull();
    expect(saved?.repositoryId).toBe(registeredRepo.id);
    expect(saved?.summary).toBe('pushed 1 commit to main');
    expect(saved?.senderLogin).toBe('octocat');
  });

  it('returns "duplicate" (not an error) on a second delivery with the same X-GitHub-Delivery id', async () => {
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      commits: [],
      repository: { full_name: 'octocat/hello-world' },
    });
    const deliveryId = randomUUID();
    const signature = sign(body, WEBHOOK_SECRET);

    const sendOnce = () =>
      request(app.getHttpServer())
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-Hub-Signature-256', signature)
        .send(body);

    const first = await sendOnce();
    const second = await sendOnce();

    expect((first.body as { status: string }).status).toBe('created');
    expect(second.status).toBe(200);
    expect((second.body as { status: string }).status).toBe('duplicate');

    const count = await dataSource.getRepository(WebhookEvent).count({ where: { deliveryId } });
    expect(count).toBe(1);
  });

  it('rejects a delivery with an invalid signature', async () => {
    const body = JSON.stringify({ repository: { full_name: 'octocat/hello-world' } });

    const response = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-GitHub-Delivery', randomUUID())
      .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(body);

    expect(response.status).toBe(401);
  });

  it('rejects a delivery for a repo that has not been registered', async () => {
    const body = JSON.stringify({ repository: { full_name: 'someone/unregistered-repo' } });

    const response = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-GitHub-Delivery', randomUUID())
      .set('X-Hub-Signature-256', sign(body, WEBHOOK_SECRET))
      .send(body);

    expect(response.status).toBe(404);
  });
});
