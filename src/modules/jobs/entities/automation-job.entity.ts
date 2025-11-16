import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BrowserType } from '../../browsers/entities/browser-type.entity';

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum WaitUntilOption {
  LOAD = 'load',
  DOMCONTENTLOADED = 'domcontentloaded',
  NETWORKIDLE = 'networkidle',
}

@Entity('automation_jobs')
@Index(['status', 'priority'], { where: "status = 'pending'" })
export class AutomationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'browser_type_id' })
  @Index()
  browserTypeId: number;

  @ManyToOne(() => BrowserType)
  @JoinColumn({ name: 'browser_type_id' })
  browserType: BrowserType;

  @Column({ type: 'text', name: 'target_url' })
  targetUrl: string;

  @Column({ type: 'jsonb' })
  actions: any[];

  @Column({
    type: 'varchar',
    length: 20,
    default: WaitUntilOption.NETWORKIDLE,
    name: 'wait_until',
  })
  waitUntil: WaitUntilOption;

  @Column({
    type: 'varchar',
    length: 20,
    default: JobStatus.PENDING,
  })
  @Index()
  status: JobStatus;

  @Column({ default: 0 })
  priority: number;

  @Column({ default: 0, name: 'retry_count' })
  retryCount: number;

  @Column({ default: 3, name: 'max_retries' })
  maxRetries: number;

  @Column({ default: 30000, name: 'timeout_ms' })
  timeoutMs: number;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;

  @Column({ nullable: true, name: 'started_at' })
  startedAt: Date;

  @Column({ nullable: true, name: 'completed_at' })
  completedAt: Date;

  @Column({ nullable: true, type: 'text', name: 'error_message' })
  errorMessage: string;

  @Column({ nullable: true, type: 'jsonb' })
  result: any;

  @Column({ nullable: true, type: 'varchar', length: 500, name: 'proxy_server' })
  proxyServer: string;

  @Column({ nullable: true, type: 'varchar', length: 255, name: 'proxy_username' })
  proxyUsername: string;

  @Column({ nullable: true, type: 'varchar', length: 255, name: 'proxy_password' })
  proxyPassword: string;

  @Column({ nullable: true, type: 'jsonb', name: 'captcha_config' })
  captchaConfig: any;

  @OneToMany(
    () => require('./job-artifact.entity').JobArtifact,
    (artifact: any) => artifact.job,
  )
  artifacts: any[];

  @OneToMany(() => require('./job-log.entity').JobLog, (log: any) => log.job)
  logs: any[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
