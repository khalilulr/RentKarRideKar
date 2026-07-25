import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { ReviewService } from './services/Review.service';
import { CancellationService } from './services/Cancellation.service';
import { ReputationService } from './services/Reputation.service';
import { ReviewRepository } from './repositories/Review.repository';
import { ZodValidationPipe } from './pipes/ZodValidationPipe';
import {
  CreateReviewSchema,
  RespondReviewSchema,
  CancelBookingSchema,
  GetReviewsQuerySchema,
  LikeReviewSchema,
} from './schemas/rating.schemas';

@Controller()
export class RatingController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly cancellationService: CancellationService,
    private readonly reputationService: ReputationService,
    private readonly reviewRepo: ReviewRepository,
  ) {}

  private handleError(apiName: string, error: any) {
    console.error(`[Error in RatingController.${apiName}]:`, error);
    const message =
      error.response?.message || error.message || 'Internal server error';
    throw new RpcException(message);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Reviews Endpoints
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('RatingService', 'SubmitReview')
  async submitReview(request: any) {
    try {
      const validated = new ZodValidationPipe(CreateReviewSchema).transform(
        request,
      ) as any;
      const reviewerId = request.reviewerId || 'usr_reviewer_default';
      const id = await this.reviewService.submitReview(reviewerId, validated);
      return { success: true, id };
    } catch (e) {
      this.handleError('SubmitReview', e);
    }
  }

  @GrpcMethod('RatingService', 'LikeReview')
  async likeReview(request: any) {
    try {
      console.log('Received LikeReview request:', request);
      const validated = new ZodValidationPipe(LikeReviewSchema).transform(
        request,
      ) as any;
      const likesCount = await this.reviewService.likeReview(
        validated.reviewId,
        validated.userId,
      );
      return { success: true, likesCount };
    } catch (e) {
      this.handleError('LikeReview', e);
    }
  }

  @GrpcMethod('RatingService', 'GetUserRating')
  async getUserRating(request: any) {
    try {
      const stats = await this.reputationService.getReputation(request.userId);
      return {
        overallRating: stats.overallRating,
        categoryBreakdown: stats.categoryBreakdown,
        trend: stats.ratingTrend,
        totalReviews: stats.tripCompletionCount,
        reliabilityScore: stats.reliabilityScore,
        reliabilityBadge: stats.badgeLevel,
      };
    } catch (e) {
      this.handleError('GetUserRating', e);
    }
  }

  @GrpcMethod('RatingService', 'GetUserReviews')
  async getUserReviews(request: any) {
    try {
      const validated = new ZodValidationPipe(GetReviewsQuerySchema).transform({
        role: request.role || undefined,
        sortBy: request.sortBy || 'date',
        cursor: request.cursor || undefined,
        limit: request.limit ? String(request.limit) : '20',
      }) as any;

      const result = await this.reviewRepo.findRevealedByReviewee(
        request.userId,
        validated.role,
        validated.sortBy,
        validated.cursor,
        validated.limit,
      );

      return {
        dataJson: JSON.stringify(result.data),
        nextCursor: result.nextCursor || '',
        total: result.total,
      };
    } catch (e) {
      this.handleError('GetUserReviews', e);
    }
  }

  @GrpcMethod('RatingService', 'RespondToReview')
  async respondToReview(request: any) {
    try {
      const validated = new ZodValidationPipe(RespondReviewSchema).transform(
        request,
      ) as any;
      const userId = request.userId || 'usr_reviewee_default';
      await this.reviewService.respondToReview(
        userId,
        request.reviewId,
        validated.responseText,
      );
      return { success: true, message: 'Response submitted successfully' };
    } catch (e) {
      this.handleError('RespondToReview', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Cancellation Endpoints
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('RatingService', 'CancelBooking')
  async cancelBooking(request: any) {
    try {
      const validated = new ZodValidationPipe(CancelBookingSchema).transform(
        request,
      ) as any;
      const userId = request.userId || 'usr_canceller_default';
      const result = await this.cancellationService.cancelBooking(
        userId,
        request.bookingId,
        validated,
      );
      return result;
    } catch (e) {
      this.handleError('CancelBooking', e);
    }
  }

  @GrpcMethod('RatingService', 'GetCancellationStats')
  async getCancellationStats(request: any) {
    try {
      return await this.cancellationService.getCancellationStats(
        request.userId,
      );
    } catch (e) {
      this.handleError('GetCancellationStats', e);
    }
  }

  @GrpcMethod('RatingService', 'GetCancellationDeadline')
  async getCancellationDeadline(request: any) {
    try {
      return await this.cancellationService.getCancellationDeadline(
        request.bookingId,
      );
    } catch (e) {
      this.handleError('GetCancellationDeadline', e);
    }
  }

  @GrpcMethod('RatingService', 'GetUserReputation')
  async getUserReputation(request: any) {
    try {
      const stats = await this.reputationService.getReputation(request.userId);
      return {
        overallRating: stats.overallRating,
        starVisualization: stats.starVisualization,
        categoryBreakdown: stats.categoryBreakdown,
        reliabilityScore: stats.reliabilityScore,
        badgeLevel: stats.badgeLevel,
        recentReviewsJson: JSON.stringify(stats.recentReviews),
        tripCompletionCount: stats.tripCompletionCount,
        ratingTrend: stats.ratingTrend,
      };
    } catch (e) {
      this.handleError('GetUserReputation', e);
    }
  }
}
