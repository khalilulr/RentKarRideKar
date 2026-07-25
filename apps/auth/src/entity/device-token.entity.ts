import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('device_tokens')
@Index(['userId', 'token'], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  token: string;

  @Column({ type: 'varchar', length: 50 })
  platform: string; // "ANDROID" | "IOS"

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
