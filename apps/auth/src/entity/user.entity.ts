import {
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    OneToMany
} from "typeorm";
import { Role } from "../enum/role.enum";
import { Session } from "./session.entity";

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'varchar',
        unique: true,
        length: 15,
        nullable: true,
    })
    mobile?: string;

    @Column({
        type: 'varchar',
        unique: true,
        nullable: true,
    })
    email?: string;

    @Column({
        type: 'varchar',
        nullable: true,
    })
    password?: string;

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    name: string;

    @Column("text", {
        array: true,
        default: () => "ARRAY[]::text[]",
    })
    roles: Role[];

    @Column({
        name: 'is_active',
        type: 'boolean',
        default: true,
    })
    isActive: boolean;

    @Column({
        type: 'enum',
        enum: Role,
        nullable: true,
    })
    activePerspective?: Role;

    @Column({
        name: "profile_picture",
        type: "varchar",
        nullable: true
    })
    profilePicture?: string;

    @OneToMany(() => Session, session => session.user)
    sessions: Session[];

    @Column({
        type: 'float',
        nullable: true,
        default: 0
    })
    rating?: number;

    @Column({
        name: 'bank_account_number',
        type: 'varchar',
        nullable: true,
    })
    bankAccountNumber?: string;

    @Column({
        name: 'bank_account_holder_name',
        type: 'varchar',
        nullable: true,
    })
    bankAccountHolderName?: string;

    @Column({
        name: 'bank_name',
        type: 'varchar',
        nullable: true,
    })
    bankName?: string;

    @Column({
        name: 'bank_ifsc_code',
        type: 'varchar',
        nullable: true,
    })
    bankIfscCode?: string;
    
    @Column({
        name: 'driver_license_number',
        type: 'varchar',
        nullable: true,
    })
    driverLicenseNumber?: string;

    @Column({
        name: 'driver_experience_years',
        type: 'int',
        nullable: true,
    })
    driverExperienceYears?: number;

    @Column({
        name: 'owner_business_name',
        type: 'varchar',
        nullable: true,
    })
    ownerBusinessName?: string;

    @Column({
        name: 'owner_address',
        type: 'varchar',
        nullable: true,
    })
    ownerAddress?: string;

    @Column({
        name: 'wallet_balance',
        type: 'int',
        default: 0
    })
    walletBalance: number;

    @Column({
        name: 'referral_code',
        type: 'varchar',
        nullable: true
    })
    referralCode?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}