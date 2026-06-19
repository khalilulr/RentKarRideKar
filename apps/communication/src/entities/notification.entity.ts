import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar' })
  channel: string; // 'in-app' | 'whatsapp' | 'both'

  @Column({ type: 'varchar', default: 'SENT' })
  status: string; // 'SENT' | 'PENDING' | 'CANCELLED'

  @Column({ type: 'timestamp', name: 'scheduled_at', nullable: true })
  scheduledAt?: Date | null;

  @Column({ type: 'timestamp', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'varchar', name: 'external_id', nullable: true })
  externalId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
