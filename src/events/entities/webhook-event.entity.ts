import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

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
  id: string;

  @Column()
  @Index()
  provider: string; // e.g. 'github'

  @Column({ name: 'delivery_id' })
  deliveryId: string; // provider's unique ID for this specific delivery attempt

  @Column({ name: 'event_type' })
  @Index()
  eventType: string; // e.g. 'push', 'pull_request', 'issues'

  @Column({ type: 'varchar', nullable: true })
  action: string | null; // e.g. 'opened', 'closed' — present on many GitHub event types

  @Column({ name: 'repository_name', type: 'varchar', nullable: true })
  repositoryName: string | null;

  @Column({ name: 'sender_login', type: 'varchar', nullable: true })
  senderLogin: string | null;

  // Full original payload, preserved for auditability even though we've
  // pulled the fields above out into queryable columns.
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
