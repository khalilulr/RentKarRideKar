import { Injectable, ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ReviewRepository } from '../repositories/Review.repository';
import { ReputationRepository } from '../repositories/Reputation.repository';
import { BookingIntegrationService } from './BookingIntegration.service';
import { Review } from '../entities/Review.entity';
import { AppError } from '../errors/AppError';

@Injectable()
export class ReviewService {
  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly bookingIntegration: BookingIntegrationService,
  ) {}

  async submitReview(
    reviewerId: string,
    body: {
      bookingId: string;
      revieweeId: string;
      reviewerRole: 'owner' | 'passenger';
      overallRating: number;
      categoryScores?: {
        punctuality?: number;
        cleanliness?: number;
        safety?: number;
        communication?: number;
      };
      reviewText?: string;
    },
  ): Promise<string> {
    const { bookingId, revieweeId, reviewerRole, overallRating, categoryScores, reviewText } = body;

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

    // Validate reviewee exists on this booking and matches the opposite role
    const isRevieweePassenger = booking.passengerId === revieweeId;
    const isRevieweeOwner = vehicles.some(v => v.owner_id === revieweeId);

    if (reviewerRole === 'passenger' && !isRevieweeOwner) {
      throw new AppError(400, 'INVALID_REVIEWEE', 'Reviewee must be the vehicle owner');
    }
    if (reviewerRole === 'owner' && !isRevieweePassenger) {
      throw new AppError(400, 'INVALID_REVIEWEE', 'Reviewee must be the passenger');
    }

    // 3. Enforce unique (booking_id, reviewer_role)
    const existing = await this.reviewRepo.findByBookingAndRole(bookingId, reviewerRole);
    if (existing) {
      throw new AppError(409, 'DUPLICATE_REVIEW', 'You have already reviewed this booking');
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
      overallRating,
      punctualityScore: categoryScores?.punctuality,
      cleanlinessScore: categoryScores?.cleanliness,
      safetyScore: categoryScores?.safety,
      communicationScore: categoryScores?.communication,
      reviewText,
      expiresAt,
      revealedAt: undefined, // null initially
    });

    // 6. Check if both roles have now reviewed this booking
    const bothReviews = await this.reviewRepo.findBothReviewsForBooking(bookingId);
    if (bothReviews.length === 2) {
      // Both submitted -> Reveal both immediately
      for (const r of bothReviews) {
        r.revealedAt = now;
        await this.reviewRepo.save(r);
      }
    }

    // 7. Invalidate cache for reviewee
    await this.reputationRepo.invalidate(revieweeId);

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
}
