import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('captcha_solver_configs')
export class CaptchaSolverConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
