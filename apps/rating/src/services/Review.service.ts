import { Injectable, ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ReviewRepository } from '../repositories/Review.repository';
import { ReputationRepository } from '../repositories/Reputation.repository';
import { ReviewLikeRepository } from '../repositories/ReviewLike.repository';
import { BookingIntegrationService } from './BookingIntegration.service';
import { Review } from '../entities/Review.entity';
import { AppError } from '../errors/AppError';

@Injectable()
export class ReviewService {
  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly bookingIntegration: BookingIntegrationService,
    private readonly reviewLikeRepo: ReviewLikeRepository,
  ) {}

  async submitReview(
    reviewerId: string,
    body: {
      bookingId: string;
      revieweeId: string;
      reviewerRole: 'owner' | 'passenger';
      targetType: 'driver' | 'vehicle' | 'passenger';
      overallRating: number;
      isLiked?: boolean;
      reviewText?: string;
    },
  ): Promise<string> {
    const { bookingId, revieweeId, reviewerRole, targetType, overallRating, isLiked, reviewText } = body;

    // 1. Validate booking exists and is completed
    const booking = await this.bookingIntegration.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    if (booking.status !== 'COMPLETED') {
      throw new AppError(400, 'BOOKING_NOT_COMPLETED', 'Booking is not completed yet');
    }

    // 2. Validate reviewer role matches their role on that booking
    const vehicles = await this.bookingIntegration.getOrderVehicles(bookingId);
    const isPassenger = booking.passengerId === reviewerId;
    const isOwner = vehicles.some(v => v.owner_id === reviewerId);

    if (reviewerRole === 'passenger' && !isPassenger) {
      throw new AppError(403, 'FORBIDDEN_ROLE', 'You are not the passenger for this booking');
    }
    if (reviewerRole === 'owner' && !isOwner) {
      throw new AppError(403, 'FORBIDDEN_ROLE', 'You are not the owner for this booking');
    }

    // Validate reviewee exists on this booking and matches the target type
    if (targetType === 'driver') {
      const isRevieweeOwner = vehicles.some(v => v.owner_id === revieweeId);
      if (!isRevieweeOwner) {
        throw new AppError(400, 'INVALID_REVIEWEE', 'Reviewee must be the vehicle owner/driver');
      }
    } else if (targetType === 'vehicle') {
      const isRevieweeVehicle = vehicles.some(v => v.vehicle_id === revieweeId || v.vehicleId === revieweeId);
      if (!isRevieweeVehicle) {
        throw new AppError(400, 'INVALID_REVIEWEE', 'Reviewee must be a vehicle on this booking');
      }
    } else if (targetType === 'passenger') {
      if (booking.passengerId !== revieweeId) {
        throw new AppError(400, 'INVALID_REVIEWEE', 'Reviewee must be the passenger');
      }
    }

    // 3. Enforce unique (booking_id, reviewer_role, target_type)
    const existing = await this.reviewRepo.findByBookingRoleAndTarget(bookingId, reviewerRole, targetType);
    if (existing) {
      throw new AppError(409, 'DUPLICATE_REVIEW', `You have already reviewed this booking's ${targetType}`);
    }

    // 4. Reject if trip completed more than 7 days ago
    const now = new Date();
    const completedAtTimes = vehicles.map(v => v.completed_at ? new Date(v.completed_at).getTime() : 0).filter(t => t > 0);
    const tripCompletionDate = completedAtTimes.length > 0 ? new Date(Math.max(...completedAtTimes)) : booking.tripStartDate;

    const diffDays = (now.getTime() - tripCompletionDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      throw new AppError(400, 'REVIEW_PERIOD_EXPIRED', 'Reviews must be submitted within 7 days of trip completion');
    }

    // 5. Create Review
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // now + 7 days
    const review = await this.reviewRepo.create({
      bookingId,
      reviewerId,
      revieweeId,
      reviewerRole,
      targetType,
      overallRating,
      isLiked: !!isLiked,
      likesCount: 0,
      reviewText,
      expiresAt,
      revealedAt: targetType === 'vehicle' ? now : undefined, // vehicle reviews are revealed immediately
    });

    // 6. Check if both roles have now reviewed each other
    if (targetType !== 'vehicle') {
      const allReviews = await this.reviewRepo.findBothReviewsForBooking(bookingId);
      const driverReview = allReviews.find(r => r.targetType === 'driver');
      const passengerReview = allReviews.find(r => r.targetType === 'passenger');

      if (driverReview && passengerReview) {
        // Both submitted -> Reveal both immediately
        driverReview.revealedAt = now;
        passengerReview.revealedAt = now;
        await this.reviewRepo.save(driverReview);
        await this.reviewRepo.save(passengerReview);
      }
    }

    // 7. Invalidate cache for reviewee (if it's a user)
    if (targetType !== 'vehicle') {
      await this.reputationRepo.invalidate(revieweeId);
    }

    return review.id;
  }

  async respondToReview(
    userId: string,
    reviewId: string,
    responseText: string,
  ): Promise<void> {
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found');
    }

    // req.user.userId must be the reviewee on this review
    if (review.revieweeId !== userId) {
      throw new AppError(403, 'FORBIDDEN_RESPONSE', 'You can only respond to reviews written about you');
    }

    // Review must be revealed
    if (!review.revealedAt) {
      throw new AppError(400, 'REVIEW_NOT_REVEALED', 'Cannot respond to a review that is not yet revealed');
    }

    // Enforce one response per review
    if (review.responseText) {
      throw new AppError(409, 'DUPLICATE_RESPONSE', 'You have already responded to this review');
    }

    review.responseText = responseText;
    review.responseSubmittedAt = new Date();
    await this.reviewRepo.save(review);
  }

  async likeReview(reviewId: string, userId: string): Promise<number> {
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found');
    }

    const alreadyLiked = await this.reviewLikeRepo.exists(reviewId, userId);
    if (alreadyLiked) {
      throw new AppError(400, 'ALREADY_LIKED', 'You have already liked this review');
    }

    await this.reviewLikeRepo.create(reviewId, userId);

    review.likesCount = (review.likesCount || 0) + 1;
    await this.reviewRepo.save(review);
    return review.likesCount;
  }
}
