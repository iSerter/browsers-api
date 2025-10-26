import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BrowserTypeEnum {
  CHROMIUM = 'chromium',
  FIREFOX = 'firefox',
  WEBKIT = 'webkit',
}

export enum DeviceTypeEnum {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
}

@Entity('browser_types')
export class BrowserType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: BrowserTypeEnum;

  @Column({
    type: 'varchar',
    length: 20,
    default: DeviceTypeEnum.DESKTOP,
    name: 'device_type',
  })
  deviceType: DeviceTypeEnum;

  @Column({ nullable: true, type: 'text', name: 'user_agent' })
  userAgent: string;

  @Column({ nullable: true, name: 'viewport_width' })
  viewportWidth: number;

  @Column({ nullable: true, name: 'viewport_height' })
  viewportHeight: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
