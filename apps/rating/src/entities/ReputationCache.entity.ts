import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('reputation_cache')
export class ReputationCache {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'overall_rating', nullable: true })
  overallRating?: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'punctuality_avg', nullable: true })
  punctualityAvg?: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'cleanliness_avg', nullable: true })
  cleanlinessAvg?: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'safety_avg', nullable: true })
  safetyAvg?: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'communication_avg', nullable: true })
  communicationAvg?: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, name: 'reliability_score', nullable: true })
  reliabilityScore?: number;

  @Column({ type: 'varchar', name: 'badge_level', nullable: true })
  badgeLevel?: 'Excellent' | 'VeryGood' | 'Fair' | 'Concerning' | 'Poor';

  @Column({ type: 'integer', name: 'total_reviews', nullable: true })
  totalReviews?: number;

  @Column({ type: 'varchar', name: 'rating_trend', nullable: true })
  ratingTrend?: 'up' | 'down' | 'stable';

  @Column({ type: 'timestamptz', name: 'last_computed_at', default: () => 'CURRENT_TIMESTAMP' })
  lastComputedAt: Date;
}
