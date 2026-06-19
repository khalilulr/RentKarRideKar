import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { VehicleBlockEntity } from './vehicle-unavailability.entity';
import { VehicleCategory } from '../enum/vehicleCategory.enum';
import { SeatingCapacity } from '../enum/seatingCapacity.enum';
import { VehicleStatus } from '../enum/vehicleStatus.enum';

@Entity('vehicles')
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @Column({
    type: 'enum',
    enum: VehicleCategory,
    name: 'vehicle_category',
  })
  vehicleCategory: VehicleCategory;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column({ nullable: true })
  variant: string;

  @Column({ unique: true, name: 'registration_number' })
  registrationNumber: string;

  @Column({
    type: 'enum',
    enum: SeatingCapacity,
    name: 'seating_capacity',
  })
  seatingCapacity: SeatingCapacity;

  @Column()
  color: string;

  @Column({ default: true, name: 'has_ac' })
  hasAC: boolean;

  @Column({ name: 'manufacturing_year' })
  manufacturingYear: number;

  @Column({ type: 'int', name: 'service_radius', default: 10 })
  serviceRadius: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'home_lat' })
  homeLat: number;

  @Column('decimal', { precision: 10, scale: 7, name: 'home_lng' })
  homeLng: number;

  @Column({ name: 'home_address' })
  homeAddress: string;

  @Column('simple-array', { nullable: true, name: 'vehicle_photos' })
  vehiclePhotos: string[];

  @Column({ nullable: true, name: 'fuel_type' })
  fuelType: string;

  @Column({ nullable: true })
  transmission: string;

  // ─── Status & Availability ─────────────────────────────────

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    default: VehicleStatus.DRAFT,
  })
  status: VehicleStatus;              // controlled by admin

  @Column({ default: false, name: 'is_available' })
  isAvailable: boolean;               // ← controlled by owner (online/offline toggle)

  // ─── Plate & Permit Details (NEW) ─────────────────────────

  @Column({ default: 'WHITE', name: 'plate_type' })
  plateType: string;                  // 'WHITE' | 'YELLOW'

  @Column({ nullable: true, name: 'commercial_permit_number' })
  commercialPermitNumber: string;

  @Column({ nullable: true, name: 'permit_type' })
  permitType: string;                 // e.g. CONTRACT_CARRIAGE

  @Column({ type: 'date', nullable: true, name: 'permit_expiry_date' })
  permitExpiryDate: Date;

  // ─── Pricing Details (NEW) ─────────────────────────────────

  @Column('decimal', { precision: 10, scale: 2, nullable: true, name: 'per_km_outstation' })
  perKmOutstation: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, name: 'per_hour_local' })
  perHourLocal: number;

  @Column({ type: 'int', nullable: true, name: 'minimum_booking_hours', default: 4 })
  minimumBookingHours: number;

  @Column({ type: 'int', nullable: true, name: 'night_charge_percentage', default: 20 })
  nightChargePercentage: number;

  @Column({ type: 'simple-json', nullable: true, name: 'event_package' })
  eventPackage: { halfDay?: number; fullDay?: number; weddingPackage?: number };

  @Column({ type: 'int', default: 25, name: 'advance_percentage' })
  advancePercentage: number;

  @Column({ type: 'simple-json', nullable: true, name: 'rto_raw_data' })
  rtoRawData: any;

  // ─── Relations ─────────────────────────────────────────────

  @OneToMany(() => VehicleBlockEntity, (block) => block.vehicle)
  blocks: VehicleBlockEntity[];       // ← date-specific blocks


  // ─── Drivers ───────────────────────────────────
  // On VehicleEntity — two separate columns

  @Column('simple-array', { nullable: true, name: 'known_driver_ids' })
  knownDriverIds: string[];
  // Manually added by owner — "I always use Raju for this car"
  // Shown as a contact list in Mode 2 picker

  @Column('simple-array', { nullable: true, name: 'recent_driver_ids' })
  recentDriverIds: string[];
  // Auto-populated by booking service after each completed trip
  // "Drivers who've driven this car before" — shown at top of Mode 2 picker
  // ─── Timestamps ────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}