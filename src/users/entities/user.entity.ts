import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * accessToken is stored in plaintext for now — same demo-scope trade-off
 * as `synchronize: true` on the datasource. Encrypting it at rest (e.g.
 * pgcrypto or an application-level KMS key) is a prerequisite before this
 * handles real user accounts beyond local testing, not just this table.
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

  @Column({ name: 'access_token' })
  accessToken!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
