import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cancellations')
export class Cancellation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId: string;

  @Column({ type: 'uuid', name: 'cancelled_by_id' })
  cancelledById: string;

  @Column({ type: 'varchar', name: 'cancelled_by_role' })
  cancelledByRole: 'owner' | 'passenger';

  @CreateDateColumn({ type: 'timestamptz', name: 'cancelled_at' })
  cancelledAt: Date;

  @Column({ type: 'boolean', name: 'is_late', default: false })
  isLate: boolean;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'hours_before_trip' })
  hoursBeforeTrip: number;

  @Column({ type: 'boolean', name: 'advance_was_paid' })
  advanceWasPaid: boolean;

  @Column({ type: 'boolean', name: 'penalty_applied', default: false })
  penaltyApplied: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'penalty_amount', nullable: true })
  penaltyAmount?: number;

  @Column({ type: 'smallint', name: 'offense_count_at_time' })
  offenseCountAtTime: number;
}
