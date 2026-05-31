import { Injectable } from '@nestjs/common';
import { ReviewRepository } from '../repositories/Review.repository';
import { ReputationRepository } from '../repositories/Reputation.repository';
import { CancellationService } from './Cancellation.service';
import { ReputationCache } from '../entities/ReputationCache.entity';

@Injectable()
export class ReputationService {
  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly cancellationService: CancellationService,
  ) {}

  getStarVisualization(rating: number): string {
    const rounded = Math.round(rating);
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  }

  async getReputation(userId: string): Promise<any> {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // 1. Check Cache
    const cached = await this.reputationRepo.findByUserId(userId);
    if (cached && new Date(cached.lastComputedAt) > tenMinutesAgo) {
      const recentReviews = await this.getRecentReviews(userId, 3);
      return {
        overallRating: Number(cached.overallRating || 0),
        starVisualization: this.getStarVisualization(Number(cached.overallRating || 0)),
        categoryBreakdown: {
          punctuality: Number(cached.punctualityAvg || 0),
          cleanliness: Number(cached.cleanlinessAvg || 0),
          safety: Number(cached.safetyAvg || 0),
          communication: Number(cached.communicationAvg || 0),
        },
        reliabilityScore: Number(cached.reliabilityScore || 5.0),
        badgeLevel: cached.badgeLevel || 'Excellent',
        recentReviews,
        tripCompletionCount: cached.totalReviews || 0,
        ratingTrend: cached.ratingTrend || 'stable',
      };
    }

    // 2. Compute Fresh Stats
    const reviews = await this.reviewRepo.findRevealedReviewsForCalculation(userId);
    const cancellationStats = await this.cancellationService.getCancellationStats(userId);

    let overallRating = 0;
    let punctualityAvg = 0;
    let cleanlinessAvg = 0;
    let safetyAvg = 0;
    let communicationAvg = 0;
    let ratingTrend: 'up' | 'down' | 'stable' = 'stable';

    if (reviews.length > 0) {
      // A. Weighted Overall Rating
      let weightedSum = 0;
      let weightSum = 0;

      for (const r of reviews) {
        const diffDays = (now.getTime() - new Date(r.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
        let weight = 0.5;
        if (diffDays <= 30) weight = 1.0;
        else if (diffDays <= 90) weight = 0.8;

        weightedSum += r.overallRating * weight;
        weightSum += weight;
      }
      overallRating = Number((weightedSum / weightSum).toFixed(2));

      // B. Category Averages
      let pSum = 0, pCount = 0;
      let cSum = 0, cCount = 0;
      let sSum = 0, sCount = 0;
      let comSum = 0, comCount = 0;

      for (const r of reviews) {
        if (r.punctualityScore !== undefined && r.punctualityScore !== null) {
          pSum += r.punctualityScore;
          pCount++;
        }
        if (r.cleanlinessScore !== undefined && r.cleanlinessScore !== null) {
          cSum += r.cleanlinessScore;
          cCount++;
        }
        if (r.safetyScore !== undefined && r.safetyScore !== null) {
          sSum += r.safetyScore;
          sCount++;
        }
        if (r.communicationScore !== undefined && r.communicationScore !== null) {
          comSum += r.communicationScore;
          comCount++;
        }
      }

      punctualityAvg = pCount > 0 ? Number((pSum / pCount).toFixed(2)) : 0;
      cleanlinessAvg = cCount > 0 ? Number((cSum / cCount).toFixed(2)) : 0;
      safetyAvg = sCount > 0 ? Number((sSum / sCount).toFixed(2)) : 0;
      communicationAvg = comCount > 0 ? Number((comSum / comCount).toFixed(2)) : 0;

      // C. Trend Analysis
      const allTimeAvg = Number((reviews.reduce((acc, r) => acc + r.overallRating, 0) / reviews.length).toFixed(2));
      const recent10 = reviews.slice(0, 10);
      const recent10Avg = Number((recent10.reduce((acc, r) => acc + r.overallRating, 0) / recent10.length).toFixed(2));

      if (recent10Avg > allTimeAvg + 0.1) {
        ratingTrend = 'up';
      } else if (recent10Avg < allTimeAvg - 0.1) {
        ratingTrend = 'down';
      } else {
        ratingTrend = 'stable';
      }
    }

    // 3. Update Cache
    const freshCache: Partial<ReputationCache> = {
      userId,
      overallRating,
      punctualityAvg,
      cleanlinessAvg,
      safetyAvg,
      communicationAvg,
      reliabilityScore: cancellationStats.reliabilityScore,
      badgeLevel: cancellationStats.badgeLevel,
      totalReviews: reviews.length,
      ratingTrend,
    };
    await this.reputationRepo.save(freshCache);

    const recentReviews = await this.getRecentReviews(userId, 3);

    return {
      overallRating,
      starVisualization: this.getStarVisualization(overallRating),
      categoryBreakdown: {
        punctuality: punctualityAvg,
        cleanliness: cleanlinessAvg,
        safety: safetyAvg,
        communication: communicationAvg,
      },
      reliabilityScore: cancellationStats.reliabilityScore,
      badgeLevel: cancellationStats.badgeLevel,
      recentReviews,
      tripCompletionCount: reviews.length,
      ratingTrend,
    };
  }

  private async getRecentReviews(userId: string, count: number): Promise<any[]> {
    const list = await this.reviewRepo.findRevealedReviewsForCalculation(userId);
    const recent = list.slice(0, count);

    return recent.map(r => ({
      reviewerName: r.reviewerRole === 'passenger' ? 'Passenger Client' : 'Owner Partner',
      rating: r.overallRating,
      textSnippet: r.reviewText
        ? r.reviewText.length > 120
          ? r.reviewText.substring(0, 120) + '...'
          : r.reviewText
        : '',
    }));
  }
}
