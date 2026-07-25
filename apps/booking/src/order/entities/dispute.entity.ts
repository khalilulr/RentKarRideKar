import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'order_id' })
  @Index()
  orderId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string; // The user who raised the dispute

  @Column({ type: 'varchar', length: 50 })
  type: string; // WRONG_BILLING | MISBEHAVIOUR | VEHICLE_CONDITION | ROUTE_DEVIATION | DRIVER_NO_SHOW | OTHER

  @Column({ type: 'text' })
  description: string;

  @Column('simple-array', { nullable: true })
  photos: string[];

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string; // OPEN | RESOLVED

  @Column({ type: 'varchar', length: 50, name: 'raised_by' })
  raisedBy: string; // PASSENGER | VEHICLE_OWNER

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    name: 'refund_amount',
  })
  refundAmount: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'refund_to' })
  refundTo: string; // PASSENGER | VEHICLE_OWNER

  @Column({ type: 'boolean', default: false, name: 'penalise_owner' })
  penaliseOwner: boolean;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    name: 'penalty_amount',
  })
  penaltyAmount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'resolved_at' })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
