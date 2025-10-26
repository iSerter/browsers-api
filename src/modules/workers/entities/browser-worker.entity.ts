import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BrowserType } from '../../browsers/entities/browser-type.entity';
import { AutomationJob } from '../../jobs/entities/automation-job.entity';

export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
}

@Entity('browser_workers')
export class BrowserWorker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'browser_type_id' })
  @Index()
  browserTypeId: number;

  @ManyToOne(() => BrowserType)
  @JoinColumn({ name: 'browser_type_id' })
  browserType: BrowserType;

  @Column({
    type: 'varchar',
    length: 20,
    default: WorkerStatus.IDLE,
  })
  @Index()
  status: WorkerStatus;

  @Column({ nullable: true, name: 'current_job_id' })
  currentJobId: string;

  @ManyToOne(() => AutomationJob, { nullable: true })
  @JoinColumn({ name: 'current_job_id' })
  currentJob: AutomationJob;

  @Column({ type: 'timestamp', default: () => 'NOW()', name: 'last_heartbeat' })
  lastHeartbeat: Date;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ nullable: true, type: 'jsonb' })
  metadata: any;
}

