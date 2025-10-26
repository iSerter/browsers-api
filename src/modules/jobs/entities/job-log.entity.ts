import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AutomationJob } from './automation-job.entity';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

@Entity('job_logs')
export class JobLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'job_id' })
  @Index()
  jobId: string;

  @ManyToOne(() => AutomationJob, (job) => job.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: AutomationJob;

  @Column({ type: 'varchar', length: 20 })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true, type: 'jsonb' })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;
}
