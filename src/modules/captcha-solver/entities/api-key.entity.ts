import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiKeyHealthStatus } from '../interfaces/captcha-config.interface';

/**
 * Entity for storing API keys in the database
 */
@Entity('captcha_solver_api_keys')
@Index('IDX_provider_active_health', ['provider', 'isActive', 'healthStatus'])
export class CaptchaSolverApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  provider: string;

  @Column({ name: 'api_key', type: 'text' })
  apiKey: string;

  // Stored as VARCHAR(20) with a CHECK constraint by the migration (not a native
  // pg enum), so map it to varchar to keep the entity in sync with the schema.
  @Column({
    name: 'health_status',
    type: 'varchar',
    length: 20,
    default: ApiKeyHealthStatus.UNKNOWN,
  })
  healthStatus: ApiKeyHealthStatus;

  @Column({ name: 'last_successful_use', type: 'timestamp', nullable: true })
  lastSuccessfulUse: Date | null;

  @Column({ name: 'last_failure', type: 'timestamp', nullable: true })
  lastFailure: Date | null;

  @Column({ name: 'consecutive_failures', default: 0 })
  consecutiveFailures: number;

  @Column({ name: 'total_uses', default: 0 })
  totalUses: number;

  @Column({ name: 'total_failures', default: 0 })
  totalFailures: number;

  @Column({ name: 'last_validation_error', type: 'text', nullable: true })
  lastValidationError: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

