import { EventsService } from './events.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { GithubEventDto } from '../webhooks/dto/github-event.dto';

function payload(body: Record<string, unknown>): GithubEventDto {
  return body;
}

type SavedEvent = Partial<WebhookEvent>;

describe('EventsService', () => {
  let eventsRepository: {
    save: jest.Mock<Promise<{ id: string }>, [SavedEvent]>;
    createQueryBuilder: jest.Mock;
  };
  let service: EventsService;

  beforeEach(() => {
    eventsRepository = {
      save: jest.fn<Promise<{ id: string }>, [SavedEvent]>(),
      createQueryBuilder: jest.fn(),
    };
    service = new EventsService(eventsRepository as any);
  });

  describe('ingestGithubEvent / transform', () => {
    async function ingestAndCapture(
      eventType: string,
      body: Record<string, unknown>,
      repositoryId: string | null = 'repo-123',
    ): Promise<SavedEvent> {
      eventsRepository.save.mockResolvedValue({ id: 'saved-id' });
      await service.ingestGithubEvent('delivery-1', eventType, payload(body), repositoryId);
      return eventsRepository.save.mock.calls.at(-1)![0];
    }

    it('summarizes a push event and extracts the branch as refName', async () => {
      const saved = await ingestAndCapture('push', {
        ref: 'refs/heads/main',
        commits: [{ id: 'a' }, { id: 'b' }],
        repository: { full_name: 'octocat/hello-world' },
        sender: { login: 'octocat' },
      });

      expect(saved.summary).toBe('pushed 2 commits to main');
      expect(saved.refName).toBe('main');
      expect(saved.repositoryName).toBe('octocat/hello-world');
      expect(saved.senderLogin).toBe('octocat');
      expect(saved.repositoryId).toBe('repo-123');
    });

    it('uses singular "commit" for a single-commit push', async () => {
      const saved = await ingestAndCapture('push', {
        ref: 'refs/heads/main',
        commits: [{ id: 'a' }],
      });

      expect(saved.summary).toBe('pushed 1 commit to main');
    });

    it('summarizes a pull_request event', async () => {
      const saved = await ingestAndCapture('pull_request', {
        action: 'opened',
        pull_request: { number: 42, title: 'Fix login bug' },
      });

      expect(saved.summary).toBe('opened PR #42: Fix login bug');
      expect(saved.action).toBe('opened');
    });

    it('summarizes an issues event', async () => {
      const saved = await ingestAndCapture('issues', {
        action: 'opened',
        issue: { number: 7, title: 'Crash on startup' },
      });

      expect(saved.summary).toBe('opened issue #7: Crash on startup');
    });

    it('summarizes a release event', async () => {
      const saved = await ingestAndCapture('release', {
        action: 'published',
        release: { tag_name: 'v1.2.0' },
      });

      expect(saved.summary).toBe('published release v1.2.0');
    });

    it('summarizes star/unstar events', async () => {
      const starred = await ingestAndCapture('star', { action: 'created' });
      const unstarred = await ingestAndCapture('star', { action: 'deleted' });

      expect(starred.summary).toBe('starred the repo');
      expect(unstarred.summary).toBe('unstarred the repo');
    });

    it('summarizes a fork event', async () => {
      const saved = await ingestAndCapture('fork', {
        forkee: { full_name: 'someone/hello-world-fork' },
      });

      expect(saved.summary).toBe('forked to someone/hello-world-fork');
    });

    it('captures refName (unmodified) for create/delete events', async () => {
      const saved = await ingestAndCapture('create', { ref: 'v2.0' });

      expect(saved.refName).toBe('v2.0');
      expect(saved.summary).toBeNull(); // 'create' has no summary template
    });

    it('falls back to a null summary/refName for unhandled event types', async () => {
      const saved = await ingestAndCapture('ping', {});

      expect(saved.summary).toBeNull();
      expect(saved.refName).toBeNull();
    });

    it('treats a Postgres unique-violation on save as a duplicate, not an error', async () => {
      eventsRepository.save.mockRejectedValue({ code: '23505' });

      const result = await service.ingestGithubEvent(
        'delivery-1',
        'push',
        payload({ ref: 'refs/heads/main', commits: [] }),
        null,
      );

      expect(result).toEqual({ status: 'duplicate' });
    });

    it('rethrows non-unique-violation errors from save', async () => {
      const dbError = new Error('connection reset');
      eventsRepository.save.mockRejectedValue(dbError);

      await expect(
        service.ingestGithubEvent('delivery-1', 'push', payload({}), null),
      ).rejects.toThrow(dbError);
    });
  });
});
