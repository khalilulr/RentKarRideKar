import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { Message } from './message.entity';

@Entity('chat_rooms')
@Unique(['bookingId', 'roomType'])
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'participant_a_id', type: 'uuid' })
  participantAId: string; // always passenger

  @Column({ name: 'participant_b_id', type: 'uuid' })
  participantBId: string; // driver or owner

  @Column({ name: 'room_type', length: 20 })
  roomType: string; // 'passenger_driver' | 'passenger_owner'

  @Column({ length: 20, default: 'active' })
  status: string; // 'active' | 'readonly' | 'archived'

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date;

  @OneToMany(() => Message, (message) => message.room)
  messages: Message[];
}
