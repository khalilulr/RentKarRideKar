import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';

@Entity('order_vehicles')
export class OrderVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Index()
  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ type: 'uuid', name: 'vehicle_id', nullable: true })
  vehicleId: string;

  @Index()
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @Column({
    type: 'enum',
    enum: OrderVehicleStatus,
    default: OrderVehicleStatus.PENDING_OWNER_RESPONSE,
  })
  status: OrderVehicleStatus;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'timestamp', name: 'owner_response_deadline', nullable: true })
  ownerResponseDeadline: Date;

  @Column({ type: 'uuid', name: 'assigned_driver_id', nullable: true })
  assignedDriverId: string | null;

  @Column({ type: 'timestamp', name: 'driver_response_deadline', nullable: true })
  driverResponseDeadline: Date;

  @Column({ type: 'varchar', name: 'driver_assignment_type', nullable: true })
  driverAssignmentType: string | null; // OWNER_AS_DRIVER, TRUSTED_DRIVER

  @Column({ type: 'varchar', name: 'proxy_contact', nullable: true })
  proxyContact: string | null;

  @Column({ nullable: true })
  otp: string;

  @Column({ type: 'int', name: 'otp_attempts', default: 3 })
  otpAttempts: number;

  @Column({ type: 'timestamp', name: 'otp_expires_at', nullable: true })
  otpExpiresAt: Date;

  @Column({ type: 'timestamp', name: 'arrived_at', nullable: true })
  arrivedAt: Date;

  @Column({ type: 'timestamp', name: 'trip_started_at', nullable: true })
  tripStartedAt: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt: Date;

  @Column({ type: 'int', name: 'final_odometer_reading', nullable: true })
  finalOdometerReading: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'actual_distance_km', nullable: true })
  actualDistanceKm: number;

  @Column({ name: 'cancellation_reason', nullable: true })
  cancellationReason: string;

  @Column({ name: 'pickup_address', nullable: true })
  pickupAddress: string;

  @Column({ name: 'drop_address', nullable: true })
  dropAddress: string;

  @Column('decimal', { precision: 10, scale: 7, name: 'pickup_lat', nullable: true })
  pickupLat: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'pickup_lng', nullable: true })
  pickupLng: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'drop_lat', nullable: true })
  dropLat: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'drop_lng', nullable: true })
  dropLng: number;

  @Column({ type: 'timestamp', name: 'pickup_datetime', nullable: true })
  pickupDatetime: Date;

  @Column({ type: 'timestamp', name: 'return_datetime', nullable: true })
  returnDatetime: Date | null;

  @Column({ type: 'varchar', name: 'trip_type', nullable: true })
  tripType: string;

  @Column({ type: 'int', name: 'total_days', nullable: true })
  totalDays: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
