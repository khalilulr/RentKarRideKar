import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('call_sessions')
export class CallSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'caller_id', type: 'uuid' })
  callerId: string;

  @Column({ name: 'callee_id', type: 'uuid' })
  calleeId: string;

  @Column({ name: 'twilio_call_sid', length: 100, nullable: true })
  twilioCallSid: string;

  @Column({ name: 'virtual_number', length: 20 })
  virtualNumber: string;

  @Column({ length: 20, default: 'active' })
  status: string; // 'active' | 'ended'

  @CreateDateColumn({ name: 'opened_at', type: 'timestamptz' })
  openedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds: number;
}
