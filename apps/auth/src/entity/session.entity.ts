import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    nullable: false,
  })
  refreshTokenHash: string;

  @Column({
    type: 'varchar',
    nullable: false,
  })
  ipAddress: string;

  @Column({
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isRevoked: boolean;

  @Column({
    type: 'varchar',
    nullable: false,
  })
  userAgent: string;

  @ManyToOne(() => User, (user) => user.sessions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
