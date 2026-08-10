import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookEvent } from './entities/webhook-event.entity';
import { GithubEventDto } from '../webhooks/dto/github-event.dto';

export type IngestResult = { status: 'created' | 'duplicate'; id?: string };

// Postgres error code for a unique constraint violation.
const POSTGRES_UNIQUE_VIOLATION = '23505';

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
      rawPayload: payload,
    };
  }

  findRecent(limit = 50): Promise<WebhookEvent[]> {
    return this.eventsRepository.find({
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
