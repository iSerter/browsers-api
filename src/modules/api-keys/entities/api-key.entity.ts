import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  key: string;

  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  @Index()
  clientId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: ApiKeyStatus.ACTIVE,
  })
  @Index()
  status: ApiKeyStatus;

  @Column({ name: 'rate_limit', type: 'int', default: 100 })
  rateLimit: number; // Requests per minute

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ name: 'last_used_at', nullable: true, type: 'timestamp' })
  lastUsedAt: Date | null;

  @Column({ name: 'expires_at', nullable: true, type: 'timestamp' })
  expiresAt: Date | null;

  @Column({ nullable: true, type: 'jsonb' })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

