import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('offers_history')
export class OfferHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', name: 'offer_code' })
  offerCode: string;

  @Column({ type: 'varchar', name: 'booking_id' })
  bookingId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'discount_amount' })
  discountAmount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'used_at' })
  usedAt: Date;
}
