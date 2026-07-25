import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('reviews')
@Unique(['bookingId', 'reviewerRole', 'targetType'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId: string;

  @Column({ type: 'uuid', name: 'reviewer_id' })
  reviewerId: string;

  @Column({ type: 'uuid', name: 'reviewee_id' })
  revieweeId: string;

  @Column({ type: 'varchar', name: 'reviewer_role' })
  reviewerRole: 'owner' | 'passenger';

  @Column({ type: 'varchar', name: 'target_type' })
  targetType: 'driver' | 'vehicle' | 'passenger';

  @Column({ type: 'smallint', name: 'overall_rating' })
  overallRating: number;

  @Column({ type: 'boolean', name: 'is_liked', default: false })
  isLiked?: boolean;

  @Column({ type: 'integer', name: 'likes_count', default: 0 })
  likesCount: number;

  @Column({ type: 'text', name: 'review_text', nullable: true })
  reviewText?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'submitted_at' })
  submittedAt: Date;

  @Column({ type: 'timestamptz', name: 'revealed_at', nullable: true })
  revealedAt?: Date;

  @Column({ type: 'text', name: 'response_text', nullable: true })
  responseText?: string;

  @Column({
    type: 'timestamptz',
    name: 'response_submitted_at',
    nullable: true,
  })
  responseSubmittedAt?: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}
