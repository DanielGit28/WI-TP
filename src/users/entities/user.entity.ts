import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { decrypt, encrypt } from '../../common/crypto/token-cipher';

/**
 * accessToken is a live GitHub OAuth token with `repo` scope (full control
 * of the user's private repos) — encrypted at rest via a TypeORM column
 * transformer (AES-256-GCM, see token-cipher.ts) so a DB read alone isn't
 * enough to obtain it.
 */
@Entity('users')
@Unique('UQ_github_id', ['githubId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'github_id' })
  githubId!: number;

  @Column({ name: 'github_login' })
  githubLogin!: string;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'access_token', transformer: { to: encrypt, from: decrypt } })
  accessToken!: string;

  // timestamptz, not the @CreateDateColumn default — see the comment on
  // WebhookEvent.receivedAt for why a plain `timestamp` silently
  // corrupts values across machines in different timezones.
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
