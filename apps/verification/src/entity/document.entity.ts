import { 
  Column, 
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Entity, 
  ManyToOne, 
  PrimaryGeneratedColumn, 
  JoinColumn 
} from "typeorm";
import { DocumentType } from "../enum/document_type.enum";
import { DocumentStatus } from "../enum/document_status.enum";
import { KycVerificationEntity } from "./kyc-verification.entity";

@Entity('kyc_documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
    name: 'document_type'
  })
  documentType: DocumentType;

  @Column({ 
    type: 'varchar', 
    name: 'document_url' 
  })
  documentUrl: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
    name: 'status'
  })
  status: DocumentStatus;

  @Column({ 
    type: 'text', 
    nullable: true, 
    name: 'rejection_reason' 
  })
  rejectionReason?: string;

  @ManyToOne(() => KycVerificationEntity, (verification) => verification.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'verification_id' })
  verification: KycVerificationEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date; // soft delete for audit trail on re-uploads
}