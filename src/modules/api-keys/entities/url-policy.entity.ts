import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PolicyType {
  WHITELIST = 'whitelist',
  BLACKLIST = 'blacklist',
}

@Entity('url_policies')
export class UrlPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  pattern: string; // URL pattern or domain

  @Column({
    type: 'varchar',
    length: 20,
    default: PolicyType.BLACKLIST,
  })
  @Index()
  type: PolicyType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ nullable: true, type: 'jsonb' })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
