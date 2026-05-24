// vehicle-block.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { Reason as BlockReason } from '../enum/reason.enum';

@Entity('vehicle_blocks')
export class VehicleBlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VehicleEntity, (vehicle) => vehicle.blocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: VehicleEntity;           // ← relation back to VehicleEntity

  @Column({ type: 'date', name: 'start_date' })
  startDate: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: BlockReason,
  })
  reason: BlockReason;

  @Column({ type: 'uuid', nullable: true, name: 'booking_id' })
  bookingId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}