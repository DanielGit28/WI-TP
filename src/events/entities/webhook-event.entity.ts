import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Repository } from '../../repositories/entities/repository.entity';

/**
 * Normalized representation of an ingested webhook event.
 *
 * The (provider, deliveryId) unique constraint is what makes ingestion
 * idempotent: providers like GitHub retry deliveries on timeout/error,
 * so the same event can arrive more than once. Rather than deduping in
 * application code, we let Postgres reject the duplicate insert and
 * treat that as a no-op.
 */
@Entity('webhook_events')
@Unique('UQ_provider_delivery', ['provider', 'deliveryId'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  provider!: string; // e.g. 'github'

  @Column({ name: 'delivery_id' })
  deliveryId!: string; // provider's unique ID for this specific delivery attempt

  @Column({ name: 'event_type' })
  @Index()
  eventType!: string; // e.g. 'push', 'pull_request', 'issues'

  @Column({ type: 'varchar', nullable: true })
  action!: string | null; // e.g. 'opened', 'closed' — present on many GitHub event types

  @Column({ name: 'repository_name', type: 'varchar', nullable: true })
  repositoryName!: string | null;

  // Nullable: events ingested before per-repo registration existed (or
  // whose repo has since been deleted) have no matching Repository row.
  // Those are treated as publicly visible — there's no owner to scope
  // them to. See EventsService.findEvents.
  @Column({ name: 'repository_id', type: 'uuid', nullable: true })
  @Index()
  repositoryId!: string | null;

  @ManyToOne(() => Repository, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repository_id' })
  repository!: Repository | null;

  @Column({ name: 'sender_login', type: 'varchar', nullable: true })
  senderLogin!: string | null;

  // Human-readable one-liner for feed display, e.g. "opened PR #42: Fix
  // login bug" — computed per event type at ingest time so the frontend
  // doesn't need to know GitHub's payload shape for every event type.
  @Column({ type: 'varchar', nullable: true })
  summary!: string | null;

  @Column({ name: 'ref_name', type: 'varchar', nullable: true })
  refName!: string | null; // branch/tag ref, e.g. 'main' — from push/create/delete events

  // Full original payload, preserved for auditability even though we've
  // pulled the fields above out into queryable columns.
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;
}
