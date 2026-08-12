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
import { User } from '../../users/entities/user.entity';

export type RepositoryVisibility = 'public' | 'private';

/**
 * A GitHub repo a user has registered with the pipeline. Registration
 * auto-installs a webhook on GitHub (see RepositoriesService), and
 * webhookSecret is what GithubSignatureGuard verifies deliveries for this
 * repo against — one secret per repo, not the old single global secret.
 */
@Entity('repositories')
@Unique('UQ_repository_full_name', ['fullName'])
export class Repository {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id' })
  ownerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User;

  @Column({ name: 'github_repo_id' })
  githubRepoId!: number;

  @Column({ name: 'full_name' })
  @Index()
  fullName!: string; // 'owner/repo'

  @Column({ type: 'varchar' })
  visibility!: RepositoryVisibility;

  @Column({ name: 'webhook_id' })
  webhookId!: number; // GitHub's hook id, needed to remove the hook on delete

  @Column({ name: 'webhook_secret' })
  webhookSecret!: string;

  // timestamptz, not the @CreateDateColumn default — see the comment on
  // WebhookEvent.receivedAt for why a plain `timestamp` silently
  // corrupts values across machines in different timezones.
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
