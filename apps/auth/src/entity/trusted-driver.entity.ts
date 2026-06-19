import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from "typeorm";

export enum TrustStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
}

@Entity('trusted_drivers')
@Index(['ownerId', 'driverId'], { unique: true })
export class TrustedDriver {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'uuid',
        name: 'owner_id',
        nullable: false
    })
    ownerId: string;

    @Column({
        type: 'uuid',
        name: 'driver_id',
        nullable: false
    })
    driverId: string;

    @Column({
        type: 'enum',
        enum: TrustStatus,
        default: TrustStatus.PENDING,
        nullable: false
    })
    status: TrustStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
