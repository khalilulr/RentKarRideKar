import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Cart } from './cart.entity';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Column({ name: 'cart_id' })
  cartId: string;

  @Column({ type: 'uuid', name: 'vehicle_id' })
  vehicleId: string;

  @Column({ name: 'pickup_address' })
  pickupAddress: string;

  @Column('decimal', { precision: 10, scale: 7, name: 'pickup_lat' })
  pickupLat: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'pickup_lng' })
  pickupLng: number;

  @Column({ name: 'drop_address' })
  dropAddress: string;

  @Column('decimal', { precision: 10, scale: 7, name: 'drop_lat' })
  dropLat: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'drop_lng' })
  dropLng: number;

  @Column({ type: 'timestamp', name: 'pickup_datetime' })
  pickupDatetime: Date;

  @Column({ type: 'varchar', name: 'trip_type' })
  tripType: string;

  @Column({ type: 'timestamp', name: 'return_datetime', nullable: true })
  returnDatetime: Date | null;

  @Column({ type: 'int', name: 'total_days' })
  totalDays: number;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  // Price lock columns
  @Column('decimal', { precision: 10, scale: 2, name: 'locked_base_fare' })
  lockedBaseFare: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'locked_driver_fees' })
  lockedDriverFees: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'locked_total_price' })
  lockedTotalPrice: number;

  @Column({ type: 'timestamp', name: 'price_locked_at' })
  priceLockedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
