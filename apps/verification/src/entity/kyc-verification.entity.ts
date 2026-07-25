import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Role } from '../enum/role.enum';
import { KycStatus } from '../enum/kycStatus.enum';
import { DocumentEntity } from './document.entity';

@Entity('kyc_verifications')
export class KycVerificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', nullable: true, name: 'vehicle_id' })
  vehicleId?: string;
  // null = user KYC verification
  // populated = vehicle document verification

  @Column({
    type: 'enum',
    enum: Role,
    nullable: true,
  })
  role?: Role;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING,
  })
  status: KycStatus;

  @Column({
    type: 'text',
    nullable: true,
    name: 'rejection_reason',
  })
  rejectionReason?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'reviewed_by',
  })
  reviewedBy?: string; // admin userId who reviewed

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'submitted_at',
  })
  submittedAt?: Date; // when user hit submit

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'reviewed_at',
  })
  reviewedAt?: Date; // when admin approved/rejected

  @OneToMany(() => DocumentEntity, (document) => document.verification)
  documents: DocumentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
