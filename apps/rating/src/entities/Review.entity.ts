import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('reviews')
@Unique(['bookingId', 'reviewerRole'])
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

  @Column({ type: 'smallint', name: 'overall_rating' })
  overallRating: number;

  @Column({ type: 'smallint', name: 'punctuality_score', nullable: true })
  punctualityScore?: number;

  @Column({ type: 'smallint', name: 'cleanliness_score', nullable: true })
  cleanlinessScore?: number;

  @Column({ type: 'smallint', name: 'safety_score', nullable: true })
  safetyScore?: number;

  @Column({ type: 'smallint', name: 'communication_score', nullable: true })
  communicationScore?: number;

  @Column({ type: 'text', name: 'review_text', nullable: true })
  reviewText?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'submitted_at' })
  submittedAt: Date;

  @Column({ type: 'timestamptz', name: 'revealed_at', nullable: true })
  revealedAt?: Date;

  @Column({ type: 'text', name: 'response_text', nullable: true })
  responseText?: string;

  @Column({ type: 'timestamptz', name: 'response_submitted_at', nullable: true })
  responseSubmittedAt?: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}
