import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('offers')
@Unique(['code'])
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'code' })
  code: string;

  @Column({ type: 'varchar', name: 'type' }) // 'percentage' | 'flat'
  type: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'value' })
  value: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', name: 'first_booking_only', default: false })
  firstBookingOnly: boolean;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'min_booking_amount',
    default: 0.0,
  })
  minBookingAmount: number;

  @Column({ type: 'text', name: 'description', nullable: true })
  description?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
