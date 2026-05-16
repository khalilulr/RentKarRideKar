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
    })
    mobile: string;

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    name: string;

    @Column("text", {
        array: true,
        default: () => "ARRAY['PASSENGER']::text[]",
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
        default: Role.PASSENGER
    })
    activePerspective: Role;

    @Column({
        name: "profile_picture",
        type: "varchar",
        nullable: true
    })
    profilePicture?: string;

    @OneToMany(() => Session, session => session.user)
    sessions: Session[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}