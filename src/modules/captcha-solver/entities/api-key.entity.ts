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
export class CaptchaSolverApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  provider: string;

  @Column({ type: 'text' })
  apiKey: string;

  @Column({
    type: 'enum',
    enum: ApiKeyHealthStatus,
    default: ApiKeyHealthStatus.UNKNOWN,
  })
  healthStatus: ApiKeyHealthStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastSuccessfulUse: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastFailure: Date | null;

  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ default: 0 })
  totalUses: number;

  @Column({ default: 0 })
  totalFailures: number;

  @Column({ type: 'text', nullable: true })
  lastValidationError: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

