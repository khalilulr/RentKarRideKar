import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { OrderVehicle } from './order-vehicle.entity';
import { OrderTimeline } from './order-timeline.entity';
import { OrderStatus } from '../enum/order-status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'passenger_id' })
  passengerId: string;

  @Column({ name: 'passenger_note', nullable: true, type: 'text' })
  passengerNote: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.OWNER_PENDING,
  })
  status: OrderStatus;

  @Column({ name: 'visible_status', type: 'varchar', default: 'REQUEST_SENT' })
  visibleStatus: string; // REQUEST_SENT, AWAITING_PAYMENT, BOOKED, IN_TRANSIT, COMPLETED, CANCELLED

  @Column('decimal', { precision: 10, scale: 2, name: 'total_amount' })
  totalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'advance_amount' })
  advanceAmount: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'original_amount', nullable: true })
  originalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'discount_amount', default: 0 })
  discountAmount: number;

  @Column({ name: 'promo_code', type: 'varchar', nullable: true })
  promoCode: string;

  @Column({ name: 'payment_status', type: 'varchar', default: 'PENDING' })
  paymentStatus: string; // PENDING, PAID, REFUNDED

  @Column({ name: 'payment_link', nullable: true })
  paymentLink: string;

  @Column({ name: 'whatsapp_status', type: 'varchar', default: 'SENT' })
  whatsappStatus: string; // SENT, NOT_SENT

  @OneToMany(() => OrderVehicle, (ov) => ov.order, { cascade: true })
  vehicles: OrderVehicle[];

  @OneToMany(() => OrderTimeline, (ot) => ot.order, { cascade: true })
  timeline: OrderTimeline[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Index()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
