import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WebhookEvent } from './entities/webhook-event.entity';
import { GithubEventDto } from '../webhooks/dto/github-event.dto';
import { FindEventsDto } from './dto/find-events.dto';

export type IngestResult = { status: 'created' | 'duplicate'; id?: string };
export type EventTypeCount = { eventType: string; count: number };

// Narrow view of the GitHub payload fields buildSummary/buildRefName read.
// GithubEventDto only validates action/repository/sender; everything else
// passes through untyped, so this exists purely to avoid `any` here.
interface GithubWebhookPayload {
  action?: string;
  ref?: unknown;
  commits?: unknown[];
  pull_request?: { number?: number; title?: string };
  issue?: { number?: number; title?: string };
  release?: { tag_name?: string };
  forkee?: { full_name?: string };
}

// Postgres error code for a unique constraint violation.
const POSTGRES_UNIQUE_VIOLATION = '23505';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventsRepository: Repository<WebhookEvent>,
  ) {}

  /**
   * Extract -> Transform -> Load for a single GitHub webhook delivery.
   * Extraction already happened in the controller (headers + body).
   * This method transforms the raw payload into the normalized shape
   * and loads it, relying on the DB's unique constraint for idempotency.
   */
  async ingestGithubEvent(
    deliveryId: string,
    eventType: string,
    payload: GithubEventDto,
  ): Promise<IngestResult> {
    const normalized = this.transform(deliveryId, eventType, payload);

    try {
      const saved = await this.eventsRepository.save(normalized);
      this.logger.log(`Ingested ${eventType} event (delivery ${deliveryId})`);
      return { status: 'created', id: saved.id };
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        this.logger.warn(`Duplicate delivery ${deliveryId} — already ingested, skipping`);
        return { status: 'duplicate' };
      }
      throw err;
    }
  }

  private transform(
    deliveryId: string,
    eventType: string,
    payload: GithubEventDto,
  ): Partial<WebhookEvent> {
    return {
      provider: 'github',
      deliveryId,
      eventType,
      action: payload.action ?? null,
      repositoryName: payload.repository?.full_name ?? null,
      senderLogin: payload.sender?.login ?? null,
      summary: this.buildSummary(eventType, payload),
      refName: this.buildRefName(eventType, payload),
      rawPayload: payload,
    };
  }

  // One human-readable line per event type, so a frontend feed doesn't
  // need to know GitHub's payload shape for every event. Unrecognized
  // event types fall back to null — the caller can display eventType/action.
  private buildSummary(eventType: string, payload: GithubEventDto): string | null {
    const p = payload as GithubWebhookPayload;

    switch (eventType) {
      case 'push': {
        const commitCount = Array.isArray(p.commits) ? p.commits.length : 0;
        const branch = this.stripRefPrefix(p.ref);
        return `pushed ${commitCount} commit${commitCount === 1 ? '' : 's'} to ${branch ?? 'unknown branch'}`;
      }
      case 'pull_request': {
        const number = p.pull_request?.number;
        const title = p.pull_request?.title;
        return `${p.action} PR #${number}: ${title}`;
      }
      case 'issues': {
        const number = p.issue?.number;
        const title = p.issue?.title;
        return `${p.action} issue #${number}: ${title}`;
      }
      case 'release': {
        const tag = p.release?.tag_name;
        return `${p.action} release ${tag}`;
      }
      case 'star':
        return p.action === 'created' ? 'starred the repo' : 'unstarred the repo';
      case 'fork':
        return `forked to ${p.forkee?.full_name ?? 'unknown'}`;
      default:
        return null;
    }
  }

  private buildRefName(eventType: string, payload: GithubEventDto): string | null {
    const p = payload as GithubWebhookPayload;

    switch (eventType) {
      case 'push':
        return this.stripRefPrefix(p.ref);
      case 'create':
      case 'delete':
        return typeof p.ref === 'string' ? p.ref : null;
      default:
        return null;
    }
  }

  private stripRefPrefix(ref: unknown): string | null {
    if (typeof ref !== 'string') return null;
    return ref.replace(/^refs\/(heads|tags)\//, '');
  }

  async findEvents(query: FindEventsDto): Promise<WebhookEvent[]> {
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    return this.eventsRepository.find({
      where: {
        ...(query.eventType && { eventType: query.eventType }),
        ...(query.repository && { repositoryName: query.repository }),
        ...(query.before && { receivedAt: LessThan(new Date(query.before)) }),
      },
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }

  async getStats(): Promise<EventTypeCount[]> {
    const rows = await this.eventsRepository
      .createQueryBuilder('event')
      .select('event.event_type', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.event_type')
      .orderBy('count', 'DESC')
      .getRawMany<{ eventType: string; count: string }>();

    return rows.map((row) => ({ eventType: row.eventType, count: parseInt(row.count, 10) }));
  }
}
