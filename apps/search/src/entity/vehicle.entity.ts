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

  // ─── Status & Availability ─────────────────────────────────

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    default: VehicleStatus.DRAFT,
  })
  status: VehicleStatus;              // controlled by admin

  @Column({ default: true, name: 'is_available' })
  isAvailable: boolean;               // ← controlled by owner (online/offline toggle)

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