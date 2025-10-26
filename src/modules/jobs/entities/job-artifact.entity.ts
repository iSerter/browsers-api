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

export enum ArtifactType {
  SCREENSHOT = 'screenshot',
  PDF = 'pdf',
  VIDEO = 'video',
  TRACE = 'trace',
  DATA = 'data',
}

@Entity('job_artifacts')
export class JobArtifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id' })
  @Index()
  jobId: string;

  @ManyToOne(() => AutomationJob, (job) => job.artifacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'job_id' })
  job: AutomationJob;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'artifact_type',
  })
  artifactType: ArtifactType;

  @Column({ nullable: true, type: 'text', name: 'file_path' })
  filePath: string;

  @Column({ nullable: true, type: 'bytea', name: 'file_data' })
  fileData: Buffer;

  @Column({ nullable: true, length: 100, name: 'mime_type' })
  mimeType: string;

  @Column({ nullable: true, type: 'bigint', name: 'size_bytes' })
  sizeBytes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
